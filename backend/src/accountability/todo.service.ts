import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyTodo, DailyTodoSource, DailyTodoStatus } from '../data/entities/daily-todo.entity';
import { Goal } from '../data/entities/goal.entity';
import { findAnchorGoal } from '../data/goal-selection';
import { structuredLog } from '../common/logger';

/**
 * Per-day editable to-do list backing the coaching AI's awareness of what the
 * user is supposed to do today. Three entry paths:
 *   - plan seed (first message of the day → action_plan.daily_tasks[dayIdx])
 *   - user adds via chat → AI calls add_todo
 *   - AI proposes mid-coaching → AI calls add_todo with source='ai'
 *
 * Today is computed in server-local for now (matches DailyTask's startOfToday).
 * If the product later cares about user-local midnights, the call site can
 * pass an explicit date.
 */
@Injectable()
export class TodoService {
  private readonly logger = new Logger(TodoService.name);

  constructor(
    @InjectRepository(DailyTodo) private readonly todoRepo: Repository<DailyTodo>,
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
  ) {}

  async listToday(userId: string): Promise<DailyTodo[]> {
    const today = this.startOfToday();
    return this.todoRepo.find({
      where: { user_id: userId, scheduled_date: today },
      order: { created_at: 'ASC' },
    });
  }

  async add(args: {
    userId: string;
    content: string;
    source: DailyTodoSource;
  }): Promise<DailyTodo> {
    const today = this.startOfToday();
    const trimmed = args.content.trim().slice(0, 500);
    const saved = await this.todoRepo.save({
      user_id: args.userId,
      scheduled_date: today,
      content: trimmed,
      status: DailyTodoStatus.OPEN,
      source: args.source,
    });
    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: 'todo_added',
      userId: args.userId, todoId: saved.id, source: args.source,
    });
    return saved;
  }

  async markDone(userId: string, todoId: string): Promise<DailyTodo | null> {
    const todo = await this.todoRepo.findOne({ where: { id: todoId } });
    if (!todo || todo.user_id !== userId) return null;
    if (todo.status === DailyTodoStatus.DONE) return todo;
    await this.todoRepo.update(todoId, {
      status: DailyTodoStatus.DONE,
      completed_at: new Date(),
    });
    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: 'todo_done',
      userId, todoId,
    });
    return this.todoRepo.findOne({ where: { id: todoId } });
  }

  async remove(userId: string, todoId: string): Promise<boolean> {
    const todo = await this.todoRepo.findOne({ where: { id: todoId } });
    if (!todo || todo.user_id !== userId) return false;
    await this.todoRepo.delete(todoId);
    return true;
  }

  /**
   * Idempotently seed today's list from goal.action_plan.daily_tasks if it has
   * not been seeded yet. Returns the list of todos in place after seeding.
   *
   * Heuristic: if today has at least one PLAN-source todo, we've already seeded.
   * If not, parse the day-N plan entry into discrete items (the strings in
   * daily_tasks[] pack multiple actions per day separated by sentences) and
   * create one todo per item.
   */
  async ensureSeededForToday(userId: string): Promise<DailyTodo[]> {
    const today = this.startOfToday();
    const existing = await this.todoRepo.find({
      where: { user_id: userId, scheduled_date: today },
    });
    if (existing.some((t) => t.source === DailyTodoSource.PLAN)) {
      return existing;
    }

    // Seed today's plan todos from the ANCHOR goal's action plan.
    const goal = await findAnchorGoal(this.goalRepo, userId);
    const dailyTasks = goal?.action_plan?.daily_tasks;
    if (!goal || !dailyTasks || dailyTasks.length === 0) {
      return existing;
    }

    // Use the count of distinct plan-sourced *days* this user has had as the
    // day-index — counts unique scheduled_date values to avoid drift if a day
    // was skipped or rescheduled. Falls back to row count if the query fails.
    const priorPlanRows = await this.todoRepo
      .createQueryBuilder('t')
      .select('DISTINCT t.scheduled_date', 'd')
      .where('t.user_id = :uid', { uid: userId })
      .andWhere('t.source = :src', { src: DailyTodoSource.PLAN })
      .getRawMany()
      .catch(() => null);
    const dayIndex = priorPlanRows ? priorPlanRows.length : 0;
    const dayEntry = dailyTasks[dayIndex % dailyTasks.length];

    const items = splitPlanDayIntoItems(dayEntry);
    const created: DailyTodo[] = [];
    for (const item of items) {
      created.push(await this.todoRepo.save({
        user_id: userId,
        scheduled_date: today,
        content: item,
        status: DailyTodoStatus.OPEN,
        source: DailyTodoSource.PLAN,
      }));
    }
    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: 'todos_seeded_from_plan',
      userId, dayIndex, itemCount: created.length,
    });
    return [...existing, ...created];
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

/**
 * Split a plan-day entry into discrete todo items. The strings in
 * `action_plan.daily_tasks` come from the LLM-generated plan and typically
 * look like:
 *   "Day 1 Monday: Block Netflix on all devices. Schedule gym 5am appointment.
 *    Define 3 business revenue activities. Tell 1 person your 90-day goal."
 *
 * We drop the "Day N {weekday}:" prefix, then split on sentence punctuation,
 * filter out fragments shorter than 4 chars, and trim trailing punctuation.
 *
 * Exported for tests.
 */
export function splitPlanDayIntoItems(entry: string): string[] {
  if (!entry) return [];
  // Strip leading "Day N Weekday:" or "Day N:" prefix
  const stripped = entry.replace(/^\s*day\s+\d+(?:\s+\w+)?\s*[:\-—]\s*/i, '').trim();
  if (!stripped) return [];

  // Split on sentence terminators. Comma-only lists ("eggs, bacon, toast") would
  // over-split — we keep commas inside items so "chicken, rice, broccoli" stays one item.
  const parts = stripped.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);

  return parts
    .map((p) => p.trim().replace(/[.!?]+$/, '').trim())
    .filter((p) => p.length >= 4);
}
