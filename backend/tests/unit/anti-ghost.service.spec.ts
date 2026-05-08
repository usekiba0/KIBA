import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { AntiGhostState, GhostState } from '../../src/data/entities/anti-ghost-state.entity';
import { StrikeService } from '../../src/accountability/strike.service';

const userId = 'user-1';
const taskId = 'task-1';

function makeState(state: GhostState = GhostState.ACTIVE): AntiGhostState {
  return {
    user_id: userId, state,
    last_response_at: new Date(),
    next_escalation_at: null,
    current_job_id: null,
  };
}

describe('AntiGhostService', () => {
  let service: AntiGhostService;
  let mockStateRepo: any;
  let mockQueue: any;
  let mockStrikeService: any;

  beforeEach(async () => {
    mockStateRepo = {
      findOne: jest.fn().mockResolvedValue(makeState()),
      save: jest.fn(async (s: any) => s),
      create: jest.fn((s: any) => s),
    };
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      getJob: jest.fn().mockResolvedValue({ remove: jest.fn() }),
    };
    mockStrikeService = {
      logStrike: jest.fn().mockResolvedValue({ id: 'strike-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AntiGhostService,
        { provide: getRepositoryToken(AntiGhostState), useValue: mockStateRepo },
        { provide: getQueueToken('accountability'), useValue: mockQueue },
        { provide: StrikeService, useValue: mockStrikeService },
      ],
    }).compile();

    service = module.get<AntiGhostService>(AntiGhostService);
  });

  describe('onMissedCheckin', () => {
    it('transitions state from active to ghost_1', async () => {
      mockStateRepo.findOne.mockResolvedValue(makeState(GhostState.ACTIVE));
      await service.onMissedCheckin(userId, taskId);
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: GhostState.GHOST_1 })
      );
    });

    it('logs a strike at escalation_level 1', async () => {
      await service.onMissedCheckin(userId, taskId);
      expect(mockStrikeService.logStrike).toHaveBeenCalledWith(userId, taskId, 1);
    });

    it('queues a ghost_2 escalation job delayed by 24h', async () => {
      await service.onMissedCheckin(userId, taskId);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'ghost-escalate',
        expect.objectContaining({ userId, taskId, level: 2 }),
        expect.objectContaining({ delay: expect.any(Number) })
      );
      const delay = mockQueue.add.mock.calls[0][2].delay;
      const hours = delay / (1000 * 60 * 60);
      expect(hours).toBeCloseTo(24, 0);
    });

    it('stores the BullMQ job id in state', async () => {
      await service.onMissedCheckin(userId, taskId);
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ current_job_id: 'job-123' })
      );
    });
  });

  describe('onEscalate', () => {
    it('transitions ghost_1 → ghost_2 and logs strike level 2', async () => {
      mockStateRepo.findOne.mockResolvedValue(makeState(GhostState.GHOST_1));
      await service.onEscalate(userId, taskId, 2);
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: GhostState.GHOST_2 })
      );
      expect(mockStrikeService.logStrike).toHaveBeenCalledWith(userId, taskId, 2);
    });

    it('transitions ghost_2 → ghost_3 and logs strike level 3', async () => {
      mockStateRepo.findOne.mockResolvedValue(makeState(GhostState.GHOST_2));
      await service.onEscalate(userId, taskId, 3);
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: GhostState.GHOST_3 })
      );
      expect(mockStrikeService.logStrike).toHaveBeenCalledWith(userId, taskId, 3);
    });
  });

  describe('onUserResponse', () => {
    it('resets state to active when user responds', async () => {
      mockStateRepo.findOne.mockResolvedValue(makeState(GhostState.GHOST_2));
      await service.onUserResponse(userId);
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: GhostState.ACTIVE })
      );
    });

    it('cancels the pending escalation job', async () => {
      const mockJob = { remove: jest.fn() };
      mockQueue.getJob.mockResolvedValue(mockJob);
      const state = makeState(GhostState.GHOST_1);
      state.current_job_id = 'job-to-cancel';
      mockStateRepo.findOne.mockResolvedValue(state);
      await service.onUserResponse(userId);
      expect(mockQueue.getJob).toHaveBeenCalledWith('job-to-cancel');
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('updates last_response_at timestamp', async () => {
      const before = Date.now();
      await service.onUserResponse(userId);
      const saved = mockStateRepo.save.mock.calls[0][0];
      expect(new Date(saved.last_response_at).getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getState', () => {
    it('returns active state for a user with no ghost state record', async () => {
      mockStateRepo.findOne.mockResolvedValue(null);
      const state = await service.getState(userId);
      expect(state).toBe(GhostState.ACTIVE);
    });

    it('returns the current ghost state', async () => {
      mockStateRepo.findOne.mockResolvedValue(makeState(GhostState.GHOST_2));
      const state = await service.getState(userId);
      expect(state).toBe(GhostState.GHOST_2);
    });
  });
});
