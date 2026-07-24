import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TodoService } from '../../src/accountability/todo.service';
import {
  DailyTodo,
  DailyTodoStatus,
  DailyTodoSource,
} from '../../src/data/entities/daily-todo.entity';
import { Goal } from '../../src/data/entities/goal.entity';

/**
 * Commitment semantics (task-composition Approach C, Phase 1). A to-do only
 * counts once the user has agreed to it — committed_at is the flag. USER/AI
 * rows are committed on creation; completing any row commits it retroactively;
 * an auto-seeded PLAN row stays a null-committed proposal until then.
 */
describe('TodoService commitment semantics', () => {
  let service: TodoService;
  let todoRepo: { save: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let goalRepo: { find: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    todoRepo = {
      save: jest.fn().mockImplementation(async (row) => ({ id: 't-1', ...row })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    goalRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TodoService,
        { provide: getRepositoryToken(DailyTodo), useValue: todoRepo },
        { provide: getRepositoryToken(Goal), useValue: goalRepo },
      ],
    }).compile();

    service = module.get<TodoService>(TodoService);
  });

  it('commits a USER-added todo on creation', async () => {
    await service.add({
      userId: 'u-1',
      content: 'cold call 5 leads',
      source: DailyTodoSource.USER,
    });

    expect(todoRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ source: DailyTodoSource.USER, committed_at: expect.any(Date) }),
    );
  });

  it('commits an AI-added todo on creation', async () => {
    await service.add({ userId: 'u-1', content: 'post a selfie', source: DailyTodoSource.AI });

    expect(todoRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ committed_at: expect.any(Date) }),
    );
  });

  it('commits a proposal when it is completed (completion = agreement)', async () => {
    todoRepo.findOne.mockResolvedValue({
      id: 't-1',
      user_id: 'u-1',
      status: DailyTodoStatus.OPEN,
      source: DailyTodoSource.PLAN,
      committed_at: null,
    });

    await service.markDone('u-1', 't-1');

    expect(todoRepo.update).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ status: DailyTodoStatus.DONE, committed_at: expect.any(Date) }),
    );
  });

  it('does not overwrite an existing commitment time on completion', async () => {
    const committedAt = new Date('2026-07-20T10:00:00.000Z');
    todoRepo.findOne.mockResolvedValue({
      id: 't-1',
      user_id: 'u-1',
      status: DailyTodoStatus.OPEN,
      source: DailyTodoSource.USER,
      committed_at: committedAt,
    });

    await service.markDone('u-1', 't-1');

    const patch = todoRepo.update.mock.calls[0][1];
    expect(patch.committed_at).toBeUndefined(); // left as-is, not re-stamped
    expect(patch.status).toBe(DailyTodoStatus.DONE);
  });

  it('leaves auto-seeded PLAN todos UN-committed (a proposal)', async () => {
    goalRepo.find.mockResolvedValue([
      { action_plan: { daily_tasks: ['Day 1: Audit subscriber data. Map the journey.'] } },
    ] as Goal[]);
    todoRepo.find.mockResolvedValue([]); // nothing seeded yet
    // createQueryBuilder is used for the day-index count; stub it to 0 rows.
    (todoRepo as unknown as { createQueryBuilder: jest.Mock }).createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }));

    await service.ensureSeededForToday('u-1');

    expect(todoRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ source: DailyTodoSource.PLAN }),
    );
    for (const call of todoRepo.save.mock.calls) {
      expect(call[0].committed_at ?? null).toBeNull();
    }
  });
});
