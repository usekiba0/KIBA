import { ConflictException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { User, UserStatus } from '../data/entities/user.entity';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../data/entities/subscription.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { Goal } from '../data/entities/goal.entity';
import { StripeService } from './stripe.service';
import { CheckinService } from '../accountability/checkin.service';
import { OnboardingFormDto } from './dto/onboarding-form.dto';
import { structuredLog } from '../common/logger';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue('messaging') private readonly messagingQueue: Queue,
    private readonly stripeService: StripeService,
    @Inject(forwardRef(() => CheckinService)) private readonly checkinService: CheckinService,
    private readonly config: ConfigService,
  ) {}

  async checkPhone(phone: string): Promise<{ exists: boolean }> {
    const existing = await this.userRepo.findOne({ where: { phone_number: phone } });
    return { exists: !!existing };
  }

  async createSetupIntent(name: string, phoneNumber: string) {
    const existing = await this.userRepo.findOne({ where: { phone_number: phoneNumber } });
    if (existing) throw new ConflictException('This phone number is already registered.');
    const customer = await this.stripeService.createCustomer(name, phoneNumber);
    const setupIntent = await this.stripeService.createSetupIntent(customer.id);
    return { client_secret: setupIntent.client_secret, stripe_customer_id: customer.id };
  }

  async submit(dto: OnboardingFormDto) {
    const existing = await this.userRepo.findOne({ where: { phone_number: dto.phone_number } });
    if (existing) throw new ConflictException('This phone number is already registered. Please sign in instead.');

    const betaMode = this.config.get<string>('BETA_MODE') === 'true';
    const isBetaBypass = betaMode && dto.stripe_payment_method_id === 'pm_beta_bypass';

    if (isBetaBypass) {
      return this.submitBeta(dto);
    }

    const priceId = this.config.getOrThrow<string>('STRIPE_PRICE_ID_INDIVIDUAL');
    const trialDays = this.config.get<number>('STRIPE_TRIAL_DAYS', 3);

    let stripeCustomerId: string | null = null;
    let stripeSubscriptionId: string | null = null;

    try {
      // Reuse the customer created during setup-intent — avoids attaching a payment method
      // from one customer to a different customer (which Stripe rejects with 400).
      if (dto.stripe_customer_id) {
        stripeCustomerId = dto.stripe_customer_id;
      } else {
        const customer = await this.stripeService.createCustomer(dto.name, dto.phone_number);
        stripeCustomerId = customer.id;
      }

      const stripeSub = await this.stripeService.createSubscriptionWithTrial(
        stripeCustomerId!,
        dto.stripe_payment_method_id,
        priceId,
        trialDays,
      );
      stripeSubscriptionId = stripeSub.id;
      const trialEnd = new Date(stripeSub.trial_end! * 1000);

      // Persist user + subscription in a DB transaction
      const result = await this.dataSource.transaction(async (manager) => {
        const user = manager.create(User, {
          phone_number: dto.phone_number,
          name: dto.name,
          coaching_focus: dto.coaching_focus,
          goals: dto.goals,
          height_cm: dto.height_cm ?? null,
          weight_kg: dto.weight_kg ?? null,
          age: dto.age ?? null,
          health_conditions: dto.health_conditions ?? [],
          dietary_restrictions: dto.dietary_restrictions ?? [],
          injuries: dto.injuries ?? null,
          checkin_time: dto.checkin_time ?? null,
          utc_offset_minutes: dto.utc_offset_minutes ?? null,
          status: UserStatus.TRIAL,
        });
        const savedUser = await manager.save(User, user);

        const sub = manager.create(Subscription, {
          user_id: savedUser.id,
          stripe_customer_id: stripeCustomerId!,
          stripe_subscription_id: stripeSubscriptionId!,
          plan: (dto.plan as SubscriptionPlan) ?? SubscriptionPlan.INDIVIDUAL,
          status: SubscriptionStatus.TRIALING,
          trial_start: new Date(),
          trial_end: trialEnd,
        });
        await manager.save(Subscription, sub);

        const profile = manager.create(PsychologicalProfile, {
          user_id: savedUser.id,
          fears: dto.fears,
          avoidance_patterns: dto.avoidance_patterns,
          comparison_figure: dto.comparison_figure,
          public_failure_scenario: dto.public_failure_scenario,
          typical_failure_moment: dto.typical_failure_moment,
          pressure_preference: dto.pressure_preference,
          cussing_ok: dto.cussing_ok === true,
        });
        await manager.save(PsychologicalProfile, profile);

        const goal = manager.create(Goal, {
          user_id: savedUser.id,
          description: dto.goal_description,
          timeline: dto.goal_timeline,
          current_status: dto.current_status,
          difficulty_level: 3,
          // The web form captures a single goal — it's the anchor by definition.
          is_anchor: true,
        });
        await manager.save(Goal, goal);

        return { savedUser, trialEnd };
      });

      // Queue welcome message (outside transaction — non-critical)
      const welcomeText = this.buildWelcomeMessage(result.savedUser, dto);
      await this.messagingQueue.add('send-message', {
        to: result.savedUser.phone_number,
        body: welcomeText,
        type: 'welcome',
      });

      // Queue plan generation
      await this.messagingQueue.add('plan-generation', {
        userId: result.savedUser.id,
      });

      // Kick off the daily check-in cadence directly so it doesn't depend on
      // plan-generation succeeding (LLM timeouts, malformed JSON, etc.). The
      // jobId guard in scheduleCheckin makes this idempotent with any other
      // scheduling path (plan-generation handler, Stripe webhook, boot-time
      // scheduleAllCheckins). Non-fatal if it fails — the boot hook re-tries.
      try {
        await this.checkinService.scheduleCheckin(result.savedUser);
      } catch (err) {
        this.logger.error(
          `scheduleCheckin failed for new user ${result.savedUser.id}: ${(err as Error).message}`,
        );
      }

      structuredLog(this.logger, 'log', {
        service: 'onboarding',
        operation: 'user_created',
        userId: result.savedUser.id,
      });

      return {
        user_id: result.savedUser.id,
        phone_number: result.savedUser.phone_number,
        subscription_status: SubscriptionStatus.TRIALING,
        trial_end: result.trialEnd,
        welcome_sms_queued: true,
      };
    } catch (err) {
      // Compensating action: cancel orphaned Stripe subscription/customer if DB write failed
      if (stripeSubscriptionId) {
        await this.stripeService
          .cancelSubscription(stripeSubscriptionId)
          .catch((e) =>
            this.logger.error(
              `Failed to cancel orphaned Stripe subscription ${stripeSubscriptionId}: ${e}`,
            ),
          );
      }
      if (stripeCustomerId) {
        await this.stripeService
          .deleteCustomer(stripeCustomerId)
          .catch((e) =>
            this.logger.error(
              `Failed to delete orphaned Stripe customer ${stripeCustomerId}: ${e}`,
            ),
          );
      }
      throw err;
    }
  }

  private async submitBeta(dto: OnboardingFormDto) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    const result = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        phone_number: dto.phone_number,
        name: dto.name,
        coaching_focus: dto.coaching_focus,
        goals: dto.goals,
        height_cm: dto.height_cm ?? null,
        weight_kg: dto.weight_kg ?? null,
        age: dto.age ?? null,
        health_conditions: dto.health_conditions ?? [],
        dietary_restrictions: dto.dietary_restrictions ?? [],
        injuries: dto.injuries ?? null,
        checkin_time: dto.checkin_time ?? null,
        utc_offset_minutes: dto.utc_offset_minutes ?? null,
        status: UserStatus.TRIAL,
      });
      const savedUser = await manager.save(User, user);

      const phoneSuffix = dto.phone_number.replace(/\D/g, '').slice(-10);
      const sub = manager.create(Subscription, {
        user_id: savedUser.id,
        stripe_customer_id: `cus_beta_${phoneSuffix}`,
        stripe_subscription_id: `sub_beta_${phoneSuffix}`,
        plan: (dto.plan as SubscriptionPlan) ?? SubscriptionPlan.INDIVIDUAL,
        status: SubscriptionStatus.TRIALING,
        trial_start: new Date(),
        trial_end: trialEnd,
      });
      await manager.save(Subscription, sub);

      return { savedUser, trialEnd };
    });

    const welcomeText = this.buildWelcomeMessage(result.savedUser, dto);
    await this.messagingQueue.add('send-message', {
      to: result.savedUser.phone_number,
      body: welcomeText,
      type: 'welcome',
    });

    // Beta path skips plan-generation entirely (no Stripe = no subscription event
    // to chain off of). Without this call, beta users get a welcome SMS and then
    // silence — no daily check-in ever fires. Idempotent via jobId.
    try {
      await this.checkinService.scheduleCheckin(result.savedUser);
    } catch (err) {
      this.logger.error(
        `scheduleCheckin failed for beta user ${result.savedUser.id}: ${(err as Error).message}`,
      );
    }

    structuredLog(this.logger, 'log', {
      service: 'onboarding',
      operation: 'user_created_beta',
      userId: result.savedUser.id,
    });

    return {
      user_id: result.savedUser.id,
      phone_number: result.savedUser.phone_number,
      subscription_status: SubscriptionStatus.TRIALING,
      trial_end: result.trialEnd,
      welcome_sms_queued: true,
    };
  }

  private buildWelcomeMessage(user: User, dto: OnboardingFormDto): string {
    const firstName = (user.name ?? 'friend').split(/\s+/)[0];
    const goal = dto.goal_description ?? dto.goals ?? null;
    const avoidance = dto.avoidance_patterns?.trim() || null;

    // KIBA voice: lowercase, short, peer energy, no exclamation points or corporate
    // openers. Reference the avoidance pattern (what they keep failing to fix) over
    // the fear — it's the more actionable callback the spec keeps coming back to.
    const lines: string[] = [`hey ${firstName} — i'm KIBA.`];
    lines.push(`not another app you forget about. i text you, follow up, remember what you tell me.`);

    if (goal && avoidance) {
      lines.push(`you said you want to ${goal}, and that ${avoidance} is what keeps tripping you up.`);
      lines.push(`good. that's exactly what we're fixing.`);
    } else if (goal) {
      lines.push(`you said you want to ${goal}. i'm here to make sure you actually do it.`);
    } else {
      lines.push(`whatever you said you wanted — i'm here to make sure you actually do it.`);
    }

    lines.push(`reply YES when you're ready and we get to work.`);
    return lines.join(' ');
  }
}
