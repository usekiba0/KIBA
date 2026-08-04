import { Injectable, Logger } from '@nestjs/common';
import { CoachingProcessor } from './coaching.processor';
import { MAX_TURN_IMAGES } from './inbound-media';
import { warm as warmInboundImage } from './image-prep';

export interface DebouncedMessage {
  from: string;
  text: string;
  twilioSid: string | null;
  mediaUrls: string[];
  mediaContentTypes: string[];
  channel: 'sms' | 'imessage';
  dateSent: number;
  uniqueId: string | null;
  /**
   * The PROVIDER's own server timestamp for this message (SendBlue's
   * `date_updated`), in epoch ms. Distinct from `dateSent`, which is the
   * sender's device clock and is skewed on iMessage — this one is a server
   * clock, so subtracting it from our receipt time gives an honest measure of
   * how long the provider took to hand the message over. Null on channels that
   * expose no such field (Twilio SMS). See providerLagMs below.
   */
  providerUpdatedAt: number | null;
}

interface BufferState {
  messages: DebouncedMessage[];
  timer: NodeJS.Timeout;
  // Wall clock of the FIRST webhook in this batch. The only honest starting
  // point for end-to-end latency: `dateSent` is the sender's clock (skewed on
  // iMessage) and `turnStart` inside the processor is already past the debounce
  // window, so neither shows the user-perceived wait.
  firstPushAt: number;
  // Provider timestamp of the FIRST webhook in this batch, pairing with
  // firstPushAt to give the provider-side lag the user actually felt.
  firstProviderUpdatedAt: number | null;
}

/**
 * Provider forwarding lag, or null when it can't be trusted.
 *
 * Our turn_latency has always started at OUR webhook receipt, which silently
 * excluded everything the provider spent getting the message to us. Measured
 * 2026-08-03 over 104 inbound messages, that gap is p50 2601ms / p90 4738ms —
 * roughly half the perceived latency of a fast text reply, and completely
 * invisible in our own numbers.
 *
 * Bounds guard against cross-server clock skew: a negative value or anything
 * beyond a couple of minutes says the two clocks disagree (or the message was
 * replayed), and a wrong number here is worse than no number, because this one
 * is meant to inform a provider-migration decision.
 */
export function providerLagMs(receivedAt: number, providerUpdatedAt: number | null): number | null {
  if (providerUpdatedAt == null || !Number.isFinite(providerUpdatedAt)) return null;
  const lag = receivedAt - providerUpdatedAt;
  if (lag < 0 || lag > 120_000) return null;
  return lag;
}

// IMAGE bursts: 3s by default. People who send photos usually send SEVERAL (a
// few gym shots, multiple screenshots), and each photo is its own webhook that
// can land 1-3s after the last on mobile data — at 1.5s KIBA replied to each one
// separately, which reads spammy/botty (Karibi 2026-06-25). The timer resets on
// every new image, so the batch always waits for the last one; a ~3s pause
// before reacting to a photo reads like natural "looking at it" time.
//
// Tunable via env because this window is pure added latency on the SINGLE-photo
// case, which prod suggests is the common one (2026-07-30: every sampled vision
// turn ran the full 3s, i.e. no second photo ever reset the timer). But 1.5s is
// already a KNOWN-BAD value, so do not "optimise" this back down blind — lower it
// a step at a time in Render and watch for per-photo replies before going again.
// Vision e2e is ~15s p50; this 3s is the small half. The real cost is the
// AI_VISION_MODEL generation (7-11s) — see scripts/sim-vision.ts.
// Default raised 3000 -> 4000 on 2026-08-03 after measuring real arrival gaps in
// prod (see the burst window below). Prod also sets the env var explicitly.
const IMAGE_DEBOUNCE_MS = Number(process.env.MESSAGE_IMAGE_DEBOUNCE_MS ?? 4000);

// ADAPTIVE second stage. Once TWO photos are in the buffer, a burst is a fact
// rather than a guess, so we can afford to wait longer for the rest of it —
// without charging that wait to the single-photo case, which is the common one.
//
// Why this exists (Karibi 2026-08-03): a real user (+92, Pakistan) sent 6 photos
// whose arrival gaps were 3349 / 5306 / 3057 / 2764 / 5899 ms. Two of those blew
// past the 4000ms window, so the dump split into THREE turns and KIBA sent three
// replies — the first two redundantly describing the same SSD and the same
// fintech panel. Exactly the per-photo spam the debouncer exists to prevent.
//
// The window had been tuned on founder testing (US wifi, gaps 2155-2793ms). The
// first real user roughly DOUBLED that. Never tune this on founder data alone.
//
// 8000 covers the observed 5899ms worst case with margin. Env-tunable so it can
// be dialled back without a deploy if it costs too much perceived latency.
const IMAGE_BURST_DEBOUNCE_MS = Number(process.env.MESSAGE_IMAGE_BURST_DEBOUNCE_MS ?? 8000);

