import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { WeeklyReviewService } from '../../src/accountability/weekly-review.service';
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

/**
 * First spec for the weekly review — added the day it was caught sending
 * "0 done, N missed / you didn't really show up this week" built from
 * auto-seeded plan rows the user never agreed to (KIBA_Retraining_Doc
 * msg #126). The night recap got the PLAN exclusion on 2026-06-29; the weekly
 * review was missed, which is exactly the kind of drift a spec pins down.
 */
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

// committed_at mirrors the migration backfill (Approach C Phase 1): USER/AI
// rows and any DONE row are commitments; an OPEN PLAN row is an un-agreed
// proposal (null). Callers can override by passing committedAt explicitly.
const todo = (
  status: DailyTodoStatus,
  source: DailyTodoSource,
  content = 'x',
  committedAt?: Date | null,
): DailyTodo =>
  ({
    content,
    status,
    source,
    committed_at:
      committedAt !== undefined
        ? committedAt
        : source === DailyTodoSource.PLAN && status !== DailyTodoStatus.DONE
          ? null
          : new Date(),
  }) as DailyTodo;

describe('WeeklyReviewService.fire', () => {
  let service: WeeklyReviewService;
  let userRepo: any;
  let todoRepo: any;
  let messageRepo: any;
  let messaging: any;
  let queue: any;
  let scoreService: any;

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn().mockResolvedValue(makeUser()),
      createQueryBuilder: jest.fn(() => claimQB(1)),
    };
    todoRepo = { find: jest.fn().mockResolvedValue([]) };
    messageRepo = {
      save: jest.fn().mockResolvedValue({ id: 'm-1' }),
      findOne: jest.fn().mockResolvedValue(null),
    };
    messaging = { send: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    scoreService = {
      updateScore: jest.fn().mockResolvedValue({ current_score: 55 }),
      countExecutionDays: jest.fn().mockResolvedValue(2),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyReviewService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(DailyTodo), useValue: todoRepo },
        { provide: getRepositoryToken(Proof), useValue: { count: jest.fn().mockResolvedValue(0) } },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
        { provide: ScoreService, useValue: scoreService },
        { provide: MessagingService, useValue: messaging },
        {
          provide: SessionBoundaryService,
          useValue: {
            checkAndHandle: jest.fn().mockResolvedValue({ sessionId: 's-1' }),
            recordMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: getQueueToken('accountability'), useValue: queue },
      ],
    }).compile();

    service = module.get<WeeklyReviewService>(WeeklyReviewService);
  });

  it('does not count untouched auto-seeded PLAN rows as missed (Retraining #126)', async () => {
    // Merely chatting once a day seeds PLAN todos. A week of those, none of
    // them ever discussed, used to render as "❌ 4 missed" over a real week
    // of work.
    todoRepo.find.mockResolvedValue([
      todo(DailyTodoStatus.DONE, DailyTodoSource.USER, 'gym'),
      todo(DailyTodoStatus.OPEN, DailyTodoSource.PLAN),
      todo(DailyTodoStatus.OPEN, DailyTodoSource.PLAN),
      todo(DailyTodoStatus.OPEN, DailyTodoSource.PLAN),
      todo(DailyTodoStatus.OPEN, DailyTodoSource.PLAN),
    ]);

    await service.fire('user-1');

    const [, body] = messaging.send.mock.calls[0];
    expect(body).toContain('✅ 1 done');
    expect(body).not.toContain('missed');
  });

  it('still counts a miss the user actually owned (USER/AI source)', async () => {
    todoRepo.find.mockResolvedValue([
      todo(DailyTodoStatus.DONE, DailyTodoSource.USER, 'gym'),
      todo(DailyTodoStatus.OPEN, DailyTodoSource.USER, 'deep work'),
    ]);

    await service.fire('user-1');

    const [, body] = messaging.send.mock.calls[0];
    expect(body).toContain('❌ 1 missed');
  });

  it('omits the score line when the proof ledger has never been fed', async () => {
    todoRepo.find.mockResolvedValue([todo(DailyTodoStatus.DONE, DailyTodoSource.USER, 'gym')]);
    scoreService.updateScore.mockResolvedValue({ current_score: 0 });
    scoreService.countExecutionDays.mockResolvedValue(0);

    await service.fire('user-1');

    const [, body] = messaging.send.mock.calls[0];
    expect(body).not.toContain('score:');
  });

  it('defers rather than firing into an active conversation', async () => {
    const utcHour = new Date().getUTCHours();
    userRepo.findOne.mockResolvedValue(
      makeUser({ utc_offset_minutes: (12 - utcHour) * 60 }), // local noon
    );
    messageRepo.findOne.mockResolvedValue({ id: 'm-9', created_at: new Date() });

    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(userRepo.createQueryBuilder).not.toHaveBeenCalled(); // week not claimed — the retry must win it
    const jobIds = queue.add.mock.calls.map((c: unknown[]) => (c[2] as { jobId: string }).jobId);
    expect(jobIds.some((j: string) => j.startsWith('weekly-defer:user-1:'))).toBe(true);
    expect(jobIds.some((j: string) => j.startsWith('weekly-review:user-1:'))).toBe(true);
  });

  it('stays entirely silent on a week with no activity at all', async () => {
    todoRepo.find.mockResolvedValue([
      todo(DailyTodoStatus.OPEN, DailyTodoSource.PLAN),
      todo(DailyTodoStatus.OPEN, DailyTodoSource.PLAN),
    ]);

    await service.fire('user-1');

    // All-PLAN weeks now count 0 done / 0 missed / 0 proofs → builder returns
    // null → nothing sends. Before the fix this exact week rendered as
    // "you didn't really show up".
    expect(messaging.send).not.toHaveBeenCalled();
  });
});
