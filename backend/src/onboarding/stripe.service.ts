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
}
