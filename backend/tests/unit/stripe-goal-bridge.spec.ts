import { StripeWebhookController } from '../../src/onboarding/stripe-webhook.controller';
import { User } from '../../src/data/entities/user.entity';

/**
 * The SMS intake stores goals only as text on intake_data — no Goal row was ever
 * created, so SMS users got check-ins scheduled but no action plan / daily task.
 * bridgeGoalsFromIntake closes that gap at payment time. These lock its core
 * decisions: one row per goal, the right anchor, idempotency, plan enqueue.
 */
describe('StripeWebhookController.bridgeGoalsFromIntake', () => {
  function setup(existingGoals = 0) {
    const created: any[] = [];
    const goalRepo: any = {
      count: jest.fn(async () => existingGoals),
      create: jest.fn((row: any) => row),
      save: jest.fn(async (rows: any) => {
        created.push(...rows);
        return rows;
      }),
    };
    const messagingQueue: any = { add: jest.fn().mockResolvedValue({}) };
    // Only goalRepo + messagingQueue are exercised; the rest are inert mocks.
    const controller = new StripeWebhookController(
      {} as any, // stripeService
      {} as any, // subRepo
      {} as any, // userRepo
      {} as any, // eventRepo
      {} as any, // profileRepo
      goalRepo,
      messagingQueue,
      {} as any, // messagingService
      {} as any, // checkinService
    );
    return { controller, goalRepo, messagingQueue, created };
  }

  function run(controller: StripeWebhookController, user: Partial<User>) {
    return (controller as any).bridgeGoalsFromIntake(user as User);
  }

  it('creates one row per goal and flags the goal_description as anchor', async () => {
    const { controller, messagingQueue, created } = setup();
    await run(controller, {
      id: 'user-1',
      intake_data: {
        goal_description: 'scale the business',
        goals: ['gym every morning', 'scale the business', 'read the bible'],
        goal_timeline: '12 months',
        current_status: 'just starting',
      },
    });

    expect(created).toHaveLength(3);
    const anchors = created.filter((g) => g.is_anchor);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].description).toBe('scale the business');
    // The anchor carries the intake timeline/status; secondary goals are lightweight.
    expect(anchors[0].timeline).toBe('12 months');
    expect(created.find((g) => g.description === 'gym every morning').timeline).toBe('');
    // Plan generation must be enqueued for the user (targets the anchor).
    expect(messagingQueue.add).toHaveBeenCalledWith('plan-generation', { userId: 'user-1' });
  });

  it('falls back to the single goal_description when no goals array is present', async () => {
    const { controller, created } = setup();
    await run(controller, {
      id: 'user-2',
      intake_data: { goal_description: 'get fit', goal_timeline: '90 days', current_status: 'sedentary' },
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ description: 'get fit', is_anchor: true });
  });

  it('is idempotent — does nothing when the user already has goals', async () => {
    const { controller, goalRepo, messagingQueue } = setup(2);
    await run(controller, { id: 'user-3', intake_data: { goal_description: 'whatever' } });

    expect(goalRepo.save).not.toHaveBeenCalled();
    expect(messagingQueue.add).not.toHaveBeenCalled();
  });

  it('no-ops when intake captured no goal at all', async () => {
    const { controller, goalRepo, messagingQueue } = setup();
    await run(controller, { id: 'user-4', intake_data: {} });

    expect(goalRepo.save).not.toHaveBeenCalled();
    expect(messagingQueue.add).not.toHaveBeenCalled();
  });

  it('de-duplicates repeated goal text', async () => {
    const { controller, created } = setup();
    await run(controller, {
      id: 'user-5',
      intake_data: { goal_description: 'gym', goals: ['gym', 'gym', 'money'] },
    });

    expect(created).toHaveLength(2);
    expect(created.map((g) => g.description).sort()).toEqual(['gym', 'money']);
  });
});
