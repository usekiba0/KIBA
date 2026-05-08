import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { CrisisAlert } from '../data/entities/crisis-alert.entity';
import { User } from '../data/entities/user.entity';
import { Message } from '../data/entities/message.entity';
import { MessagingService } from '../messaging/messaging.service';
import { AlertChannel } from '../data/entities/crisis-alert.entity';
import { structuredLog } from '../common/logger';

@Processor('crisis-detection')
export class SafetyProcessor {
  private readonly logger = new Logger(SafetyProcessor.name);

  constructor(
    @InjectRepository(CrisisAlert) private readonly alertRepo: Repository<CrisisAlert>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
  ) {}

  @Process('dispatch-coach-alert')
  async handleCoachAlert(job: Job<{ alertId: string; userId: string; createdAt: Date }>) {
    const alert = await this.alertRepo.findOne({ where: { id: job.data.alertId } });
    if (!alert || alert.coach_alerted) return;

    const [user, triggeringMsg] = await Promise.all([
      this.userRepo.findOne({ where: { id: job.data.userId } }),
      alert.triggering_message_id
        ? this.messageRepo.findOne({ where: { id: alert.triggering_message_id } })
        : Promise.resolve(null),
    ]);

    const userName = user?.name ?? 'Unknown';
    const userPhone = user?.phone_number ?? 'Unknown';
    const age = user?.age ? `, ${user.age}` : '';
    const focus = user?.coaching_focus ?? 'general';
    const goals = user?.goals ?? 'not set';
    const health = user?.health_conditions?.length ? user.health_conditions.join(', ') : 'none reported';
    const injuries = user?.injuries ?? 'none';
    const msgSnippet = triggeringMsg?.content
      ? `"${triggeringMsg.content.substring(0, 120)}${triggeringMsg.content.length > 120 ? '…' : ''}"`
      : 'Not available';
    const method = alert.detection_method === 'keyword' ? 'keyword match' : `AI classifier (${Math.round((alert.confidence_score ?? 0) * 100)}% confidence)`;
    const detectedAt = new Date().toLocaleString('en-GB', { timeZone: 'UTC', hour12: false });

    const smsTxt =
      `⚠️ KIBA CRISIS ALERT\n` +
      `${userName}${age} | ${userPhone}\n` +
      `Health: ${health}\n` +
      `Message: ${msgSnippet}\n` +
      `Detected: ${method}\n` +
      `Their session is paused — please reach out directly.`;

    const emailText =
      `KIBA AI CRISIS ALERT — ${detectedAt} UTC\n\n` +
      `USER\n` +
      `  Name:    ${userName}${age}\n` +
      `  Phone:   ${userPhone}\n` +
      `  Focus:   ${focus}\n` +
      `  Goals:   ${goals}\n` +
      `  Health:  ${health}\n` +
      `  Injuries: ${injuries}\n\n` +
      `TRIGGERING MESSAGE\n` +
      `  ${msgSnippet}\n\n` +
      `DETECTION\n` +
      `  Method:  ${method}\n` +
      `  Alert ID: ${job.data.alertId}\n\n` +
      `The user has been sent a holding message and their session is paused. ` +
      `Please contact them directly on the number above as soon as possible.\n\n` +
      `Manage this alert → https://kiba-1.onrender.com/admin (Crisis tab)`;

    // Send SMS alert to coach
    const coachPhone = this.config.get<string>('CRISIS_COACH_ALERT_PHONE');
    if (coachPhone) {
      await this.messagingService.sendViaTwilio(coachPhone, smsTxt);
    }

    // Send email alert to coach
    const coachEmail = this.config.get<string>('CRISIS_COACH_ALERT_EMAIL');
    if (coachEmail) {
      await this.sendEmailAlert(coachEmail, emailText, userName);
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
      from: this.config.get('SMTP_FROM', 'Kiba AI Alerts <alerts@kiba.ai>'),
      to,
      subject: `⚠️ Kiba Crisis Alert — ${userName}`,
      text,
    });
  }
}
