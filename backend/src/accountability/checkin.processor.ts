import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { User, OnboardingStage, UserStatus } from '../data/entities/user.entity';
// DailyTask repo is no longer needed here — task lookup/creation is handled
// by TaskService.ensureTodayTask, which encapsulates the day-index + cycling
// logic. Keeps this processor lean.
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { Message, MessageRole, MessageType } from '../data/entities/message.entity';
import { MessagingService } from '../messaging/messaging.service';
import { SessionBoundaryService } from '../data/session-boundary.service';
import { AntiGhostService } from './anti-ghost.service';
import { ScheduleService } from './schedule.service';
import { CheckinService } from './checkin.service';
import { TaskService } from './task.service';
import { SurpriseService } from './surprise.service';
import { buildCheckinMessage } from '../ai/prompts/checkin.prompt';
import { structuredLog } from '../common/logger';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

@Processor('accountability')
export class CheckinProcessor {
  private readonly logger = new Logger(CheckinProcessor.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    private readonly messagingService: MessagingService,
    private readonly sessionBoundary: SessionBoundaryService,
    private readonly antiGhostService: AntiGhostService,
    private readonly scheduleService: ScheduleService,
    private readonly checkinService: CheckinService,
    private readonly taskService: TaskService,
    private readonly surpriseService: SurpriseService,
    @InjectQueue('accountability') private readonly queue: Queue,
  ) {}

  @Process('send-checkin')
  async handleSendCheckin(job: Job<{ userId: string }>): Promise<void> {
    const { userId } = job.data;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    // Stop the daily loop if user cancelled or never finished onboarding.
    // crisis_hold suppresses today's send but we still re-enqueue tomorrow's
    // — the user might be unflagged by then and shouldn't lose the cadence.
    if (user.status === UserStatus.CANCELLED) return;
    if (user.onboarding_stage !== OnboardingStage.COMPLETE) return;

    if (!user.crisis_hold) {
      // ensureTodayTask creates today's DailyTask if one doesn't exist yet
      // (the schema was always queried but nothing wrote to it before this).
      // Returns null if no goal / no action_plan / no daily_tasks defined —
      // in which case we fall through to the "no tasks today" check-in copy.
      const [task, profile] = await Promise.all([
        this.taskService.ensureTodayTask(userId),
        this.profileRepo.findOne({ where: { user_id: userId } }),
      ]);

      const safeName = user.name ?? 'friend';
      // Compute user-local DOW so Thu/Fri get the end-of-week push variant.
      // Sun=0..Sat=6. Null offset → null DOW → neutral template.
      const offset = user.utc_offset_minutes ?? null;
      const localDow = offset !== null
        ? new Date(Date.now() + offset * 60_000).getUTCDay()
        : null;
      const message = task
        ? buildCheckinMessage(safeName, profile, task.task_description, { localDow })
        : buildCheckinMessage(safeName, profile, null, { localDow });

      // CRITICAL: wrap send so a Twilio/SendBlue throw can't kill the
      // re-enqueue chain below. We lost cadence for every prod user this way —
      // the daily-checkin job ran once, send failed (or was silently dropped),
      // the exception bubbled, BullMQ marked the job failed, and re-enqueue
      // never happened. From that point forward the user got nothing forever.
      // After this fix: send failures are logged but the daily chain survives.
      let sendOk = false;
      try {
        await this.messagingService.send(user.phone_number, message);
        sendOk = true;
      } catch (err) {
        structuredLog(this.logger, 'error', {
          service: 'accountability',
          operation: 'checkin_send_failed',
          userId,
          error: (err as Error).message,
        });
      }

      // Persist the check-in as a Message row so it shows up in the admin API
      // (filterable via is_checkin_prompt) and in the next coaching turn's
      // recent-message context. Without this, check-ins were invisible —
      // there's no way to confirm from the DB whether they ever fired, which
      // is what masked the prod outage we're fixing here.
      try {
        const boundary = await this.sessionBoundary.checkAndHandle(userId);
        await this.messageRepo.save({
          user_id: userId,
          session_id: boundary.sessionId,
          role: MessageRole.AI,
          message_type: MessageType.TEXT,
          content: message,
          is_checkin_prompt: true,
        });
        await this.sessionBoundary.recordMessage(boundary.sessionId);
      } catch (err) {
        // Visibility is a nice-to-have, not a correctness blocker. Log + move on.
        this.logger.warn(`checkin Message row failed for ${userId}: ${(err as Error).message}`);
      }

      if (task && sendOk) {
        await this.queue.add(
          'checkin-missed',
          { userId, taskId: task.id },
          { delay: TWO_HOURS_MS },
        );
      }

      structuredLog(this.logger, 'log', {
        service: 'accountability',
        operation: 'checkin_sent',
        userId,
        taskId: task?.id ?? null,
        sendOk,
      });
    }

    // Re-enqueue tomorrow's check-in. Daily cadence is the whole product —
    // without this self-reschedule each user gets exactly one check-in then
    // silence forever. Delegating to checkinService.scheduleCheckin keeps
    // jobId-based idempotency in one place so a Stripe webhook + bootstrap
    // script + this self-reschedule can't all double-enqueue.
    // Wrapped in try/catch for the same reason as the send above — a single
    // user's broken state must not stop the chain for everyone else.
    try {
      await this.checkinService.scheduleCheckin(user);
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'accountability',
        operation: 'reenqueue_failed',
        userId,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Safety net: hourly re-run of scheduleAllCheckins. Boot-time bootstrap
   * already exists, but Render only deploys on push — if Redis flaps mid-week
   * and a deploy doesn't follow, cadence stays broken for every user until the
   * next push. The hourly cron closes that window.
   *
   * Idempotent via the deterministic jobId in scheduleCheckin — same minute =
   * same jobId = Bull rejects the duplicate, so already-healthy users are a no-op.
   */
  @Process('safety-reschedule-checkins')
  async handleSafetyReschedule(): Promise<void> {
    await this.checkinService.scheduleAllCheckins();
  }

  @Process('send-scheduled-reminder')
  async handleScheduledReminder(job: Job<{ reminderId: string }>): Promise<void> {
    await this.scheduleService.fire(job.data.reminderId);
  }

  /**
   * SMS-first onboarding dunning. Fires at 24h then 72h after the payment link
   * is sent if the user hasn't paid yet. After two nudges we stop pestering.
   */
  @Process('payment-link-nudge')
  async handlePaymentLinkNudge(job: Job<{ userId: string; nudgeIndex: number }>): Promise<void> {
    const { userId, nudgeIndex } = job.data;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    if (user.onboarding_stage !== OnboardingStage.PAYMENT_PENDING) return; // paid or moved on
    if (user.dunning_nudges_sent >= 2) return;
    if (user.crisis_hold) return;

    const messages = [
      "still got your payment link sitting in our chat. takes 30 sec — text me once you're in and we lock in day one.",
      "last nudge — pay the link i sent and we start. ignore this if you're out, no hard feelings.",
    ];
    const text = messages[Math.min(nudgeIndex, messages.length - 1)];
    await this.messagingService.send(user.phone_number, text);
    await this.userRepo.update(userId, { dunning_nudges_sent: user.dunning_nudges_sent + 1 });

    structuredLog(this.logger, 'log', {
      service: 'onboarding', operation: 'dunning_nudge_sent',
      userId, nudgeIndex,
    });

    // Schedule the next nudge (24h after the first → 72h total after link sent)
    if (nudgeIndex === 0) {
      await this.queue.add(
        'payment-link-nudge',
        { userId, nudgeIndex: 1 },
        { delay: 48 * 60 * 60 * 1000 },
      );
    }
  }

  @Process('checkin-missed')
  async handleCheckinMissed(job: Job<{ userId: string; taskId: string }>): Promise<void> {
    const { userId, taskId } = job.data;
    await this.antiGhostService.onMissedCheckin(userId, taskId);

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'checkin_missed',
      userId,
      taskId,
    });
  }

