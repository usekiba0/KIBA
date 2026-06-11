import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { Goal } from '../data/entities/goal.entity';
import { findAnchorGoal } from '../data/goal-selection';
import { structuredLog } from '../common/logger';

/**
 * DailyTask lifecycle. The schema and the morning check-in were both built
 * assuming a `DailyTask` row exists for each user-day, but nothing in the
 * original codebase actually creates them — so every morning check-in fell
 * through to the generic "no tasks today" message.
 *
 * This service plugs that hole: `ensureTodayTask` is called right before the
 * morning check-in reads the task, so the user always has a goal-anchored
 * thing to be accountable for.
 *
 * Source of task descriptions: `goal.action_plan.daily_tasks[]` — populated by
 * PlanService when the user signs up. We cycle through the array using the
 * user's day-index (count of prior tasks). When they exhaust the list it
 * wraps — preferable to silence while we wait for action_plan v2.
 */
@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
  ) {}

  /**
   * Returns the user's PENDING task for today, creating it if it doesn't exist.
   * Returns null only if the user has no goal yet OR the action_plan hasn't
   * been generated yet OR daily_tasks is empty — all recoverable states the
   * caller should treat as "no task today, send the generic check-in".
   */
  async ensureTodayTask(userId: string): Promise<DailyTask | null> {
    const today = this.startOfToday();

    // Idempotency — if a task already exists for today (pending OR completed
    // OR missed), return it as-is. Never create two tasks for the same day.
    const existing = await this.taskRepo.findOne({
      where: { user_id: userId, scheduled_date: today },
    });
    if (existing) {
      return existing.status === TaskStatus.PENDING ? existing : null;
    }

    // Daily tasks seed from the ANCHOR goal only — the one-thing-a-day rhythm.
    // Secondary goals are tracked but don't each generate a daily task.
    const goal = await findAnchorGoal(this.goalRepo, userId);
    if (!goal) return null;

    const dailyTasks = goal.action_plan?.daily_tasks;
    if (!dailyTasks || dailyTasks.length === 0) return null;

    // Day-index = how many tasks this user has had before today. Cycles when
    // we run past the end of the action plan.
    const priorCount = await this.taskRepo.count({ where: { user_id: userId } });
    const description = dailyTasks[priorCount % dailyTasks.length];

    const task = this.taskRepo.create({
      goal_id: goal.id,
      user_id: userId,
      task_description: description,
      scheduled_date: today,
      status: TaskStatus.PENDING,
    });
    const saved = await this.taskRepo.save(task);

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'task_created',
      userId,
      taskId: saved.id,
      dayIndex: priorCount,
    });

    return saved;
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
