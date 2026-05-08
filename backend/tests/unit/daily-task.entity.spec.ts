import { DailyTask, TaskStatus } from '../../src/data/entities/daily-task.entity';

describe('DailyTask entity', () => {
  function makeTask(overrides: Partial<DailyTask> = {}): DailyTask {
    const t = new DailyTask();
    t.id = 'task-1';
    t.goal_id = 'goal-1';
    t.user_id = 'user-1';
    t.task_description = 'Run 1K at easy pace';
    t.scheduled_date = new Date('2026-05-10');
    t.status = TaskStatus.PENDING;
    t.proof_id = null;
    t.completion_timestamp = null;
    t.created_at = new Date();
    Object.assign(t, overrides);
    return t;
  }

  it('has TaskStatus enum with all required values', () => {
    expect(TaskStatus.PENDING).toBe('pending');
    expect(TaskStatus.COMPLETED).toBe('completed');
    expect(TaskStatus.MISSED).toBe('missed');
    expect(TaskStatus.RECOVERY).toBe('recovery');
  });

  it('creates a task with required fields', () => {
    const task = makeTask();
    expect(task.goal_id).toBe('goal-1');
    expect(task.user_id).toBe('user-1');
    expect(task.task_description).toBeDefined();
    expect(task.scheduled_date).toBeInstanceOf(Date);
    expect(task.status).toBe(TaskStatus.PENDING);
  });

  it('defaults proof_id and completion_timestamp to null', () => {
    const task = makeTask();
    expect(task.proof_id).toBeNull();
    expect(task.completion_timestamp).toBeNull();
  });

  it('can be marked completed with a timestamp', () => {
    const now = new Date();
    const task = makeTask({ status: TaskStatus.COMPLETED, completion_timestamp: now });
    expect(task.status).toBe(TaskStatus.COMPLETED);
    expect(task.completion_timestamp).toBe(now);
  });

  it('can be marked missed', () => {
    const task = makeTask({ status: TaskStatus.MISSED });
    expect(task.status).toBe(TaskStatus.MISSED);
  });

  it('can be a recovery task', () => {
    const task = makeTask({ status: TaskStatus.RECOVERY });
    expect(task.status).toBe(TaskStatus.RECOVERY);
  });
});