  /**
   * Handles ghost escalation jobs at levels 2-6 (the +5h, d2, d3, d5, d7 pings).
   * AntiGhostService enqueues these chained — each handler fires the level's
   * scripted message and schedules the next level if there is one.
   *
   * Critical: this handler did NOT exist in prod before 63e43a1 — anti-ghost
   * jobs were enqueued but never consumed, so the entire ghost-reengagement
   * system was a silent no-op since launch.
   */
  @Process('ghost-escalate')
  async handleGhostEscalate(job: Job<{ userId: string; taskId: string; level: 2 | 3 | 4 | 5 | 6 }>): Promise<void> {
    const { userId, taskId, level } = job.data;
    await this.antiGhostService.onEscalate(userId, taskId, level);
  }

  /**
   * Sunday-evening planner. Picks 1-2 random user-local time slots in the
   * upcoming Mon-Sat per eligible user and enqueues delayed send-surprise
   * jobs. Idempotent — re-runs that hit different slots can co-exist; same
   * slot is rejected by Bull jobId dedup.
   */
  @Process('plan-week-surprises')
  async handlePlanWeekSurprises(): Promise<void> {
    await this.surpriseService.scheduleWeek();
  }

  /**
   * Worker for a single surprise message. Re-checks eligibility at fire time
   * (user might have cancelled / hit crisis hold / just texted between when
   * we planned this and when it fires).
   */
  @Process('send-surprise')
  async handleSendSurprise(job: Job<{ userId: string }>): Promise<void> {
    await this.surpriseService.fire(job.data.userId);
  }
}
