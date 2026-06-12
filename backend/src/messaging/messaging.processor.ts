import { Process, Processor, OnQueueFailed, OnQueueActive } from '@nestjs/bull';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { MessagingService } from './messaging.service';
import { PlanService } from '../ai/plan.service';
import { User } from '../data/entities/user.entity';
import { Goal } from '../data/entities/goal.entity';
import { findAllGoals } from '../data/goal-selection';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { CheckinService } from '../accountability/checkin.service';
import { classifyGoalType } from '../ai/goal-classifier';
import { structuredLog } from '../common/logger';

@Processor('messaging')
export class MessagingProcessor {
  private readonly logger = new Logger(MessagingProcessor.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly planService: PlanService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    @Inject(forwardRef(() => CheckinService)) private readonly checkinService: CheckinService,
  ) {}

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`[Queue] Processing job ${job.id} — to: ${job.data.to} type: ${job.data.type ?? 'sms'}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`[Queue] Job ${job.id} FAILED after ${job.attemptsMade} attempts — ${err.message}`, err.stack);
  }

  @Process('send-message')
  async handleSendMessage(job: Job<{ to: string; body: string; type?: string }>) {
    try {
      this.logger.log(`[SMS] Sending to ${job.data.to}`);
      await this.messagingService.send(job.data.to, job.data.body);
      this.logger.log(`[SMS] Sent successfully to ${job.data.to}`);
    } catch (err) {
      this.logger.error(`[SMS] Failed to send to ${job.data.to}: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  @Process('plan-generation')
  async handlePlanGeneration(job: Job<{ userId: string }>) {
    const { userId } = job.data;

    // Multi-goal (Karibi 2026-06-12 "it focused on gym only"): EVERY goal the
    // user holds gets its own classified action plan, so the daily loop can
    // coach all of them, not just the anchor. Secondary goals used to be stored
    // plan-less and were never coached again.
    const [user, goals, profile] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      findAllGoals(this.goalRepo, userId),
      this.profileRepo.findOne({ where: { user_id: userId } }),
    ]);

    if (!user || !goals.length || !profile) {
      this.logger.warn(`[Plan] Missing data for userId=${userId} — skipping`);
      return;
    }

    // Check-in cadence is independent of plan generation — schedule it OUTSIDE
    // the LLM calls so an Anthropic hiccup at signup never silences the user
    // permanently. Idempotent + timezone-aware via CheckinService.scheduleCheckin.
    try {
      await this.checkinService.scheduleCheckin(user);
    } catch (err) {
      this.logger.error(
        `[Plan] scheduleCheckin failed for userId=${userId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Non-fatal — boot-time scheduleAllCheckins will re-enqueue next deploy.
    }

    // Classify + plan each goal independently. One goal's failure must not block
    // the others, so each is best-effort; we re-throw (letting Bull retry) ONLY
    // when every goal failed — a wholesale Anthropic outage — not for a single
    // malformed plan.
    const results = await Promise.allSettled(
      goals.map((goal) => this.generateGoalPlan(goal, profile, userId)),
    );
    const anyOk = results.some((r) => r.status === 'fulfilled');
    if (!anyOk) {
      throw new Error(`[Plan] generation failed for all ${goals.length} goals (userId=${userId})`);
    }
  }

  /**
   * Classify + generate the action plan for a single goal and persist both.
   * Classification is deterministic (no LLM) and persisted separately so an
   * Anthropic hiccup on the plan never leaves the goal unclassified.
   */
  private async generateGoalPlan(
    goal: Goal,
    profile: PsychologicalProfile,
    userId: string,
  ): Promise<void> {
    try {
      const goalType = classifyGoalType(goal.description, goal.timeline);
      if (goalType !== goal.goal_type) {
        await this.goalRepo.update(goal.id, { goal_type: goalType });
      }
    } catch (err) {
      this.logger.warn(`[Plan] goal classification failed for goalId=${goal.id}: ${(err as Error).message}`);
    }

    const plan = await this.planService.generatePlan(
      { description: goal.description, timeline: goal.timeline, current_status: goal.current_status },
      profile,
    );
    await this.goalRepo.update(goal.id, { action_plan: plan });

    structuredLog(this.logger, 'log', {
      service: 'plan',
      operation: 'plan_generated',
      userId,
      goalId: goal.id,
    });
  }
}
