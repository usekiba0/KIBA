import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../data/entities/user.entity';
import { Message, MessageRole, MessageType } from '../data/entities/message.entity';
import { NutritionalAnalysis } from '../data/entities/nutritional-analysis.entity';
import { SessionSummary } from '../data/entities/session-summary.entity';
import { CoachingService } from '../ai/coaching.service';
import { VisionService } from '../ai/vision.service';
import { CrisisService } from '../ai/crisis.service';
import { SummarisationService } from '../ai/summarisation.service';
import { SessionCacheService } from '../data/session-cache.service';
import { SessionBoundaryService } from '../data/session-boundary.service';
import { MessagingService } from './messaging.service';
import { SafetyService } from '../safety/safety.service';
import { SummaryTrigger } from '../data/entities/session-summary.entity';
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

// Allowlist for trusted media URL hosts (Twilio CDN domains)
const TRUSTED_MEDIA_HOSTS = ['api.twilio.com', 'media.twiliocdn.com'];

function isTrustedMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return TRUSTED_MEDIA_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

@Processor('coaching')
export class CoachingProcessor {
  private readonly logger = new Logger(CoachingProcessor.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(NutritionalAnalysis) private readonly nutritionRepo: Repository<NutritionalAnalysis>,
    @InjectRepository(SessionSummary) private readonly summaryRepo: Repository<SessionSummary>,
    private readonly coachingService: CoachingService,
    private readonly visionService: VisionService,
    private readonly crisisService: CrisisService,
    private readonly summarisationService: SummarisationService,
    private readonly sessionCache: SessionCacheService,
    private readonly sessionBoundary: SessionBoundaryService,
    private readonly messagingService: MessagingService,
    private readonly safetyService: SafetyService,
  ) {}

  @Process('process-coaching-message')
  async handle(job: Job<CoachingJob>) {
    const { from, body, twilioSid, numMedia, mediaUrls, mediaContentTypes } = job.data;

    // Look up user
    const user = await this.userRepo.findOne({ where: { phone_number: from } });
    if (!user) {
      await this.messagingService.send(from, 'Welcome! Sign up at ryke.ai to start your free coaching trial. 🙌');
      return;
    }

    // Update last active
    await this.userRepo.update(user.id, { last_active_at: new Date() });

    // Save inbound message (session_id updated below once session is resolved)
    const inboundMsg = await this.messageRepo.save({
      user_id: user.id,
      session_id: 'pending',
      role: MessageRole.USER,
      message_type: numMedia > 0 ? MessageType.MMS : MessageType.TEXT,
      content: body,
      media_url: mediaUrls[0] ?? null,
      media_content_type: mediaContentTypes[0] ?? null,
      twilio_sid: twilioSid,
    });

    // Crisis hold check — if already flagged, send holding message and stop
    if (user.crisis_hold) {
      await this.messagingService.send(
        user.phone_number,
        "I'm here with you. A real person is aware of your situation. Please reach out to them or text 988 for immediate support. 💙",
      );
      return;
    }

    // SAFETY-CRITICAL: Await crisis classification before generating any coaching reply.
    // This ensures no AI response is sent to a crisis message before the hold is set.
    const crisisResult = await this.crisisService.classify(body);
    if (crisisResult.crisis) {
      await this.safetyService.handleCrisisDetection(user.id, inboundMsg.id, crisisResult);
      return; // SafetyService sends the holding message
    }

    // Context reset intent
    const lowerBody = body.toLowerCase();
    if (RESET_INTENTS.some(intent => lowerBody.includes(intent))) {
      await this.sessionCache.invalidateSession(user.id);
      await this.messagingService.send(
        user.phone_number,
        "Done — fresh start! Your profile and goals are still saved. What would you like to work on today?",
      );
      return;
    }

    // Session boundary check
    const boundary = await this.sessionBoundary.checkAndHandle(user.id);
    await this.messageRepo.update(inboundMsg.id, { session_id: boundary.sessionId });
    await this.sessionBoundary.recordMessage(boundary.sessionId);

    // Queue session summarisation if needed (non-blocking background task)
    if (boundary.shouldSummarise) {
      this.summarisationService
        .summariseSession(user.id, boundary.sessionId, SummaryTrigger.SESSION_EXPIRY)
        .catch(err => this.logger.error(`Summarisation error: ${err}`));
    }

    // Load session context
    const { messages: sessionWindow } = await this.sessionCache.getSessionWindow(user.id);

    const latestSummary = boundary.isNewSession
      ? await this.summaryRepo.findOne({ where: { user_id: user.id }, order: { created_at: 'DESC' } })
      : null;

    // MMS nutrition analysis — validate media URL to prevent SSRF
    const hasValidImage =
      numMedia > 0 &&
      mediaContentTypes[0]?.startsWith('image/') &&
      mediaUrls[0] &&
      isTrustedMediaUrl(mediaUrls[0]);

    if (hasValidImage) {
      const nutritionResult = await this.visionService.analyseFood(mediaUrls[0], user);

      await this.nutritionRepo.save({
        message_id: inboundMsg.id,
        user_id: user.id,
        detected_foods: nutritionResult.detected_foods,
        total_calories: nutritionResult.total_calories,
        protein_grams: nutritionResult.protein_grams,
        carbs_grams: nutritionResult.carbs_grams,
        fat_grams: nutritionResult.fat_grams,
        health_flags: nutritionResult.health_condition_flags,
        recommendation: nutritionResult.dietary_recommendation,
        food_identified: nutritionResult.food_identified,
      });

      let reply: string;
      if (!nutritionResult.food_identified) {
        reply = "I couldn't identify a meal in that photo — try a clearer shot with the food in frame? 📸";
      } else {
        const cal = nutritionResult.total_calories ?? '?';
        const p = nutritionResult.protein_grams ?? '?';
        const c = nutritionResult.carbs_grams ?? '?';
        const f = nutritionResult.fat_grams ?? '?';
        const rec = nutritionResult.dietary_recommendation ?? 'Looks good!';
        reply = `${rec}\n\n~${cal} cal | ${p}p/${c}c/${f}f`;
      }

      await this.saveAndSend(user, boundary.sessionId, reply);
      return;
    }

    // MMS with untrusted URL — log and skip vision
    if (numMedia > 0 && mediaUrls[0] && !isTrustedMediaUrl(mediaUrls[0])) {
      this.logger.warn(`Rejected untrusted media URL for user ${user.id}: ${mediaUrls[0]}`);
    }

    // Standard coaching reply
    const dbMessages = await this.messageRepo.find({
      where: { session_id: boundary.sessionId },
      order: { created_at: 'ASC' },
      take: 20,
    });

    const { reply, tokenCount } = await this.coachingService.generateReply(
      user, dbMessages, body, latestSummary?.summary,
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
      service: 'coaching', operation: 'reply_sent', userId: user.id, messageId: aiMsg.id,
    });
  }
}
