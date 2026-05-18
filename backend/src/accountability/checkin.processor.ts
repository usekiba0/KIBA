import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { User, OnboardingStage } from '../data/entities/user.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { MessagingService } from '../messaging/messaging.service';
import { AntiGhostService } from './anti-ghost.service';
import { ScheduleService } from './schedule.service';
import { buildCheckinMessage } from '../ai/prompts/checkin.prompt';
import { structuredLog } from '../common/logger';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

@Processor('accountability')
export class CheckinProcessor {
  private readonly logger = new Logger(CheckinProcessor.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    private readonly messagingService: MessagingService,
    private readonly antiGhostService: AntiGhostService,
    private readonly scheduleService: ScheduleService,
    @InjectQueue('accountability') private readonly queue: Queue,
  ) {}

  @Process('send-checkin')
  async handleSendCheckin(job: Job<{ userId: string }>): Promise<void> {
    const { userId } = job.data;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    if (user.crisis_hold) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [task, profile] = await Promise.all([
      this.taskRepo.findOne({ where: { user_id: userId, scheduled_date: today, status: TaskStatus.PENDING } }),
      this.profileRepo.findOne({ where: { user_id: userId } }),
    ]);

    const safeName = user.name ?? 'friend';
    const message = task
      ? buildCheckinMessage(safeName, profile, task.task_description)
      : buildCheckinMessage(safeName, profile, null);

    await this.messagingService.send(user.phone_number, message);

    if (task) {
      await this.queue.add(
        'checkin-missed',
        { userId, taskId: task.id },
        { delay: TWO_HOURS_MS },
      );
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'checkin_sent',
      userId,
      taskId: task?.id ?? null,
    });
  }

  @Process('send-scheduled-reminder')
  async handleScheduledReminder(job: Job<{ reminderId: string }>): Promise<void> {
    await this.scheduleService.fire(job.data.reminderId);
  }

  /**
   * SMS-first onboarding dunning. Fires at 24h then 72h after the payment link
   * is sent if the user hasn't paid yet. After two nudges we stop pestering.
   */
  @Process('payment-link-nudge')
  async handlePaymentLinkNudge(job: Job<{ userId: string; nudgeIndex: number }>): Promise<void> {
    const { userId, nudgeIndex } = job.data;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    if (user.onboarding_stage !== OnboardingStage.PAYMENT_PENDING) return; // paid or moved on
    if (user.dunning_nudges_sent >= 2) return;
    if (user.crisis_hold) return;

    const messages = [
      "still got your payment link sitting in our chat. takes 30 sec — text me once you're in and we lock in day one.",
      "last nudge — pay the link i sent and we start. ignore this if you're out, no hard feelings.",
    ];
    const text = messages[Math.min(nudgeIndex, messages.length - 1)];
    await this.messagingService.send(user.phone_number, text);
    await this.userRepo.update(userId, { dunning_nudges_sent: user.dunning_nudges_sent + 1 });

    structuredLog(this.logger, 'log', {
      service: 'onboarding', operation: 'dunning_nudge_sent',
      userId, nudgeIndex,
    });

    // Schedule the next nudge (24h after the first → 72h total after link sent)
    if (nudgeIndex === 0) {
      await this.queue.add(
        'payment-link-nudge',
        { userId, nudgeIndex: 1 },
        { delay: 48 * 60 * 60 * 1000 },
      );
    }
  }

  @Process('checkin-missed')
  async handleCheckinMissed(job: Job<{ userId: string; taskId: string }>): Promise<void> {
    const { userId, taskId } = job.data;
    await this.antiGhostService.onMissedCheckin(userId, taskId);

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'checkin_missed',
      userId,
      taskId,
    });
  }
}
