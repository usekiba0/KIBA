import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { CoachingProcessor } from '../../src/messaging/coaching.processor';
import { User } from '../../src/data/entities/user.entity';
import { Subscription } from '../../src/data/entities/subscription.entity';
import { Message } from '../../src/data/entities/message.entity';
import { SessionSummary } from '../../src/data/entities/session-summary.entity';
import { DailyTask } from '../../src/data/entities/daily-task.entity';
import { CoachingService } from '../../src/ai/coaching.service';
import { CrisisService } from '../../src/ai/crisis.service';
import { SummarisationService } from '../../src/ai/summarisation.service';
import { VisionService } from '../../src/ai/vision.service';
import { SessionCacheService } from '../../src/data/session-cache.service';
import { SessionBoundaryService } from '../../src/data/session-boundary.service';
import { CorrectionService } from '../../src/data/correction.service';
import { ReferralService } from '../../src/data/referral.service';
import { MessagingService } from '../../src/messaging/messaging.service';
import { SafetyService } from '../../src/safety/safety.service';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { ProofService } from '../../src/accountability/proof.service';
import { ScoreIntentService } from '../../src/accountability/score-intent.service';
import { ScheduleService } from '../../src/accountability/schedule.service';
import { TodoService } from '../../src/accountability/todo.service';
import { LedgerCorrectionService } from '../../src/accountability/ledger-correction.service';
import { StripeService } from '../../src/onboarding/stripe.service';
import { OutboundRecorderService } from '../../src/data/outbound-recorder.service';

/**
 * Najee/Sam 2026-07-23: the plan-link SMS (and its lead-in) went out via
 * messagingService.send() with no Message row, so the link was invisible to the
 * admin thread, to audits, and to the AI's own history — KIBA literally could
 * not see that it had sent a link, and two "lost lead" false alarms followed.
 * PR #33 covered every scheduled sender class but not this path.
 */
describe('CoachingProcessor sendPaymentLink — thread recording', () => {
  let processor: CoachingProcessor;
  let messagingService: { send: jest.Mock };
  let recorder: { record: jest.Mock };
  let userRepo: { findOne: jest.Mock; update: jest.Mock };
  let accountabilityQueue: { add: jest.Mock };

  const user = {
    id: 'u-najee',
    name: 'Najee',
    phone_number: '+15550001111',
    payment_link_sent_at: null,
    stripe_checkout_session_id: null,
    referral_trial_days: null,
    intake_data: { goal_description: 'lock in gym 5x a week' },
    utc_offset_minutes: -300,
  } as unknown as User;

  beforeEach(async () => {
    messagingService = { send: jest.fn().mockResolvedValue(undefined) };
    recorder = { record: jest.fn().mockResolvedValue(undefined) };
    userRepo = { findOne: jest.fn(), update: jest.fn().mockResolvedValue({}) };
    accountabilityQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const config = {
      get: jest.fn((key: string, def?: unknown) => {
        const values: Record<string, unknown> = {
          CHECKOUT_LINK_SECRET: 'test-secret-test-secret-test-secret',
          FRONTEND_URL: 'https://usekiba.ai',
        };
        return values[key] ?? def;
      }),
      getOrThrow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoachingProcessor,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Subscription), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Message), useValue: { find: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(SessionSummary), useValue: {} },
        { provide: getRepositoryToken(DailyTask), useValue: {} },
        { provide: ConfigService, useValue: config },
        { provide: CoachingService, useValue: {} },
        { provide: VisionService, useValue: {} },
        { provide: CrisisService, useValue: {} },
        { provide: SummarisationService, useValue: {} },
        { provide: SessionCacheService, useValue: {} },
        { provide: SessionBoundaryService, useValue: { checkAndHandle: jest.fn() } },
        { provide: MessagingService, useValue: messagingService },
        { provide: SafetyService, useValue: {} },
        { provide: AntiGhostService, useValue: {} },
        { provide: ProofService, useValue: {} },
        { provide: ScoreIntentService, useValue: {} },
        { provide: ScheduleService, useValue: {} },
        { provide: TodoService, useValue: {} },
        { provide: LedgerCorrectionService, useValue: {} },
        { provide: CorrectionService, useValue: {} },
        { provide: StripeService, useValue: {} },
        { provide: ReferralService, useValue: {} },
        { provide: OutboundRecorderService, useValue: recorder },
        { provide: getQueueToken('accountability'), useValue: accountabilityQueue },
      ],
    }).compile();

    processor = module.get<CoachingProcessor>(CoachingProcessor);
  });

  type SendPaymentLink = (
    u: User,
    msgId: string,
    opts?: { requireFullIntake: boolean; leadIn?: string; bypassRateLimit?: boolean },
  ) => Promise<{ ok: boolean }>;

  const sendPaymentLink = (...args: Parameters<SendPaymentLink>) =>
    (processor as unknown as { sendPaymentLink: SendPaymentLink }).sendPaymentLink(...args);

  it('records the plan-link SMS as a payment_link thread row', async () => {
    const result = await sendPaymentLink({ ...user } as User, 'msg-1', { requireFullIntake: true });

    expect(result.ok).toBe(true);
    expect(recorder.record).toHaveBeenCalledWith(
      user.id,
      expect.stringContaining('https://usekiba.ai/plan?t='),
      'payment_link',
    );
  });

  it('records the lead-in line too when one is sent', async () => {
    await sendPaymentLink({ ...user } as User, 'msg-1', {
      requireFullIntake: true,
      leadIn: "here's your fresh link:",
    });

    expect(recorder.record).toHaveBeenCalledWith(
      user.id,
      "here's your fresh link:",
      'payment_link',
    );
    expect(recorder.record).toHaveBeenCalledWith(
      user.id,
      expect.stringContaining('/plan?t='),
      'payment_link',
    );
  });

  it('records nothing when the SMS never went out', async () => {
    messagingService.send.mockRejectedValue(new Error('sendblue 500'));

    const result = await sendPaymentLink({ ...user } as User, 'msg-1', { requireFullIntake: true });

    expect(result.ok).toBe(false);
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('a recording failure never blocks the link send', async () => {
    recorder.record.mockRejectedValue(new Error('db hiccup'));

    const result = await sendPaymentLink({ ...user } as User, 'msg-1', { requireFullIntake: true });

    expect(result.ok).toBe(true);
    expect(userRepo.update).toHaveBeenCalled(); // PAYMENT_PENDING still persisted
  });
});
