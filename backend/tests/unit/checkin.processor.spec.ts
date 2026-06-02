import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { CheckinProcessor } from '../../src/accountability/checkin.processor';
import { User, UserStatus } from '../../src/data/entities/user.entity';
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
import { StripeService } from '../../src/onboarding/stripe.service';
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
  let mockQueue: any;

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
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'missed-job-1' }) };
    const mockStripeService = { createCustomer: jest.fn(), createCheckoutSession: jest.fn() };
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
        { provide: StripeService, useValue: mockStripeService },
        { provide: ConfigService, useValue: mockConfig },
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
});
