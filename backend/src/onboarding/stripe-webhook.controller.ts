import {
  Controller, Post, Headers, RawBodyRequest, Req,
  HttpCode, BadRequestException, Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { StripeService } from './stripe.service';
import { MessagingService } from '../messaging/messaging.service';
import { CheckinService } from '../accountability/checkin.service';
import { Subscription, SubscriptionStatus, SubscriptionPlan } from '../data/entities/subscription.entity';
import { User, UserStatus, OnboardingStage } from '../data/entities/user.entity';
import { ProcessedStripeEvent } from '../data/entities/processed-stripe-event.entity';
import { PsychologicalProfile, PressurePreference } from '../data/entities/psychological-profile.entity';
import { Goal } from '../data/entities/goal.entity';
import { structuredLog } from '../common/logger';
import Stripe from 'stripe';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ProcessedStripeEvent) private readonly eventRepo: Repository<ProcessedStripeEvent>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
    @InjectQueue('messaging') private readonly messagingQueue: Queue,
    private readonly messagingService: MessagingService,
    private readonly checkinService: CheckinService,
    private readonly config: ConfigService,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body unavailable — verify middleware order in main.ts');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    // Idempotency: use INSERT with conflict detection (avoids TOCTOU race condition)
    try {
      await this.processEvent(event);
      await this.eventRepo.insert({ stripe_event_id: event.id, event_type: event.type });
    } catch (err) {
      // Unique constraint violation = already processed (concurrent delivery)
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        return { received: true };
      }
      this.logger.error(`Failed to process Stripe event ${event.id}: ${err}`);
      throw err;
    }

    return { received: true };
  }

  private async processEvent(event: Stripe.Event) {
    const data = event.data.object as any;

    switch (event.type) {
      case 'checkout.session.completed': {
        // SMS-first onboarding completed payment. Promote the user from
        // payment_pending -> complete and create their subscription row.
        const session = data as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId) {
          this.logger.warn(`checkout.session.completed without user_id metadata: ${session.id}`);
          break;
        }
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
          this.logger.warn(`checkout.session.completed for unknown user_id ${userId}`);
          break;
        }

        // Find-or-create / REACTIVATE the subscription row from the Stripe sub on
        // this session. For a brand-new customer this creates it. For a RETURNING
        // customer who previously cancelled and is re-paying, we MUST relink the
        // existing row to the new Stripe subscription and reset its status — Stripe
        // issues a new subscription id (the customer id is reused). The old code
        // ran only `if (!sub …)`, so the stale `cancelled` row survived: the user
        // got the "you're in" acknowledgement, then the paywall gate (which checks
        // sub.status) saw `cancelled` and asked them to repay — a double charge
        // with no coaching. The sub=cancelled / user=trial mismatch was the tell.
        let sub = await this.subRepo.findOne({ where: { user_id: user.id } });
        if (session.subscription) {
          // Pull the Stripe subscription so we know the trial_end + status.
          const stripeSub = await this.stripeService.getSubscription(
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
          );
          const now = new Date();
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '';
          const status = (stripeSub.status as SubscriptionStatus) ?? SubscriptionStatus.TRIALING;
          const trialStart = stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000) : now;
          const trialEnd = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : now;
          const periodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null;
          if (!sub) {
            sub = this.subRepo.create({
              user_id: user.id,
              stripe_customer_id: customerId,
              stripe_subscription_id: stripeSub.id,
              plan: SubscriptionPlan.INDIVIDUAL,
              status,
              trial_start: trialStart,
              trial_end: trialEnd,
              current_period_end: periodEnd,
            });
          } else {
            // Returning customer re-paying: relink + reactivate the existing row.
            sub.stripe_customer_id = customerId || sub.stripe_customer_id;
            sub.stripe_subscription_id = stripeSub.id;
            sub.plan = SubscriptionPlan.INDIVIDUAL;
            sub.status = status;
            sub.trial_start = trialStart;
            sub.trial_end = trialEnd;
            sub.current_period_end = periodEnd;
          }
          await this.subRepo.save(sub);
        }

        user.onboarding_stage = OnboardingStage.COMPLETE;
        user.status = UserStatus.TRIAL;
        await this.userRepo.save(user);

        // Promote intake_data into the PsychologicalProfile row that coaching
        // reads on every reply. Without this, the coaching AI loses the mentor
        // / fears / avoidance fields the intake AI captured and starts saying
        // "i don't have that info" when the user asks. Idempotent — skip if a
        // profile already exists (e.g. user came in via the form-based flow).
        const existingProfile = await this.profileRepo.findOne({ where: { user_id: user.id } });
        if (!existingProfile) {
          const intake = user.intake_data ?? {};
          await this.profileRepo.save(
            this.profileRepo.create({
              user_id: user.id,
              fears: intake.fears ?? '',
              avoidance_patterns: intake.avoidance_patterns ?? '',
              comparison_figure: intake.comparison_figure ?? '',
              public_failure_scenario: intake.public_failure_scenario ?? '',
              typical_failure_moment: intake.typical_failure_moment ?? '',
              pressure_preference: intake.pressure_preference === 'encouragement'
                ? PressurePreference.ENCOURAGEMENT
                : PressurePreference.PRESSURE,
            }),
          );
        }

        // Bridge the SMS intake goals into Goal entity rows. The intake AI only
        // ever stored goals as text on intake_data — no Goal row was created and
        // plan-generation was never enqueued, so SMS users got check-ins
        // scheduled but never a goal-anchored daily task or action plan. This
        // creates one Goal row per captured goal, flags the anchor, and kicks off
        // plan generation for it. Idempotent — skips if goals already exist.
        await this.bridgeGoalsFromIntake(user);

        // Bypass Bull/Upstash — the activation SMS is the demo's moment of truth,
        // so deliver directly through SendBlue/Twilio rather than risk a queue
        // worker outage swallowing it silently. Lifecycle notifications elsewhere
        // in this controller (trial_will_end, payment_failed, etc.) stay on the
        // queue since they're tolerant to delays.
        try {
          await this.messagingService.send(
            user.phone_number,
            "you're in. coaching mode unlocked — tell me what we're locking in today.",
          );
        } catch (err) {
          this.logger.error(
            `[StripeWebhook] activation SMS failed for ${user.id}: ${(err as Error).message}`,
          );
        }

        // Retention nudge: a one-time "pin our chat" image so KIBA stays at the
        // top of their messages. Static asset — same image for everyone — sent
        // only if PIN_CHAT_IMAGE_URL is configured (a public HTTPS URL SendBlue/
        // Twilio can fetch), so this is a safe no-op until the image is hosted.
        // Best-effort: a media-send failure must never block activation.
        const pinImageUrl = this.config.get<string>('PIN_CHAT_IMAGE_URL');
        if (pinImageUrl) {
          try {
            await this.messagingService.send(
              user.phone_number,
              'one more thing — pin our chat so i stay at the top and you never lose track of your day 📌 here\'s how:',
              pinImageUrl,
            );
          } catch (err) {
            this.logger.warn(
              `[StripeWebhook] pin-chat image send failed for ${user.id}: ${(err as Error).message}`,
            );
          }
        }

        // Kick off the daily check-in cadence. The intake AI promised this
        // ("we'll set up reminders once you're in") and previously nothing
        // actually scheduled it — payment completed but the user never heard
        // from us again. scheduleCheckin no-ops if checkin_time is null, but
        // the cold-inbound path now defaults it to 09:00 so we always have a
        // value. Errors are non-fatal — the activation worked, the daily loop
        // can be re-kicked off by the next inbound message in the worst case.
        try {
          // Refresh user so we read the post-save state (checkin_time/offset).
          const fresh = await this.userRepo.findOne({ where: { id: user.id } });
          if (fresh) await this.checkinService.scheduleCheckin(fresh);
        } catch (err) {
          this.logger.error(
            `[StripeWebhook] scheduleCheckin failed for ${user.id}: ${(err as Error).message}`,
          );
        }

        structuredLog(this.logger, 'log', {
          service: 'stripe-webhook',
          operation: 'sms_onboarding_complete',
          userId: user.id,
          sessionId: session.id,
        });
        break;
      }

      case 'customer.subscription.created': {
        const sub = await this.subRepo.findOne({ where: { stripe_subscription_id: data.id } });
        if (sub) {
          sub.status = SubscriptionStatus.TRIALING;
          await this.subRepo.save(sub);
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `Your Kiba AI coaching is active! Text me anytime to start. 💪`,
              type: 'subscription_active',
            });

            // Safety net for the web-form path: OnboardingService.submit already
            // calls scheduleCheckin synchronously, but if that call failed (Redis
            // blip) we get a second chance here once Stripe confirms the sub.
            // Idempotent via jobId.
            try {
              await this.checkinService.scheduleCheckin(user);
            } catch (err) {
              this.logger.error(
                `[StripeWebhook] scheduleCheckin on subscription.created failed for ${user.id}: ${(err as Error).message}`,
              );
            }
          }
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub = await this.subRepo.findOne({ where: { stripe_subscription_id: data.id } });
        if (sub) {
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `Your Kiba AI trial ends in 3 days. Your coaching continues automatically — no action needed!`,
              type: 'trial_ending',
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = await this.subRepo.findOne({ where: { stripe_subscription_id: data.id } });
        if (sub) {
          const wasTrialing = sub.status === SubscriptionStatus.TRIALING;
          sub.status = data.status as SubscriptionStatus;
          if (data.current_period_end) sub.current_period_end = new Date(data.current_period_end * 1000);
          await this.subRepo.save(sub);
          if (wasTrialing && data.status === 'active') {
            const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
            if (user) {
              await this.messagingQueue.add('send-message', {
                to: user.phone_number,
                body: `Your free trial has ended and your Kiba AI coaching continues. Welcome to the team! 🎉`,
                type: 'trial_ended',
              });
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const sub = await this.subRepo.findOne({ where: { stripe_customer_id: data.customer } });
        if (sub) {
          sub.status = SubscriptionStatus.PAST_DUE;
          await this.subRepo.save(sub);
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `We couldn't process your Kiba AI payment. Please update your card to keep your coaching active.`,
              type: 'payment_failed',
            });
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const sub = await this.subRepo.findOne({ where: { stripe_customer_id: data.customer } });
        if (sub && sub.status === SubscriptionStatus.PAST_DUE) {
          sub.status = SubscriptionStatus.ACTIVE;
          await this.subRepo.save(sub);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = await this.subRepo.findOne({ where: { stripe_subscription_id: data.id } });
        if (sub) {
          sub.status = SubscriptionStatus.CANCELLED;
          await this.subRepo.save(sub);
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            user.status = UserStatus.CANCELLED;
            await this.userRepo.save(user);
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `Your Kiba AI subscription has ended. Text us any time to reactivate. Take care! 👋`,
              type: 'subscription_cancelled',
            });
          }
        }
        break;
      }
    }

    structuredLog(this.logger, 'log', { service: 'stripe-webhook', operation: event.type });
  }

  /**
   * Create Goal entity rows from the SMS intake's captured goals and enqueue
   * plan generation for the anchor. Closes the long-standing gap where SMS users
   * never got a Goal row (so no action plan, no daily task content).
   *
   * Idempotent: no-ops if the user already has goals (re-delivered webhook, or a
   * web-form user who got their Goal at signup). One row per captured goal; the
   * goal matching intake_data.goal_description is flagged the anchor (else the
   * first). Per-goal timeline/current_status only exist for the anchor in intake,
   * so secondary goals are stored lightweight and can be promoted later.
   */
  private async bridgeGoalsFromIntake(user: User): Promise<void> {
    try {
      const existing = await this.goalRepo.count({ where: { user_id: user.id } });
      if (existing > 0) return;

      const intake = user.intake_data ?? {};
      const anchorText = intake.goal_description?.trim() || null;
      const list = (intake.goals && intake.goals.length ? intake.goals : anchorText ? [anchorText] : [])
        .map((g) => g.trim())
        .filter((g) => g.length > 0);
      const unique = Array.from(new Set(list));
      if (unique.length === 0) return; // nothing captured — leave as-is

      // Anchor = the goal matching goal_description, else the first one.
      const anchorIdx = anchorText && unique.includes(anchorText) ? unique.indexOf(anchorText) : 0;

      const rows = unique.map((description, i) =>
        this.goalRepo.create({
          user_id: user.id,
          description,
          timeline: i === anchorIdx ? intake.goal_timeline?.trim() || '' : '',
          current_status: i === anchorIdx ? intake.current_status?.trim() || '' : '',
          difficulty_level: 3,
          is_anchor: i === anchorIdx,
        }),
      );
      await this.goalRepo.save(rows);

      // Plan generation targets the anchor (handler resolves via findAnchorGoal).
      await this.messagingQueue.add('plan-generation', { userId: user.id });

      structuredLog(this.logger, 'log', {
        service: 'stripe-webhook',
        operation: 'goals_bridged_from_intake',
        userId: user.id,
        goalCount: rows.length,
      });
    } catch (err) {
      // Non-fatal — activation must still complete. Worst case there's no action
      // plan yet; a later inbound or backfill can recreate goals.
      this.logger.error(
        `[StripeWebhook] bridgeGoalsFromIntake failed for ${user.id}: ${(err as Error).message}`,
      );
    }
  }
}
