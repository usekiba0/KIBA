import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Queue } from 'bull';
import * as twilio from 'twilio';
import axios from 'axios';
import { structuredLog } from '../common/logger';
import { humanizeVoice } from './voice';
import { User } from '../data/entities/user.entity';
import { normalizePhoneNumber } from '../common/phone';
import { dedupKey } from './send-dedup';

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);
  private readonly twilioClient: twilio.Twilio;
  private sendBlueReady = false;

  // Last-resort duplicate-send guard. Regardless of the trigger (a re-processed
  // inbound webhook, a retried job, a SendBlue→Twilio fallback that both landed,
  // or the model repeating itself), never deliver the SAME text to the SAME
  // number twice inside a short window (Karibi 2026-07-08 — identical message
  // sent twice). Keyed on recipient+body; only guards messages long enough that
  // a legit exact repeat is implausible, so short confirmations ("ok", "done")
  // are never suppressed. In-memory, so it protects within a single instance.
  private readonly recentSends = new Map<string, number>();
  // Widened from 90s on 2026-07-21. Two duplicate daily-reminder chains fired the
  // same verse minutes apart and both landed; 90s was never long enough to span
  // separate Bull jobs that merely share a scheduled minute.
  private static readonly SEND_DEDUP_WINDOW_MS = 10 * 60_000;
  private static readonly SEND_DEDUP_MIN_LEN = 25;

  /** The six iMessage tapbacks SendBlue accepts. */
  static readonly VALID_REACTIONS = ['love', 'like', 'dislike', 'laugh', 'emphasize', 'question'] as const;

  constructor(
    private readonly config: ConfigService,
    @InjectQueue('messaging') private readonly messagingQueue: Queue,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    this.twilioClient = twilio(
      config.getOrThrow('TWILIO_ACCOUNT_SID'),
      config.getOrThrow('TWILIO_AUTH_TOKEN'),
    );
  }

  async onModuleInit(): Promise<void> {
    const keyId = this.config.get<string>('SENDBLUE_API_KEY_ID');
    const secret = this.config.get<string>('SENDBLUE_API_SECRET_KEY');
    if (!keyId || !secret) {
      this.logger.warn('[SendBlue] No credentials configured — iMessage disabled');
      return;
    }
    this.sendBlueReady = true;
    this.logger.log('[SendBlue] Credentials loaded — iMessage replies enabled');
  }

  async queueMessage(to: string, body: string): Promise<void> {
    this.logger.log(`[Queue] Adding send-message job for ${to}`);
    await this.messagingQueue.add(
      'send-message',
      { to, body },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );
    this.logger.log(`[Queue] Job added for ${to}`);
  }

  /**
   * Send a message, optionally with a media attachment (photo / GIF / video).
   * `mediaUrl` must be a publicly-fetchable HTTPS URL — both SendBlue and Twilio
   * pull the file from the URL, neither accepts a raw upload. Full media works
   * over iMessage (SendBlue); SMS falls back to Twilio MMS where GIFs render as a
   * static image and video is unreliable.
   */
  /**
   * True if this number has revoked consent. Checked at the outbound chokepoint
   * rather than at each of the ~10 call sites that generate messages, because a
   * per-caller check is one forgotten branch away from texting someone who asked
   * to be left alone — and every new generator we add would have to remember.
   *
   * Fails CLOSED on a DB error: if we cannot confirm consent, we do not send.
   * A missed check-in is recoverable; messaging someone who opted out is not.
   */
  async hasOptedOut(to: string): Promise<boolean> {
    try {
      const found = await this.userRepo.findOne({
        where: { phone_number: normalizePhoneNumber(to), opted_out_at: Not(IsNull()) },
        select: { id: true },
      });
      return found !== null;
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'messaging',
        operation: 'opt_out_check_failed',
        to,
        error: (err as Error).message,
      });
      return true;
    }
  }

  /**
   * @param allowOptedOut only ever true for the opt-out/opt-in confirmation
   * itself. Carrier rules permit exactly one final message acknowledging the
   * opt-out, and the resume path has to be able to reply to START while the
   * flag is still set.
   */
  async send(to: string, body: string, mediaUrl?: string, allowOptedOut = false): Promise<void> {
    if (!allowOptedOut && (await this.hasOptedOut(to))) {
      structuredLog(this.logger, 'warn', {
        service: 'messaging',
        operation: 'send_blocked_opted_out',
        to,
        bodyPreview: (body ?? '').slice(0, 60),
      });
      return;
    }

    // SINGLE outbound chokepoint sanitization. The coaching path already cleans
    // via saveAndSend, but every DETERMINISTIC generator (check-in, night recap,
    // weekly review, ghost, surprise, milestone, dunning) calls send() directly
    // and would otherwise ship raw em-dashes/markdown to the phone. humanizeVoice
    // is idempotent, so cleaning here never harms already-clean text.
    const clean = humanizeVoice(body);

    // Duplicate-send guard: drop an identical message to the same number sent
    // within the window. Prunes expired keys on the way through so the map can't
    // grow unbounded. Media sends are never suppressed (a repeated caption with a
    // new attachment is legitimate).
    if (!mediaUrl && clean.length >= MessagingService.SEND_DEDUP_MIN_LEN) {
      const now = Date.now();
      for (const [k, ts] of this.recentSends) {
        if (now - ts >= MessagingService.SEND_DEDUP_WINDOW_MS) this.recentSends.delete(k);
      }
      const key = dedupKey(to, clean);
      const last = this.recentSends.get(key);
      if (last !== undefined && now - last < MessagingService.SEND_DEDUP_WINDOW_MS) {
        structuredLog(this.logger, 'warn', {
          service: 'messaging',
          operation: 'duplicate_send_suppressed',
          to,
          bodyPreview: clean.slice(0, 60),
        });
        return;
      }
      this.recentSends.set(key, now);
    }

    const sendBlueKeyId = this.config.get<string>('SENDBLUE_API_KEY_ID');
    const sendBlueSecret = this.config.get<string>('SENDBLUE_API_SECRET_KEY');

    if (this.sendBlueReady && sendBlueKeyId && sendBlueSecret) {
      try {
        await this.sendViaSendBlue(to, clean, sendBlueKeyId, sendBlueSecret, mediaUrl);
        return;
      } catch (err) {
        this.logger.warn(`[Send] SendBlue failed, falling back to Twilio: ${(err as Error).message}`);
      }
    }

    await this.sendViaTwilio(to, clean, mediaUrl);
  }

  async sendViaSendBlue(to: string, body: string, keyId: string, secret: string, mediaUrl?: string): Promise<void> {
    const fromNumber = this.config.get<string>('SENDBLUE_FROM_NUMBER');
    const payload: Record<string, string> = { number: to, content: body };
    if (fromNumber) payload.from_number = fromNumber;
    if (mediaUrl) payload.media_url = mediaUrl;
    try {
      const response = await axios.post(
        'https://api.sendblue.co/api/send-message',
        payload,
        { headers: { 'sb-api-key-id': keyId, 'sb-api-secret-key': secret } },
      );
      const status = response.data?.status;
      const errorCode = response.data?.error_code;
      this.logger.log(`[SendBlue] Send response for ${to}: status=${status} error_code=${errorCode} handle=${response.data?.message_handle} raw=${JSON.stringify(response.data)}`);
      if (status === 'ERROR' || errorCode) {
        throw new Error(`SendBlue rejected send: status=${status} error_code=${errorCode} error=${response.data?.error_message}`);
      }
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'send_imessage',
        to,
        status,
        messageHandle: response.data?.message_handle,
      });
    } catch (err) {
      const detail = (err as any)?.response?.data
        ? JSON.stringify((err as any).response.data)
        : '';
      this.logger.error(`[SendBlue] Send failed to ${to}: ${(err as Error).message} | body: ${detail}`);
      throw err;
    }
  }

  /**
   * Send an iMessage read receipt back to a user we just received a message from.
   * Makes KIBA feel present — user sees "Read" within ~1s of texting instead of
   * messages sitting on "Delivered" until the AI gets a reply queued up.
   *
   * Endpoint per SendBlue docs (v2): POST /api/mark-read with both `number`
   * (the user) and `from_number` (our SendBlue line). Both are required.
   *
   * IMPORTANT: read receipts must be manually enabled by SendBlue support on
   * your account before the API actually marks anything as read. The endpoint
   * returns 200 either way — silent no-op until activation. Email
   * support@sendblue.com to request activation.
   *
   * iMessage only — Twilio SMS has no read-receipt concept. Pass-through fail
   * silently if SendBlue isn't configured. Errors are logged but never thrown
   * — read receipts are best-effort, missing one is a UX downgrade not a
   * correctness bug.
   *
   * Designed to be called fire-and-forget from the webhook handler. Don't
   * await this — the webhook should ack 200 immediately so SendBlue doesn't
   * retry.
   */
  async sendReadReceipt(to: string): Promise<void> {
    if (!this.sendBlueReady) return;
    const keyId = this.config.get<string>('SENDBLUE_API_KEY_ID');
    const secret = this.config.get<string>('SENDBLUE_API_SECRET_KEY');
    const fromNumber = this.config.get<string>('SENDBLUE_FROM_NUMBER');
    if (!keyId || !secret) return;
    if (!fromNumber) {
      this.logger.warn('[SendBlue] SENDBLUE_FROM_NUMBER missing — skipping read receipt');
      return;
    }

    try {
      const response = await axios.post(
        'https://api.sendblue.co/api/mark-read',
        { number: to, from_number: fromNumber },
        {
          headers: {
            'sb-api-key-id': keyId,
            'sb-api-secret-key': secret,
            'Content-Type': 'application/json',
          },
          timeout: 5_000,
        },
      );
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'send_read_receipt',
        to,
        status: response.data?.status ?? 'ok',
        raw: response.data,
      });
    } catch (err) {
      const detail = (err as any)?.response?.data
        ? JSON.stringify((err as any).response.data)
        : '';
      const status = (err as any)?.response?.status;
      this.logger.warn(
        `[SendBlue] Read receipt failed for ${to}: http=${status} ${(err as Error).message} | body: ${detail}`,
      );
    }
  }

  /**
   * Send an iMessage tapback (heart / thumbs / laugh / etc.) onto a message the
   * user sent us. iMessage-only — SMS/RCS have no tapback concept, so this no-ops
   * with ok:false off-iMessage rather than sending the ugly "Liked 'x'" text.
   * `messageHandle` is the Apple GUID from the inbound SendBlue webhook.
   *
   * Endpoint mirrors the proven send-message host (api.sendblue.co). Best-effort:
   * returns a result instead of throwing so a failed reaction never breaks a turn.
   */
  async sendReaction(
    to: string,
    messageHandle: string | null,
    reaction: string,
    partIndex = 0,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.sendBlueReady) return { ok: false, error: 'reactions require iMessage (SendBlue not configured)' };
    if (!MessagingService.VALID_REACTIONS.includes(reaction as never)) {
      return { ok: false, error: `invalid reaction: ${reaction}` };
    }
    const keyId = this.config.get<string>('SENDBLUE_API_KEY_ID');
    const secret = this.config.get<string>('SENDBLUE_API_SECRET_KEY');
    const fromNumber = this.config.get<string>('SENDBLUE_FROM_NUMBER');
    if (!keyId || !secret) return { ok: false, error: 'SendBlue not configured' };
    if (!fromNumber) return { ok: false, error: 'SENDBLUE_FROM_NUMBER missing' };
    if (!messageHandle) return { ok: false, error: 'no message_handle to react to' };
    // A tapback is still an outbound message to their phone. Someone who opted
    // out should get nothing from us, including a thumbs-up.
    if (await this.hasOptedOut(to)) return { ok: false, error: 'recipient opted out' };

    try {
      const response = await axios.post(
        'https://api.sendblue.co/api/send-reaction',
        { from_number: fromNumber, message_handle: messageHandle, reaction, part_index: partIndex },
        { headers: { 'sb-api-key-id': keyId, 'sb-api-secret-key': secret, 'Content-Type': 'application/json' }, timeout: 5_000 },
      );
      const status = response.data?.status;
      if (status && String(status).toUpperCase() === 'ERROR') {
        return { ok: false, error: `SendBlue rejected reaction: ${response.data?.error_message ?? status}` };
      }
      structuredLog(this.logger, 'log', {
        service: 'messaging', operation: 'send_reaction', to, reaction,
      });
      return { ok: true };
    } catch (err) {
      const detail = (err as any)?.response?.data ? JSON.stringify((err as any).response.data) : '';
      this.logger.warn(`[SendBlue] Reaction failed for ${to}: ${(err as Error).message} | body: ${detail}`);
      return { ok: false, error: (err as Error).message };
    }
  }

  async sendViaTwilio(to: string, body: string, mediaUrl?: string): Promise<void> {
    const from = this.config.getOrThrow('TWILIO_PHONE_NUMBER');
    this.logger.log(`[Twilio] Sending from ${from} to ${to}`);
    try {
      const message = await this.twilioClient.messages.create({
        from,
        to,
        body,
        ...(mediaUrl ? { mediaUrl: [mediaUrl] } : {}),
      });
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'send_sms',
        to,
        sid: message.sid,
        status: message.status,
      });
      this.logger.log(`[Twilio] Message SID: ${message.sid} status: ${message.status}`);
    } catch (err) {
      this.logger.error(`[Twilio] Send FAILED to ${to} from ${from}: ${(err as Error).message}`);
      throw err;
    }
  }
}
