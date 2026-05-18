import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ScheduledReminder, ScheduledReminderStatus } from '../data/entities/scheduled-reminder.entity';
import { User } from '../data/entities/user.entity';
import { MessagingService } from '../messaging/messaging.service';
import { structuredLog } from '../common/logger';

// 2-minute floor: SendBlue queue + iMessage delivery has 30-90s of inherent
// latency. Below this we can't promise the user a useful reminder, so we
// reject upfront rather than firing late.
export const MIN_DELAY_MS = 2 * 60_000;
export const MIN_DELAY_MINUTES = MIN_DELAY_MS / 60_000;
const MAX_DELAY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

export interface EnqueueArgs {
  userId: string;
  sessionId?: string | null;
  createdByMessageId?: string | null;
  fireAt: Date;
  message: string;
}

export interface EnqueueResult {
  ok: true;
  reminderId: string;
  fireAtIso: string;
}

export interface EnqueueRejection {
  ok: false;
  reason: string;
}

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    @InjectRepository(ScheduledReminder) private readonly reminderRepo: Repository<ScheduledReminder>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectQueue('accountability') private readonly queue: Queue,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * Persist a reminder and enqueue the BullMQ job. The DB row is the source of
   * truth — if the queue is flushed, an admin can re-enqueue from the row.
   */
  async enqueue(args: EnqueueArgs): Promise<EnqueueResult | EnqueueRejection> {
    const now = Date.now();
    const delayMs = args.fireAt.getTime() - now;

    if (Number.isNaN(args.fireAt.getTime())) {
      return { ok: false, reason: 'fire_at is not a valid date' };
    }
    if (delayMs < MIN_DELAY_MS) {
      return { ok: false, reason: `minimum is ${MIN_DELAY_MINUTES} minutes from now — anything sooner can't reliably deliver` };
    }
    if (delayMs > MAX_DELAY_MS) {
      return { ok: false, reason: 'fire_at must be within 1 year' };
    }
    if (!args.message?.trim()) {
      return { ok: false, reason: 'message is required' };
    }

    const saved = await this.reminderRepo.save({
      user_id: args.userId,
      session_id: args.sessionId ?? null,
      created_by_message_id: args.createdByMessageId ?? null,
      fire_at: args.fireAt,
      message: args.message.trim(),
      status: ScheduledReminderStatus.PENDING,
    });

    const job = await this.queue.add(
      'send-scheduled-reminder',
      { reminderId: saved.id },
      { delay: delayMs },
    );

    await this.reminderRepo.update(saved.id, { bull_job_id: String(job.id) });

    structuredLog(this.logger, 'log', {
      service: 'schedule',
      operation: 'enqueued',
      userId: args.userId,
      reminderId: saved.id,
      fireAtIso: args.fireAt.toISOString(),
      delayMs,
    });

    return { ok: true, reminderId: saved.id, fireAtIso: args.fireAt.toISOString() };
  }

  /**
   * Job handler: send the reminder message and mark the row fired.
   * Idempotent — re-firing a non-pending row is a no-op.
   */
  async fire(reminderId: string): Promise<void> {
    const reminder = await this.reminderRepo.findOne({ where: { id: reminderId } });
    if (!reminder) {
      this.logger.warn(`fire: reminder ${reminderId} not found — likely deleted`);
      return;
    }
    if (reminder.status !== ScheduledReminderStatus.PENDING) {
      this.logger.log(`fire: reminder ${reminderId} status=${reminder.status} — skipping`);
      return;
    }

    const user = await this.userRepo.findOne({ where: { id: reminder.user_id } });
    if (!user) {
      await this.reminderRepo.update(reminderId, {
        status: ScheduledReminderStatus.FAILED,
        failure_reason: 'user not found',
      });
      return;
    }
    if (user.crisis_hold) {
      await this.reminderRepo.update(reminderId, {
        status: ScheduledReminderStatus.CANCELLED,
        failure_reason: 'user in crisis hold',
      });
      return;
    }

    try {
      await this.messagingService.send(user.phone_number, reminder.message);
      await this.reminderRepo.update(reminderId, {
        status: ScheduledReminderStatus.FIRED,
        fired_at: new Date(),
      });
      structuredLog(this.logger, 'log', {
        service: 'schedule',
        operation: 'fired',
        userId: user.id,
        reminderId,
      });
    } catch (err) {
      await this.reminderRepo.update(reminderId, {
        status: ScheduledReminderStatus.FAILED,
        failure_reason: (err as Error).message.slice(0, 500),
      });
      this.logger.error(`fire failed for ${reminderId}: ${(err as Error).message}`);
      throw err;
    }
  }

  async listForUser(userId: string, limit = 50): Promise<ScheduledReminder[]> {
    return this.reminderRepo.find({
      where: { user_id: userId },
      order: { fire_at: 'DESC' },
      take: limit,
    });
  }

  /** Pending (not yet fired/cancelled/failed) reminders for a user, oldest fire_at first. */
  async listPendingForUser(userId: string): Promise<ScheduledReminder[]> {
    return this.reminderRepo.find({
      where: { user_id: userId, status: ScheduledReminderStatus.PENDING },
      order: { fire_at: 'ASC' },
      take: 50,
    });
  }

  async listPending(): Promise<ScheduledReminder[]> {
    return this.reminderRepo.find({
      where: { status: ScheduledReminderStatus.PENDING },
      order: { fire_at: 'ASC' },
      take: 200,
    });
  }

  async cancel(reminderId: string): Promise<ScheduledReminder | null> {
    const reminder = await this.reminderRepo.findOne({ where: { id: reminderId } });
    if (!reminder) return null;
    if (reminder.status !== ScheduledReminderStatus.PENDING) return reminder;

    if (reminder.bull_job_id) {
      const job = await this.queue.getJob(reminder.bull_job_id);
      if (job) await job.remove().catch(() => undefined);
    }
    await this.reminderRepo.update(reminderId, { status: ScheduledReminderStatus.CANCELLED });
    return this.reminderRepo.findOne({ where: { id: reminderId } });
  }
}
