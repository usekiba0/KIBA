import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { RecapService } from '../../src/accountability/recap.service';
import { User, UserStatus, OnboardingStage } from '../../src/data/entities/user.entity';
import {
  DailyTodo,
  DailyTodoStatus,
  DailyTodoSource,
} from '../../src/data/entities/daily-todo.entity';
import { Proof } from '../../src/data/entities/proof.entity';
import { Message } from '../../src/data/entities/message.entity';
import { ScoreService } from '../../src/accountability/score.service';
import { MessagingService } from '../../src/messaging/messaging.service';
import { SessionBoundaryService } from '../../src/data/session-boundary.service';

/** Atomic per-day claim stub. affected=1 → this fire wins and sends. */
function claimQB(affected = 1) {
  return {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    phone_number: '+15551234567',
    name: 'Alex',
    status: UserStatus.ACTIVE,
    onboarding_stage: OnboardingStage.COMPLETE,
    crisis_hold: false,
    utc_offset_minutes: -300,
    last_excuse_phrase: null,
    same_excuse_count: 0,
    ...overrides,
  } as unknown as User;
}

// Committed items (Approach C Phase 1): a completed task is committed, and an
// OPEN task the user agreed to (USER/AI source) is committed on creation.
const doneTodo = {
  content: 'leg workout',
  status: DailyTodoStatus.DONE,
  committed_at: new Date(),
} as DailyTodo;
const openTodo = {
  content: 'business deep work',
  status: DailyTodoStatus.OPEN,
  source: DailyTodoSource.USER,
  committed_at: new Date(),
} as DailyTodo;

