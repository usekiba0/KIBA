import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { Strike } from '../data/entities/strike.entity';
import { User } from '../data/entities/user.entity';
import { ScoreService } from './score.service';
import { dowForUser } from './strike.service';
import { structuredLog } from '../common/logger';

export type CorrectionDay = 'today' | 'yesterday';

export type CorrectMissResult =
  | { ok: true; corrected: number; tasks: string[]; strikes_removed: number; new_score: number | null }
  | { ok: false; error: string };

/**
 * The ledger-correction path (Retraining doc #49/#127). When KIBA wrongly marks
 * a task missed and the user disputes it, the live layer used to SAY "score's
 * fixed" while nothing in the DB changed — the false 0/100 and the strike
 * survived into every future recap, weekly review and coaching context.
 *
 * This service makes the concession real: flip the wrongly-MISSED task back to
 * COMPLETED, delete its strikes, un-count the day-of-week miss (the exact
 * mirror of StrikeService.logStrike's increment), and recompute the score.
 *
 * Deliberately narrow: only 'today' / 'yesterday' — disputes happen right after
 * a wrong recap/morning fires, and a tight window keeps the LLM-exposed tool
 * from rewriting week-old history on a whim.
 */
@Injectable()
export class LedgerCorrectionService {
  private readonly logger = new Logger(LedgerCorrectionService.name);

  constructor(
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    @InjectRepository(Strike) private readonly strikeRepo: Repository<Strike>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly scoreService: ScoreService,
  ) {}

  async correctMiss(userId: string, day: CorrectionDay): Promise<CorrectMissResult> {
    // Same server-local-midnight keying TaskService.ensureTodayTask uses to
    // CREATE rows — lookup must match creation or we'd never find the task.
    const target = new Date();
    target.setHours(0, 0, 0, 0);
    if (day === 'yesterday') target.setDate(target.getDate() - 1);

    const tasks = await this.taskRepo.find({
      where: { user_id: userId, status: TaskStatus.MISSED, scheduled_date: target },
    });
    if (tasks.length === 0) {
      return { ok: false, error: `no missed task on record for ${day} — nothing to correct` };
    }

    let strikesRemoved = 0;
    for (const task of tasks) {
      task.status = TaskStatus.COMPLETED;
      task.completion_timestamp = new Date();
      await this.taskRepo.save(task);

      const del = await this.strikeRepo.delete({ daily_task_id: task.id });
      strikesRemoved += del.affected ?? 0;

      // Mirror of logStrike's day-of-week increment. Best-effort — a counter
      // hiccup must not fail the correction itself.
      try {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        const dow = dowForUser(task.scheduled_date, user?.utc_offset_minutes ?? null);
        if (user && dow !== null) {
          const counts = [...(user.miss_counts_by_dow ?? [0, 0, 0, 0, 0, 0, 0])];
          counts[dow] = Math.max(0, (counts[dow] ?? 0) - 1);
          await this.userRepo.update(userId, { miss_counts_by_dow: counts });
        }
      } catch (err) {
        this.logger.warn(`dow miss-count decrement failed for ${userId}: ${(err as Error).message}`);
      }
    }

    // Recompute so the next recap/review/coaching turn sees the corrected
    // reality. Best-effort: the ledger fix above is the point; a scoring
    // hiccup shouldn't undo the user-visible concession.
    let newScore: number | null = null;
    try {
      const snapshot = await this.scoreService.updateScore(userId);
      newScore = snapshot?.current_score ?? null;
    } catch (err) {
      this.logger.warn(`score recompute after correction failed for ${userId}: ${(err as Error).message}`);
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'ledger_miss_corrected',
      userId,
      day,
      corrected: tasks.length,
      strikesRemoved,
    });

    return {
      ok: true,
      corrected: tasks.length,
      tasks: tasks.map((t) => t.task_description),
      strikes_removed: strikesRemoved,
      new_score: newScore,
    };
  }
}
