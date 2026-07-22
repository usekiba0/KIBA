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
    @InjectQueue('accountability') private readonly accountabilityQueue: Queue,
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
              // Real money vs test-mode — drives the dashboard's real MRR.
              livemode: event.livemode,
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
            sub.livemode = event.livemode;
          }
          await this.subRepo.save(sub);
        }

        user.onboarding_stage = OnboardingStage.COMPLETE;
        user.status = UserStatus.TRIAL;
        // Re-arm the day-7 price reveal for THIS trial (a returning customer
        // re-paying gets a fresh trial, so they get a fresh reveal).
        user.trial_price_revealed_at = null;
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
        // Sales-psychology rule (Karibi 2026-06-27): do NOT celebrate the tap.
        // No "you're in", no "coaching mode unlocked", no "let's go" — those read
        // automated and break the vibe. Act like it was always going to happen and
        // move straight into the plan, referencing their goal when we have it.
        try {
          const goalShort = user.intake_data?.goal_description?.trim();
          await this.messagingService.send(
            user.phone_number,
            goalShort
              ? `alright. we're locked in on ${goalShort}. what's the first move today?`
              : `alright. we're locked in. what's the first move today?`,
          );
        } catch (err) {
          this.logger.error(
            `[StripeWebhook] activation SMS failed for ${user.id}: ${(err as Error).message}`,
          );
        }

        // Apple-masking Path B (launch call 2026-07-10): auto-send the KIBA
        // contact card so the user saves it and every future text shows "KIBA"
        // instead of a bare number — Apple has no native branding for a
        // business that texts first, so the saved contact IS the branding (and
        // it defeats iOS "Screen Unknown Senders"). The .vcf carries BOTH the
        // SendBlue (iMessage) and Twilio (SMS) numbers so one save brands both
        // threads. Set CONTACT_CARD_URL to a public HTTPS URL of the .vcf
        // (frontend/public/kiba-contact.vcf; regenerate via
        // backend/scripts/gen-contact-card.js). No-op until configured.
        // Best-effort: a failure must never block activation. Sent BEFORE the
        // pin-chat nudge — save the contact first, then pin it.
        const contactCardUrl = this.config.get<string>('CONTACT_CARD_URL');
        if (contactCardUrl) {
          try {
            await this.messagingService.send(
              user.phone_number,
              'first thing — save my contact so i always show up as KIBA in your texts 📲',
              contactCardUrl,
            );
          } catch (err) {
            this.logger.warn(
              `[StripeWebhook] contact-card send failed for ${user.id}: ${(err as Error).message}`,
            );
          }
        }

        // Retention nudge: a one-time "pin our chat" how-to so KIBA stays at the
        // top of their messages. The media can be an image, GIF, or VIDEO — the
        // send path passes the URL straight to SendBlue (media_url) / Twilio
        // (mediaUrl), both of which handle video/GIF (Karibi 2026-06-27). Set
        // PIN_CHAT_MEDIA_URL to a public HTTPS URL of the clip (falls back to the
        // legacy PIN_CHAT_IMAGE_URL). No-op until one is configured. NOTE: keep it
        // small — iMessage handles video natively, but Android/MMS (Twilio) caps
        // size, so a short GIF or a compressed <~1MB mp4 is safest cross-platform.
        // Best-effort: a media-send failure must never block activation.
        const pinMediaUrl =
          this.config.get<string>('PIN_CHAT_MEDIA_URL') ??
          this.config.get<string>('PIN_CHAT_IMAGE_URL');
        if (pinMediaUrl) {
          try {
            await this.messagingService.send(
              user.phone_number,
              'one more thing — pin our chat so i stay at the top and you never lose track of your day 📌 here\'s how:',
              pinMediaUrl,
            );
          } catch (err) {
            this.logger.warn(
              `[StripeWebhook] pin-chat media send failed for ${user.id}: ${(err as Error).message}`,
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

        // Day-7 price reveal (Karibi 2026-06-26): schedule ONE KIBA-voice message
        // to land a few hours before the trial charges, so the price arrives as
        // the natural next step after a week of value — not a surprise bill. Uses
        // the real Stripe trial_end; jobId keyed on the sub id makes a re-delivered
        // webhook a no-op. The handler re-checks status so a churned user is skipped.
        if (sub?.trial_end) {
          try {
            const REVEAL_BEFORE_END_MS = 4 * 60 * 60 * 1000; // ~4h ahead of the charge
            const delay = Math.max(0, sub.trial_end.getTime() - Date.now() - REVEAL_BEFORE_END_MS);
            await this.accountabilityQueue.add(
              'trial-price-reveal',
              { userId: user.id },
              { delay, jobId: `trial-price-reveal:${sub.stripe_subscription_id}` },
            );
          } catch (err) {
            this.logger.error(
              `[StripeWebhook] schedule trial-price-reveal failed for ${user.id}: ${(err as Error).message}`,
            );
          }
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
          sub.livemode = event.livemode;
          await this.subRepo.save(sub);
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            // NO activation SMS here — it was a DUPLICATE (Karibi 2026-06-26).
            // Both onboarding paths already send exactly one activation message,
            // and this event fires alongside each:
            //   - SMS path: checkout.session.completed sends the KIBA-voice
            //     "you're in. coaching mode unlocked…" (above).
            //   - web-form path: OnboardingService.submit sends its own 'welcome'.
            // Sending "your coaching is active 💪" on top of either was the
            // back-to-back double text. We keep ONLY the scheduleCheckin safety net.
            //
            // Safety net for the web-form path: OnboardingService.submit already
            // calls scheduleCheckin synchronously, but if that failed (Redis blip)
            // we get a second chance here once Stripe confirms the sub. Idempotent
            // via jobId.
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
            // KIBA voice, momentum only — NO price here. The price reveal is its
            // own day-7 message (trial-price-reveal); pre-empting it with a SaaS
            // "trial ends, no action needed" notice kills that moment.
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `few days in and you're actually showing up. that's the hard part right there. keep it going, i'm locked in with you.`,
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
          sub.livemode = event.livemode;
          if (data.current_period_end) sub.current_period_end = new Date(data.current_period_end * 1000);
          await this.subRepo.save(sub);
          if (wasTrialing && data.status === 'active') {
            const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
            if (user) {
              // KIBA voice confirmation (the day-7 reveal already framed the price).
              // No celebration — just keep moving (sales-psychology rule).
              await this.messagingQueue.add('send-message', {
                to: user.phone_number,
                body: `that's week one in the books. nothing changes on your end, i'm still on you every morning. let's keep building.`,
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
              body: `hey, your card didn't go through on my end. update it real quick so we don't lose your momentum.`,
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
              body: `alright, you're unsubscribed, no hard feelings. whenever you wanna lock back in just text me and i'll get you set right back up.`,
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
