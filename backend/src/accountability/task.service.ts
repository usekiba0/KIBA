import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { Goal } from '../data/entities/goal.entity';
import { findAllGoals } from '../data/goal-selection';
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

    // Daily task seeds from ALL goals that have a generated plan — multi-goal
    // coaching (Karibi 2026-06-12 "it focused on gym only"). We still create
    // exactly ONE DailyTask row per day: a single combined task keeps scoring,
    // photo-proof and anti-ghost single-track. Its description carries each
    // goal's action for today, newline-separated; the check-in renderer turns
    // that into one combined message. findAllGoals returns anchor-first, so a
    // single-goal user's description is unchanged (just that one task).
    const goals = await findAllGoals(this.goalRepo, userId);
    const planned = goals.filter((g) => (g.action_plan?.daily_tasks?.length ?? 0) > 0);
    if (planned.length === 0) return null;

    // Day-index = how many tasks this user has had before today. Cycles when
    // we run past the end of a goal's action plan. Each goal cycles on its own
    // length so plans of different sizes stay in sync with the day count.
    const priorCount = await this.taskRepo.count({ where: { user_id: userId } });
    const description = planned
      .map((g) => {
        const tasks = g.action_plan.daily_tasks;
        return tasks[priorCount % tasks.length];
      })
      .join('\n');

    const task = this.taskRepo.create({
      // The combined task is anchored to the primary goal's id (findAllGoals is
      // anchor-first) for the proof/anti-ghost FK; it represents the whole day.
      goal_id: planned[0].id,
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
