import { Process, Processor, OnQueueFailed, OnQueueActive } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { MessagingService } from './messaging.service';
import { PlanService } from '../ai/plan.service';
import { User } from '../data/entities/user.entity';
import { Goal } from '../data/entities/goal.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
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
    @InjectQueue('accountability') private readonly accountabilityQueue: Queue,
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

    const [user, goal, profile] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      this.goalRepo.findOne({ where: { user_id: userId }, order: { created_at: 'DESC' } }),
      this.profileRepo.findOne({ where: { user_id: userId } }),
    ]);

    if (!user || !goal || !profile) {
      this.logger.warn(`[Plan] Missing data for userId=${userId} — skipping`);
      return;
    }

    try {
      const plan = await this.planService.generatePlan(
        { description: goal.description, timeline: goal.timeline, current_status: goal.current_status },
        profile,
      );

      await this.goalRepo.update(goal.id, { action_plan: plan });

      // Schedule first check-in
      if (user.checkin_time) {
        const [hours, minutes] = user.checkin_time.split(':').map(Number);
        const now = new Date();
        const target = new Date(now);
        target.setHours(hours, minutes, 0, 0);
        if (target.getTime() <= now.getTime()) {
          target.setDate(target.getDate() + 1);
        }
        const delay = target.getTime() - now.getTime();
        await this.accountabilityQueue.add('send-checkin', { userId }, { delay });
      }

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
