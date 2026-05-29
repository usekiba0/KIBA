import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proof, ProofType, ProofValidationStatus } from '../data/entities/proof.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { User } from '../data/entities/user.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { AntiGhostService } from './anti-ghost.service';
import { ScoreService } from './score.service';
import { MessagingService } from '../messaging/messaging.service';
import { buildMilestoneMessage, pickMilestone } from '../ai/prompts/milestone.prompt';
import { structuredLog } from '../common/logger';

export interface SubmitProofDto {
  userId: string;
  taskId: string;
  type: ProofType;
  mediaUrl?: string;
  content?: string;
}

@Injectable()
export class ProofService {
  private readonly logger = new Logger(ProofService.name);

  constructor(
    @InjectRepository(Proof) private readonly proofRepo: Repository<Proof>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    private readonly antiGhostService: AntiGhostService,
    private readonly scoreService: ScoreService,
    private readonly messagingService: MessagingService,
  ) {}

  async submitProof(dto: SubmitProofDto): Promise<Proof> {
    const task = await this.taskRepo.findOne({ where: { id: dto.taskId, user_id: dto.userId } });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found for user ${dto.userId}`);

    const proof = await this.proofRepo.save(
      this.proofRepo.create({
        task_id: dto.taskId,
        user_id: dto.userId,
        proof_type: dto.type,
        media_url: dto.mediaUrl ?? null,
        content: dto.content ?? null,
        validation_status: ProofValidationStatus.ACCEPTED,
        validated_at: new Date(),
      }),
    );

    task.status = TaskStatus.COMPLETED;
    task.proof_id = proof.id;
    task.completion_timestamp = new Date();
    await this.taskRepo.save(task);

    await this.antiGhostService.onUserResponse(dto.userId);
    await this.scoreService.updateScore(dto.userId);

    // Streak milestone auto-fire (V5 PART 6). Counts consecutive completed
    // tasks ending today. Only fires if the streak crosses 3/7/14/30 AND
    // exceeds the user's last_milestone_hit so we don't double-celebrate
    // when the same streak length holds across multiple proof submissions.
    // Best-effort: a failure here must not block proof acceptance.
    try {
      await this.fireMilestoneIfDue(dto.userId);
    } catch (err) {
      this.logger.warn(`milestone check failed for ${dto.userId}: ${(err as Error).message}`);
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'proof_submitted',
      userId: dto.userId,
      taskId: dto.taskId,
      proofType: dto.type,
    });

    return proof;
  }

  /**
   * Count the user's current completed-task streak (going backwards from today)
   * and fire the milestone message if we just crossed 3/7/14/30. Updates
   * `user.last_milestone_hit` so the same crossing doesn't double-fire.
   *
   * The streak is "consecutive days ending today with a completed task." A day
   * with NO task counts as a break (the user has to be actively grinding for
   * the streak to hold).
   */
  private async fireMilestoneIfDue(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    const streak = await this.computeCurrentStreak(userId);
    const milestone = pickMilestone(streak, user.last_milestone_hit);
    if (!milestone) return;

    const profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    const message = buildMilestoneMessage(milestone, user.name ?? '', profile);
    if (!message) return;

    await this.messagingService.send(user.phone_number, message);
    await this.userRepo.update(userId, { last_milestone_hit: milestone });

    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: 'milestone_fired',
      userId, milestone, streak,
    });
  }

  /**
   * Consecutive completed days ending today. Walks backwards from today
   * looking for the first day that is NOT completed (either missed or no task
   * at all) and returns the run length.
   *
   * Pulled inline rather than reusing ScoreService.calcStreakBonus because we
   * need the raw day count, not the normalized bonus value.
   */
  private async computeCurrentStreak(userId: string): Promise<number> {
    const tasks = await this.taskRepo.find({
      where: { user_id: userId },
      order: { scheduled_date: 'DESC' },
      take: 60,
    });
    if (tasks.length === 0) return 0;

    // Bucket tasks by ISO date so multiple tasks-per-day still count as one day.
    const byDate = new Map<string, TaskStatus>();
    for (const t of tasks) {
      const key = new Date(t.scheduled_date).toISOString().slice(0, 10);
      // If any task that day was COMPLETED, the day counts as complete.
      const existing = byDate.get(key);
      if (t.status === TaskStatus.COMPLETED || !existing) {
        byDate.set(key, t.status);
      }
    }

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let d = 0; d < 60; d++) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);
      const key = day.toISOString().slice(0, 10);
      const status = byDate.get(key);
      if (status === TaskStatus.COMPLETED) {
        streak++;
      } else {
        // First non-complete day ends the streak. The walk stops here.
        // Exception: TODAY (d=0) with no task yet — that's not a break, it's a
        // pending day. We only break if the most recent NON-empty day failed.
        if (d === 0 && status === undefined) continue;
        break;
      }
    }
    return streak;
  }
}
