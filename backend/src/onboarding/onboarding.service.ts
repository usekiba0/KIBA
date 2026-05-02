import { Injectable, Logger } from '@nestjs/common';
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
import { StripeService } from './stripe.service';
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
    private readonly config: ConfigService,
  ) {}

  async createSetupIntent(name: string, phoneNumber: string) {
    const customer = await this.stripeService.createCustomer(name, phoneNumber);
    const setupIntent = await this.stripeService.createSetupIntent(customer.id);
    return { client_secret: setupIntent.client_secret, stripe_customer_id: customer.id };
  }

  async submit(dto: OnboardingFormDto) {
    // Idempotent: return existing user if already registered
    const existing = await this.userRepo.findOne({ where: { phone_number: dto.phone_number } });
    if (existing) {
      const sub = await this.subRepo.findOne({ where: { user_id: existing.id } });
      return {
        user_id: existing.id,
        phone_number: existing.phone_number,
        subscription_status: sub?.status ?? SubscriptionStatus.TRIALING,
        trial_end: sub?.trial_end ?? null,
        welcome_sms_queued: false,
      };
    }

    const betaMode = this.config.get<string>('BETA_MODE') === 'true';
    const isBetaBypass = betaMode && dto.stripe_payment_method_id === 'pm_beta_bypass';

    if (isBetaBypass) {
      return this.submitBeta(dto);
    }

    const priceId = this.config.getOrThrow<string>('STRIPE_PRICE_ID_INDIVIDUAL');
    const trialDays = this.config.get<number>('STRIPE_TRIAL_DAYS', 30);

    // Create Stripe resources first so we can reference them in the DB transaction.
    // If the DB transaction fails we cancel the Stripe subscription as compensation.
    let stripeCustomerId: string | null = null;
    let stripeSubscriptionId: string | null = null;

    try {
      const customer = await this.stripeService.createCustomer(dto.name, dto.phone_number);
      stripeCustomerId = customer.id;

      const stripeSub = await this.stripeService.createSubscriptionWithTrial(
        customer.id,
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

        return { savedUser, trialEnd };
      });

      // Queue welcome message (outside transaction — non-critical)
      const welcomeText = this.buildWelcomeMessage(result.savedUser);
      await this.messagingQueue.add('send-message', {
        to: result.savedUser.phone_number,
        body: welcomeText,
        type: 'welcome',
      });

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

    const welcomeText = this.buildWelcomeMessage(result.savedUser);
    await this.messagingQueue.add('send-message', {
      to: result.savedUser.phone_number,
      body: welcomeText,
      type: 'welcome',
    });

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

  private buildWelcomeMessage(user: User): string {
    const focusMap: Record<string, string> = {
      fitness: 'fitness',
      nutrition: 'your nutrition',
      wellness: 'your wellbeing',
      combined: 'your health journey',
    };
    const focus = focusMap[user.coaching_focus] ?? 'your goals';
    return `Hey ${user.name}! I'm Ryke, your AI coach. Ready to work on ${focus}. What's on your mind today?`;
  }
}
