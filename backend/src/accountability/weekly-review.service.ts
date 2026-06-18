import { Injectable, Logger, Inject, forwardRef, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { User, UserStatus, OnboardingStage } from '../data/entities/user.entity';
import { DailyTodo, DailyTodoStatus } from '../data/entities/daily-todo.entity';
import { Proof, ProofValidationStatus } from '../data/entities/proof.entity';
import { Message, MessageRole, MessageType } from '../data/entities/message.entity';
import { MessagingService } from '../messaging/messaging.service';
import { SessionBoundaryService } from '../data/session-boundary.service';
import { ScoreService } from './score.service';
import { computeWeeklyDelayMs } from './schedule-time.util';
import { localDateString } from './checkin.processor';
import { buildWeeklyReviewMessage } from '../ai/prompts/recap.prompt';
import { structuredLog } from '../common/logger';

/** Weekday (0=Sun) and user-local time the weekly review fires at: Sunday 6pm. */
const REVIEW_WEEKDAY = 0;
const REVIEW_LOCAL_TIME = '18:00';

/**
 * Weekly Review (the 7-day mock's "Day 7" one-week review). A once-a-week
 * per-user job that sums the past week — tasks done vs missed, proof sent, the
 * current score, the recurring leak — and points at the week ahead.
 *
 * A deliberate twin of RecapService (the nightly Night Recap): same self-healing
 * scheduling (boot bootstrap + hourly safety re-arm from CheckinProcessor +
 * self-reschedule) and the same atomic per-local-day claim, here on
 * `last_weekly_review_date`, so it fires at most once per week no matter how many
 * schedulers race.
 */
@Injectable()
export class WeeklyReviewService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WeeklyReviewService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(DailyTodo) private readonly todoRepo: Repository<DailyTodo>,
    @InjectRepository(Proof) private readonly proofRepo: Repository<Proof>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    private readonly scoreService: ScoreService,
    @Inject(forwardRef(() => MessagingService)) private readonly messagingService: MessagingService,
    private readonly sessionBoundary: SessionBoundaryService,
    @InjectQueue('accountability') private readonly queue: Queue,
  ) {}

  onApplicationBootstrap(): void {
    setImmediate(() => {
      this.scheduleAllReviews().catch((err) => {
        structuredLog(this.logger, 'error', {
          service: 'accountability',
          operation: 'weekly_review_bootstrap_failed',
          error: (err as Error).message,
        });
      });
    });
  }

  async scheduleAllReviews(): Promise<void> {
    const users = await this.userRepo.find({
      where: [
        { status: UserStatus.ACTIVE, onboarding_stage: OnboardingStage.COMPLETE },
        { status: UserStatus.TRIAL, onboarding_stage: OnboardingStage.COMPLETE },
        { status: UserStatus.PAUSED, onboarding_stage: OnboardingStage.COMPLETE },
      ],
    });

    let scheduled = 0;
    let skipped = 0;
    for (const user of users) {
      if (user.utc_offset_minutes === null || user.utc_offset_minutes === undefined) {
        skipped++;
        continue;
      }
      try {
        await this.scheduleReview(user);
        scheduled++;
      } catch (err) {
        this.logger.error(`scheduleAllReviews failed for ${user.id}: ${(err as Error).message}`);
      }
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'weekly_reviews_scheduled',
      total: users.length,
      scheduled,
      skipped,
    });
  }

  async scheduleReview(user: User): Promise<void> {
    if (user.utc_offset_minutes === null || user.utc_offset_minutes === undefined) return;

    const delay = computeWeeklyDelayMs(REVIEW_WEEKDAY, REVIEW_LOCAL_TIME, user.utc_offset_minutes);
    // Deterministic jobId per user per target minute — Bull rejects duplicates,
    // so boot bootstrap, hourly safety re-arm and the self-reschedule can all
    // call this without producing redundant reviews.
    const fireAtMinute = Math.floor((Date.now() + delay) / 60_000);
    const jobId = `weekly-review:${user.id}:${fireAtMinute}`;

    await this.queue.add(
      'send-weekly-review',
      { userId: user.id },
      { delay, jobId, removeOnComplete: true, removeOnFail: 50 },
    );
  }

  async fire(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    if (user.status === UserStatus.CANCELLED) return;
    if (user.onboarding_stage !== OnboardingStage.COMPLETE) return;

    if (!user.crisis_hold) {
      const offset = user.utc_offset_minutes ?? null;
      const localDate = localDateString(offset);
      const claim = await this.userRepo
        .createQueryBuilder()
        .update(User)
        .set({ last_weekly_review_date: localDate })
        .where('id = :id AND (last_weekly_review_date IS DISTINCT FROM :date)', { id: userId, date: localDate })
        .execute();

      if (!claim.affected) {
        structuredLog(this.logger, 'log', {
          service: 'accountability',
          operation: 'weekly_review_duplicate_suppressed',
          userId,
          localDate,
        });
      } else {
        await this.buildAndSend(user, offset);
      }
    }

    try {
      await this.scheduleReview(user);
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'accountability',
        operation: 'weekly_review_reenqueue_failed',
        userId,
        error: (err as Error).message,
      });
    }
  }

  private async buildAndSend(user: User, offset: number | null): Promise<void> {
    const weekDates = lastNLocalDates(7, offset);
    const [todos, proofCount, scoreSnapshot] = await Promise.all([
      this.todoRepo.find({
        where: { user_id: user.id, scheduled_date: In(weekDates) as unknown as Date },
      }),
      this.countProofsForWeek(user.id, weekDates[weekDates.length - 1], offset),
      this.scoreService.updateScore(user.id).then((s) => s.current_score).catch(() => null),
    ]);

    const doneCount = todos.filter((t) => t.status === DailyTodoStatus.DONE).length;
    const missedCount = todos.filter((t) => t.status === DailyTodoStatus.OPEN).length;

    const message = buildWeeklyReviewMessage({
      userName: user.name ?? '',
      doneCount,
      missedCount,
      proofCount,
      score: scoreSnapshot,
      excusePhrase: user.last_excuse_phrase,
      excuseCount: user.same_excuse_count,
    });

    if (!message) {
      structuredLog(this.logger, 'log', {
        service: 'accountability',
        operation: 'weekly_review_skipped_no_activity',
        userId: user.id,
      });
      return;
    }

    let sendOk = false;
    try {
      await this.messagingService.send(user.phone_number, message);
      sendOk = true;
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'accountability',
        operation: 'weekly_review_send_failed',
        userId: user.id,
        error: (err as Error).message,
      });
    }

    try {
      const boundary = await this.sessionBoundary.checkAndHandle(user.id);
      await this.messageRepo.save({
        user_id: user.id,
        session_id: boundary.sessionId,
        role: MessageRole.AI,
        message_type: MessageType.TEXT,
        content: message,
      });
      await this.sessionBoundary.recordMessage(boundary.sessionId);
    } catch (err) {
      this.logger.warn(`weekly review Message row failed for ${user.id}: ${(err as Error).message}`);
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'weekly_review_sent',
      userId: user.id,
      doneCount,
      missedCount,
      proofCount,
      score: scoreSnapshot,
      sendOk,
    });
  }

  /** Count accepted proofs across the 7-day local window ending on `endLocalDate`. */
  private countProofsForWeek(userId: string, endLocalDate: string, offset: number | null): Promise<number> {
    const [y, m, d] = endLocalDate.split('-').map(Number);
    const endStartUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - (offset ?? 0) * 60_000;
    const endUtcMs = endStartUtcMs + 24 * 60 * 60_000; // end of the last local day
    const startUtcMs = endUtcMs - 7 * 24 * 60 * 60_000; // 7 local days back
    return this.proofRepo.count({
      where: {
        user_id: userId,
        validation_status: ProofValidationStatus.ACCEPTED,
        created_at: Between(new Date(startUtcMs), new Date(endUtcMs)),
      },
    });
  }
}

/** The last N user-local calendar dates (YYYY-MM-DD), oldest first, today last. */
function lastNLocalDates(n: number, offset: number | null): string[] {
  const out: string[] = [];
  const off = (offset ?? 0) * 60_000;
  for (let i = n - 1; i >= 0; i--) {
    const local = new Date(Date.now() + off - i * 24 * 60 * 60_000);
    const yyyy = local.getUTCFullYear();
    const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(local.getUTCDate()).padStart(2, '0');
    out.push(`${yyyy}-${mm}-${dd}`);
  }
  return out;
}
