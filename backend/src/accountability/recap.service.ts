import { Injectable, Logger, Inject, forwardRef, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { User, UserStatus, OnboardingStage } from '../data/entities/user.entity';
import { DailyTodo, DailyTodoStatus, DailyTodoSource } from '../data/entities/daily-todo.entity';
import { Proof, ProofValidationStatus } from '../data/entities/proof.entity';
import { Message, MessageRole, MessageType } from '../data/entities/message.entity';
import { MessagingService } from '../messaging/messaging.service';
import { resolveOffsetMinutes } from '../messaging/world-time';
import { SessionBoundaryService } from '../data/session-boundary.service';
import { ScoreService } from './score.service';
import { computeLocalDelayMs } from './schedule-time.util';
import { localDateString } from './checkin.processor';
import { buildNightRecapMessage } from '../ai/prompts/recap.prompt';
import { structuredLog } from '../common/logger';

/** User-local wall-clock time the recap fires at — 9pm, after the day is done. */
const RECAP_LOCAL_TIME = '21:00';

/**
 * Night Recap (V1 spec PART 7). A nightly per-user job that mirrors the day
 * back: completed vs dropped missions, proof sent, the day's score, and
 * tomorrow's correction.
 *
 * Scheduling mirrors the morning check-in's self-healing design — boot-time
 * bootstrap + the hourly safety re-arm (driven from CheckinProcessor) + a
 * self-reschedule after each fire — so a Redis flap can't permanently kill the
 * cadence. Sends are deduped per user-local day via an atomic claim on
 * `last_recap_date`, the same way check-ins claim `last_checkin_date`.
 */
@Injectable()
export class RecapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecapService.name);

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

  /**
   * Schedule tonight's recap for every active user on boot. Fire-and-forget so
   * a failure here never blocks startup. Deterministic jobIds make it a no-op
   * for users already scheduled.
   */
  onApplicationBootstrap(): void {
    setImmediate(() => {
      this.scheduleAllRecaps().catch((err) => {
        structuredLog(this.logger, 'error', {
          service: 'accountability',
          operation: 'recap_bootstrap_failed',
          error: (err as Error).message,
        });
      });
    });
  }

  async scheduleAllRecaps(): Promise<void> {
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
      if (resolveOffsetMinutes(user.iana_timezone, user.utc_offset_minutes) == null) {
        skipped++;
        continue;
      }
      try {
        await this.scheduleRecap(user);
        scheduled++;
      } catch (err) {
        this.logger.error(`scheduleAllRecaps failed for ${user.id}: ${(err as Error).message}`);
      }
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'recaps_scheduled',
      total: users.length,
      scheduled,
      skipped,
    });
  }

  async scheduleRecap(user: User): Promise<void> {
    const offset = resolveOffsetMinutes(user.iana_timezone, user.utc_offset_minutes);
    if (offset == null) return;

    const delay = computeLocalDelayMs(RECAP_LOCAL_TIME, offset);
    // Deterministic jobId per user per target minute — Bull rejects duplicates,
    // so boot bootstrap, hourly safety re-arm and the self-reschedule below can
    // all call this without producing N redundant recaps.
    const fireAtMinute = Math.floor((Date.now() + delay) / 60_000);
    const jobId = `recap:${user.id}:${fireAtMinute}`;

    await this.queue.add(
      'send-recap',
      { userId: user.id },
      { delay, jobId, removeOnComplete: true, removeOnFail: 50 },
    );
  }

  /**
   * Worker: aggregate today's activity, send the recap, then re-enqueue
   * tomorrow's. Mirrors CheckinProcessor.handleSendCheckin: cancelled / not-
   * onboarded users stop the loop; crisis-hold suppresses tonight's send but
   * keeps cadence; an atomic per-local-day claim guarantees one recap per day.
   */
  async fire(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    if (user.status === UserStatus.CANCELLED) return;
    if (user.onboarding_stage !== OnboardingStage.COMPLETE) return;

    if (!user.crisis_hold) {
      const offset = resolveOffsetMinutes(user.iana_timezone, user.utc_offset_minutes);
      const localDate = localDateString(offset);
      const claim = await this.userRepo
        .createQueryBuilder()
        .update(User)
        .set({ last_recap_date: localDate })
        .where('id = :id AND (last_recap_date IS DISTINCT FROM :date)', { id: userId, date: localDate })
        .execute();

      if (!claim.affected) {
        structuredLog(this.logger, 'log', {
          service: 'accountability',
          operation: 'recap_duplicate_suppressed',
          userId,
          localDate,
        });
      } else {
        await this.buildAndSend(user, localDate, offset);
      }
    }

    try {
      await this.scheduleRecap(user);
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'accountability',
        operation: 'recap_reenqueue_failed',
        userId,
        error: (err as Error).message,
      });
    }
  }

  private async buildAndSend(user: User, localDate: string, offset: number | null): Promise<void> {
    const [todos, proofCount, scoreSnapshot] = await Promise.all([
      this.todoRepo.find({ where: { user_id: user.id, scheduled_date: localDate as unknown as Date } }),
      this.countProofsForLocalDay(user.id, localDate, offset),
      // Refresh + read today's score. Best-effort: a scoring hiccup shouldn't
      // sink the whole recap, so fall back to null (the line is then omitted).
      this.scoreService.updateScore(user.id).then((s) => s.current_score).catch(() => null),
    ]);

    // Done counts for any source — completing an auto-seeded plan task is real engagement.
    const done = todos.filter((t) => t.status === DailyTodoStatus.DONE).map((t) => t.content);
    // Only shame tasks the user actually engaged with: ones THEY added (USER) or the
    // coach added mid-convo (AI). Auto-seeded PLAN tasks that are still OPEN were never
    // agreed to — the user may never have seen them — so they are NOT counted as
    // "missed". This stops the "you folded on everything" recap for ten goals the user
    // never discussed (Bianca, 2026-06-29). Skipped is intentional — also excluded.
    const missed = todos
      .filter((t) => t.status === DailyTodoStatus.OPEN && t.source !== DailyTodoSource.PLAN)
      .map((t) => t.content);

    const message = buildNightRecapMessage({
      userName: user.name ?? '',
      done,
      missed,
      proofCount,
      score: scoreSnapshot,
      excusePhrase: user.last_excuse_phrase,
      excuseCount: user.same_excuse_count,
    });

    // Nothing on the board today → nothing to recap. Stay quiet.
    if (!message) {
      structuredLog(this.logger, 'log', {
        service: 'accountability',
        operation: 'recap_skipped_no_activity',
        userId: user.id,
        localDate,
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
        operation: 'recap_send_failed',
        userId: user.id,
        error: (err as Error).message,
      });
    }

    // Persist as a Message row so the recap shows up in the admin SMS history
    // and in the next coaching turn's context. Visibility only — a failure here
    // must not break anything.
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
      this.logger.warn(`recap Message row failed for ${user.id}: ${(err as Error).message}`);
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'recap_sent',
      userId: user.id,
      doneCount: done.length,
      missedCount: missed.length,
      proofCount,
      score: scoreSnapshot,
      sendOk,
    });
  }

  /** Count accepted proofs whose timestamp falls inside the user's local day. */
  private countProofsForLocalDay(userId: string, localDate: string, offset: number | null): Promise<number> {
    const [y, m, d] = localDate.split('-').map(Number);
    const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - (offset ?? 0) * 60_000;
    const endUtcMs = startUtcMs + 24 * 60 * 60_000;
    return this.proofRepo.count({
      where: {
        user_id: userId,
        validation_status: ProofValidationStatus.ACCEPTED,
        created_at: Between(new Date(startUtcMs), new Date(endUtcMs)),
      },
    });
  }
}
