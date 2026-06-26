import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { CheckinProcessor, buildTrialPriceReveal } from '../../src/accountability/checkin.processor';
import { User, UserStatus, OnboardingStage } from '../../src/data/entities/user.entity';
import { DailyTask, TaskStatus } from '../../src/data/entities/daily-task.entity';
import { PsychologicalProfile, PressurePreference } from '../../src/data/entities/psychological-profile.entity';
import { Message } from '../../src/data/entities/message.entity';
import { MessagingService } from '../../src/messaging/messaging.service';
import { SessionBoundaryService } from '../../src/data/session-boundary.service';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { ScheduleService } from '../../src/accountability/schedule.service';
import { CheckinService } from '../../src/accountability/checkin.service';
import { TaskService } from '../../src/accountability/task.service';
import { SurpriseService } from '../../src/accountability/surprise.service';
import { RecapService } from '../../src/accountability/recap.service';
import { WeeklyReviewService } from '../../src/accountability/weekly-review.service';
import { StripeService } from '../../src/onboarding/stripe.service';
import { CoachingService } from '../../src/ai/coaching.service';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function makeJob(data: object): Job {
  return { id: 'job-1', data } as unknown as Job;
}

/** QueryBuilder stub for the atomic once-per-day claim. affected=1 → claim wins. */
function claimQB(affected = 1) {
  return {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
}

// Partial mock — only the fields the processor reads. Cast because User has many
// more columns this flow never touches.
const testUser = {
  id: 'user-1',
  phone_number: '+15551234567',
  name: 'Alex',
  checkin_time: '09:00',
  utc_offset_minutes: -300,
  status: UserStatus.ACTIVE,
  crisis_hold: false,
  onboarding_stage: 'complete',
  registered_at: new Date(),
  last_active_at: null,
} as unknown as User;

const testTask: DailyTask = {
  id: 'task-1',
  goal_id: 'goal-1',
  user_id: 'user-1',
  task_description: 'Run 5km before work',
  scheduled_date: new Date(),
  status: TaskStatus.PENDING,
  proof_id: null,
  completion_timestamp: null,
  created_at: new Date(),
};

const testProfile: PsychologicalProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  fears: 'staying stuck',
  avoidance_patterns: 'scrolling',
  comparison_figure: 'college roommate',
  public_failure_scenario: 'everyone finds out',
  typical_failure_moment: 'Sunday evenings',
  embarrassment: null,
  pressure_preference: PressurePreference.PRESSURE,
  cussing_ok: false,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('CheckinProcessor', () => {
  let processor: CheckinProcessor;
  let mockUserRepo: any;
  let mockProfileRepo: any;
  let mockMessageRepo: any;
  let mockMessagingService: any;
  let mockSessionBoundary: any;
  let mockAntiGhostService: any;
  let mockScheduleService: any;
  let mockCheckinService: any;
  let mockTaskService: any;
  let mockSurpriseService: any;
  let mockRecapService: any;
  let mockWeeklyReviewService: any;
  let mockQueue: any;
  let mockStripeService: any;

  beforeEach(async () => {
    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(testUser),
      // Atomic per-day claim — affected:1 means this job wins and sends.
      createQueryBuilder: jest.fn(() => claimQB(1)),
    };
    mockProfileRepo = { findOne: jest.fn().mockResolvedValue(testProfile) };
    mockMessageRepo = { save: jest.fn().mockResolvedValue({ id: 'm-1' }) };
    mockMessagingService = { send: jest.fn().mockResolvedValue(undefined) };
    mockSessionBoundary = {
      checkAndHandle: jest.fn().mockResolvedValue({ sessionId: 's-1', isNewSession: false, minutesSinceLastMessage: 0, shouldSummarise: false }),
      recordMessage: jest.fn().mockResolvedValue(undefined),
    };
    mockAntiGhostService = { onMissedCheckin: jest.fn().mockResolvedValue(undefined) };
    mockScheduleService = { fire: jest.fn().mockResolvedValue(undefined) };
    mockCheckinService = {
      scheduleCheckin: jest.fn().mockResolvedValue(undefined),
      scheduleAllCheckins: jest.fn().mockResolvedValue(undefined),
    };
    // Task now comes from TaskService.ensureTodayTask, not a repo lookup.
    mockTaskService = { ensureTodayTask: jest.fn().mockResolvedValue(testTask) };
    mockSurpriseService = { fire: jest.fn(), scheduleWeek: jest.fn() };
    mockRecapService = { fire: jest.fn(), scheduleAllRecaps: jest.fn(), scheduleRecap: jest.fn() };
    mockWeeklyReviewService = { fire: jest.fn(), scheduleAllReviews: jest.fn(), scheduleReview: jest.fn() };
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'missed-job-1' }) };
    mockStripeService = { createCustomer: jest.fn(), createCheckoutSession: jest.fn() };
    const mockConfig = { get: jest.fn((_k: string, d?: unknown) => d), getOrThrow: jest.fn(() => 'price_test') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinProcessor,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(PsychologicalProfile), useValue: mockProfileRepo },
        { provide: getRepositoryToken(Message), useValue: mockMessageRepo },
        { provide: MessagingService, useValue: mockMessagingService },
        { provide: SessionBoundaryService, useValue: mockSessionBoundary },
        { provide: AntiGhostService, useValue: mockAntiGhostService },
        { provide: ScheduleService, useValue: mockScheduleService },
        { provide: CheckinService, useValue: mockCheckinService },
        { provide: TaskService, useValue: mockTaskService },
        { provide: SurpriseService, useValue: mockSurpriseService },
        { provide: RecapService, useValue: mockRecapService },
        { provide: WeeklyReviewService, useValue: mockWeeklyReviewService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: ConfigService, useValue: mockConfig },
        // Win-back nudges are now LLM-generated; return null so the deterministic
        // template fallback runs in these tests (keeps assertions stable).
        { provide: CoachingService, useValue: { generateWinbackNudge: jest.fn().mockResolvedValue(null) } },
        { provide: getQueueToken('accountability'), useValue: mockQueue },
      ],
    }).compile();

    processor = module.get<CheckinProcessor>(CheckinProcessor);
  });

  describe('handleSendCheckin', () => {
    it('sends a check-in SMS to the user phone number', async () => {
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockMessagingService.send).toHaveBeenCalledWith(
        testUser.phone_number,
        expect.any(String),
      );
    });

    it('includes the task description in the check-in message', async () => {
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      const sentBody: string = mockMessagingService.send.mock.calls[0][1];
      expect(sentBody).toContain(testTask.task_description);
    });

    it('loads the psychological profile to shape the message', async () => {
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockProfileRepo.findOne).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
    });

    it('queues a checkin-missed job with 2h delay', async () => {
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockQueue.add).toHaveBeenCalledWith(
        'checkin-missed',
        expect.objectContaining({ userId: 'user-1', taskId: testTask.id }),
        expect.objectContaining({ delay: TWO_HOURS_MS }),
      );
    });

    it('re-enqueues tomorrow via CheckinService', async () => {
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockCheckinService.scheduleCheckin).toHaveBeenCalledWith(testUser);
    });

    it('suppresses the send when the per-day claim is already taken (no duplicate)', async () => {
      mockUserRepo.createQueryBuilder.mockReturnValueOnce(claimQB(0)); // another job won the day
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockMessagingService.send).not.toHaveBeenCalled();
      // still re-enqueues tomorrow even when today's send is suppressed
      expect(mockCheckinService.scheduleCheckin).toHaveBeenCalledWith(testUser);
    });

    it('does nothing when user is not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await processor.handleSendCheckin(makeJob({ userId: 'unknown' }));
      expect(mockMessagingService.send).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('skips check-in when user has crisis_hold = true', async () => {
      mockUserRepo.findOne.mockResolvedValue({ ...testUser, crisis_hold: true });
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockMessagingService.send).not.toHaveBeenCalled();
    });

    it('sends a generic check-in when no pending task exists', async () => {
      mockTaskService.ensureTodayTask.mockResolvedValue(null);
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockMessagingService.send).toHaveBeenCalledWith(
        testUser.phone_number,
        expect.any(String),
      );
    });

    it('does not queue a missed job when no task exists', async () => {
      mockTaskService.ensureTodayTask.mockResolvedValue(null);
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckinMissed', () => {
    it('calls onMissedCheckin on the anti-ghost service', async () => {
      await processor.handleCheckinMissed(makeJob({ userId: 'user-1', taskId: 'task-1' }));
      expect(mockAntiGhostService.onMissedCheckin).toHaveBeenCalledWith('user-1', 'task-1');
    });
  });

  describe('handlePaymentLinkNudge', () => {
    const pendingUser = {
      ...testUser,
      onboarding_stage: OnboardingStage.PAYMENT_PENDING,
      dunning_nudges_sent: 0,
      intake_data: { goal_description: 'run a 5k', avoidance_patterns: 'scrolling' },
    } as unknown as User;

    beforeEach(() => {
      mockUserRepo.findOne.mockResolvedValue(pendingUser);
      mockUserRepo.update = jest.fn().mockResolvedValue(undefined);
    });

    it('ships a freshly regenerated checkout link (the original Stripe session has expired)', async () => {
      mockStripeService.createCustomer.mockResolvedValue({ id: 'cus_1' });
      mockStripeService.createCheckoutSession.mockResolvedValue({ id: 'cs_fresh', url: 'https://checkout.stripe/fresh' });

      await processor.handlePaymentLinkNudge(makeJob({ userId: 'user-1', nudgeIndex: 0 }));

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalled();
      expect(mockMessagingService.send).toHaveBeenCalledWith('+15551234567', 'https://checkout.stripe/fresh');
      expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({ stripe_checkout_session_id: 'cs_fresh' }));
      expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', { dunning_nudges_sent: 1 });
    });

    it('falls back to a reply CTA when link regeneration fails, without crashing', async () => {
      mockStripeService.createCustomer.mockResolvedValue({ id: 'cus_1' });
      mockStripeService.createCheckoutSession.mockRejectedValue(new Error('stripe down'));

      await processor.handlePaymentLinkNudge(makeJob({ userId: 'user-1', nudgeIndex: 0 }));

      expect(mockMessagingService.send).toHaveBeenCalledWith('+15551234567', "reply 'go' and i'll send you a fresh link.");
      expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', { dunning_nudges_sent: 1 });
    });

    it('does nothing once the lead has paid (no longer payment_pending)', async () => {
      mockUserRepo.findOne.mockResolvedValue({ ...pendingUser, onboarding_stage: OnboardingStage.COMPLETE });

      await processor.handlePaymentLinkNudge(makeJob({ userId: 'user-1', nudgeIndex: 0 }));

      expect(mockMessagingService.send).not.toHaveBeenCalled();
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });
  });

  describe('handleTrialPriceReveal (day-7 price reveal)', () => {
    const activeTrialUser = {
      id: 'user-1',
      phone_number: '+15551234567',
      name: 'Alex',
      status: UserStatus.TRIAL,
      crisis_hold: false,
      onboarding_stage: OnboardingStage.COMPLETE,
      trial_price_revealed_at: null,
      intake_data: { goal_description: 'scale my clothing brand' },
    };

    beforeEach(() => {
      mockUserRepo.update = jest.fn().mockResolvedValue(undefined);
    });

    it('sends ONE KIBA-voice price message and marks it revealed', async () => {
      mockUserRepo.findOne.mockResolvedValue({ ...activeTrialUser });

      await processor.handleTrialPriceReveal(makeJob({ userId: 'user-1' }));

      expect(mockMessagingService.send).toHaveBeenCalledTimes(1);
      const [phone, body] = mockMessagingService.send.mock.calls[0];
      expect(phone).toBe('+15551234567');
      expect(body).toContain('$20/month');
      expect(body).toContain('scale my clothing brand');
      expect(body).not.toMatch(/free trial/i); // never a SaaS framing
      expect(mockUserRepo.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ trial_price_revealed_at: expect.any(Date) }),
      );
    });

    it('is idempotent — skips if already revealed', async () => {
      mockUserRepo.findOne.mockResolvedValue({ ...activeTrialUser, trial_price_revealed_at: new Date() });

      await processor.handleTrialPriceReveal(makeJob({ userId: 'user-1' }));

      expect(mockMessagingService.send).not.toHaveBeenCalled();
    });

    it('skips a user who churned during the trial', async () => {
      mockUserRepo.findOne.mockResolvedValue({ ...activeTrialUser, status: UserStatus.CANCELLED });

      await processor.handleTrialPriceReveal(makeJob({ userId: 'user-1' }));

      expect(mockMessagingService.send).not.toHaveBeenCalled();
    });

    it('skips when not activated or in crisis hold', async () => {
      mockUserRepo.findOne.mockResolvedValue({ ...activeTrialUser, onboarding_stage: OnboardingStage.PAYMENT_PENDING });
      await processor.handleTrialPriceReveal(makeJob({ userId: 'user-1' }));

      mockUserRepo.findOne.mockResolvedValue({ ...activeTrialUser, crisis_hold: true });
      await processor.handleTrialPriceReveal(makeJob({ userId: 'user-1' }));

      expect(mockMessagingService.send).not.toHaveBeenCalled();
    });
  });
});

describe('buildTrialPriceReveal', () => {
  it('frames the price as the next step after a week, never a "free trial"', () => {
    const msg = buildTrialPriceReveal({ name: 'Alex', goal: 'get to 100k', priceDisplay: '$20/month' });
    expect(msg).toContain('Alex');
    expect(msg).toContain('get to 100k');
    expect(msg).toContain('$20/month');
    expect(msg).toMatch(/most people fall off by day 3/i); // social proof
    expect(msg).not.toMatch(/free trial/i);
  });

  it('degrades gracefully with no name or goal', () => {
    const msg = buildTrialPriceReveal({ name: null, goal: null, priceDisplay: '$29/month' });
    expect(msg).toContain('$29/month');
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain(' on .'); // no dangling "on <empty>"
  });
});
