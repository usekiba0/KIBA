import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { User } from '../data/entities/user.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { MessagingService } from '../messaging/messaging.service';
import { AntiGhostService } from './anti-ghost.service';
import { structuredLog } from '../common/logger';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

@Processor('accountability')
export class CheckinProcessor {
  private readonly logger = new Logger(CheckinProcessor.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    private readonly messagingService: MessagingService,
    private readonly antiGhostService: AntiGhostService,
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
    const task = await this.taskRepo.findOne({
      where: { user_id: userId, scheduled_date: today, status: TaskStatus.PENDING },
    });

    const message = task
      ? `${user.name} — check in time. Did you do it? "${task.task_description}" — send proof now.`
      : `${user.name} — check in time. What did you work on today? Send me proof.`;

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
