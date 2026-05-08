import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StrikeService } from '../../src/accountability/strike.service';
import { Strike } from '../../src/data/entities/strike.entity';
import { DailyTask, TaskStatus } from '../../src/data/entities/daily-task.entity';

const userId = 'user-1';
const taskId = 'task-1';

function makeTask(overrides: Partial<DailyTask> = {}): DailyTask {
  return {
    id: taskId, goal_id: 'goal-1', user_id: userId,
    task_description: 'Run 1K', scheduled_date: new Date(),
    status: TaskStatus.PENDING, proof_id: null, completion_timestamp: null, created_at: new Date(),
    ...overrides,
  } as DailyTask;
}

describe('StrikeService', () => {
  let service: StrikeService;
  let mockStrikeRepo: any;
  let mockTaskRepo: any;

  beforeEach(async () => {
    mockStrikeRepo = {
      create: jest.fn((s: any) => s),
      save: jest.fn(async (s: any) => ({ ...s, id: 'strike-new' })),
      find: jest.fn().mockResolvedValue([]),
    };
    mockTaskRepo = {
      findOne: jest.fn().mockResolvedValue(makeTask()),
      save: jest.fn(async (t: any) => t),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrikeService,
        { provide: getRepositoryToken(Strike), useValue: mockStrikeRepo },
        { provide: getRepositoryToken(DailyTask), useValue: mockTaskRepo },
      ],
    }).compile();

    service = module.get<StrikeService>(StrikeService);
  });

  describe('logStrike', () => {
    it('creates a Strike record with correct user_id, task_id and escalation_level', async () => {
      await service.logStrike(userId, taskId, 1);
      expect(mockStrikeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: userId, daily_task_id: taskId, escalation_level: 1 })
      );
      expect(mockStrikeRepo.save).toHaveBeenCalledTimes(1);
    });

    it('marks the DailyTask as missed', async () => {
      await service.logStrike(userId, taskId, 1);
      expect(mockTaskRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.MISSED })
      );
    });

    it('returns the created Strike', async () => {
      const strike = await service.logStrike(userId, taskId, 1);
      expect(strike.user_id).toBe(userId);
      expect(strike.daily_task_id).toBe(taskId);
      expect(strike.escalation_level).toBe(1);
    });

    it('accepts escalation levels 1, 2, and 3', async () => {
      for (const level of [1, 2, 3]) {
        await service.logStrike(userId, taskId, level);
        expect(mockStrikeRepo.create).toHaveBeenLastCalledWith(
          expect.objectContaining({ escalation_level: level })
        );
      }
    });
  });

  describe('getStrikeCount', () => {
    it('returns 0 when user has no strikes', async () => {
      mockStrikeRepo.find.mockResolvedValue([]);
      const count = await service.getStrikeCount(userId);
      expect(count).toBe(0);
    });

    it('returns correct count of recent strikes', async () => {
      mockStrikeRepo.find.mockResolvedValue([
        { id: 's1', user_id: userId, escalation_level: 1, created_at: new Date() },
        { id: 's2', user_id: userId, escalation_level: 2, created_at: new Date() },
        { id: 's3', user_id: userId, escalation_level: 1, created_at: new Date() },
      ]);
      const count = await service.getStrikeCount(userId);
      expect(count).toBe(3);
    });
  });
});
