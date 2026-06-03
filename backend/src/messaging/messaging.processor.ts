import { Process, Processor, OnQueueFailed, OnQueueActive } from '@nestjs/bull';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { MessagingService } from './messaging.service';
import { PlanService } from '../ai/plan.service';
import { User } from '../data/entities/user.entity';
import { Goal } from '../data/entities/goal.entity';
import { findAnchorGoal } from '../data/goal-selection';
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

    // Plan generation targets the ANCHOR goal — the one that drives the daily
    // loop. Secondary goals are stored without a generated plan (promotable
    // later) so signup stays a single LLM call.
    const [user, goal, profile] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      findAnchorGoal(this.goalRepo, userId),
      this.profileRepo.findOne({ where: { user_id: userId } }),
    ]);

    if (!user || !goal || !profile) {
      this.logger.warn(`[Plan] Missing data for userId=${userId} — skipping`);
      return;
    }

    // Classify the goal type up front (deterministic, no LLM) so proactive copy
    // can branch — only TASK goals get "did it happen?", everything else gets
    // "what's the move today?". Persisted independently of the plan LLM below so
    // an Anthropic hiccup never leaves the goal unclassified. Karibi 2026-06-01.
    try {
      const goalType = classifyGoalType(goal.description, goal.timeline);
      if (goalType !== goal.goal_type) {
        await this.goalRepo.update(goal.id, { goal_type: goalType });
      }
    } catch (err) {
      this.logger.warn(`[Plan] goal classification failed for userId=${userId}: ${(err as Error).message}`);
    }

    // Plan generation calls Anthropic and can fail (timeout, malformed JSON, etc.).
    // The daily check-in cadence is independent — schedule it OUTSIDE this try
    // block so an LLM hiccup at signup never silences the user permanently.
    // Idempotent + timezone-aware via CheckinService.scheduleCheckin.
    try {
      await this.checkinService.scheduleCheckin(user);
    } catch (err) {
      this.logger.error(
        `[Plan] scheduleCheckin failed for userId=${userId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Non-fatal — boot-time scheduleAllCheckins will re-enqueue next deploy.
    }

    try {
      const plan = await this.planService.generatePlan(
        { description: goal.description, timeline: goal.timeline, current_status: goal.current_status },
        profile,
      );

      await this.goalRepo.update(goal.id, { action_plan: plan });

      structuredLog(this.logger, 'log', {
        service: 'plan',
        operation: 'plan_generated',
        userId,
      });
    } catch (err) {
      this.logger.error(`[Plan] Generation failed for userId=${userId}: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }
}
