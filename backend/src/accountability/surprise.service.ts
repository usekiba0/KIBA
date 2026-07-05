import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { User, UserStatus, OnboardingStage } from '../data/entities/user.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { AntiGhostState, GhostState } from '../data/entities/anti-ghost-state.entity';
import { MessagingService } from '../messaging/messaging.service';
import { resolveOffsetMinutes } from '../messaging/world-time';
import {
  buildSurpriseMessage,
  pickSurpriseFlavor,
} from '../ai/prompts/surprise.prompt';
import { structuredLog } from '../common/logger';

/** Don't surprise a user who's actively texting — pop in mid-convo feels weird. */
const RECENT_ACTIVITY_SKIP_MS = 6 * 60 * 60 * 1000;
/** Don't surprise fully-dormant users; they need ghost-reengagement instead. */
const FULLY_DORMANT_DAYS = 14;
/** User-local window the surprise can fire in (11am-6pm). Avoids waking them up. */
const LOCAL_HOUR_MIN = 11;
const LOCAL_HOUR_MAX = 18;
/** How many surprises to plan per user per week (1 or 2). */
const SURPRISES_PER_WEEK_MIN = 1;
const SURPRISES_PER_WEEK_MAX = 2;

interface SurpriseJobData {
  userId: string;
}

/**
 * V5 PART 13 — surprise messages 1-2x/week. Sunday-evening cron picks
 * randomized weekday/time slots per eligible user and enqueues delayed jobs.
 * Each slot fires the `send-surprise` worker on schedule.
 *
 * Design constraint per Karibi 2026-05-29: no big context memory. The
 * "interesting" content is computed at fire time from compact user-row fields
 * (registered_at, miss_counts_by_dow, last_milestone_hit) + a count of
 * completed DailyTasks. No precomputed JSONB blobs.
 */
@Injectable()
export class SurpriseService {
  private readonly logger = new Logger(SurpriseService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    @InjectRepository(AntiGhostState) private readonly ghostRepo: Repository<AntiGhostState>,
    @Inject(forwardRef(() => MessagingService)) private readonly messagingService: MessagingService,
    @InjectQueue('accountability') private readonly queue: Queue,
  ) {}

