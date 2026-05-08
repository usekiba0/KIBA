import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ExecutionScore } from '../data/entities/execution-score.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { Proof, ProofValidationStatus } from '../data/entities/proof.entity';
import { structuredLog } from '../common/logger';

@Injectable()
export class ScoreService {
  private readonly logger = new Logger(ScoreService.name);

  constructor(
    @InjectRepository(ExecutionScore) private readonly scoreRepo: Repository<ExecutionScore>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    @InjectRepository(Proof) private readonly proofRepo: Repository<Proof>,
  ) {}

  calculateScore(tasks: DailyTask[], proofs: Proof[]): number {
    if (tasks.length === 0) return 0;

    const completed = tasks.filter(t => t.status === TaskStatus.COMPLETED);
    const completionRate = completed.length / tasks.length;

    const completedWithProofId = completed.filter(t => t.proof_id);
    const proofRate = completed.length > 0 ? completedWithProofId.length / completed.length : 0;

    const responseTimeScore = this.calcResponseTimeScore(tasks, proofs);
    const streakBonus = this.calcStreakBonus(tasks);

    const raw = Math.round(
      completionRate * 40 +
      proofRate * 30 +
      responseTimeScore * 20 +
      streakBonus * 10,
    );

    return Math.min(100, Math.max(0, raw));
  }

  async updateScore(userId: string): Promise<ExecutionScore> {
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const [tasks, proofs] = await Promise.all([
      this.taskRepo.find({ where: { user_id: userId } }),
      this.proofRepo.find({ where: { user_id: userId, validation_status: ProofValidationStatus.ACCEPTED } }),
    ]);

    const recentTasks = tasks.filter(t => new Date(t.scheduled_date) >= since);

    const completed = recentTasks.filter(t => t.status === TaskStatus.COMPLETED);
    const completionRate = recentTasks.length > 0 ? completed.length / recentTasks.length : 0;
    const completedWithProof = completed.filter(t => t.proof_id);
    const proofRate = completed.length > 0 ? completedWithProof.length / completed.length : 0;
    const responseTimeScore = this.calcResponseTimeScore(recentTasks, proofs);
    const streakBonus = this.calcStreakBonus(recentTasks);
    const currentScore = this.calculateScore(recentTasks, proofs);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.scoreRepo.findOne({ where: { user_id: userId, snapshot_date: today } });

    const snapshot = existing ?? this.scoreRepo.create({ user_id: userId });
    snapshot.current_score = currentScore;
    snapshot.completion_rate = completionRate;
    snapshot.proof_rate = proofRate;
    snapshot.response_time_score = responseTimeScore;
    snapshot.streak_bonus = streakBonus;
    snapshot.snapshot_date = today;

    const saved = await this.scoreRepo.save(snapshot);

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'score_updated',
      userId,
      currentScore,
    });

    return saved;
  }

  private calcResponseTimeScore(tasks: DailyTask[], proofs: Proof[]): number {
    const proofMap = new Map(proofs.map(p => [p.task_id, p]));
    const responseTimes: number[] = [];

    for (const task of tasks) {
      if (task.status !== TaskStatus.COMPLETED || !task.proof_id) continue;
      const proof = proofMap.get(task.id);
      if (!proof) continue;
      const taskTime = new Date(task.scheduled_date).getTime();
      const proofTime = new Date(proof.created_at).getTime();
      const hoursToRespond = (proofTime - taskTime) / (1000 * 60 * 60);
      // <2h = 1.0, <6h = 0.7, <12h = 0.4, <24h = 0.2, >24h = 0
      if (hoursToRespond < 2) responseTimes.push(1.0);
      else if (hoursToRespond < 6) responseTimes.push(0.7);
      else if (hoursToRespond < 12) responseTimes.push(0.4);
      else if (hoursToRespond < 24) responseTimes.push(0.2);
      else responseTimes.push(0);
    }

    if (responseTimes.length === 0) return 0;
    return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  private calcStreakBonus(tasks: DailyTask[]): number {
    const sorted = [...tasks].sort((a, b) =>
      new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
    );
    let streak = 0;
    for (const task of sorted) {
      if (task.status === TaskStatus.COMPLETED) streak++;
      else break;
    }
    // 7+ day streak = full bonus, scale linearly
    return Math.min(1, streak / 7);
  }
}
