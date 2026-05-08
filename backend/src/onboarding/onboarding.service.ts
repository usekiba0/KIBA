import { ConflictException, Injectable, Logger } from '@nestjs/common';
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
    const trialDays = this.config.get<number>('STRIPE_TRIAL_DAYS', 30);

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
        });
        await manager.save(PsychologicalProfile, profile);

        const goal = manager.create(Goal, {
          user_id: savedUser.id,
          description: dto.goal_description,
          timeline: dto.goal_timeline,
          current_status: dto.current_status,
          difficulty_level: 3,
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

    const welcomeText = this.buildWelcomeMessage(result.savedUser, dto);
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

  private buildWelcomeMessage(user: User, dto: OnboardingFormDto): string {
    const goal = dto.goal_description ?? dto.goals ?? 'your goal';
    const fear = dto.fears;
    if (fear) {
      return `Hey ${user.name}! I'm Kiba — your accountability system. You said you want to ${goal}. You also said you fear ${fear}. That fear is exactly why you need a system, not just motivation. Let's build your plan. Reply YES to get started.`;
    }
    return `Hey ${user.name}! I'm Kiba — your accountability system. Your goal: ${goal}. I'm here to make sure you actually do it. Reply YES to get started.`;
  }
}
