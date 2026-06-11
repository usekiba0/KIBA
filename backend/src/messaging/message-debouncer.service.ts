import { Injectable, Logger } from '@nestjs/common';
import { CoachingProcessor } from './coaching.processor';

export interface DebouncedMessage {
  from: string;
  text: string;
  twilioSid: string | null;
  mediaUrls: string[];
  mediaContentTypes: string[];
  channel: 'sms' | 'imessage';
  dateSent: number;
  uniqueId: string | null;
}

interface BufferState {
  messages: DebouncedMessage[];
  timer: NodeJS.Timeout;
}

// 1.5s is long enough to coalesce iMessage chunks ("Look where I" / "At" /
// "the gym" all land within ~300ms in production logs) and the trailing image
// webhook (often arrives 0.5–1s after its sibling text), but short enough to
// keep replies feeling instant.
const DEBOUNCE_MS = 1500;

// Keep webhook IDs around long enough to absorb Twilio/SendBlue retries even
// after the original batch has already flushed and been processed.
const SEEN_TTL_MS = 5 * 60_000;

@Injectable()
export class MessageDebouncerService {
  private readonly logger = new Logger(MessageDebouncerService.name);
  private readonly buffers = new Map<string, BufferState>();
  private readonly recentlySeen = new Map<string, number>();

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

    const existing = this.buffers.get(msg.from);
    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(msg);
      existing.timer = this.scheduleFlush(msg.from);
    } else {
      this.buffers.set(msg.from, {
        messages: [msg],
        timer: this.scheduleFlush(msg.from),
      });
    }
  }

  private scheduleFlush(from: string): NodeJS.Timeout {
    return setTimeout(() => {
      this.flush(from).catch((err) =>
        this.logger.error(`[Debounce] flush error for ${from}: ${(err as Error).message}\n${(err as Error).stack}`),
      );
    }, DEBOUNCE_MS);
  }

  private pruneSeen(): void {
    const cutoff = Date.now() - SEEN_TTL_MS;
    for (const [id, ts] of this.recentlySeen) {
      if (ts < cutoff) this.recentlySeen.delete(id);
    }
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
    });
  }
}
