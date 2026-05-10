import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { CheckinProcessor } from '../../src/accountability/checkin.processor';
import { User, UserStatus } from '../../src/data/entities/user.entity';
import { DailyTask, TaskStatus } from '../../src/data/entities/daily-task.entity';
import { MessagingService } from '../../src/messaging/messaging.service';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { Job } from 'bull';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function makeJob(data: object): Job {
  return { id: 'job-1', data } as unknown as Job;
}

const testUser: User = {
  id: 'user-1',
  phone_number: '+15551234567',
  name: 'Alex',
  coaching_focus: null as any,
  goals: null as any,
  checkin_time: '09:00',
  height_cm: null,
  weight_kg: null,
  age: null,
  health_conditions: [],
  dietary_restrictions: [],
  injuries: null,
  status: UserStatus.ACTIVE,
  crisis_hold: false,
  registered_at: new Date(),
  last_active_at: null,
};

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

describe('CheckinProcessor', () => {
  let processor: CheckinProcessor;
  let mockUserRepo: any;
  let mockTaskRepo: any;
  let mockMessagingService: any;
  let mockAntiGhostService: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(testUser),
    };
    mockTaskRepo = {
      findOne: jest.fn().mockResolvedValue(testTask),
    };
    mockMessagingService = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    mockAntiGhostService = {
      onMissedCheckin: jest.fn().mockResolvedValue(undefined),
    };
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'missed-job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinProcessor,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(DailyTask), useValue: mockTaskRepo },
        { provide: MessagingService, useValue: mockMessagingService },
        { provide: AntiGhostService, useValue: mockAntiGhostService },
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

    it('queues a checkin-missed job with 2h delay', async () => {
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockQueue.add).toHaveBeenCalledWith(
        'checkin-missed',
        expect.objectContaining({ userId: 'user-1', taskId: testTask.id }),
        expect.objectContaining({ delay: TWO_HOURS_MS }),
      );
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
      mockTaskRepo.findOne.mockResolvedValue(null);
      await processor.handleSendCheckin(makeJob({ userId: 'user-1' }));
      expect(mockMessagingService.send).toHaveBeenCalledWith(
        testUser.phone_number,
        expect.stringContaining(testUser.name),
      );
    });

    it('does not queue a missed job when no task exists', async () => {
      mockTaskRepo.findOne.mockResolvedValue(null);
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
