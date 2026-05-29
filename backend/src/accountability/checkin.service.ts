import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { User, UserStatus, OnboardingStage } from '../data/entities/user.entity';
import { structuredLog } from '../common/logger';

@Injectable()
export class CheckinService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectQueue('accountability') private readonly queue: Queue,
  ) {}

  /**
   * Self-heal after every deploy / Redis restart.
   *
   * Bull jobs live in Redis. If Redis flaps (e.g. Upstash quota limit, server
   * restart, network blip) the queued `send-checkin` jobs can be lost — and
   * because the processor self-reschedules ONLY after a job runs, the daily
   * cadence for that user dies permanently with no recovery.
   *
   * This hook re-enqueues today's check-in for every COMPLETE user on every
   * boot. The deterministic jobId in scheduleCheckin makes it safe to call
   * unconditionally: Bull rejects duplicates for the same user/target-minute,
   * so already-healthy users are a no-op.
   *
   * Fire-and-forget — failures here must not block app startup. Errors are
   * structured-logged so they surface in Render dashboards.
   */
  async onApplicationBootstrap(): Promise<void> {
    setImmediate(() => {
      this.scheduleAllCheckins()
        .then(() => {
          structuredLog(this.logger, 'log', {
            service: 'accountability',
            operation: 'bootstrap_complete',
          });
        })
        .catch((err) => {
          structuredLog(this.logger, 'error', {
            service: 'accountability',
            operation: 'bootstrap_failed',
            error: (err as Error).message,
          });
        });

      // Install the hourly safety re-arm. Boot bootstrap above is one-shot; this
      // is the recurring sibling that protects cadence between deploys.
      this.installSafetyRescheduleCron().catch((err) => {
        structuredLog(this.logger, 'error', {
          service: 'accountability',
          operation: 'safety_cron_install_failed',
          error: (err as Error).message,
        });
      });
    });
  }

  /**
   * Add a repeatable Bull job that runs scheduleAllCheckins every hour. Using
   * Bull's repeat option (not @nestjs/schedule) so we don't introduce a new
   * dependency for one cron — `accountability` is already wired everywhere.
   *
   * Bull `repeat` jobs are idempotent across deploys: the repeat key is derived
   * from the cron/every value, so re-installing the same schedule on every boot
   * is a no-op. removeOnComplete prevents the completed-jobs list from growing
   * unbounded.
   */
  private async installSafetyRescheduleCron(): Promise<void> {
    await this.queue.add(
      'safety-reschedule-checkins',
      {},
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: 'safety-reschedule-checkins',
        removeOnComplete: true,
        removeOnFail: 5,
      },
    );
    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'safety_cron_installed',
      intervalMs: 60 * 60 * 1000,
    });
  }

  computeDelayMs(checkinTime: string, utcOffsetMinutes = 0): number {
    const [hours, minutes] = checkinTime.split(':').map(Number);

    // Convert user's local time → UTC by subtracting their offset
    const localTotalMins = hours * 60 + minutes;
    const utcTotalMins = ((localTotalMins - utcOffsetMinutes) % 1440 + 1440) % 1440;
    const utcH = Math.floor(utcTotalMins / 60);
    const utcM = utcTotalMins % 60;

    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(utcH, utcM, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  async scheduleCheckin(user: User): Promise<any> {
    if (!user.checkin_time) return undefined;

    // Pass the user's offset so the delay targets THEIR 09:00, not server UTC 09:00.
    // Without this, US-Eastern users were getting check-ins at 04:00–05:00 local.
    const delay = this.computeDelayMs(user.checkin_time, user.utc_offset_minutes ?? 0);

    // Deterministic jobId per user per target minute. Bull rejects duplicate
    // jobIds, so the function becomes safe to call from multiple paths
    // (Stripe webhook, bootstrap script, self-reschedule from processor)
    // without producing N redundant check-ins for the same user.
    const fireAtMinute = Math.floor((Date.now() + delay) / 60_000);
    const jobId = `checkin:${user.id}:${fireAtMinute}`;

    const job = await this.queue.add(
      'send-checkin',
      { userId: user.id },
      { delay, jobId, removeOnComplete: true, removeOnFail: 50 },
    );

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'checkin_scheduled',
      userId: user.id,
      delayMs: delay,
      jobId,
    });

    return job;
  }

  async scheduleOneShot(userId: string, delayMs: number): Promise<void> {
    await this.queue.add('send-checkin', { userId }, { delay: delayMs });
    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'oneshot_scheduled',
      userId,
      delayMs,
    });
  }

  async scheduleAllCheckins(): Promise<void> {
    // Only users who completed onboarding AND haven't cancelled — mirrors the
    // skip guards in CheckinProcessor.handleSendCheckin so we don't enqueue
    // jobs that would immediately no-op. `crisis_hold` users ARE included
    // (the processor handles suppressing today's send while keeping cadence).
    const users = await this.userRepo.find({
      where: [
        { status: UserStatus.ACTIVE, onboarding_stage: OnboardingStage.COMPLETE },
        { status: UserStatus.TRIAL, onboarding_stage: OnboardingStage.COMPLETE },
        { status: UserStatus.PAUSED, onboarding_stage: OnboardingStage.COMPLETE },
      ],
    });

    let scheduled = 0;
    let skipped = 0;
    let failed = 0;
    for (const user of users) {
      if (!user.checkin_time) { skipped++; continue; }
      try {
        await this.scheduleCheckin(user);
        scheduled++;
      } catch (err) {
        failed++;
        this.logger.error(
          `scheduleAllCheckins: failed for user ${user.id}: ${(err as Error).message}`,
        );
      }
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'schedule_all_done',
      total: users.length,
      scheduled,
      skipped,
      failed,
    });
  }
}
