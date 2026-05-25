import {
  Controller, Post, Headers, RawBodyRequest, Req,
  HttpCode, BadRequestException, Logger,
} from '@nestjs/common';
import { Request } from 'express';
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
    @InjectQueue('messaging') private readonly messagingQueue: Queue,
    private readonly messagingService: MessagingService,
    private readonly checkinService: CheckinService,
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

        // Find or create the subscription row. The customer.subscription.created
        // event may have already created one — if so, just promote the user.
        let sub = await this.subRepo.findOne({ where: { user_id: user.id } });
        if (!sub && session.subscription) {
          // Pull the Stripe subscription so we know the trial_end + status.
          const stripeSub = await this.stripeService.getSubscription(
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
          );
          const now = new Date();
          sub = this.subRepo.create({
            user_id: user.id,
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '',
            stripe_subscription_id: stripeSub.id,
            plan: SubscriptionPlan.INDIVIDUAL,
            status: (stripeSub.status as SubscriptionStatus) ?? SubscriptionStatus.TRIALING,
            trial_start: stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000) : now,
            trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : now,
          });
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
}
