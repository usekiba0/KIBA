import { Process, Processor } from '@nestjs/bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../data/entities/user.entity';
import { Message, MessageRole, MessageType } from '../data/entities/message.entity';
import { SessionSummary, SummaryTrigger } from '../data/entities/session-summary.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { ProofType } from '../data/entities/proof.entity';
import { CoachingService } from '../ai/coaching.service';
import { CrisisService } from '../ai/crisis.service';
import { SummarisationService } from '../ai/summarisation.service';
import { SessionCacheService } from '../data/session-cache.service';
import { SessionBoundaryService } from '../data/session-boundary.service';
import { MessagingService } from './messaging.service';
import { SafetyService } from '../safety/safety.service';
import { AntiGhostService } from '../accountability/anti-ghost.service';
import { ProofService } from '../accountability/proof.service';
import { ScoreIntentService } from '../accountability/score-intent.service';
import { structuredLog } from '../common/logger';

interface CoachingJob {
  from: string;
  body: string;
  twilioSid: string | null;
  numMedia: number;
  mediaUrls: string[];
  mediaContentTypes: string[];
  channel: 'sms' | 'imessage';
}

const RESET_INTENTS = ['reset my coaching', 'start fresh', 'clear my history', 'reset context'];

@Processor('coaching')
export class CoachingProcessor {
  private readonly logger = new Logger(CoachingProcessor.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(SessionSummary) private readonly summaryRepo: Repository<SessionSummary>,
    @InjectRepository(DailyTask) private readonly dailyTaskRepo: Repository<DailyTask>,
    private readonly config: ConfigService,
    private readonly coachingService: CoachingService,
    private readonly crisisService: CrisisService,
    private readonly summarisationService: SummarisationService,
    private readonly sessionCache: SessionCacheService,
    private readonly sessionBoundary: SessionBoundaryService,
    private readonly messagingService: MessagingService,
    @Inject(forwardRef(() => SafetyService))
    private readonly safetyService: SafetyService,
    @Inject(forwardRef(() => AntiGhostService))
    private readonly antiGhostService: AntiGhostService,
    @Inject(forwardRef(() => ProofService))
    private readonly proofService: ProofService,
    private readonly scoreIntentService: ScoreIntentService,
  ) {}

