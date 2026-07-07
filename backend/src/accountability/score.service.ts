import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  /**
   * How many distinct local days in the last `sinceDays` the user ACTUALLY
   * executed — a completed task or an accepted proof both count as "showed up
   * that day". Used to gate praise copy (e.g. the day-7 price reveal) so KIBA
   * never congratulates a streak that never happened (Karibi 2026-07-07: ghosted
   * the whole trial, still got "7 days straight, you actually did it"). A task
   * and its own proof on the same day collapse to one via the day-key Set.
   */
  async countExecutionDays(userId: string, sinceDays: number): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    since.setHours(0, 0, 0, 0);

    const [tasks, proofs] = await Promise.all([
      this.taskRepo.find({ where: { user_id: userId } }),
      this.proofRepo.find({ where: { user_id: userId, validation_status: ProofValidationStatus.ACCEPTED } }),
    ]);

    const dayKey = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);
    const days = new Set<string>();
    for (const t of tasks) {
      if (t.status === TaskStatus.COMPLETED && new Date(t.scheduled_date) >= since) {
        days.add(dayKey(t.scheduled_date));
      }
    }
    for (const p of proofs) {
      if (new Date(p.created_at) >= since) days.add(dayKey(p.created_at));
    }
    return days.size;
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

/**
 * Current consecutive-completed-days streak ending today, from a task list.
 * A day with no task OR a non-completed task breaks the streak — EXCEPT today
 * with no task yet (that's a pending day, not a break). Multiple tasks on one
 * day collapse to one day (any COMPLETED that day = the day counts).
 *
 * Pure + exported so the coaching prompt can inject the REAL streak as ground
 * truth instead of letting the model infer/fabricate a "X days straight"
 * (Karibi 2026-07-07: got "7 days straight, you actually did it" after ghosting
 * the whole trial). Mirrors ProofService.computeCurrentStreak.
 */
export function currentStreakFromTasks(
  tasks: Array<{ scheduled_date: Date | string; status: TaskStatus }>,
  now: number = Date.now(),
): number {
  if (tasks.length === 0) return 0;

  const byDate = new Map<string, TaskStatus>();
  for (const t of tasks) {
    const key = new Date(t.scheduled_date).toISOString().slice(0, 10);
    const existing = byDate.get(key);
    if (t.status === TaskStatus.COMPLETED || !existing) byDate.set(key, t.status);
  }

  let streak = 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let d = 0; d < 60; d++) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    const key = day.toISOString().slice(0, 10);
    const status = byDate.get(key);
    if (status === TaskStatus.COMPLETED) {
      streak++;
    } else {
      // Today with no task yet is a pending day, not a break.
      if (d === 0 && status === undefined) continue;
      break;
    }
  }
  return streak;
}
