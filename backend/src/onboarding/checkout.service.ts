import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../data/entities/user.entity';
import { ReferralService } from '../data/referral.service';
import { StripeService } from './stripe.service';
import { planLinkFor, verifyCheckoutToken, TokenResult } from './checkout-link';
import { structuredLog } from '../common/logger';

export type PlanId = 'monthly' | 'yearly';

export interface PlanOption {
  id: PlanId;
  /** Total charged per billing period, in minor units (cents). */
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  /** Amount per month, in minor units — yearly divided by 12, for the "$4.99/mo
   * · Yearly" line. Computed here so the page never does billing math. */
  per_month: number;
  /** Whole-percent saving vs paying monthly for a year. Null when there's no
   * monthly price to compare against, or when yearly isn't actually cheaper. */
  savings_pct: number | null;
}

export interface PlansPayload {
  name: string | null;
  trial_days: number;
  plans: PlanOption[];
}

export type PlansResult =
  | { ok: true; payload: PlansPayload }
  | { ok: false; reason: 'invalid_token' | 'expired' | 'unknown_user' | 'stripe_error' };

export type SessionResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid_token' | 'expired' | 'unknown_user' | 'unknown_plan' | 'stripe_error' };

/**
 * The plan-selection screen behind a texted checkout link.
 *
 * Stripe Checkout can't show a monthly/yearly toggle inside a single
 * subscription session, so the choice happens on OUR page first (Karibi
 * 2026-07-20, referencing Tomo's paywall) and only the chosen price is handed to
 * Stripe. The link is a stateless signed token rather than a row: nothing to
 * migrate, nothing to clean up, and it can't be enumerated by walking user ids.
 *
 * Prices are read LIVE from Stripe every time. Nothing about the amounts is
 * hardcoded or mirrored in our DB, so whatever is configured in the Stripe
 * dashboard is what the user sees — the page can never quote a stale price.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly stripeService: StripeService,
    private readonly referralService: ReferralService,
  ) {}

  /**
   * Secret for link signatures. A dedicated CHECKOUT_LINK_SECRET is preferred,
   * but falls back to INTERNAL_API_KEY (already required at boot) so this ships
   * without a new mandatory env var — one less thing to get wrong on Render at
   * launch. Rotating either secret invalidates outstanding links, which is the
   * correct behavior.
   */
  private signingSecret(): string {
    return (
      this.config.get<string>('CHECKOUT_LINK_SECRET') ||
      this.config.get<string>('INTERNAL_API_KEY') ||
      ''
    );
  }

  verifyToken(token: string, now = Date.now()): TokenResult {
    return verifyCheckoutToken(this.signingSecret(), token, now);
  }

  /** The URL we text instead of a raw Stripe Checkout URL. */
  planLinkFor(userId: string): string {
    return planLinkFor(
      this.signingSecret(),
      this.config.get<string>('FRONTEND_URL', 'https://usekiba.ai'),
      userId,
    );
  }

  private priceIds(): { monthly: string | null; yearly: string | null } {
    return {
      monthly: this.config.get<string>('STRIPE_PRICE_ID_INDIVIDUAL') || null,
      // Optional on purpose: until an annual price exists in Stripe the page
      // simply renders monthly-only, so this can deploy before the price is
      // created without showing a broken or empty paywall.
      yearly: this.config.get<string>('STRIPE_PRICE_ID_INDIVIDUAL_ANNUAL') || null,
    };
  }

  async getPlans(token: string): Promise<PlansResult> {
    const verified = this.verifyToken(token);
    if (!verified.ok) return { ok: false, reason: verified.reason };

    const user = await this.userRepo.findOne({ where: { id: verified.userId } });
    if (!user) return { ok: false, reason: 'unknown_user' };

    const ids = this.priceIds();
    let monthly: PlanOption | null = null;
    let yearly: PlanOption | null = null;

    try {
      if (ids.monthly) monthly = await this.loadPlan('monthly', ids.monthly);
      if (ids.yearly) yearly = await this.loadPlan('yearly', ids.yearly);
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'checkout',
        operation: 'plan_price_lookup_failed',
        userId: user.id,
        error: (err as Error).message,
      });
      return { ok: false, reason: 'stripe_error' };
    }

    if (!monthly && !yearly) return { ok: false, reason: 'stripe_error' };

    // Savings are computed from the two real prices rather than written into the
    // copy, so the badge can't claim a discount that no longer exists.
    if (yearly && monthly && monthly.interval === 'month' && yearly.interval === 'year') {
      const fullYear = monthly.amount * 12;
      if (fullYear > yearly.amount) {
        yearly.savings_pct = Math.round(((fullYear - yearly.amount) / fullYear) * 100);
      }
    }

    return {
      ok: true,
      payload: {
        // First name only — it's a greeting, not an identity check, and the page
        // is reachable by anyone holding the link.
        name: user.name ? user.name.trim().split(/\s+/)[0] : null,
        trial_days: this.referralService.trialDaysFor(
          user,
          this.config.get<number>('STRIPE_TRIAL_DAYS', 7),
        ),
        plans: [yearly, monthly].filter((p): p is PlanOption => p !== null),
      },
    };
  }

  private async loadPlan(id: PlanId, priceId: string): Promise<PlanOption> {
    const price = await this.stripeService.getPrice(priceId);
    const amount = price.unit_amount ?? 0;
    const interval = price.recurring?.interval === 'year' ? 'year' : 'month';
    return {
      id,
      amount,
      currency: price.currency ?? 'usd',
      interval,
      per_month: interval === 'year' ? Math.round(amount / 12) : amount,
      savings_pct: null,
    };
  }

  /**
   * Create the Stripe Checkout Session for the plan the user tapped. The trial
   * length comes from the same referral-aware helper the SMS path uses, so a
   * redeemed code is honored no matter which plan they pick.
   */
  async createSession(token: string, plan: PlanId): Promise<SessionResult> {
    const verified = this.verifyToken(token);
    if (!verified.ok) return { ok: false, reason: verified.reason };

    const user = await this.userRepo.findOne({ where: { id: verified.userId } });
    if (!user) return { ok: false, reason: 'unknown_user' };
    if (!user.name) return { ok: false, reason: 'unknown_user' };

    const ids = this.priceIds();
    const priceId = plan === 'yearly' ? ids.yearly : ids.monthly;
    if (!priceId) return { ok: false, reason: 'unknown_plan' };

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://usekiba.ai');
    const trialDays = this.referralService.trialDaysFor(
      user,
      this.config.get<number>('STRIPE_TRIAL_DAYS', 7),
    );

    try {
      const customer = await this.stripeService.createCustomer(user.name, user.phone_number);
      const session = await this.stripeService.createCheckoutSession({
        customerId: customer.id,
        priceId,
        trialDays,
        userId: user.id,
        successUrl: `${frontendUrl}/onboarding/success`,
        cancelUrl: `${frontendUrl}/onboarding/cancel`,
      });
      if (!session.url) return { ok: false, reason: 'stripe_error' };

      // Persist the session id here rather than when the link was texted — this
      // is the first moment one exists. The Stripe-verified stage self-heal in
      // coaching.processor reads it, and a user who never reached Stripe has
      // nothing to verify anyway.
      await this.userRepo.update(user.id, { stripe_checkout_session_id: session.id });

      structuredLog(this.logger, 'log', {
        service: 'checkout',
        operation: 'plan_session_created',
        userId: user.id,
        plan,
        trialDays,
        sessionId: session.id,
      });
      return { ok: true, url: session.url };
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'checkout',
        operation: 'plan_session_failed',
        userId: user.id,
        plan,
        error: (err as Error).message,
      });
      return { ok: false, reason: 'stripe_error' };
    }
  }
}