// How long after a photo turn flushes we keep treating the NEXT photo from that
// user as part of the same dump.
//
// The burst window above can only fire once TWO photos sit in the buffer at the
// same time — which never happens if every gap exceeds the BASE window. Measured
// 2026-08-03: a user sent 12 photos "together" and they arrived over 44.8s with
// gaps of 2065-6046ms. Photos 1-5 each exceeded the 4000ms base, so each flushed
// alone and KIBA fired five separate per-photo replies; only the tail, whose gaps
// happened to fall under the base, merged.
//
// Critically, the spacing is NOT the provider's doing — span at SendBlue was
// 44998ms vs 44773ms at our end, so Apple's sequential attachment upload is the
// source and no provider change would help.
//
// Raising the base window to cover 6046ms would merge all 12 into ONE reply after
// ~53s of silence, and would tax every single-photo turn. This is the cheaper
// shape: the FIRST photo still answers on the fast window, and once we've just
// answered a photo, the next one is assumed to be the dump continuing.
const PHOTO_RECENCY_MS = Number(process.env.MESSAGE_PHOTO_RECENCY_MS ?? 15_000);
// TEXT bursts: OFF (Karibi 2026-07-21). Was 2s, then 1.5s. In real use it never
// merged anything — people leave 3-8s between bubbles, so almost every message
// flushed alone and the window was pure added latency on the common case (a
// single message). Widening it far enough to actually catch a burst would have
// cost every lone message that same delay, which is the worse trade on a product
// judged on feeling "nearly instant".
//
// This does NOT make KIBA reply per-bubble — it already did. Genuinely reading a
// burst as one turn needs per-user serialization (hold or supersede an in-flight
// turn when a new inbound lands), not a longer timer. IMAGE stays at 3s: photo
// webhooks really do land 1-3s apart, so that window merges and is worth its cost.
const TEXT_DEBOUNCE_MS = 0;

/**
 * Delay before flushing a buffer. Three cases:
 *   no media  -> flush immediately (the text window is off)
 *   1 photo   -> IMAGE_DEBOUNCE_MS, the cost paid by the common single-photo case
 *   2+ photos -> IMAGE_BURST_DEBOUNCE_MS, because a burst is now confirmed
 *
 * Counting MEDIA (not messages) is what makes the escalation honest: a photo
 * plus a separate text bubble is still a single-photo turn and must not be
 * charged the burst wait.
 */
export function debounceDelayFor(
  messages: { mediaUrls: string[] }[],
  /** ms since this user's last photo turn flushed, or null if there wasn't one. */
  msSinceLastPhotoFlush?: number | null,
): number {
  const mediaCount = messages.reduce((n, m) => n + m.mediaUrls.length, 0);
  if (mediaCount === 0) return TEXT_DEBOUNCE_MS;

  // Cap reached: waiting longer cannot show the model any more photos, so flush
  // now. This is what bounds a long dump — without it, 12 photos arriving over
  // 45s would hold the whole turn for ~53s before a single word came back.
  if (mediaCount >= MAX_TURN_IMAGES) return 0;

  if (mediaCount >= 2) return IMAGE_BURST_DEBOUNCE_MS;

  // Exactly one photo buffered. If we answered a photo moments ago this is the
  // same dump still uploading, so use the burst window and let the rest chain
  // into one turn. Otherwise it's a lone photo and pays only the fast window.
  if (msSinceLastPhotoFlush != null && msSinceLastPhotoFlush <= PHOTO_RECENCY_MS) {
    return IMAGE_BURST_DEBOUNCE_MS;
  }
  return IMAGE_DEBOUNCE_MS;
}

// Keep webhook IDs around long enough to absorb Twilio/SendBlue retries even
// after the original batch has already flushed and been processed.
const SEEN_TTL_MS = 5 * 60_000;

@Injectable()
export class MessageDebouncerService {
  private readonly logger = new Logger(MessageDebouncerService.name);
  private readonly buffers = new Map<string, BufferState>();
  private readonly recentlySeen = new Map<string, number>();
  // Last time a batch CONTAINING MEDIA flushed, per sender. Drives the recency
  // escalation in debounceDelayFor.
  private readonly lastPhotoFlushAt = new Map<string, number>();

  constructor(private readonly coachingProcessor: CoachingProcessor) {}

