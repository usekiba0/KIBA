import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { User, OnboardingStage, UserStatus } from '../data/entities/user.entity';
import { StripeService } from '../onboarding/stripe.service';
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
import { RecapService } from './recap.service';
import { buildCheckinMessage } from '../ai/prompts/checkin.prompt';
import { structuredLog } from '../common/logger';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * User-LOCAL calendar day as YYYY-MM-DD — the key for the once-per-day check-in
 * claim. `now` is injectable for tests. Null offset falls back to the UTC day.
 */
export function localDateString(offsetMinutes: number | null, now: number = Date.now()): string {
  const d = new Date(now + (offsetMinutes ?? 0) * 60_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Follow-up sequence for leads who got a payment link but haven't paid.
 * Three nudges total. The first fires ~2.5h after the link (scheduled by
 * CoachingProcessor.sendPaymentLink); these are the delays BEFORE the next one:
 *   nudge 0 → nudge 1: ~22h later (~next day, ~24h after the link)
 *   nudge 1 → nudge 2: ~48h later (~2-3 days after the link, final)
 */
const NUDGE_NEXT_DELAY_MS = [22 * 60 * 60 * 1000, 48 * 60 * 60 * 1000];
const MAX_DUNNING_NUDGES = 3;

/**
 * Build a follow-up nudge in KIBA's voice, personalised with what the lead told
 * us during intake. Falls back gracefully when a field is missing so we never
 * render "undefined" or an empty reference. Pure + exported for testing.
 */
export function buildDunningNudge(
  index: number,
  ctx: { name: string | null; goal?: string | null; obstacle?: string | null; trialDays: number },
): string {
  const name = ctx.name?.trim() || '';
  const tail = name ? ` ${name}` : '';
  const goal = ctx.goal?.trim();
  const obstacle = ctx.obstacle?.trim();
  const d = ctx.trialDays;

  switch (index) {
    case 0:
      // Playful + value-demonstrating: their ghosting IS the proof of what they
      // need. Plant FOMO, not pressure. Free trial framed as zero-risk, not an ask.
      return goal
        ? `ngl${tail} — good thing you haven't fully locked in yet 😭 cause if you ghosted me like this AFTER we started, i'd be ALL over you about ${goal}${obstacle ? ` — especially when ${obstacle} starts creeping back in` : ''}. that's literally the point though. ${d} days free, zero risk — wanna see what that actually feels like?`
        : `ngl${tail} — good thing you haven't fully locked in yet 😭 cause if you ghosted me like this after, i'd be all over you. that's the whole point though. ${d} days free, zero risk. wanna see what it feels like?`;
    case 1:
      // FOMO + value: name what they're missing, keep it light and human.
      return goal
        ? `${name ? `${name} 👀 ` : '👀 '}you told me ${goal} actually mattered to you${obstacle ? `, and that ${obstacle} keeps winning` : ''}. most people fold right at the edge of starting — that's exactly where i come in. ${d} days. free. just feel the difference. 🔥`
        : `${name ? `${name} 👀 ` : '👀 '}most people fold right at the edge of starting — that's exactly where i come in. you already told me what you want. ${d} days, free, just feel the difference. 🔥`;
    default:
      // Final — warm FOMO, no guilt-trip, door stays open.
      return goal
        ? `last time i bring it up${tail} 🙏 ${goal}${obstacle ? `. ${obstacle}` : ''} — you told me both, and none of that's changed. at some point it stops being "should i try this" and becomes "how long do i let it stay the same." door's open whenever you are. ${d} days free.`
        : `last time i bring it up${tail} 🙏 at some point it stops being "should i try this" and becomes "how long do i let it stay exactly the same." door's open whenever you are. ${d} days free.`;
  }
}

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
    private readonly recapService: RecapService,
    private readonly stripeService: StripeService,
    private readonly config: ConfigService,
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
      // ── Atomic per-day dedup ──────────────────────────────────────────────
      // The check-in was firing 2-3x some mornings: Bull's jobId dedup is voided
      // by removeOnComplete the instant the job runs, so racing schedulers (boot
      // bootstrap, hourly safety cron, self-reschedule, scheduleOneShot) could
      // re-enqueue the same target minute at fire time. We CLAIM the user-local
      // day with a single conditional UPDATE — only one job per local day wins;
      // the rest skip the send (but still re-enqueue tomorrow below).
      const offset = user.utc_offset_minutes ?? null;
      const localDate = localDateString(offset);
      const claim = await this.userRepo
        .createQueryBuilder()
        .update(User)
        .set({ last_checkin_date: localDate })
        .where('id = :id AND (last_checkin_date IS DISTINCT FROM :date)', { id: userId, date: localDate })
        .execute();

      if (!claim.affected) {
        structuredLog(this.logger, 'log', {
          service: 'accountability',
          operation: 'checkin_duplicate_suppressed',
          userId,
          localDate,
        });
      } else {
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
    // Re-arm night recaps on the same hourly heartbeat so a Redis flap can't
    // permanently kill recap cadence either. Idempotent via deterministic jobId.
    await this.recapService.scheduleAllRecaps();
  }

  /**
   * Worker for a single user's night recap. Aggregates the day, sends, and
   * self-reschedules tomorrow's recap. Re-checks eligibility at fire time.
   */
  @Process('send-recap')
  async handleSendRecap(job: Job<{ userId: string }>): Promise<void> {
    await this.recapService.fire(job.data.userId);
  }

  @Process('send-scheduled-reminder')
  async handleScheduledReminder(job: Job<{ reminderId: string }>): Promise<void> {
    await this.scheduleService.fire(job.data.reminderId);
  }

  /**
   * SMS-first onboarding follow-up sequence. Three nudges — ~2.5h, ~next day,
   * ~2-3 days after the link — for leads who haven't paid yet. Each one is
   * personalised with the lead's goal/obstacle and ships a FRESH checkout link
   * (the original Stripe session expires at 24h, so reusing it would be a dead
   * link by nudge 2). After three we stop pestering.
   */
  @Process('payment-link-nudge')
  async handlePaymentLinkNudge(job: Job<{ userId: string; nudgeIndex: number }>): Promise<void> {
    const { userId, nudgeIndex } = job.data;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    if (user.onboarding_stage !== OnboardingStage.PAYMENT_PENDING) return; // paid or moved on
    if (user.dunning_nudges_sent >= MAX_DUNNING_NUDGES) return;
    if (user.crisis_hold) return;

    const text = buildDunningNudge(nudgeIndex, {
      name: user.name,
      goal: user.intake_data?.goal_description ?? null,
      obstacle: user.intake_data?.avoidance_patterns ?? null,
      trialDays: this.config.get<number>('STRIPE_TRIAL_DAYS', 7),
    });
    await this.messagingService.send(user.phone_number, text);

    // Ship a fresh link on its own line so it's always live and clickable. If
    // regen fails (Stripe hiccup), fall back to a reply CTA rather than a dead
    // or missing link — the conversation re-engages either way.
    const freshUrl = await this.regenerateCheckoutLink(user);
    await this.messagingService.send(
      user.phone_number,
      freshUrl ?? "reply 'go' and i'll send you a fresh link.",
    );

    await this.userRepo.update(userId, { dunning_nudges_sent: user.dunning_nudges_sent + 1 });

    structuredLog(this.logger, 'log', {
      service: 'onboarding', operation: 'dunning_nudge_sent',
      userId, nudgeIndex, linkRegenerated: !!freshUrl,
    });

    // Schedule the next nudge in the sequence, if any remain.
    const nextDelay = NUDGE_NEXT_DELAY_MS[nudgeIndex];
    if (nextDelay !== undefined && nudgeIndex + 1 < MAX_DUNNING_NUDGES) {
      await this.queue.add(
        'payment-link-nudge',
        { userId, nudgeIndex: nudgeIndex + 1 },
        { delay: nextDelay },
      );
    }
  }

  /**
   * Create a fresh Stripe checkout session for a still-unpaid lead and record it
   * on the user row. Returns the hosted URL, or null if the user has no name or
   * Stripe fails (caller falls back to a reply CTA). Does NOT change
   * onboarding_stage — the lead is already PAYMENT_PENDING.
   */
  private async regenerateCheckoutLink(user: User): Promise<string | null> {
    if (!user.name) return null;
    try {
      const priceId = this.config.getOrThrow<string>('STRIPE_PRICE_ID_INDIVIDUAL');
      const trialDays = this.config.get<number>('STRIPE_TRIAL_DAYS', 7);
      // Return pages are FRONTEND routes — use FRONTEND_URL, not APP_BASE_URL
      // (the backend has no /onboarding/success route and would 404 after pay).
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://kiba.ai');
      const customer = await this.stripeService.createCustomer(user.name, user.phone_number);
      const session = await this.stripeService.createCheckoutSession({
        customerId: customer.id,
        priceId,
        trialDays,
        userId: user.id,
        successUrl: `${frontendUrl}/onboarding/success`,
        cancelUrl: `${frontendUrl}/onboarding/cancel`,
      });
      if (!session.url) return null;
      await this.userRepo.update(user.id, {
        payment_link_sent_at: new Date(),
        stripe_checkout_session_id: session.id,
      });
      return session.url;
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'onboarding', operation: 'dunning_link_regen_failed',
        userId: user.id, error: (err as Error).message,
      });
      return null;
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
