import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScoreService } from '../../src/accountability/score.service';
import { ExecutionScore } from '../../src/data/entities/execution-score.entity';
import { DailyTask, TaskStatus } from '../../src/data/entities/daily-task.entity';
import { Proof, ProofValidationStatus } from '../../src/data/entities/proof.entity';
import { DailyTodo, DailyTodoStatus } from '../../src/data/entities/daily-todo.entity';

const userId = 'user-1';

function makeTask(status: TaskStatus, daysAgo: number, proofId?: string): Partial<DailyTask> {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { id: `task-${daysAgo}`, user_id: userId, status, scheduled_date: d, proof_id: proofId ?? null, created_at: d };
}

/**
 * A to-do the way KIBA's own tools write them. This is the path real users are on: the score
 * used to read only daily_tasks, which exist only when a goal has a generated action_plan, so
 * anyone onboarded over SMS scored 0 no matter how much they actually did.
 */
function makeTodo(status: DailyTodoStatus, daysAgo: number): Partial<DailyTodo> {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `todo-${status}-${daysAgo}`,
    user_id: userId,
    status,
    scheduled_date: d,
    completed_at: status === DailyTodoStatus.DONE ? d : null,
    created_at: d,
  } as Partial<DailyTodo>;
}

function makeScore(overrides: Partial<ExecutionScore> = {}): ExecutionScore {
  return { id: 'score-1', user_id: userId, current_score: 50, completion_rate: 0.5, proof_rate: 0.5, response_time_score: 0.5, streak_bonus: 0, snapshot_date: new Date(), created_at: new Date(), ...overrides } as ExecutionScore;
}

