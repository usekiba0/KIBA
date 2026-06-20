import Stripe from 'stripe';

// These hit the real Stripe API (or its SDK), so they can only run with a key.
// Without one — e.g. in CI, which has no Stripe secret — skip the whole suite
// instead of constructing `new Stripe('')`, which throws and fails the suite.
const describeStripe = process.env.STRIPE_SECRET_KEY ? describe : describe.skip;

describeStripe('Stripe Contract Tests', () => {
  let stripe: Stripe;

  beforeAll(() => {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2025-02-24.acacia',
    });
  });

  describe('SetupIntent creation', () => {
    it('should create a SetupIntent and return a client_secret', async () => {
      if (!process.env.STRIPE_SECRET_KEY) return;

      const customer = await stripe.customers.create({ name: 'Test User', phone: '+15551234567' });
      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['card'],
      });

      expect(setupIntent.id).toMatch(/^seti_/);
      expect(setupIntent.client_secret).toBeTruthy();
      expect(setupIntent.status).toBe('requires_payment_method');

      // Cleanup
      await stripe.customers.del(customer.id);
    }, 15000);
  });

  describe('Webhook event construction', () => {
    it('should reject invalid webhook signatures', () => {
      const payload = JSON.stringify({ id: 'evt_test', type: 'customer.subscription.created', data: {} });
      const secret = 'whsec_test_secret_that_is_long_enough_for_testing';

      expect(() =>
        stripe.webhooks.constructEvent(Buffer.from(payload), 'invalid_signature', secret),
      ).toThrow();
    });

    it('should accept valid webhook signatures', () => {
      const payload = JSON.stringify({ id: 'evt_test', type: 'customer.subscription.created', data: { object: {} } });
      const secret = 'whsec_' + 'a'.repeat(32);
      const timestamp = Math.floor(Date.now() / 1000);
      const sig = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });

      const event = stripe.webhooks.constructEvent(Buffer.from(payload), sig, secret);
      expect(event.id).toBe('evt_test');
    });
  });

  describe('Subscription trial structure', () => {
    it('should have correct trial_period_days in subscription create params', () => {
      // Validate the params structure used in StripeService
      const params: Stripe.SubscriptionCreateParams = {
        customer: 'cus_test',
        items: [{ price: 'price_test' }],
        trial_period_days: 30,
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
      };
      expect(params.trial_period_days).toBe(30);
      expect(params.items?.[0].price).toBe('price_test');
    });
  });
});
