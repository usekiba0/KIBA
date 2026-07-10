import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { AntiGhostState, GhostState } from '../../src/data/entities/anti-ghost-state.entity';
import { User, UserStatus } from '../../src/data/entities/user.entity';
import { Goal } from '../../src/data/entities/goal.entity';
import { Message, MessageRole } from '../../src/data/entities/message.entity';
import { PsychologicalProfile } from '../../src/data/entities/psychological-profile.entity';
import { StrikeService } from '../../src/accountability/strike.service';
import { MessagingService } from '../../src/messaging/messaging.service';

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

function makeUser(crisis_hold = false): User {
  // Partial mock — only the fields AntiGhostService reads. Cast because User
  // has many more columns this service never touches.
  return {
    id: userId, phone_number: '+15551234567', name: 'Alex',
    coaching_focus: null as any, goals: null as any, checkin_time: '09:00',
    height_cm: null, weight_kg: null, age: null,
    health_conditions: [], dietary_restrictions: [], injuries: null,
    status: UserStatus.ACTIVE, crisis_hold,
    registered_at: new Date(), last_active_at: null,
  } as unknown as User;
}

describe('AntiGhostService', () => {
  let service: AntiGhostService;
  let mockStateRepo: any;
  let mockQueue: any;
  let mockStrikeService: any;
  let mockUserRepo: any;
  let mockGoalRepo: any;
  let mockProfileRepo: any;
  let mockMessageRepo: any;
  let mockMessagingService: any;

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
    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(makeUser(false)),
    };
    // fireGhostMessage loads goal + profile and sends the scripted message.
    mockGoalRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockProfileRepo = { findOne: jest.fn().mockResolvedValue(null) };
    // Default: no prior inbound → context-suppression is a no-op and the ghost
    // fires as before. Individual defer tests override findOne.
    mockMessageRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockMessagingService = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AntiGhostService,
        { provide: getRepositoryToken(AntiGhostState), useValue: mockStateRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Goal), useValue: mockGoalRepo },
        { provide: getRepositoryToken(PsychologicalProfile), useValue: mockProfileRepo },
        { provide: getRepositoryToken(Message), useValue: mockMessageRepo },
        { provide: getQueueToken('accountability'), useValue: mockQueue },
        { provide: StrikeService, useValue: mockStrikeService },
        { provide: MessagingService, useValue: mockMessagingService },
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

    it('queues a ghost_2 escalation job (~3h after ghost_1, = 5h since miss)', async () => {
      await service.onMissedCheckin(userId, taskId);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'ghost-escalate',
        expect.objectContaining({ userId, taskId, level: 2 }),
        expect.objectContaining({ delay: expect.any(Number) })
      );
      const delay = mockQueue.add.mock.calls[0][2].delay;
      const hours = delay / (1000 * 60 * 60);
      expect(hours).toBeCloseTo(3, 0);
    });

    it('stores the BullMQ job id in state', async () => {
      await service.onMissedCheckin(userId, taskId);
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ current_job_id: 'job-123' })
      );
    });

    // Regression: a user who ghosts several mornings in a row must NOT spawn a
    // second escalation chain each day. Each new chain used to orphan the prior
    // one (state only tracks the latest job id) and the orphans kept firing —
    // that stacked up as 4-5 pings in one morning. When already mid-ghost, a
    // fresh miss is a no-op: no strike, no message, no new escalation job.
    it('does NOT start a second chain when already mid-ghost', async () => {
      mockStateRepo.findOne.mockResolvedValue(makeState(GhostState.GHOST_2));
      await service.onMissedCheckin(userId, taskId);
      expect(mockStrikeService.logStrike).not.toHaveBeenCalled();
      expect(mockMessagingService.send).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockStateRepo.save).not.toHaveBeenCalled();
    });
  });

  // Rule 13 (Karibi Conversation Overhaul): a ghost must never talk over a plan
  // KIBA itself acknowledged. If the user's last inbound said they'd be back
  // later, defer the whole chain ONCE instead of guilt-blasting them.
  describe('onMissedCheckin — context suppression (stated return)', () => {
    const recentAway = (content: string) => ({
      content,
      role: MessageRole.USER,
      created_at: new Date(Date.now() - 60 * 60 * 1000), // 1h ago (within window)
    });

    it('defers (no strike/no message) when the last inbound stated a return time', async () => {
      mockMessageRepo.findOne.mockResolvedValue(
        recentAway("alr i'll lock in after the game bro watching Colombia rn"),
      );
      await service.onMissedCheckin(userId, taskId);

      // No ghost fired, no strike, chain state untouched...
      expect(mockStrikeService.logStrike).not.toHaveBeenCalled();
      expect(mockMessagingService.send).not.toHaveBeenCalled();
      expect(mockStateRepo.save).not.toHaveBeenCalled();
      // ...instead the chain is re-queued once with deferred=true.
      expect(mockQueue.add).toHaveBeenCalledWith(
        'checkin-missed',
        expect.objectContaining({ userId, taskId, deferred: true }),
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('fires normally on the deferred re-run even if still saying they are away', async () => {
      mockMessageRepo.findOne.mockResolvedValue(recentAway('going to sleep, talk later'));
      await service.onMissedCheckin(userId, taskId, /* alreadyDeferred */ true);
      // Second time around it does NOT defer again — a permanent "gn" can't
      // suppress the ghost forever.
      expect(mockStrikeService.logStrike).toHaveBeenCalledWith(userId, taskId, 1);
      expect(mockMessagingService.send).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'ghost-escalate',
        expect.objectContaining({ level: 2 }),
        expect.anything(),
      );
    });

    it('does NOT defer on a STALE away message (older than the window)', async () => {
      mockMessageRepo.findOne.mockResolvedValue({
        content: 'going to sleep',
        role: MessageRole.USER,
        created_at: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12h ago
      });
      await service.onMissedCheckin(userId, taskId);
      expect(mockStrikeService.logStrike).toHaveBeenCalledWith(userId, taskId, 1);
      expect(mockMessagingService.send).toHaveBeenCalled();
    });

    it('does NOT defer when the last inbound is a normal message', async () => {
      mockMessageRepo.findOne.mockResolvedValue(recentAway('yeah that plan works for me'));
      await service.onMissedCheckin(userId, taskId);
      expect(mockStrikeService.logStrike).toHaveBeenCalledWith(userId, taskId, 1);
      expect(mockMessagingService.send).toHaveBeenCalled();
    });
  });

  describe('onEscalate', () => {
    // NOTE: only ONE strike is logged per missed task (at level 1 in
    // onMissedCheckin). Levels 2-6 are re-engagement pings on the same already-
    // counted miss — onEscalate transitions state + sends the message, it does
    // NOT log additional strikes (V5 PART 7).
    it('transitions ghost_1 → ghost_2 and sends the ping', async () => {
      mockStateRepo.findOne.mockResolvedValue(makeState(GhostState.GHOST_1));
      await service.onEscalate(userId, taskId, 2);
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: GhostState.GHOST_2 })
      );
      expect(mockMessagingService.send).toHaveBeenCalled();
      expect(mockStrikeService.logStrike).not.toHaveBeenCalled();
    });

    it('transitions ghost_2 → ghost_3 without a second strike', async () => {
      mockStateRepo.findOne.mockResolvedValue(makeState(GhostState.GHOST_2));
      await service.onEscalate(userId, taskId, 3);
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: GhostState.GHOST_3 })
      );
      expect(mockStrikeService.logStrike).not.toHaveBeenCalled();
    });

    // Orphan-drain: an escalate job whose id no longer matches the live
    // current_job_id is a superseded chain (legacy multi-chain user, or a user
    // who already replied and had current_job_id cleared). It must die silently
    // — no ping, no state write, no re-schedule.
    it('drops an orphaned escalate job whose id != current_job_id', async () => {
      const state = makeState(GhostState.GHOST_2);
      state.current_job_id = 'live-chain-job';
      mockStateRepo.findOne.mockResolvedValue(state);
      await service.onEscalate(userId, taskId, 3, 'orphan-chain-job');
      expect(mockMessagingService.send).not.toHaveBeenCalled();
      expect(mockStateRepo.save).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    // The chain the state points at proceeds normally when the ids match.
    it('proceeds when the executing job id matches current_job_id', async () => {
      const state = makeState(GhostState.GHOST_2);
      state.current_job_id = 'live-chain-job';
      mockStateRepo.findOne.mockResolvedValue(state);
      await service.onEscalate(userId, taskId, 3, 'live-chain-job');
      expect(mockMessagingService.send).toHaveBeenCalled();
      expect(mockStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: GhostState.GHOST_3 })
      );
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

  describe('crisis_hold suppression', () => {
    it('skips onMissedCheckin entirely when user has crisis_hold = true', async () => {
      mockUserRepo.findOne.mockResolvedValue(makeUser(true));
      await service.onMissedCheckin(userId, taskId);
      expect(mockStrikeService.logStrike).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockStateRepo.save).not.toHaveBeenCalled();
    });

    it('skips onEscalate entirely when user has crisis_hold = true', async () => {
      mockUserRepo.findOne.mockResolvedValue(makeUser(true));
      await service.onEscalate(userId, taskId, 2);
      expect(mockStrikeService.logStrike).not.toHaveBeenCalled();
      expect(mockStateRepo.save).not.toHaveBeenCalled();
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