describe('ScoreService', () => {
  let service: ScoreService;
  let mockScoreRepo: any;
  let mockTaskRepo: any;
  let mockProofRepo: any;
  let mockTodoRepo: any;

  beforeEach(async () => {
    mockScoreRepo = { findOne: jest.fn(), save: jest.fn(async (s: any) => s), create: jest.fn((s: any) => s) };
    mockTaskRepo = { find: jest.fn() };
    mockProofRepo = { find: jest.fn() };
    mockTodoRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoreService,
        { provide: getRepositoryToken(ExecutionScore), useValue: mockScoreRepo },
        { provide: getRepositoryToken(DailyTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(Proof), useValue: mockProofRepo },
        { provide: getRepositoryToken(DailyTodo), useValue: mockTodoRepo },
      ],
    }).compile();

    service = module.get<ScoreService>(ScoreService);
  });

  describe('calculateScore', () => {
    it('returns 0 when no tasks in last 14 days', () => {
      const score = service.calculateScore([], []);
      expect(score).toBe(0);
    });

    it('returns 100 when all tasks completed with proof and fast response', () => {
      const tasks = Array.from({ length: 7 }, (_, i) =>
        makeTask(TaskStatus.COMPLETED, i, `proof-${i}`)
      );
      const proofs = tasks.map((t, i) => ({
        id: `proof-${i}`, task_id: t.id!, user_id: userId,
        validation_status: ProofValidationStatus.ACCEPTED,
        created_at: new Date(t.created_at!.getTime() + 30 * 60 * 1000),
      }));
      const score = service.calculateScore(tasks as DailyTask[], proofs as any[]);
      expect(score).toBe(100);
    });

    it('completion_rate contributes 40% of score', () => {
      // alternating missed/completed — day 0 (most recent) is MISSED, so streak = 0
      const tasks = Array.from({ length: 10 }, (_, i) =>
        makeTask(i % 2 === 0 ? TaskStatus.MISSED : TaskStatus.COMPLETED, i)
      );
      const score = service.calculateScore(tasks as DailyTask[], []);
      // completion_rate = 0.5 → 0.5 * 40 = 20
      // proof_rate = 0 (no proof_ids) → 0
      // response_time_score = 0 (no proofs) → 0
      // streak_bonus = 0 (alternating) → 0
      expect(score).toBe(20);
    });

    it('proof_rate contributes 30% of score', () => {
      // All tasks completed, half with proof
      const tasks = Array.from({ length: 4 }, (_, i) =>
        makeTask(TaskStatus.COMPLETED, i, i < 2 ? `proof-${i}` : undefined)
      );
      const proofs = [0, 1].map(i => ({
        id: `proof-${i}`, task_id: `task-${i}`, user_id: userId,
        validation_status: ProofValidationStatus.ACCEPTED,
        created_at: new Date(tasks[i].created_at!.getTime() + 30 * 60 * 1000),
      }));
      const score = service.calculateScore(tasks as DailyTask[], proofs as any[]);
      // completion_rate = 1.0 → 40
      // proof_rate = 0.5 → 15
      // response_time_score based on 2 proofs submitted in 30min (good) → some points
      // streak = 4 consecutive → bonus
      expect(score).toBeGreaterThan(40);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('score is always between 0 and 100', () => {
      const tasks = Array.from({ length: 14 }, (_, i) => makeTask(TaskStatus.MISSED, i));
      const score = service.calculateScore(tasks as DailyTask[], []);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('streak_bonus is 0 with no consecutive completions', () => {
      // alternating completed and missed
      const tasks = Array.from({ length: 6 }, (_, i) =>
        makeTask(i % 2 === 0 ? TaskStatus.COMPLETED : TaskStatus.MISSED, i)
      );
      const score = service.calculateScore(tasks as DailyTask[], []);
      // no streak → no bonus
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updateScore', () => {
    it('saves a new ExecutionScore snapshot for today', async () => {
      mockTaskRepo.find.mockResolvedValue([
        makeTask(TaskStatus.COMPLETED, 0, 'proof-1'),
        makeTask(TaskStatus.MISSED, 1),
      ]);
      mockProofRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(null);

      await service.updateScore(userId);

      expect(mockScoreRepo.save).toHaveBeenCalledTimes(1);
      const saved = mockScoreRepo.save.mock.calls[0][0];
      expect(saved.user_id).toBe(userId);
      expect(typeof saved.current_score).toBe('number');
      expect(saved.current_score).toBeGreaterThanOrEqual(0);
      expect(saved.current_score).toBeLessThanOrEqual(100);
    });

    it('updates existing snapshot if one exists for today', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      mockTaskRepo.find.mockResolvedValue([makeTask(TaskStatus.COMPLETED, 0)]);
      mockProofRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(makeScore({ snapshot_date: today }));

      await service.updateScore(userId);

      expect(mockScoreRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * The recording fix (REC-01..REC-05 in specs/kiba-training-v2/TEST-CASES.md).
 *
 * Root cause: the score read daily_tasks and proofs only. Those rows exist only when a goal
 * has a generated action_plan, while KIBA's live tools (add_todo / mark_todo_done) write
 * daily_todos. So for anyone onboarded over SMS the score was computed from tables nothing
 * populates, and read 0 forever regardless of how much the user actually did.
 */
describe('ScoreService — execution recording', () => {
  let service: ScoreService;
  let scoreRepo: any;
  let taskRepo: any;
  let proofRepo: any;
  let todoRepo: any;

  beforeEach(async () => {
    scoreRepo = { findOne: jest.fn(), save: jest.fn(async (s: any) => s), create: jest.fn((s: any) => s) };
    taskRepo = { find: jest.fn().mockResolvedValue([]) };
    proofRepo = { find: jest.fn().mockResolvedValue([]) };
    todoRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoreService,
        { provide: getRepositoryToken(ExecutionScore), useValue: scoreRepo },
        { provide: getRepositoryToken(DailyTask), useValue: taskRepo },
        { provide: getRepositoryToken(Proof), useValue: proofRepo },
        { provide: getRepositoryToken(DailyTodo), useValue: todoRepo },
      ],
    }).compile();

    service = module.get<ScoreService>(ScoreService);
  });

  it('REC-03: a completed to-do produces a non-zero score', async () => {
    // The headline bug. Before this fix the user below scored 0.
    todoRepo.find.mockResolvedValue([
      makeTodo(DailyTodoStatus.DONE, 1),
      makeTodo(DailyTodoStatus.DONE, 2),
    ]);

    const snapshot = await service.updateScore(userId);

    expect(snapshot.current_score).toBeGreaterThan(0);
    expect(snapshot.completion_rate).toBe(1);
  });

  it('REC-04: silence never counts as a miss', async () => {
    // An open to-do and a pending task are unresolved, not failed. Counting them against the
    // user is exactly the "no response equals failure" behaviour the spec forbids.
    todoRepo.find.mockResolvedValue([
      makeTodo(DailyTodoStatus.DONE, 1),
      makeTodo(DailyTodoStatus.OPEN, 1),
      makeTodo(DailyTodoStatus.OPEN, 2),
    ]);
    taskRepo.find.mockResolvedValue([makeTask(TaskStatus.PENDING, 1)]);

    const snapshot = await service.updateScore(userId);

    expect(snapshot.completion_rate).toBe(1);
  });

  it('counts an explicit miss as a loss', async () => {
    // MISSED is only ever written by StrikeService after a real escalated miss, so unlike
    // silence it is genuine evidence of non-completion.
    todoRepo.find.mockResolvedValue([makeTodo(DailyTodoStatus.DONE, 1)]);
    taskRepo.find.mockResolvedValue([makeTask(TaskStatus.MISSED, 2)]);

    const snapshot = await service.updateScore(userId);

    expect(snapshot.completion_rate).toBe(0.5);
  });

  it('scores 0 when there is genuinely nothing resolved', async () => {
    // A brand-new user has no execution history. Zero here is honest, not a bug.
    const snapshot = await service.updateScore(userId);
    expect(snapshot.current_score).toBe(0);
    expect(snapshot.completion_rate).toBe(0);
  });

  it('ignores commitments outside the 14 day window', async () => {
    todoRepo.find.mockResolvedValue([makeTodo(DailyTodoStatus.DONE, 40)]);
    const snapshot = await service.updateScore(userId);
    expect(snapshot.current_score).toBe(0);
  });

  it('counts both systems together rather than picking one', async () => {
    // Users who predate the to-do tools have daily_tasks; newer ones have daily_todos. Someone
    // mid-migration has both, and must not have half their history silently dropped.
    taskRepo.find.mockResolvedValue([makeTask(TaskStatus.COMPLETED, 1)]);
    todoRepo.find.mockResolvedValue([makeTodo(DailyTodoStatus.DONE, 2)]);

    const snapshot = await service.updateScore(userId);

    expect(snapshot.completion_rate).toBe(1);
    expect(snapshot.current_score).toBeGreaterThan(0);
  });

  it('countExecutionDays credits days earned through to-dos', async () => {
    // This gates the praise copy. Reading tasks only meant a to-do user looked like a ghost,
    // and got under-credited just as badly as a real ghost once got over-credited.
    todoRepo.find.mockResolvedValue([
      makeTodo(DailyTodoStatus.DONE, 1),
      makeTodo(DailyTodoStatus.DONE, 2),
      makeTodo(DailyTodoStatus.OPEN, 3),
    ]);

    expect(await service.countExecutionDays(userId, 7)).toBe(2);
  });
});
