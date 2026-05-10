import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProofService } from '../../src/accountability/proof.service';
import { Proof, ProofType, ProofValidationStatus } from '../../src/data/entities/proof.entity';
import { DailyTask, TaskStatus } from '../../src/data/entities/daily-task.entity';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { ScoreService } from '../../src/accountability/score.service';

const testTask: DailyTask = {
  id: 'task-1',
  goal_id: 'goal-1',
  user_id: 'user-1',
  task_description: 'Run 5km',
  scheduled_date: new Date(),
  status: TaskStatus.PENDING,
  proof_id: null,
  completion_timestamp: null,
  created_at: new Date(),
};

describe('ProofService', () => {
  let service: ProofService;
  let mockProofRepo: any;
  let mockTaskRepo: any;
  let mockAntiGhostService: any;
  let mockScoreService: any;

  beforeEach(async () => {
    mockProofRepo = {
      create: jest.fn((d: any) => ({ id: 'proof-1', ...d })),
      save: jest.fn(async (p: any) => ({ id: 'proof-1', ...p })),
    };
    mockTaskRepo = {
      findOne: jest.fn().mockResolvedValue({ ...testTask }),
      save: jest.fn(async (t: any) => t),
    };
    mockAntiGhostService = {
      onUserResponse: jest.fn().mockResolvedValue(undefined),
    };
    mockScoreService = {
      updateScore: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProofService,
        { provide: getRepositoryToken(Proof), useValue: mockProofRepo },
        { provide: getRepositoryToken(DailyTask), useValue: mockTaskRepo },
        { provide: AntiGhostService, useValue: mockAntiGhostService },
        { provide: ScoreService, useValue: mockScoreService },
      ],
    }).compile();

    service = module.get<ProofService>(ProofService);
  });

  describe('submitProof', () => {
    it('creates a proof record with the correct type and user', async () => {
      await service.submitProof({
        userId: 'user-1',
        taskId: 'task-1',
        type: ProofType.PHOTO,
        mediaUrl: 'https://example.com/proof.jpg',
      });
      expect(mockProofRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          task_id: 'task-1',
          proof_type: ProofType.PHOTO,
          media_url: 'https://example.com/proof.jpg',
        }),
      );
    });

    it('creates a text proof with content field', async () => {
      await service.submitProof({
        userId: 'user-1',
        taskId: 'task-1',
        type: ProofType.TEXT,
        content: 'I finished the run',
      });
      expect(mockProofRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          proof_type: ProofType.TEXT,
          content: 'I finished the run',
        }),
      );
    });

    it('marks the daily task as COMPLETED', async () => {
      await service.submitProof({ userId: 'user-1', taskId: 'task-1', type: ProofType.TEXT, content: 'done' });
      expect(mockTaskRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.COMPLETED }),
      );
    });

    it('links the proof id to the task', async () => {
      await service.submitProof({ userId: 'user-1', taskId: 'task-1', type: ProofType.TEXT, content: 'done' });
      const savedTask = mockTaskRepo.save.mock.calls[0][0];
      expect(savedTask.proof_id).toBe('proof-1');
    });

    it('sets completion_timestamp on the task', async () => {
      const before = Date.now();
      await service.submitProof({ userId: 'user-1', taskId: 'task-1', type: ProofType.TEXT, content: 'done' });
      const savedTask = mockTaskRepo.save.mock.calls[0][0];
      expect(new Date(savedTask.completion_timestamp).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('marks the proof as ACCEPTED', async () => {
      await service.submitProof({ userId: 'user-1', taskId: 'task-1', type: ProofType.TEXT, content: 'done' });
      expect(mockProofRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ validation_status: ProofValidationStatus.ACCEPTED }),
      );
    });

    it('resets the anti-ghost state for the user', async () => {
      await service.submitProof({ userId: 'user-1', taskId: 'task-1', type: ProofType.TEXT, content: 'done' });
      expect(mockAntiGhostService.onUserResponse).toHaveBeenCalledWith('user-1');
    });

    it('triggers a score recalculation', async () => {
      await service.submitProof({ userId: 'user-1', taskId: 'task-1', type: ProofType.TEXT, content: 'done' });
      expect(mockScoreService.updateScore).toHaveBeenCalledWith('user-1');
    });

    it('returns the saved proof record', async () => {
      const result = await service.submitProof({
        userId: 'user-1', taskId: 'task-1', type: ProofType.TEXT, content: 'done',
      });
      expect(result).toBeDefined();
      expect(result.user_id).toBe('user-1');
    });

    it('throws when task is not found', async () => {
      mockTaskRepo.findOne.mockResolvedValue(null);
      await expect(
        service.submitProof({ userId: 'user-1', taskId: 'missing', type: ProofType.TEXT, content: 'x' }),
      ).rejects.toThrow();
    });
  });
});