  /**
   * Plan the upcoming week's surprises for every eligible user. Idempotent
   * via deterministic Bull jobIds — re-running on the same Sunday is a no-op,
   * different invocations that happen to pick different slots can co-exist.
   */
  async scheduleWeek(): Promise<void> {
    const users = await this.userRepo.find({
      where: [
        { status: UserStatus.ACTIVE, onboarding_stage: OnboardingStage.COMPLETE },
        { status: UserStatus.TRIAL, onboarding_stage: OnboardingStage.COMPLETE },
      ],
    });

    let planned = 0;
    let skipped = 0;
    for (const user of users) {
      if (!this.isEligible(user)) {
        skipped++;
        continue;
      }
      try {
        const slots = this.pickWeeklySlots(user);
        for (const slot of slots) {
          await this.enqueueSurprise(user.id, slot);
          planned++;
        }
      } catch (err) {
        this.logger.warn(`scheduleWeek failed for ${user.id}: ${(err as Error).message}`);
      }
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'surprises_planned',
      eligible: users.length - skipped,
      planned,
      skipped,
    });
  }

  /**
   * Worker: fire a single surprise message. Re-checks eligibility at fire time
   * because the user's state may have changed since planning (cancelled,
   * crisis-hold, just texted us, etc.).
   */
  async fire(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !this.isEligible(user)) return;

    // Skip if user is actively engaged — popping in mid-convo undermines the
    // "unprompted" feel and might land on top of an ongoing coaching reply.
    const lastActiveMs = user.last_active_at ? new Date(user.last_active_at).getTime() : 0;
    if (Date.now() - lastActiveMs < RECENT_ACTIVITY_SKIP_MS) {
      structuredLog(this.logger, 'log', {
        service: 'accountability', operation: 'surprise_skipped_recent_activity', userId,
      });
      return;
    }

    // Skip if anti-ghost flow is mid-escalation — ghost messages take priority,
    // a chipper surprise on top would feel tone-deaf.
    const ghostState = await this.ghostRepo.findOne({ where: { user_id: userId } });
    if (ghostState && ghostState.state !== GhostState.ACTIVE) {
      structuredLog(this.logger, 'log', {
        service: 'accountability', operation: 'surprise_skipped_ghost', userId,
        ghostState: ghostState.state,
      });
      return;
    }

    const [profile, completedCount] = await Promise.all([
      this.profileRepo.findOne({ where: { user_id: userId } }),
      this.taskRepo.count({ where: { user_id: userId, status: TaskStatus.COMPLETED } }),
    ]);

    const daysIn = Math.max(1, Math.floor(
      (Date.now() - new Date(user.registered_at).getTime()) / (24 * 60 * 60 * 1000),
    ));
    const flavor = pickSurpriseFlavor(Date.now());

    const message = buildSurpriseMessage({
      flavor,
      userName: user.name ?? '',
      daysIn,
      showedUpCount: completedCount,
      profile,
    });

    try {
      await this.messagingService.send(user.phone_number, message);
      structuredLog(this.logger, 'log', {
        service: 'accountability', operation: 'surprise_sent',
        userId, flavor, daysIn, completedCount,
      });
    } catch (err) {
      this.logger.warn(`surprise send failed for ${userId}: ${(err as Error).message}`);
    }
  }

  private isEligible(user: User): boolean {
    if (user.status === UserStatus.CANCELLED) return false;
    if (user.onboarding_stage !== OnboardingStage.COMPLETE) return false;
    if (user.crisis_hold) return false;
    if (resolveOffsetMinutes(user.iana_timezone, user.utc_offset_minutes) == null) return false;

    // Fully-dormant users (no activity in 14 days) need ghost-reengagement,
    // not surprises. Don't pile a "scale of 1-10" on top of a dead inbox.
    const lastActive = user.last_active_at ?? user.registered_at;
    const daysSinceActive = (Date.now() - new Date(lastActive).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceActive > FULLY_DORMANT_DAYS) return false;

    return true;
  }

  /**
   * Pick 1-2 random fire times in the upcoming week (Mon-Sat 11am-6pm in user
   * local). Returns absolute UTC Date objects.
   *
   * Slot times are quantized to minute granularity so the Bull jobId remains
   * deterministic across re-runs of scheduleWeek within the same Sunday window.
   */
  private pickWeeklySlots(user: User): Date[] {
    const count = SURPRISES_PER_WEEK_MIN + Math.floor(Math.random() * (SURPRISES_PER_WEEK_MAX - SURPRISES_PER_WEEK_MIN + 1));
    const offsetMin = resolveOffsetMinutes(user.iana_timezone, user.utc_offset_minutes) ?? 0;

    // Find the next Monday in user-local time. We're running on Sunday evening
    // by convention but accept any day of week for the planning call.
    const now = new Date();
    const localNowMs = now.getTime() + offsetMin * 60_000;
    const localNow = new Date(localNowMs);
    const daysUntilMonday = ((1 - localNow.getUTCDay()) + 7) % 7 || 7;
    const localMondayMidnight = Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate() + daysUntilMonday,
      0, 0, 0, 0,
    );

    const slots: Date[] = [];
    const dayOffsets = new Set<number>();
    while (dayOffsets.size < count) {
      // Mon=0 .. Sat=5 (skip Sunday — same day cron runs, would be confusing)
      dayOffsets.add(Math.floor(Math.random() * 6));
    }
    for (const dayOffset of dayOffsets) {
      const hour = LOCAL_HOUR_MIN + Math.floor(Math.random() * (LOCAL_HOUR_MAX - LOCAL_HOUR_MIN));
      const minute = Math.floor(Math.random() * 60);
      const localFireMs = localMondayMidnight + dayOffset * 24 * 60 * 60_000 + hour * 60 * 60_000 + minute * 60_000;
      // Convert back to UTC
      const fireAt = new Date(localFireMs - offsetMin * 60_000);
      // Floor to minute so the jobId is stable.
      fireAt.setSeconds(0, 0);
      slots.push(fireAt);
    }
    return slots;
  }

  private async enqueueSurprise(userId: string, fireAt: Date): Promise<void> {
    const delay = fireAt.getTime() - Date.now();
    if (delay <= 0) return;
    const fireMinute = Math.floor(fireAt.getTime() / 60_000);
    const jobId = `surprise:${userId}:${fireMinute}`;
    await this.queue.add(
      'send-surprise',
      { userId } as SurpriseJobData,
      {
        delay,
        jobId,
        removeOnComplete: true,
        removeOnFail: 5,
      },
    );
  }
}
