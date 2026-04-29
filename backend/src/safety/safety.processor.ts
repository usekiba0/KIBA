import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { CrisisAlert } from '../data/entities/crisis-alert.entity';
import { User } from '../data/entities/user.entity';
import { MessagingService } from '../messaging/messaging.service';
import { AlertChannel } from '../data/entities/crisis-alert.entity';
import { structuredLog } from '../common/logger';

@Processor('crisis-detection')
export class SafetyProcessor {
  private readonly logger = new Logger(SafetyProcessor.name);

  constructor(
    @InjectRepository(CrisisAlert) private readonly alertRepo: Repository<CrisisAlert>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
  ) {}

  @Process('dispatch-coach-alert')
  async handleCoachAlert(job: Job<{ alertId: string; userId: string; createdAt: Date }>) {
    const alert = await this.alertRepo.findOne({ where: { id: job.data.alertId } });
    if (!alert || alert.coach_alerted) return;

    const user = await this.userRepo.findOne({ where: { id: job.data.userId } });
    const userName = user?.name ?? 'Unknown';
    const userPhone = user?.phone_number ?? 'Unknown';
    const alertBody = `RYKE AI CRISIS ALERT\nUser: ${userName} (${userPhone})\nTime: ${new Date().toISOString()}\nAlert ID: ${job.data.alertId}\n\nPlease respond to this user immediately.`;

    // Send SMS alert to coach
    const coachPhone = this.config.get<string>('CRISIS_COACH_ALERT_PHONE');
    if (coachPhone) {
      await this.messagingService.sendViaTwilio(coachPhone, alertBody);
    }

    // Send email alert to coach
    const coachEmail = this.config.get<string>('CRISIS_COACH_ALERT_EMAIL');
    if (coachEmail) {
      await this.sendEmailAlert(coachEmail, alertBody, userName);
    }

    const now = new Date();
    const slaMs = now.getTime() - new Date(job.data.createdAt).getTime();

    await this.alertRepo.update(job.data.alertId, {
      coach_alerted: true,
      coach_alerted_at: now,
      coach_alert_channel: AlertChannel.SMS,
    });

    structuredLog(this.logger, slaMs > 300000 ? 'error' : 'log', {
      service: 'safety', operation: 'coach_alerted',
      alertId: job.data.alertId, slaMs,
      sla_breach: slaMs > 300000,
    });
  }

  private async sendEmailAlert(to: string, text: string, userName: string): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      auth: { user: this.config.get('SMTP_USER'), pass: this.config.get('SMTP_PASS') },
    });

    await transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'RYKE AI Alerts <alerts@ryke.ai>'),
      to,
      subject: `⚠️ RYKE AI Crisis Alert — ${userName}`,
      text,
    });
  }
}
