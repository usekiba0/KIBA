import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ExecutionScore } from '../data/entities/execution-score.entity';
import { Goal } from '../data/entities/goal.entity';
import { findAnchorGoal } from '../data/goal-selection';
import { structuredLog } from '../common/logger';

const LOW_SCORE_THRESHOLD = 30;
const HIGH_SCORE_THRESHOLD = 80;
const LOW_SCORE_DAYS = 3;
const HIGH_SCORE_DAYS = 7;

@Injectable()
export class PlanAdjustmentService {
  private readonly logger = new Logger(PlanAdjustmentService.name);

  constructor(
    @InjectRepository(ExecutionScore) private readonly scoreRepo: Repository<ExecutionScore>,
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
  ) {}

  async evaluateAndAdjust(userId: string): Promise<void> {
    // Difficulty adjustment tracks the anchor goal — the one with the daily plan.
    const goal = await findAnchorGoal(this.goalRepo, userId);
    if (!goal) return;

    const since = new Date();
    since.setDate(since.getDate() - HIGH_SCORE_DAYS);

    const scores = await this.scoreRepo.find({
      where: { user_id: userId, snapshot_date: MoreThanOrEqual(since) },
      order: { snapshot_date: 'DESC' },
    });

    if (this.shouldReduceDifficulty(scores, goal.difficulty_level)) {
      goal.difficulty_level -= 1;
      await this.goalRepo.save(goal);
      structuredLog(this.logger, 'log', { service: 'accountability', operation: 'difficulty_reduced', userId });
      return;
    }

    if (this.shouldIncreaseDifficulty(scores, goal.difficulty_level)) {
      goal.difficulty_level += 1;
      await this.goalRepo.save(goal);
      structuredLog(this.logger, 'log', { service: 'accountability', operation: 'difficulty_increased', userId });
    }
  }

  private shouldReduceDifficulty(scores: ExecutionScore[], current: number): boolean {
    if (current <= 1) return false;
    if (scores.length < LOW_SCORE_DAYS) return false;
    return scores.slice(0, LOW_SCORE_DAYS).every(s => s.current_score < LOW_SCORE_THRESHOLD);
  }

  private shouldIncreaseDifficulty(scores: ExecutionScore[], current: number): boolean {
    if (current >= 5) return false;
    if (scores.length < HIGH_SCORE_DAYS) return false;
    return scores.slice(0, HIGH_SCORE_DAYS).every(s => s.current_score > HIGH_SCORE_THRESHOLD);
  }
}
