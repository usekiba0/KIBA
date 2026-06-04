import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as twilio from 'twilio';
import axios from 'axios';
import { structuredLog } from '../common/logger';

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);
  private readonly twilioClient: twilio.Twilio;
  private sendBlueReady = false;

  /** The six iMessage tapbacks SendBlue accepts. */
  static readonly VALID_REACTIONS = ['love', 'like', 'dislike', 'laugh', 'emphasize', 'question'] as const;

  constructor(
    private readonly config: ConfigService,
    @InjectQueue('messaging') private readonly messagingQueue: Queue,
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
  async send(to: string, body: string, mediaUrl?: string): Promise<void> {
    const sendBlueKeyId = this.config.get<string>('SENDBLUE_API_KEY_ID');
    const sendBlueSecret = this.config.get<string>('SENDBLUE_API_SECRET_KEY');

    if (this.sendBlueReady && sendBlueKeyId && sendBlueSecret) {
      try {
        await this.sendViaSendBlue(to, body, sendBlueKeyId, sendBlueSecret, mediaUrl);
        return;
      } catch (err) {
        this.logger.warn(`[Send] SendBlue failed, falling back to Twilio: ${(err as Error).message}`);
      }
    }

    await this.sendViaTwilio(to, body, mediaUrl);
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
