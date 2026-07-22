import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProofService } from '../../src/accountability/proof.service';
import { Proof, ProofType, ProofValidationStatus } from '../../src/data/entities/proof.entity';
import { DailyTask, TaskStatus } from '../../src/data/entities/daily-task.entity';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { ScoreService } from '../../src/accountability/score.service';
import { User } from '../../src/data/entities/user.entity';
import { PsychologicalProfile } from '../../src/data/entities/psychological-profile.entity';
import { MessagingService } from '../../src/messaging/messaging.service';
import { OutboundRecorderService } from '../../src/data/outbound-recorder.service';

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
  let mockUserRepo: any;
  let mockProfileRepo: any;
  let mockMessagingService: any;
  let mockRecorder: any;

  beforeEach(async () => {
    mockProofRepo = {
      create: jest.fn((d: any) => ({ id: 'proof-1', ...d })),
      save: jest.fn(async (p: any) => ({ id: 'proof-1', ...p })),
    };
    mockTaskRepo = {
      findOne: jest.fn().mockResolvedValue({ ...testTask }),
      save: jest.fn(async (t: any) => t),
      // streak walk in fireMilestoneIfDue — empty = streak 0 = no milestone fired
      find: jest.fn().mockResolvedValue([]),
    };
    mockAntiGhostService = {
      onUserResponse: jest.fn().mockResolvedValue(undefined),
    };
    mockScoreService = {
      updateScore: jest.fn().mockResolvedValue(undefined),
    };
    // Deps added for the streak-milestone auto-fire (best-effort path).
    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', name: 'Alex', phone_number: '+15551234567', last_milestone_hit: 0 }),
      update: jest.fn().mockResolvedValue({}),
    };
    mockProfileRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    mockMessagingService = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    mockRecorder = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProofService,
        { provide: getRepositoryToken(Proof), useValue: mockProofRepo },
        { provide: getRepositoryToken(DailyTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(PsychologicalProfile), useValue: mockProfileRepo },
        { provide: AntiGhostService, useValue: mockAntiGhostService },
        { provide: ScoreService, useValue: mockScoreService },
        { provide: MessagingService, useValue: mockMessagingService },
        { provide: OutboundRecorderService, useValue: mockRecorder },
      ],
    }).compile();

    service = module.get<ProofService>(ProofService);
  });

  describe('submitProof', () => {
    it('records a fired milestone as a Message row (kind=milestone)', async () => {
      // 3 consecutive completed days ending today → streak 3 → milestone fires.
      // Dates built exactly like computeCurrentStreak's walk (local midnight).
      const day = (d: number) => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        t.setDate(t.getDate() - d);
        return t;
      };
      mockTaskRepo.find.mockResolvedValue([
        { scheduled_date: day(0), status: TaskStatus.COMPLETED },
        { scheduled_date: day(1), status: TaskStatus.COMPLETED },
        { scheduled_date: day(2), status: TaskStatus.COMPLETED },
      ]);

      await service.submitProof({
        userId: 'user-1',
        taskId: 'task-1',
        type: ProofType.PHOTO,
        mediaUrl: 'https://example.com/proof.jpg',
      });

      expect(mockMessagingService.send).toHaveBeenCalled();
      expect(mockRecorder.record).toHaveBeenCalledWith('user-1', expect.any(String), 'milestone');
    });

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
