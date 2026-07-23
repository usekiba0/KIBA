import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Between } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  ScheduledReminder,
  ScheduledReminderStatus,
  ReminderRecurrence,
} from '../data/entities/scheduled-reminder.entity';
import { User } from '../data/entities/user.entity';
import { MessagingService } from '../messaging/messaging.service';
import { resolveOffsetMinutes } from '../messaging/world-time';
import { structuredLog } from '../common/logger';
import { reminderSignature, sameIntentOneShot } from './reminder-content';
import { OutboundRecorderService } from '../data/outbound-recorder.service';

// 2-minute floor: SendBlue queue + iMessage delivery has 30-90s of inherent
// latency. Below this we can't promise the user a useful reminder, so we
// reject upfront rather than firing late.
export const MIN_DELAY_MS = 2 * 60_000;
export const MIN_DELAY_MINUTES = MIN_DELAY_MS / 60_000;
const MAX_DELAY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// How far from a new ping we'll look for the stale one it replaces. Kept tight
// on purpose: a re-committed time moves by hours, not days, and over-merging
// (a reminder silently disappearing) is worse than under-merging (one extra
// ping the user can see and remove).
const SUPERSEDE_WINDOW_MS = 3 * 60 * 60_000;

export interface EnqueueArgs {
  userId: string;
  sessionId?: string | null;
  createdByMessageId?: string | null;
  fireAt: Date;
  message: string;
  recurrence?: DailyRecurrence | null;
}

export interface DailyRecurrence {
  rule: ReminderRecurrence.DAILY;
  /** Local clock the user wants the reminder at, "HH:MM" 24h. */
  localTime: string;
  /** Snapshot of user.utc_offset_minutes at creation time (DST fallback). */
  offsetMinutes: number;
  /**
   * User's IANA zone at creation. When set, each occurrence recomputes the live
   * offset from it so the reminder doesn't drift 1h across a DST transition.
   */
  ianaTimezone?: string | null;
  /**
   * Set internally when the worker re-enqueues a recurring occurrence so every
   * row in the chain shares the same parent_id. Tool callers leave this unset
   * for the first occurrence — the service stamps the new row's own id.
   */
  parentId?: string;
}

/**
 * For a "daily at HH:MM in offset O" recurrence, compute the next UTC fire
 * time strictly AFTER `now`. Caller passes the user's offset at creation time
 * so DST shifts don't quietly drift the reminder off the user's clock.
 *
 * Pure function, exported for tests.
 */
export function nextDailyFireAt(now: Date, localHHmm: string, offsetMinutes: number): Date {
  const m = localHHmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) throw new Error(`invalid HH:MM: ${localHHmm}`);
  const targetHour = parseInt(m[1], 10);
  const targetMin = parseInt(m[2], 10);

  // Work in "local minutes since epoch" by shifting UTC by the offset.
  const localNowMs = now.getTime() + offsetMinutes * 60_000;
  const localNow = new Date(localNowMs);

  // Build today's HH:MM as if `localNow` were the UTC frame (we'll convert back at the end).
  let candidateLocal = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    targetHour,
    targetMin,
    0,
    0,
  );
  if (candidateLocal <= localNowMs) {
    candidateLocal += 24 * 60 * 60_000;
  }
  return new Date(candidateLocal - offsetMinutes * 60_000);
}

/**
 * Normalize a local clock time to zero-padded "HH:MM", or null if it isn't a
 * valid 24h time. The model supplies recurrence.local_time as a raw string and
 * its formatting drifts ("8:00" one turn, "08:00" the next). Both the daily-
 * reminder dedup and the partial-unique index key on this exact string, and
 * nextDailyFireAt's strict regex throws on a non-padded hour — so an
 * un-normalized value silently defeats dedup AND kills the chain on re-enqueue.
 * Normalizing here is the single choke point that keeps all of that consistent.
 * Pure, exported for tests.
 */
