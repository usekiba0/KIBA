import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Strike } from '../data/entities/strike.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { User } from '../data/entities/user.entity';
import { structuredLog } from '../common/logger';

/**
 * Compute the day-of-week the task was scheduled for IN THE USER'S local time.
 * Sun=0..Sat=6. Returns null if we can't determine offset (counter doesn't
 * advance — never want to miscount as Monday because the server is UTC).
 *
 * Exported for tests.
 */
export function dowForUser(scheduledDate: Date, utcOffsetMinutes: number | null): number | null {
  if (utcOffsetMinutes === null || utcOffsetMinutes === undefined) return null;
  const localMs = new Date(scheduledDate).getTime() + utcOffsetMinutes * 60_000;
  return new Date(localMs).getUTCDay();
}

@Injectable()
export class StrikeService {
  private readonly logger = new Logger(StrikeService.name);

  constructor(
    @InjectRepository(Strike) private readonly strikeRepo: Repository<Strike>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async logStrike(userId: string, taskId: string, escalationLevel: number): Promise<Strike> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (task) {
      task.status = TaskStatus.MISSED;
      await this.taskRepo.save(task);

      // Increment the user-local day-of-week miss counter so the coaching
      // prompt can surface a "weakest day" signal without a separate pattern
      // analyzer. Only counts the FIRST strike on a task (level 1) — levels
      // 2-6 are ghost re-engagement pings on the same already-counted miss.
      if (escalationLevel === 1) {
        try {
          const user = await this.userRepo.findOne({ where: { id: userId } });
          const dow = dowForUser(task.scheduled_date, user?.utc_offset_minutes ?? null);
          if (user && dow !== null) {
            const counts = [...(user.miss_counts_by_dow ?? [0, 0, 0, 0, 0, 0, 0])];
            counts[dow] = (counts[dow] ?? 0) + 1;
            await this.userRepo.update(userId, { miss_counts_by_dow: counts });
          }
        } catch (err) {
          this.logger.warn(`dow miss-count update failed for ${userId}: ${(err as Error).message}`);
        }
      }
    }

    const strike = this.strikeRepo.create({
      user_id: userId,
      daily_task_id: taskId,
      escalation_level: escalationLevel,
    });
    const saved = await this.strikeRepo.save(strike);

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'strike_logged',
      userId,
      taskId,
      escalationLevel,
    });

    return saved;
  }

  async getStrikeCount(userId: string, sincedays = 7): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - sincedays);
    const strikes = await this.strikeRepo.find({
      where: { user_id: userId, created_at: MoreThanOrEqual(since) },
    });
    return strikes.length;
  }
}
