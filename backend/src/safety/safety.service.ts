import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { User } from '../data/entities/user.entity';
import { ConversationSession, SessionStatus } from '../data/entities/conversation-session.entity';
import { CrisisAlert, DetectionMethod, AlertStatus } from '../data/entities/crisis-alert.entity';
import { CrisisResult } from '../ai/crisis.service';
import { MessagingService } from '../messaging/messaging.service';
import { getHoldingMessage } from './holding-messages';
import { structuredLog } from '../common/logger';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ConversationSession) private readonly sessionRepo: Repository<ConversationSession>,
    @InjectRepository(CrisisAlert) private readonly alertRepo: Repository<CrisisAlert>,
    @InjectQueue('crisis-detection') private readonly crisisQueue: Queue,
    private readonly messagingService: MessagingService,
  ) {}

  async handleCrisisDetection(userId: string, messageId: string, result: CrisisResult): Promise<void> {
    // Set user crisis hold
    await this.userRepo.update(userId, { crisis_hold: true });

    // Set session to crisis hold
    const session = await this.sessionRepo.findOne({
      where: { user_id: userId, status: SessionStatus.ACTIVE },
      order: { started_at: 'DESC' },
    });
    if (session) {
      await this.sessionRepo.update(session.id, { status: SessionStatus.CRISIS_HOLD });
    }

    // Create alert record
    const alert = await this.alertRepo.save({
      user_id: userId,
      triggering_message_id: messageId,
      detection_method: result.method === 'keyword' ? DetectionMethod.KEYWORD : DetectionMethod.ML_CLASSIFIER,
      confidence_score: result.confidence,
      status: AlertStatus.OPEN,
    });

    // Send holding message immediately
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user) {
      await this.messagingService.send(user.phone_number, getHoldingMessage());
      await this.alertRepo.update(alert.id, {
        holding_message_sent: true,
        holding_message_sent_at: new Date(),
      });
    }

    // Queue coach alert (must fire within 5 minutes)
    await this.crisisQueue.add('dispatch-coach-alert', {
      alertId: alert.id,
      userId,
      createdAt: alert.created_at ?? new Date(),
    }, { priority: 10, attempts: 3, backoff: { type: 'exponential', delay: 1000 } });

    structuredLog(this.logger, 'log', {
      service: 'safety', operation: 'crisis_detected',
      userId, alertId: alert.id, confidence: result.confidence, dimension: result.dimension,
    });
  }

  async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    const alert = await this.alertRepo.findOneOrFail({ where: { id: alertId } });
    await this.alertRepo.update(alertId, {
      status: AlertStatus.RESOLVED,
      resolved_by: resolvedBy,
      resolved_at: new Date(),
    });
    await this.userRepo.update(alert.user_id, { crisis_hold: false });
    await this.sessionRepo.update(
      { user_id: alert.user_id, status: SessionStatus.CRISIS_HOLD },
      { status: SessionStatus.ACTIVE },
    );

    const user = await this.userRepo.findOne({ where: { id: alert.user_id } });
    if (user) {
      await this.messagingService.send(
        user.phone_number,
        "Your coach has checked in. I'm here whenever you're ready to continue — no rush at all. 💙",
      );
    }
  }
}