export function normalizeLocalTime(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const m = String(raw)
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${m[2]}`;
}

export interface EnqueueResult {
  ok: true;
  reminderId: string;
  fireAtIso: string;
}

/**
 * Who is cancelling and why — written to the row's failure_reason and logged.
 * `killChain` stops a daily series outright; without it, cancelling one
 * occurrence of a chain skips that occurrence and re-arms the next.
 */
export interface CancelOpts {
  actor?: 'admin' | 'ai_tool' | 'supersede' | 'crisis_hold' | string;
  reason?: string;
  killChain?: boolean;
}

export interface EnqueueRejection {
  ok: false;
  reason: string;
}

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    @InjectRepository(ScheduledReminder)
    private readonly reminderRepo: Repository<ScheduledReminder>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectQueue('accountability') private readonly queue: Queue,
    private readonly messagingService: MessagingService,
    private readonly recorder: OutboundRecorderService,
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
      return {
        ok: false,
        reason: `minimum is ${MIN_DELAY_MINUTES} minutes from now — anything sooner can't reliably deliver`,
      };
    }
    if (delayMs > MAX_DELAY_MS) {
      return { ok: false, reason: 'fire_at must be within 1 year' };
    }
    if (!args.message?.trim()) {
      return { ok: false, reason: 'message is required' };
    }

    let rec = args.recurrence ?? null;

    // Normalize the daily local time up front so dedup, the unique index, and
    // nextDailyFireAt all see the same canonical "HH:MM". Reject an unparseable
    // value rather than storing a string that would later throw on re-enqueue.
    if (rec?.rule === ReminderRecurrence.DAILY) {
      const normalized = normalizeLocalTime(rec.localTime);
      if (!normalized) {
        return { ok: false, reason: 'recurrence local_time must be a valid "HH:MM" 24h time' };
      }
      rec = { ...rec, localTime: normalized };
    }

    // Idempotency for user-created daily reminders: one chain per (user, local
    // time, message). The coaching model used to spawn a brand-new daily chain
    // every time it set "remind me each morning", and each chain re-enqueues
    // itself forever — so redundant reminders stacked and all fired in the same
    // morning window (Karibi 2026-07-08 — dozens every morning). Collapse an
    // IDENTICAL repeat request into the existing chain.
    //
    // The dedup key MUST include the message, not just the time: a user can have
    // two genuinely different daily reminders at the same clock time — e.g. an
    // "8pm log dinner" and an "8pm walk/workout check-in". Keying on time alone
    // silently overwrote one with the other (Karibi 2026-07-16 — "kiba stopped
    // reminding me to check in on my 8pm walks"). Matching on the exact message
    // too lets distinct-purpose reminders coexist while still collapsing a true
    // duplicate. Trade-off: a re-worded same-purpose reminder isn't merged, but
    // over-merging (silent loss) is worse than under-merging (a visible extra
    // ping the user can remove). Scoped to first-of-chain (no parentId): the
    // recurrence re-enqueue below runs only AFTER the prior occurrence is FIRED,
    // so it never matches here and is never blocked from continuing a live chain.
    if (rec?.rule === ReminderRecurrence.DAILY && rec.localTime && !rec.parentId) {
      const existing = await this.reminderRepo.findOne({
        where: {
          user_id: args.userId,
          status: ScheduledReminderStatus.PENDING,
          recurrence_rule: ReminderRecurrence.DAILY,
          recurrence_local_time: rec.localTime,
          message: args.message.trim(),
        },
      });
      if (existing) {
        await this.reminderRepo.update(existing.id, {
          recurrence_offset_minutes: rec.offsetMinutes,
          recurrence_iana_timezone: rec.ianaTimezone ?? null,
        });
        structuredLog(this.logger, 'log', {
          service: 'schedule',
          operation: 'daily_reminder_deduped',
          userId: args.userId,
          reminderId: existing.id,
          localTime: rec.localTime,
        });
        return { ok: true, reminderId: existing.id, fireAtIso: existing.fire_at.toISOString() };
      }
    }

    // One-off pre-task pings and proof checks SUPERSEDE rather than stack. When
    // a user moves a committed time the model schedules a fresh pair, and the
    // stale pair used to survive and fire too (Karibi 2026-07-19 — three "30 min
    // till push" in one minute). Only reminders whose structure we recognize are
    // ever superseded, and only within a few hours, so an unrelated reminder can
    // never be silently dropped.
    if (!rec) {
      const signature = reminderSignature(args.message);
      const from = new Date(args.fireAt.getTime() - SUPERSEDE_WINDOW_MS);
      const to = new Date(args.fireAt.getTime() + SUPERSEDE_WINDOW_MS);
      const candidates = await this.reminderRepo.find({
        where: {
          user_id: args.userId,
          status: ScheduledReminderStatus.PENDING,
          recurrence_rule: IsNull(),
          fire_at: Between(from, to),
        },
      });
      for (const old of candidates) {
        // Two supersede paths, both conservative:
        //   1) structured pre/proof pings for the same activity within the window
        //      (a re-committed time moved the pair);
        //   2) a free-form one-shot at the EXACT same minute whose content-word
        //      overlap says it's the same intent — the typo-re-confirm dup
        //      (Karibi 2026-07-23: two tailor pickups, 16s apart, both 10am).
        const sigMatch = signature !== null && reminderSignature(old.message) === signature;
        const sameMinuteDup =
          old.fire_at.getTime() === args.fireAt.getTime() &&
          sameIntentOneShot(old.message, args.message);
        if (!sigMatch && !sameMinuteDup) continue;
        await this.cancel(old.id, {
          actor: 'supersede',
          reason: sigMatch
            ? `superseded by a newer ${signature} ping`
            : 'superseded by a re-scheduled duplicate at the same minute',
        });
        structuredLog(this.logger, 'log', {
          service: 'schedule',
          operation: 'reminder_superseded',
          userId: args.userId,
          reminderId: old.id,
          signature: sigMatch ? signature : 'same_minute_intent',
        });
      }
    }

    let saved: ScheduledReminder;
    try {
      saved = await this.reminderRepo.save({
        user_id: args.userId,
        session_id: args.sessionId ?? null,
        created_by_message_id: args.createdByMessageId ?? null,
        fire_at: args.fireAt,
        message: args.message.trim(),
        status: ScheduledReminderStatus.PENDING,
        recurrence_rule: rec?.rule ?? null,
        recurrence_local_time: rec?.localTime ?? null,
        recurrence_offset_minutes: rec?.offsetMinutes ?? null,
        recurrence_iana_timezone: rec?.ianaTimezone ?? null,
        recurrence_parent_id: rec?.parentId ?? null,
      });
    } catch (err) {
      // Backstop for the partial-unique index (one pending daily reminder per
      // user/local-time/message): if a concurrent create beat us past the findOne
      // dedup above, the insert hits a 23505 unique violation. Recover by
      // returning the winner instead of surfacing an error — same outcome as the
      // dedup. Keyed on message too so we return the matching chain, not an
      // unrelated same-time reminder.
      if (
        (err as { code?: string }).code === '23505' &&
        rec?.rule === ReminderRecurrence.DAILY &&
        rec.localTime &&
        !rec.parentId
      ) {
        const winner = await this.reminderRepo.findOne({
          where: {
            user_id: args.userId,
            status: ScheduledReminderStatus.PENDING,
            recurrence_rule: ReminderRecurrence.DAILY,
            recurrence_local_time: rec.localTime,
            message: args.message.trim(),
          },
        });
        if (winner) {
          return { ok: true, reminderId: winner.id, fireAtIso: winner.fire_at.toISOString() };
        }
        // The winning row already fired/cancelled between the violation and this
        // read, so the slot is momentarily free but the duplicate is resolved.
        // Report a soft rejection rather than leaking a raw QueryFailedError.
        return { ok: false, reason: 'a daily reminder for that time was just scheduled' };
      }
      throw err;
    }

    // First-of-chain: stamp parent_id to its own id so the whole chain shares one.
    if (rec && !rec.parentId) {
      await this.reminderRepo.update(saved.id, { recurrence_parent_id: saved.id });
    }

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
      recurrence: rec?.rule ?? null,
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

    let sendErr: Error | null = null;
    try {
      await this.messagingService.send(user.phone_number, reminder.message);
      // Visible to the live coaching layer + admin API (Retraining doc B1) —
      // fired reminders were previously invisible to the conversation thread.
      await this.recorder.record(user.id, reminder.message, 'reminder');
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
      sendErr = err as Error;
      await this.reminderRepo.update(reminderId, {
        status: ScheduledReminderStatus.FAILED,
        failure_reason: sendErr.message.slice(0, 500),
      });
      this.logger.error(`fire failed for ${reminderId}: ${sendErr.message}`);
    }

    // Recurring: enqueue the next occurrence whether or not THIS send succeeded.
    // The re-arm lives OUTSIDE the send try/catch on purpose — a transient
    // SendBlue/Twilio failure must NEVER permanently kill a daily chain (Karibi
    // 2026-07-16: reminders "stopped reminding me to log food / check in on my
    // 8pm walks" after a hiccup — the re-enqueue used to sit inside the send
    // success path, so one failed send ended the chain forever). The
    // 'accountability' queue runs these jobs with Bull's default single attempt,
    // so re-arming here can't double-fire via a retry. Errors are logged, never
    // thrown — a broken re-arm degrades to "user can re-ask", not a crash.
    if (this.isDailyChainRow(reminder)) {
      await this.rearmDailyChain(reminder);
    }

    // Surface a send failure to the caller only AFTER the chain is safely
    // re-armed above (the row is already marked FAILED). Preserves failure
    // observability without sacrificing the recurring chain.
    if (sendErr) throw sendErr;
  }

  async findById(reminderId: string): Promise<ScheduledReminder | null> {
    return this.reminderRepo.findOne({ where: { id: reminderId } });
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

  /**
   * Stop a recurring series — cancels the currently-pending occurrence and any
   * other pending rows sharing the same parent_id, with NO re-arm (this is the
   * one deliberate "kill the chain" path). Returns the count of rows cancelled
   * (0 if nothing pending was found).
   */
  async cancelSeries(parentId: string, opts: CancelOpts = {}): Promise<number> {
    const pending = await this.reminderRepo.find({
      where: {
        recurrence_parent_id: parentId,
        status: ScheduledReminderStatus.PENDING,
      },
    });
    let count = 0;
    for (const row of pending) {
      const result = await this.cancel(row.id, {
        ...opts,
        reason: opts.reason ?? `series cancelled by ${opts.actor ?? 'unknown'}`,
        killChain: true,
      });
      if (result?.status === ScheduledReminderStatus.CANCELLED) count++;
    }
    return count;
  }

  /**
   * Cancel one reminder. Never anonymous: the actor/reason is written to
   * failure_reason and logged — the 2026-07-22 incident (all three of one
   * user's daily chains dead, no trace of what cancelled them) is exactly what
   * a silent cancel path costs.
   *
   * Chain survival: a daily chain re-arms only when an occurrence FIRES, so
   * cancelling a pending occurrence used to kill the whole series forever.
   * Cancelling one occurrence now means "skip this one" — the next occurrence
   * is re-armed — unless `killChain` is set (cancelSeries sets it; that is the
   * explicit stop-the-series path).
   */
  async cancel(reminderId: string, opts: CancelOpts = {}): Promise<ScheduledReminder | null> {
    const reminder = await this.reminderRepo.findOne({ where: { id: reminderId } });
    if (!reminder) return null;
    if (reminder.status !== ScheduledReminderStatus.PENDING) return reminder;

    if (reminder.bull_job_id) {
      const job = await this.queue.getJob(reminder.bull_job_id);
      if (job) await job.remove().catch(() => undefined);
    }
    await this.reminderRepo.update(reminderId, {
      status: ScheduledReminderStatus.CANCELLED,
      failure_reason: opts.reason ?? `cancelled by ${opts.actor ?? 'unknown'}`,
    });
    structuredLog(this.logger, 'log', {
      service: 'schedule',
      operation: 'reminder_cancelled',
      userId: reminder.user_id,
      reminderId,
      actor: opts.actor ?? 'unknown',
      reason: opts.reason ?? null,
      recurring: reminder.recurrence_rule ?? null,
      rearmed: this.isDailyChainRow(reminder) && !opts.killChain,
    });

    if (this.isDailyChainRow(reminder) && !opts.killChain) {
      await this.rearmDailyChain(reminder);
    }

    return this.reminderRepo.findOne({ where: { id: reminderId } });
  }

  private isDailyChainRow(reminder: ScheduledReminder): boolean {
    return (
      reminder.recurrence_rule === ReminderRecurrence.DAILY &&
      !!reminder.recurrence_local_time &&
      reminder.recurrence_offset_minutes !== null
    );
  }

  /**
   * Enqueue the next occurrence of a daily chain. Never throws — a broken
   * re-arm degrades to "user can re-ask", not a crash (and, from fire(), a
   * transient send failure must never permanently kill a chain — Karibi
   * 2026-07-16).
   */
  private async rearmDailyChain(reminder: ScheduledReminder): Promise<void> {
    try {
      // Recompute the offset LIVE from the zone (DST-correct) when we have
      // one, else use the frozen snapshot. This is what keeps a "daily 7am"
      // at 7am across a DST flip instead of drifting to 6am/8am.
      const occurrenceOffset =
        resolveOffsetMinutes(
          reminder.recurrence_iana_timezone,
          reminder.recurrence_offset_minutes,
        ) ?? reminder.recurrence_offset_minutes!;
      const nextFire = nextDailyFireAt(
        new Date(),
        reminder.recurrence_local_time!,
        occurrenceOffset,
      );
      await this.enqueue({
        userId: reminder.user_id,
        sessionId: reminder.session_id,
        createdByMessageId: reminder.created_by_message_id,
        fireAt: nextFire,
        message: reminder.message,
        recurrence: {
          rule: ReminderRecurrence.DAILY,
          localTime: reminder.recurrence_local_time!,
          offsetMinutes: reminder.recurrence_offset_minutes!,
          ianaTimezone: reminder.recurrence_iana_timezone,
          parentId: reminder.recurrence_parent_id ?? reminder.id,
        },
      });
    } catch (recErr) {
      this.logger.error(
        `recurrence re-enqueue failed for ${reminder.id}: ${(recErr as Error).message}`,
      );
    }
  }
}