  push(msg: DebouncedMessage): void {
    if (msg.uniqueId) {
      this.pruneSeen();
      if (this.recentlySeen.has(msg.uniqueId)) {
        this.logger.log(`[Debounce] dropping duplicate ${msg.uniqueId} from ${msg.from}`);
        return;
      }
      this.recentlySeen.set(msg.uniqueId, Date.now());
    }

    // Start transcoding HEIC photos NOW, not when the turn flushes. We are about
    // to sit on this buffer for 4-8s doing nothing while the rest of the dump
    // uploads; converting in that window takes 2.9-7.5s per photo off the reply
    // path. Fire-and-forget by design — a failure here just means the normal
    // inline conversion happens later. (Karibi 2026-08-04)
    for (let i = 0; i < msg.mediaUrls.length; i++) {
      warmInboundImage(msg.mediaUrls[i], msg.mediaContentTypes[i]);
    }

    let buf = this.buffers.get(msg.from);
    if (buf) {
      clearTimeout(buf.timer);
      buf.messages.push(msg);
    } else {
      buf = {
        messages: [msg],
        timer: undefined as unknown as NodeJS.Timeout,
        firstPushAt: Date.now(),
        firstProviderUpdatedAt: msg.providerUpdatedAt,
      };
      this.buffers.set(msg.from, buf);
    }
    // Recompute the delay from the WHOLE buffer each push: a text burst that
    // later gains an image flips to the faster image window, and vice versa.
    buf.timer = this.scheduleFlush(msg.from, debounceDelayFor(buf.messages, this.msSincePhotoFlush(msg.from)));
  }

  private scheduleFlush(from: string, delayMs: number): NodeJS.Timeout {
    return setTimeout(() => {
      this.flush(from).catch((err) =>
        this.logger.error(`[Debounce] flush error for ${from}: ${(err as Error).message}\n${(err as Error).stack}`),
      );
    }, delayMs);
  }

  private pruneSeen(): void {
    const cutoff = Date.now() - SEEN_TTL_MS;
    for (const [id, ts] of this.recentlySeen) {
      if (ts < cutoff) this.recentlySeen.delete(id);
    }
    // Same sweep for the photo-recency map so it can't grow without bound.
    // Anything older than the recency window can no longer influence a decision.
    const photoCutoff = Date.now() - PHOTO_RECENCY_MS;
    for (const [from, ts] of this.lastPhotoFlushAt) {
      if (ts < photoCutoff) this.lastPhotoFlushAt.delete(from);
    }
  }

  /** ms since this sender's last media-bearing flush, or null if there wasn't one. */
  private msSincePhotoFlush(from: string): number | null {
    const last = this.lastPhotoFlushAt.get(from);
    return last == null ? null : Date.now() - last;
  }

  private async flush(from: string): Promise<void> {
    const buf = this.buffers.get(from);
    if (!buf) return;
    this.buffers.delete(from);

    // iMessage and Twilio both deliver multi-part sends out of arrival order
    // (an image with date_sent T can arrive after a sibling text sent at T+2s).
    // Sort by date_sent so the model sees the user's logical message order.
    buf.messages.sort((a, b) => a.dateSent - b.dateSent);

    const textParts: string[] = [];
    const mediaUrls: string[] = [];
    const mediaContentTypes: string[] = [];
    let twilioSid: string | null = null;
    let channel: 'sms' | 'imessage' = buf.messages[0].channel;
    // The Apple GUID of the most recent iMessage in the batch — the message a
    // tapback would land on. Only meaningful for iMessage (uniqueId is the
    // SendBlue message_handle there; for SMS it's the Twilio SID, which can't
    // be reacted to).
    let messageHandle: string | null = null;

    for (const m of buf.messages) {
      const trimmed = m.text.trim();
      if (trimmed && trimmed !== '[image]') textParts.push(trimmed);
      for (let i = 0; i < m.mediaUrls.length; i++) {
        mediaUrls.push(m.mediaUrls[i]);
        mediaContentTypes.push(m.mediaContentTypes[i] ?? '');
      }
      if (m.twilioSid && !twilioSid) twilioSid = m.twilioSid;
      channel = m.channel;
      if (m.channel === 'imessage' && m.uniqueId) messageHandle = m.uniqueId;
    }

    const body = textParts.length > 0
      ? textParts.join(' ')
      : (mediaUrls.length > 0 ? '[image]' : '');

    if (!body && mediaUrls.length === 0) return;

    // Stamp BEFORE awaiting the processor: photos of the same dump keep arriving
    // while this turn generates, and they must see the fresh timestamp.
    if (mediaUrls.length > 0) this.lastPhotoFlushAt.set(from, Date.now());

    if (buf.messages.length > 1) {
      this.logger.log(
        `[Debounce] merged ${buf.messages.length} webhooks for ${from} → ${mediaUrls.length} media, ${textParts.length} text parts`,
      );
    }

    await this.coachingProcessor.process({
      from,
      body,
      twilioSid,
      numMedia: mediaUrls.length,
      mediaUrls,
      mediaContentTypes,
      channel,
      messageHandle,
      receivedAt: buf.firstPushAt,
      providerLagMs: providerLagMs(buf.firstPushAt, buf.firstProviderUpdatedAt),
    });
  }
}
