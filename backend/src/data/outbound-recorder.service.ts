import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageRole, MessageType } from './entities/message.entity';
import { SessionBoundaryService } from './session-boundary.service';

/**
 * Discriminator for scheduled/triggered outbound classes. Lets the admin API
 * and future context-shaping tell WHICH machine sent a message, and gives every
 * class a DB-visible record that it actually fired.
 */
export type ScheduledKind =
  | 'checkin'
  | 'recap'
  | 'weekly_review'
  | 'ghost'
  | 'reminder'
  | 'surprise'
  | 'dunning'
  | 'intake_nudge'
  | 'price_reveal'
  | 'milestone'
  // The plan-link SMS (and its lead-in). Sent outside saveAndSend, so without
  // this the link was invisible to the thread — the 2026-07-23 audit read two
  // healthy conversions as "lead never got a link" because of it.
  | 'payment_link';

/**
 * Persists scheduled/triggered outbound sends as Message rows so they are
 * visible to (a) the live coaching layer's recent-history context and (b) the
 * admin API. Before this, seven sender classes (ghost, reminders, surprise,
 * dunning, intake nudge, price reveal, milestone) sent texts the rest of the
 * system had no record of — so KIBA could break a scheduled promise and the
 * live layer couldn't even see it to own it (Retraining doc #114/#116), and
 * there was no way to confirm from the DB whether a class ever fired.
 *
 * Best-effort by design: recording must NEVER break the send path. Every
 * failure is logged and swallowed.
 */
@Injectable()
export class OutboundRecorderService {
  private readonly logger = new Logger(OutboundRecorderService.name);

  constructor(
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    private readonly sessionBoundary: SessionBoundaryService,
  ) {}

  async record(userId: string, content: string, kind: ScheduledKind): Promise<void> {
    if (!content || !content.trim()) return;
    try {
      const boundary = await this.sessionBoundary.checkAndHandle(userId);
      await this.messageRepo.save({
        user_id: userId,
        session_id: boundary.sessionId,
        role: MessageRole.AI,
        message_type: MessageType.TEXT,
        content,
        scheduled_kind: kind,
      });
      await this.sessionBoundary.recordMessage(boundary.sessionId);
    } catch (err) {
      this.logger.warn(
        `outbound record failed for ${userId} kind=${kind}: ${(err as Error).message}`,
      );
    }
  }
}
