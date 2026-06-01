import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import * as https from 'https';

// Disable keep-alive — Render free tier drops idle connections mid-request
const httpsAgent = new https.Agent({
  keepAlive: false,
  timeout: 30000,
  rejectUnauthorized: true,
});

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly config: ConfigService) {
    const key = config.getOrThrow<string>('STRIPE_SECRET_KEY').replace(/\s+/g, '');
    this.stripe = new Stripe(key, {
      apiVersion: '2025-02-24.acacia',
      httpClient: Stripe.createNodeHttpClient(httpsAgent),
      timeout: 30000,
      maxNetworkRetries: 0,
    });
  }

  async createCustomer(name: string, phone?: string): Promise<Stripe.Customer> {
    return this.stripe.customers.create({ name, phone });
  }

  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
  }

  async createSubscriptionWithTrial(
    customerId: string,
    paymentMethodId: string,
    priceId: string,
    trialDays: number,
  ): Promise<Stripe.Subscription> {
    await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    return this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  async deleteCustomer(customerId: string): Promise<Stripe.DeletedCustomer> {
    return this.stripe.customers.del(customerId);
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  /**
   * Create a Stripe Checkout Session for SMS-first onboarding. Returns a hosted
   * URL we SMS to the user. The session metadata embeds our internal user_id so
   * the webhook can route the success event back to the right user.
   */
  async createCheckoutSession(args: {
    customerId: string;
    priceId: string;
    trialDays: number;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    // Stripe caps checkout-session expiry at 24h after creation (min 30 min,
    // max 24h). A previous value of 30 days here EXCEEDED that cap, so
    // sessions.create threw and silently broke every SMS payment link. Use just
    // under 24h to stay valid. (SMS users who procrastinate past 24h get a fresh
    // link from the dunning nudge — see CheckinProcessor.handlePaymentLinkNudge.)
    const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60 - 60;
    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: args.customerId,
      line_items: [{ price: args.priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: args.trialDays,
        metadata: { user_id: args.userId },
      },
      metadata: { user_id: args.userId },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      expires_at: expiresAt,
      allow_promotion_codes: true,
    });
  }

  async expireCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.expire(sessionId);
  }
}
