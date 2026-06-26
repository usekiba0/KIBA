import { StripeWebhookController } from '../../src/onboarding/stripe-webhook.controller';
import { SubscriptionStatus, SubscriptionPlan } from '../../src/data/entities/subscription.entity';
import { UserStatus, OnboardingStage } from '../../src/data/entities/user.entity';

/**
 * Regression: a RETURNING customer who previously cancelled and re-pays must have
 * their subscription row RELINKED to the new Stripe subscription and reactivated.
 * The old handler only created a row when none existed, so the stale `cancelled`
 * row survived — the user got the "you're in" SMS, then the paywall asked them to
 * repay again (double charge, no coaching). The sub=cancelled / user=trial
 * mismatch was the production fingerprint (user "Ali").
 */
describe('StripeWebhookController — checkout.session.completed subscription reactivation', () => {
  function setup(existingSub: any | null) {
    const savedSubs: any[] = [];
    const subRepo: any = {
      findOne: jest.fn(async () => existingSub),
      create: jest.fn((row: any) => ({ ...row })),
      save: jest.fn(async (row: any) => {
        savedSubs.push(row);
        return row;
      }),
    };
    const user: any = {
      id: 'user-1',
      phone_number: '+15550001111',
      intake_data: {},
      status: UserStatus.CANCELLED,
      onboarding_stage: OnboardingStage.PAYMENT_PENDING,
    };
    const userRepo: any = {
      findOne: jest.fn(async () => user),
      save: jest.fn(async (u: any) => u),
    };
    const stripeService: any = {
      getSubscription: jest.fn(async () => ({
        id: 'sub_NEW',
        status: 'trialing',
        trial_start: 1_717_754_486,
        trial_end: 1_720_346_486,
        current_period_end: null,
      })),
    };
    const profileRepo: any = { findOne: jest.fn(async () => ({ id: 'p1' })), create: jest.fn(), save: jest.fn() };
    const goalRepo: any = { count: jest.fn(async () => 1) }; // skip goal bridge
    const messagingQueue: any = { add: jest.fn().mockResolvedValue({}) };
    const messagingService: any = { send: jest.fn().mockResolvedValue({}) };
    const checkinService: any = { scheduleCheckin: jest.fn().mockResolvedValue({}) };
    const config: any = { get: () => undefined };
    const accountabilityQueue: any = { add: jest.fn().mockResolvedValue({}) };

    const controller = new StripeWebhookController(
      stripeService, subRepo, userRepo, {} as any, profileRepo, goalRepo,
      messagingQueue, messagingService, checkinService, config, accountabilityQueue,
    );
    return { controller, subRepo, userRepo, user, savedSubs, accountabilityQueue, messagingQueue, checkinService };
  }

  const event = {
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', metadata: { user_id: 'user-1' }, subscription: 'sub_NEW', customer: 'cus_123' } },
  } as any;

  it('reactivates an existing CANCELLED row instead of leaving it stale', async () => {
    const existing = {
      id: 'subrow-1',
      user_id: 'user-1',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_OLD',
      plan: SubscriptionPlan.INDIVIDUAL,
      status: SubscriptionStatus.CANCELLED,
    };
    const { controller, subRepo, savedSubs } = setup(existing);

    await (controller as any).processEvent(event);

    // The SAME row was updated (not a new row created) and reactivated.
    expect(subRepo.create).not.toHaveBeenCalled();
    expect(savedSubs).toHaveLength(1);
    expect(savedSubs[0].id).toBe('subrow-1');
    expect(savedSubs[0].stripe_subscription_id).toBe('sub_NEW');
    expect(savedSubs[0].status).toBe(SubscriptionStatus.TRIALING);
  });

  it('still creates a row for a brand-new customer', async () => {
    const { controller, subRepo, savedSubs } = setup(null);

    await (controller as any).processEvent(event);

    expect(subRepo.create).toHaveBeenCalledTimes(1);
    expect(savedSubs).toHaveLength(1);
    expect(savedSubs[0].stripe_subscription_id).toBe('sub_NEW');
    expect(savedSubs[0].status).toBe(SubscriptionStatus.TRIALING);
  });

  it('promotes the user to TRIAL + COMPLETE on re-payment', async () => {
    const existing = { id: 'subrow-1', user_id: 'user-1', stripe_subscription_id: 'sub_OLD', status: SubscriptionStatus.CANCELLED };
    const { controller, user } = setup(existing);

    await (controller as any).processEvent(event);

    expect(user.status).toBe(UserStatus.TRIAL);
    expect(user.onboarding_stage).toBe(OnboardingStage.COMPLETE);
  });

  it('does NOT send a duplicate activation SMS on customer.subscription.created (keeps the check-in safety net)', async () => {
    const existing = { id: 'subrow-1', user_id: 'user-1', stripe_subscription_id: 'sub_NEW', status: SubscriptionStatus.TRIALING };
    const { controller, messagingQueue, checkinService } = setup(existing);

    await (controller as any).processEvent({
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_NEW' } },
    });

    // The robotic "your coaching is active 💪" duplicate is gone — each onboarding
    // path already sends exactly one activation message.
    expect(messagingQueue.add).not.toHaveBeenCalled();
    // But the check-in scheduling safety net stays.
    expect(checkinService.scheduleCheckin).toHaveBeenCalled();
  });

  it('schedules the day-7 price reveal and re-arms the flag at activation', async () => {
    const { controller, user, accountabilityQueue } = setup(null);

    await (controller as any).processEvent(event);

    // Flag cleared so a re-subscribe re-arms the reveal.
    expect(user.trial_price_revealed_at).toBeNull();
    // The reveal job is scheduled on the accountability queue, keyed on the sub id.
    const call = accountabilityQueue.add.mock.calls.find((c: any[]) => c[0] === 'trial-price-reveal');
    expect(call).toBeDefined();
    expect(call[1]).toEqual({ userId: 'user-1' });
    expect(call[2].jobId).toBe('trial-price-reveal:sub_NEW');
    expect(call[2].delay).toBeGreaterThanOrEqual(0); // clamped to >=0 (fixture trial_end is in the past)
  });
});