  @Process('process-coaching-message')
  async handle(job: Job<CoachingJob>) {
    const { from, body, twilioSid, numMedia, mediaUrls, mediaContentTypes, channel } = job.data;

    // Look up user
    const user = await this.userRepo.findOne({ where: { phone_number: from } });
    if (!user) {
      await this.messagingService.send(
        from,
        'Welcome! Sign up at kiba.ai to start your free coaching trial. 🙌',
      );
      return;
    }

    // Update last active
    await this.userRepo.update(user.id, { last_active_at: new Date() });

    // Cross-channel dedup — catches same message arriving via both SMS and iMessage webhooks
    const cutoff = new Date(Date.now() - 30_000);
    const qb = this.messageRepo
      .createQueryBuilder('m')
      .where('m.user_id = :uid', { uid: user.id })
      .andWhere('m.role = :role', { role: MessageRole.USER })
      .andWhere('m.created_at > :cutoff', { cutoff });
    if (body !== '[image]') {
      qb.andWhere('m.content = :body', { body });
    } else if (mediaUrls[0]) {
      qb.andWhere('m.media_url = :url', { url: mediaUrls[0] });
    }
    const dup = await qb.getOne();
    if (dup) {
      this.logger.log(`[Dedup] Skipping duplicate from ${from} (channel: ${channel})`);
      return;
    }

    // Crisis hold check — if already flagged, send holding message and stop
    if (user.crisis_hold) {
      await this.messagingService.send(
        user.phone_number,
        "I'm here with you. A real person is aware of your situation. Please reach out to them or text 988 for immediate support. 💙",
      );
      return;
    }

    // Session boundary check (must happen before saving message so we have a real session_id)
    const boundary = await this.sessionBoundary.checkAndHandle(user.id);
    await this.sessionBoundary.recordMessage(boundary.sessionId);

    // Save inbound message with real session_id
    const inboundMsg = await this.messageRepo.save({
      user_id: user.id,
      session_id: boundary.sessionId,
      role: MessageRole.USER,
      message_type: numMedia > 0 ? MessageType.MMS : MessageType.TEXT,
      content: body,
      media_url: mediaUrls[0] ?? null,
      media_content_type: mediaContentTypes[0] ?? null,
      twilio_sid: twilioSid,
    });

    // Phase 1: crisis check + DB fetches in parallel (crisis never waits for DB)
    const [crisisResult, dbMessages, latestSummary] = await Promise.all([
      this.crisisService.classify(body),
      this.messageRepo.find({
        where: { session_id: boundary.sessionId },
        order: { created_at: 'ASC' },
        take: 20,
      }),
      boundary.isNewSession
        ? this.summaryRepo.findOne({ where: { user_id: user.id }, order: { created_at: 'DESC' } })
        : Promise.resolve(null),
    ]);

    // SAFETY-CRITICAL: halt before any reply if crisis detected
    if (crisisResult.crisis) {
      await this.safetyService.handleCrisisDetection(user.id, inboundMsg.id, crisisResult);
      return;
    }

    // Cancel any anti-ghost timers — user is actively responding
    await this.antiGhostService.onUserResponse(user.id).catch((err) =>
      this.logger.warn(`onUserResponse failed for ${user.id}: ${(err as Error).message}`),
    );

    // Score query intent
    const lowerBody = body.toLowerCase();
    if (this.scoreIntentService.isScoreIntent(lowerBody)) {
      const reply = await this.scoreIntentService.buildScoreReply(user.id);
      await this.saveAndSend(user, boundary.sessionId, reply);
      return;
    }

    // Context reset intent
    if (RESET_INTENTS.some((intent) => lowerBody.includes(intent))) {
      await this.sessionCache.invalidateSession(user.id);
      await this.messagingService.send(
        user.phone_number,
        'Done — fresh start! Your profile and goals are still saved. What would you like to work on today?',
      );
      return;
    }

    // Queue session summarisation if needed (non-blocking)
    if (boundary.shouldSummarise) {
      this.summarisationService
        .summariseSession(user.id, boundary.sessionId, SummaryTrigger.SESSION_EXPIRY)
        .catch((err) => this.logger.error(`Summarisation error: ${err}`));
    }

    // Image = proof submission — look up today's pending task
    if (numMedia > 0) {
      const mediaUrl = mediaUrls[0] ?? null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const task = await this.dailyTaskRepo.findOne({
        where: { user_id: user.id, scheduled_date: today, status: TaskStatus.PENDING },
      });

      if (task) {
        await this.proofService.submitProof({
          userId: user.id,
          taskId: task.id,
          type: ProofType.PHOTO,
          mediaUrl: mediaUrl ?? undefined,
          content: body !== '[image]' ? body : undefined,
        });
        await this.saveAndSend(
          user, boundary.sessionId,
          `Proof received ✓ "${task.task_description}" marked complete. Your execution score has been updated.`,
        );
      } else {
        // No pending task today — route to coaching AI
        const { reply, tokenCount } = await this.coachingService.generateReply(
          user, dbMessages, body || '[sent a photo]', latestSummary?.summary,
        );
        await this.messageRepo.update(inboundMsg.id, { token_count: tokenCount });
        await this.saveAndSend(user, boundary.sessionId, reply);
      }
      return;
    }

    // Phase 2: coaching reply (DB context already fetched in Phase 1)
    const { reply, tokenCount } = await this.coachingService.generateReply(
      user,
      dbMessages,
      body,
      latestSummary?.summary,
    );
    await this.messageRepo.update(inboundMsg.id, { token_count: tokenCount });
    await this.saveAndSend(user, boundary.sessionId, reply);
  }

  private async saveAndSend(user: User, sessionId: string, reply: string) {
    const aiMsg = await this.messageRepo.save({
      user_id: user.id,
      session_id: sessionId,
      role: MessageRole.AI,
      message_type: MessageType.TEXT,
      content: reply,
    });

    await this.sessionCache.addMessage(user.id, 'assistant', reply);
    await this.messagingService.send(user.phone_number, reply);

    structuredLog(this.logger, 'log', {
      service: 'coaching',
      operation: 'reply_sent',
      userId: user.id,
      messageId: aiMsg.id,
    });
  }
}