describe('RecapService.fire', () => {
  let service: RecapService;
  let userRepo: any;
  let todoRepo: any;
  let proofRepo: any;
  let messageRepo: any;
  let messaging: any;
  let queue: any;
  let scoreService: any;
  let claimAffected: number;

  beforeEach(async () => {
    claimAffected = 1;
    userRepo = {
      findOne: jest.fn().mockResolvedValue(makeUser()),
      createQueryBuilder: jest.fn(() => claimQB(claimAffected)),
    };
    todoRepo = { find: jest.fn().mockResolvedValue([doneTodo, openTodo]) };
    proofRepo = { count: jest.fn().mockResolvedValue(2) };
    // findOne -> null = "user not mid-conversation", so the defer guard passes
    // and these tests exercise the send path they were written for.
    messageRepo = {
      save: jest.fn().mockResolvedValue({ id: 'm-1' }),
      findOne: jest.fn().mockResolvedValue(null),
    };
    messaging = { send: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    scoreService = {
      updateScore: jest.fn().mockResolvedValue({ current_score: 72 }),
      // Default: the proof ledger HAS been fed, so the score line renders and
      // pre-existing tests keep their meaning.
      countExecutionDays: jest.fn().mockResolvedValue(3),
    };
    const sessionBoundary = {
      checkAndHandle: jest.fn().mockResolvedValue({ sessionId: 's-1' }),
      recordMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecapService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(DailyTodo), useValue: todoRepo },
        { provide: getRepositoryToken(Proof), useValue: proofRepo },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
        { provide: ScoreService, useValue: scoreService },
        { provide: MessagingService, useValue: messaging },
        { provide: SessionBoundaryService, useValue: sessionBoundary },
        { provide: getQueueToken('accountability'), useValue: queue },
      ],
    }).compile();

    service = module.get<RecapService>(RecapService);
  });

  it('sends a recap built from the day’s todos and self-reschedules tomorrow', async () => {
    await service.fire('user-1');

    expect(messaging.send).toHaveBeenCalledTimes(1);
    const [, body] = messaging.send.mock.calls[0];
    expect(body).toContain('day recap:');
    expect(body).toContain('✅ leg workout');
    expect(body).toContain('❌ business deep work');
    expect(messageRepo.save).toHaveBeenCalled(); // persisted for admin visibility
    expect(queue.add).toHaveBeenCalledWith(
      'send-recap',
      { userId: 'user-1' },
      expect.objectContaining({ jobId: expect.stringContaining('recap:user-1:') }),
    );
  });

  it('suppresses the send when the day is already claimed, but still reschedules', async () => {
    claimAffected = 0;
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1); // reschedule only
  });

  it('stays silent when there was nothing on the board and no proof, but still reschedules', async () => {
    todoRepo.find.mockResolvedValue([]);
    proofRepo.count.mockResolvedValue(0);
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the day was only untouched auto-seeded plan tasks and no proof (no false "you folded")', async () => {
    // Bianca case: ~10 PLAN tasks auto-seeded, none agreed to, all still OPEN.
    todoRepo.find.mockResolvedValue([
      {
        content: 'Buy containers and prep ingredients',
        status: DailyTodoStatus.OPEN,
        source: DailyTodoSource.PLAN,
      },
      {
        content: 'Eat breakfast at your set time',
        status: DailyTodoStatus.OPEN,
        source: DailyTodoSource.PLAN,
      },
    ] as DailyTodo[]);
    proofRepo.count.mockResolvedValue(0);
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1); // reschedule only
  });

  // The regression that silenced the feature entirely (2026-07-21..23: every
  // recap fire for every active user exited via recap_skipped_no_activity).
  // An all-auto-seeded board plus real proof is a day the user WORKED — the
  // recap has to speak, and it must not invent a verdict about the empty board.
  it('sends on an all-auto-seeded board when proof came in', async () => {
    todoRepo.find.mockResolvedValue([
      {
        content: 'Weigh yourself same time as Day 1',
        status: DailyTodoStatus.OPEN,
        source: DailyTodoSource.PLAN,
      },
    ] as DailyTodo[]);
    proofRepo.count.mockResolvedValue(3);
    await service.fire('user-1');

    expect(messaging.send).toHaveBeenCalled();
    const body = messaging.send.mock.calls[0][1] as string;
    expect(body).toContain('3 proofs in today');
    expect(body.toLowerCase()).not.toMatch(/folded|nothing got checked off/);
  });

  it('still shames tasks the user actually committed to (USER source counts as missed)', async () => {
    todoRepo.find.mockResolvedValue([
      {
        content: 'cold call 5 leads',
        status: DailyTodoStatus.OPEN,
        source: DailyTodoSource.USER,
        committed_at: new Date(),
      },
    ] as DailyTodo[]);
    await service.fire('user-1');

    expect(messaging.send).toHaveBeenCalledTimes(1);
    const [, body] = messaging.send.mock.calls[0];
    expect(body).toContain('❌ cold call 5 leads');
  });

  // Approach C, Phase 1: counting keys on committed_at, not source.
  describe('committed-gated counts', () => {
    it('does NOT count an un-agreed OPEN item (committed_at null) as missed', async () => {
      // Same shape as an auto-seeded PLAN proposal, but proving the gate is the
      // commitment flag, not the source: an OPEN row with no committed_at is
      // never a miss, even if it slipped through as a USER row somehow.
      todoRepo.find.mockResolvedValue([
        {
          content: 'ghost proposal',
          status: DailyTodoStatus.OPEN,
          source: DailyTodoSource.PLAN,
          committed_at: null,
        },
      ] as DailyTodo[]);
      proofRepo.count.mockResolvedValue(0);
      await service.fire('user-1');

      expect(messaging.send).not.toHaveBeenCalled(); // nothing committed, no proof → silent
    });

    it('counts a COMPLETED plan item as done (completion = agreement)', async () => {
      todoRepo.find.mockResolvedValue([
        {
          content: 'audit subscriber data',
          status: DailyTodoStatus.DONE,
          source: DailyTodoSource.PLAN,
          committed_at: new Date(),
        },
      ] as DailyTodo[]);
      await service.fire('user-1');

      expect(messaging.send).toHaveBeenCalledTimes(1);
      const [, body] = messaging.send.mock.calls[0];
      expect(body).toContain('✅ audit subscriber data');
    });
  });

  it('suppresses tonight’s send for a crisis-hold user, keeping cadence', async () => {
    userRepo.findOne.mockResolvedValue(makeUser({ crisis_hold: true }));
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('stops the loop entirely for a cancelled user (no send, no reschedule)', async () => {
    userRepo.findOne.mockResolvedValue(makeUser({ status: UserStatus.CANCELLED }));
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('omits the score line when the proof ledger has never been fed (Retraining B4)', async () => {
    // The 0-100 score reads ONLY photo-proofed DailyTask completions — a
    // ledger chat can't touch. Printing "score: 0/100" under a list of ✅
    // items fabricated failure (Karibi 2026-07-21). No fed ledger, no line.
    scoreService.updateScore.mockResolvedValue({ current_score: 0 });
    scoreService.countExecutionDays.mockResolvedValue(0);

    await service.fire('user-1');

    const [, body] = messaging.send.mock.calls[0];
    expect(body).not.toContain('score:');
  });

  it('prints the real score once the ledger has data', async () => {
    await service.fire('user-1'); // default mocks: score 72, 3 execution days
    const [, body] = messaging.send.mock.calls[0];
    expect(body).toContain('score: 72/100');
  });

  it('defers instead of interrupting an active conversation, and keeps cadence', async () => {
    // The retraining test's scheduled sends barged into live conversations
    // with stale summaries (B1). If the user texted within the window, push
    // tonight's recap back rather than talking over them.
    const utcHour = new Date().getUTCHours();
    userRepo.findOne.mockResolvedValue(
      makeUser({ utc_offset_minutes: (12 - utcHour) * 60 }), // local noon — inside defer hours
    );
    messageRepo.findOne.mockResolvedValue({ id: 'm-9', created_at: new Date() });

    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(userRepo.createQueryBuilder).not.toHaveBeenCalled(); // day NOT claimed — the retry must still win it
    const jobNames = queue.add.mock.calls.map((c: unknown[]) => (c[2] as { jobId: string }).jobId);
    expect(jobNames.some((j: string) => j.startsWith('recap-defer:user-1:'))).toBe(true);
    expect(jobNames.some((j: string) => j.startsWith('recap:user-1:'))).toBe(true); // tomorrow still scheduled
  });

  it('sends anyway near local midnight even mid-conversation', async () => {
    // Deferral is bounded: past the cutoff a deferred recap would cross into
    // the wrong local day, which is worse than interrupting.
    const utcHour = new Date().getUTCHours();
    userRepo.findOne.mockResolvedValue(
      makeUser({ utc_offset_minutes: (23 - utcHour) * 60 }), // local 23:xx
    );
    messageRepo.findOne.mockResolvedValue({ id: 'm-9', created_at: new Date() });

    await service.fire('user-1');

    expect(messaging.send).toHaveBeenCalledTimes(1);
  });
});
