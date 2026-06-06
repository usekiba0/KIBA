import { Process, Processor, OnQueueFailed, OnQueueError, OnQueueActive, InjectQueue } from '@nestjs/bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, OnboardingStage, OnboardingVariant, UserStatus, IntakeData } from '../data/entities/user.entity';
import { Subscription, SubscriptionStatus } from '../data/entities/subscription.entity';
import { Message, MessageRole, MessageType } from '../data/entities/message.entity';
import { SessionSummary, SummaryTrigger } from '../data/entities/session-summary.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { ProofType } from '../data/entities/proof.entity';
import { CoachingService, CoachingToolHandlers } from '../ai/coaching.service';
import { CrisisService } from '../ai/crisis.service';
import { SummarisationService } from '../ai/summarisation.service';
import { VisionService } from '../ai/vision.service';
import { SessionCacheService } from '../data/session-cache.service';
import { SessionBoundaryService } from '../data/session-boundary.service';
import { CorrectionService } from '../data/correction.service';
import { MessagingService } from './messaging.service';
import { SafetyService } from '../safety/safety.service';
import { AntiGhostService } from '../accountability/anti-ghost.service';
import { ProofService } from '../accountability/proof.service';
import { ScoreIntentService } from '../accountability/score-intent.service';
import { ScheduleService } from '../accountability/schedule.service';
import { ReminderRecurrence } from '../data/entities/scheduled-reminder.entity';
import { TodoService } from '../accountability/todo.service';
import { DailyTodoSource, DailyTodoStatus } from '../data/entities/daily-todo.entity';
import { StripeService } from '../onboarding/stripe.service';
import { structuredLog } from '../common/logger';
import { parseTimezoneOffset, parseCityOffset, parseReminderTime } from './reminder-parser';
import { detectOnboardingVariant } from './onboarding-variant';
import { splitBubbles } from './bubbles';
import { humanizeVoice } from './voice';
import { sniffRemoteMediaType } from './media-type';

interface CoachingJob {
  from: string;
  body: string;
  twilioSid: string | null;
  numMedia: number;
  mediaUrls: string[];
  mediaContentTypes: string[];
  channel: 'sms' | 'imessage';
  // Apple GUID of the user's most recent iMessage in this batch — the message a
  // tapback reaction lands on. Null for SMS (no tapback support). Optional so
  // older callers/tests that don't set it still type-check.
  messageHandle?: string | null;
}

// Context-reset intent. Anchored to the WHOLE message (optional leading filler +
// reset phrase + optional politeness) so a colloquial mention inside a larger
// sentence can't trigger a destructive session wipe — e.g. "start fresh on
// monday with a new workout plan" must NOT reset, while "start fresh" /
// "i want to start over" / "can you clear my history please" do.
export const RESET_INTENT_RE =
  /^\s*(?:can you|could you|would you|please|pls|hey|yo|ok|okay|i want to|i wanna|i'?d like to|lets|let'?s|can we)?\s*(?:reset (?:my )?(?:coaching|context|chat)|clear (?:my )?(?:history|context|chat)|start (?:over|fresh)|restart (?:my )?coaching|fresh start)\s*(?:please|pls|now|again)?\s*[.!]*\s*$/i;

/**
 * Pull the derived pattern signals off the user row into the shape the coaching
 * prompt builder expects. Compact: just reads existing columns, no queries.
 * The "weakest day" gate (>= 2 misses) lives here so the prompt only sees a
 * signal once it's statistically meaningful.
 */
function derivePatternSignals(user: User) {
  const counts = user.miss_counts_by_dow ?? [0, 0, 0, 0, 0, 0, 0];
  let weakestDow: number | null = null;
  let weakestDowMisses = 0;
  for (let d = 0; d < 7; d++) {
    if ((counts[d] ?? 0) > weakestDowMisses) {
      weakestDow = d;
      weakestDowMisses = counts[d];
    }
  }
  return {
    weakestDow: weakestDowMisses >= 2 ? weakestDow : null,
    weakestDowMisses,
    recurringExcuse: (user.same_excuse_count ?? 0) >= 2 ? user.last_excuse_phrase : null,
    recurringExcuseCount: user.same_excuse_count ?? 0,
    lastMilestoneHit: user.last_milestone_hit ?? 0,
  };
}

// Hard guard for billing-intent messages from COMPLETE users without an active
// subscription. Catches the case where migration 1779300000000 backfilled
// pre-existing users to 'complete' even though they never actually paid — the
// coaching LLM has no reliable way to handle a "send me the link" ask, so we
// short-circuit to the same sendPaymentLink path the intake AI uses.
// False positives are fine (extra link sent) — false negatives (LLM refuses
// a paying customer) burned us in production, so the regex stays broad.
const BILLING_INTENT_RE = /\b(subscri(be|ption|bed|bing)|stripe|checkout|billing|membership)\b|\b(payment|pay)\s+(link|me|the|for|to|via|by)|\b(sign\s*up|signup)\b/i;

// An intake lead explicitly asking us to send the payment link. Used to deliver
// the link deterministically the moment they ask (once we have name+goal+tz),
// instead of letting the model loop re-asking build questions (Karibi 2026-06-05).
export const LINK_REQUEST_RE = /\b(send|resend|drop|share|gimme|give\s+me|text|where(?:'?s| is)?)\b[^.\n]{0,15}\blink\b|\bsend\s+it\b|\blink\s+(?:again|now|please|pls)\b|\b(?:don'?t|do\s+not|dont)\s+have\b[^.\n]{0,15}\blink\b/i;

/**
 * Intake turns with the full emotional build captured but no link sent before
 * the system force-sends one. Gives the AI the turn it completed the build plus
 * one grace turn to close naturally; if it still hasn't, the safety-net fires.
 */
export const FORCE_LINK_AFTER_STALLED_TURNS = 2;

/**
 * The emotional build is "complete" once the functional minimum (name + goal +
 * timezone) AND the two anchors the close leans on (why it matters + their
 * obstacle) are persisted. The micro-commitment "yes" isn't a stored field, but
 * in the script it lands right after these — so this is the safe proxy for "the
 * AI should be closing now" without firing the link on bare name+goal+tz.
 */
export function intakeBuildComplete(user: {
  name: string | null;
  utc_offset_minutes: number | null;
  intake_data?: IntakeData | null;
}): boolean {
  const d = user.intake_data ?? {};
  return Boolean(
    user.name &&
      user.utc_offset_minutes !== null &&
      user.utc_offset_minutes !== undefined &&
      d.goal_description &&
      d.why_it_matters &&
      d.avoidance_patterns,
  );
}

@Processor('coaching')
export class CoachingProcessor {
  private readonly logger = new Logger(CoachingProcessor.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Subscription) private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(SessionSummary) private readonly summaryRepo: Repository<SessionSummary>,
    @InjectRepository(DailyTask) private readonly dailyTaskRepo: Repository<DailyTask>,
    private readonly config: ConfigService,
    private readonly coachingService: CoachingService,
    private readonly visionService: VisionService,
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
    @Inject(forwardRef(() => ScheduleService))
    private readonly scheduleService: ScheduleService,
    @Inject(forwardRef(() => TodoService))
    private readonly todoService: TodoService,
    private readonly correctionService: CorrectionService,
    private readonly stripeService: StripeService,
    @InjectQueue('accountability') private readonly accountabilityQueue: Queue,
  ) {}

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`[Queue] Job ${job.id} started — ${job.name}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`[Queue] Job ${job.id} FAILED after ${job.attemptsMade} attempts: ${err.message}\n${err.stack}`);
  }

  @OnQueueError()
  onError(err: Error) {
    this.logger.error(`[Queue] Queue error: ${err.message}\n${err.stack}`);
  }

  @Process('process-coaching-message')
  async handle(job: Job<CoachingJob>) {
    return this.process(job.data);
  }

  async process(data: CoachingJob): Promise<void> {
    const { from, body, twilioSid, numMedia, mediaUrls, mediaContentTypes, channel } = data;
    const messageHandle = data.messageHandle ?? null;
    this.logger.log(`[Handler] Processing message from ${from} via ${channel}`);

    // Carrier shortcodes (e.g. +195686 from Citi) get misrouted to our SendBlue
    // number. They're not humans — silently drop before we create a lead row
    // and burn an LLM call replying to spam. Real E.164 numbers are ≥ 8 digits
    // after the `+`; shortcodes are 4–7.
    const digitsOnly = from.replace(/\D/g, '');
    if (digitsOnly.length < 8) {
      structuredLog(this.logger, 'log', {
        service: 'messaging', operation: 'shortcode_dropped',
        from, channel, bodyPreview: body.slice(0, 80),
      });
      return;
    }

    // Look up user; cold inbound creates a lead in INTAKE stage so the
    // SMS-first onboarding flow can take over.
    let user = await this.userRepo.findOne({ where: { phone_number: from } });
    if (!user) {
      // Ad-attributed onboarding: the pre-filled deep-link text of the very
      // first inbound message decides which opener the intake AI uses. Computed
      // here (lead creation) and never recomputed — later turns keep the variant.
      const variant = detectOnboardingVariant(body);
      user = await this.userRepo.save(this.userRepo.create({
        phone_number: from,
        name: null,
        coaching_focus: null,
        goals: null,
        status: UserStatus.TRIAL,
        onboarding_stage: OnboardingStage.INTAKE,
        onboarding_variant: variant,
        intake_data: {},
        // Default 9am local check-in so the daily cadence can kick in the moment
        // the user pays. Users can override mid-coaching ("check in at 7 instead")
        // — the save_intake_field tool already accepts checkin_time. Without a
        // default, scheduleCheckin early-returns and the user never hears from us.
        checkin_time: '09:00',
      }));
      this.logger.log(`[Onboarding] Created lead ${user.id} for ${from} (variant: ${variant})`);
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

    // Cancel any anti-ghost timers — user is actively responding.
    // Capture id to a const so the `.catch` closure doesn't re-widen `user`
    // (TS loses null-narrowing on a `let` that's reassigned later in the function).
    const userIdForAntiGhost = user.id;
    await this.antiGhostService.onUserResponse(userIdForAntiGhost).catch((err) =>
      this.logger.warn(`onUserResponse failed for ${userIdForAntiGhost}: ${(err as Error).message}`),
    );

    const lowerBody = body.toLowerCase();

    // Timezone detection runs for ALL stages — capturing tz early is cheap and
    // makes the intake AI's scheduling math correct as soon as we have it.
    const tzOffset = parseTimezoneOffset(lowerBody);
    if (tzOffset !== null && user.utc_offset_minutes !== tzOffset) {
      await this.userRepo.update(user.id, { utc_offset_minutes: tzOffset });
      user = { ...user, utc_offset_minutes: tzOffset };
    }

    // Resolve inbound media type ONCE for every stage. The controller's
    // guessContentType() is extension-based; when it yields nothing usable
    // (extension-less SendBlue CDN URL) we sniff the file's magic bytes so a real
    // photo isn't misclassified. Computed here — BEFORE stage routing — because
    // onboarding (intake) users send photos too and must reach vision (Karibi:
    // "it's not seeing the photo" — the image branch below only ran for COMPLETE
    // users, so pre-payment photos were silently dropped and the AI improvised
    // "i can't see images").
    const firstMediaUrl = mediaUrls[0] ?? null;
    let resolvedMediaCt = (mediaContentTypes[0] ?? '').toLowerCase().split(';')[0].trim();
    if (numMedia > 0 && firstMediaUrl && (!resolvedMediaCt || resolvedMediaCt === 'application/octet-stream')) {
      const sniffed = await sniffRemoteMediaType(firstMediaUrl);
      if (sniffed) {
        structuredLog(this.logger, 'log', {
          service: 'messaging', operation: 'media_type_sniffed',
          userId: user.id, channel, contentType: sniffed,
        });
        resolvedMediaCt = sniffed;
      }
    }
    const inboundIsImage = numMedia > 0 && resolvedMediaCt.startsWith('image/');

    // === Stage routing: SMS-first onboarding ===
    // Pre-payment users go through the intake AI flow, not the coaching flow.
    // Correction triggers, score queries, reminders, etc. are all coach-mode
    // features and are gated behind onboarding_stage === COMPLETE.
    if (user.onboarding_stage !== OnboardingStage.COMPLETE) {
      const reply = await this.handleIntakeMessage(
        user, dbMessages, body, boundary.sessionId, inboundMsg.id,
        inboundIsImage ? (firstMediaUrl ?? undefined) : undefined,
        inboundIsImage ? resolvedMediaCt : undefined,
      );
      await this.saveAndSend(user, boundary.sessionId, reply);
      return;
    }

    // Correction trigger: "#kibi <correction>" routes to the curation queue,
    // not the coaching LLM. Runs before other intent branches so reminder/score
    // regexes can't accidentally swallow correction text.
    if (CorrectionService.isCorrectionTrigger(body)) {
      const correctionText = CorrectionService.extractCorrectionText(body);
      if (correctionText.length === 0) {
        await this.saveAndSend(
          user,
          boundary.sessionId,
          "send `#kibi` or `#kiba` followed by what was wrong so i can flag it for review.",
        );
        return;
      }
      this.correctionService
        .capture({ userId: user.id, sessionId: boundary.sessionId, correctionText })
        .catch((err) => this.logger.error(`Correction capture failed: ${(err as Error).message}`));
      await this.saveAndSend(
        user,
        boundary.sessionId,
        "got it — flagged for review. appreciate you keeping me honest.",
      );
      return;
    }

    // Billing-intent guard: a COMPLETE user with no active/trialing subscription
    // is the broken backfill case (or a churned user) — bypass the LLM entirely
    // and send a fresh Stripe checkout link. Active subscribers fall through so
    // the LLM can use the send_payment_link tool with full context (or refuse
    // gracefully when the tool reports they're already in).
    if (BILLING_INTENT_RE.test(lowerBody)) {
      const activeSub = await this.subscriptionRepo.findOne({
        where: [
          { user_id: user.id, status: SubscriptionStatus.ACTIVE },
          { user_id: user.id, status: SubscriptionStatus.TRIALING },
        ],
      });
      if (!activeSub) {
        await this.saveAndSend(user, boundary.sessionId, "got you — here's the link to lock this in:");
        const linkResult = await this.sendPaymentLink(user, inboundMsg.id, { requireFullIntake: false });
        if (!linkResult.ok) {
          this.logger.warn(`[BillingGuard] sendPaymentLink failed for ${user.id}: ${linkResult.error}`);
          await this.saveAndSend(
            user, boundary.sessionId,
            "i'm having trouble generating that — an admin will reach out shortly.",
          );
        }
        structuredLog(this.logger, 'log', {
          service: 'messaging', operation: 'billing_intent_guard',
          userId: user.id, ok: linkResult.ok,
        });
        return;
      }
    }

    // Score query intent
    if (this.scoreIntentService.isScoreIntent(lowerBody)) {
      const reply = await this.scoreIntentService.buildScoreReply(user.id);
      await this.saveAndSend(user, boundary.sessionId, reply);
      return;
    }

    // Context reset intent
    if (RESET_INTENT_RE.test(body.trim())) {
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
      const mediaUrl = firstMediaUrl;
      const mediaCt = resolvedMediaCt;
      const isImage = inboundIsImage;
      const isAudio = mediaCt.startsWith('audio/');
      const isVideo = mediaCt.startsWith('video/');

      // Non-image media: voice notes / video / unknown blobs route here. We
      // can't run vision on audio bytes (that's how the "couldn't read that
      // photo" loop happened — SendBlue forwarded a .caf labeled image/jpeg).
      // Reply useful instead of feeding garbage to Claude.
      if (!isImage) {
        const reply = isAudio
          ? "i can't play voice notes yet — type it out and i got you."
          : isVideo
            ? "videos don't come through here — send a screenshot from it instead."
            : "that file type doesn't come through — try a screenshot or jpeg.";
        structuredLog(this.logger, 'log', {
          service: 'messaging', operation: 'unsupported_media_dropped',
          userId: user.id, contentType: mediaCt, channel,
        });
        await this.saveAndSend(user, boundary.sessionId, reply);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const task = await this.dailyTaskRepo.findOne({
        where: { user_id: user.id, scheduled_date: today, status: TaskStatus.PENDING },
      });

      if (task) {
        // Actually LOOK at the proof. Lenient by design: we only refuse when the
        // model is CONFIDENT the photo doesn't match the task (>= 0.8). Anything
        // uncertain — or any infra failure (validateProofFromUrl fails open) — is
        // accepted, because wrongly rejecting a real user's proof is far worse
        // than occasionally letting a borderline one through.
        const verdict = mediaUrl
          ? await this.visionService.validateProofFromUrl(task.task_description, mediaUrl, mediaCt)
          : { is_valid: true, confidence: 0, reason: '' };

        if (!verdict.is_valid && verdict.confidence >= 0.8) {
          structuredLog(this.logger, 'log', {
            service: 'accountability', operation: 'proof_rejected_low_match',
            userId: user.id, taskId: task.id, confidence: verdict.confidence,
          });
          await this.saveAndSend(
            user, boundary.sessionId,
            `hmm that doesn't look like "${task.task_description}" to me — send a quick shot of the actual thing and i'll log it 💪`,
          );
          return;
        }

        await this.proofService.submitProof({
          userId: user.id,
          taskId: task.id,
          type: ProofType.PHOTO,
          mediaUrl: mediaUrl ?? undefined,
          content: body !== '[image]' ? body : undefined,
        });
        await this.saveAndSend(
          user, boundary.sessionId,
          `proof in ✓ "${task.task_description}" logged — score updated. 💪`,
        );
      } else {
        // No pending task today — route to coaching AI with vision
        const visionTodos = await this.todoService.ensureSeededForToday(user.id).catch(() => []);
        const visionPatterns = derivePatternSignals(user);
        const { reply, tokenCount } = await this.coachingService.generateReply(
          user, dbMessages, body !== '[image]' ? body : '', latestSummary?.summary, mediaUrl ?? undefined, mediaCt,
          this.buildToolHandlers(user, boundary.sessionId, inboundMsg.id, channel, messageHandle),
          visionTodos.map((t) => ({ id: t.id, content: t.content, status: t.status })),
          visionPatterns,
        );
        await this.messageRepo.update(inboundMsg.id, { token_count: tokenCount });
        await this.saveAndSend(user, boundary.sessionId, reply);
      }
      return;
    }

    // Seed today's todos from the user's plan once per day, then pass the
    // current list into the coaching reply so the AI stops asking
    // "what's the workout?" when the answer's already in the action plan.
    const todos = await this.todoService.ensureSeededForToday(user.id).catch((err) => {
      this.logger.warn(`todo seed failed for ${user.id}: ${(err as Error).message}`);
      return [];
    });

    const patterns = derivePatternSignals(user);

    // Phase 2: coaching reply (DB context already fetched in Phase 1)
    const { reply, tokenCount } = await this.coachingService.generateReply(
      user,
      dbMessages,
      body,
      latestSummary?.summary,
      undefined,
      undefined,
      this.buildToolHandlers(user, boundary.sessionId, inboundMsg.id, channel, messageHandle),
      todos.map((t) => ({ id: t.id, content: t.content, status: t.status })),
      patterns,
    );
    await this.messageRepo.update(inboundMsg.id, { token_count: tokenCount });
    await this.saveAndSend(user, boundary.sessionId, reply);
  }

  /**
   * Handle a message from a user who is not yet onboarded (stage INTAKE or
   * PAYMENT_PENDING). Routes to the intake AI which has the save_intake_field
   * and send_payment_link tools. Returns the final user-facing reply text.
   */
  private async handleIntakeMessage(
    user: User,
    recentMessages: Message[],
    body: string,
    sessionId: string,
    userMessageId: string,
    imageUrl?: string,
    imageContentType?: string,
  ): Promise<string> {
    // ── Deterministic slot capture (don't trust the model to do the math) ──
    // The intake prompt's "STILL MISSING" gate reads PERSISTED state, but the
    // only path that wrote the timezone from a city was the model computing the
    // UTC offset and remembering to call save_intake_field — which it skipped,
    // then re-asked "what city are you in?" forever (the offset stayed null so
    // the gate never cleared). Resolve city → offset and "9am" → check-in time
    // here so an answered question can never be re-asked. The model's tool calls
    // still work as a fallback for cities/phrasings we don't recognise.
    if ((user.utc_offset_minutes ?? null) === null) {
      const cityOffset = parseCityOffset(body.toLowerCase());
      if (cityOffset !== null) {
        await this.userRepo.update(user.id, { utc_offset_minutes: cityOffset });
        user = { ...user, utc_offset_minutes: cityOffset };
        structuredLog(this.logger, 'log', {
          service: 'onboarding', operation: 'tz_captured_from_city',
          userId: user.id, utcOffsetMinutes: cityOffset,
        });
      }
    }
    if (!user.checkin_time) {
      const checkinTime = parseReminderTime(body);
      if (checkinTime) {
        await this.userRepo.update(user.id, { checkin_time: checkinTime });
        user = { ...user, checkin_time: checkinTime };
        structuredLog(this.logger, 'log', {
          service: 'onboarding', operation: 'checkin_captured_from_text',
          userId: user.id, checkinTime,
        });
      }
    }

    // Build the intake context snapshot used by the prompt.
    const ctx = {
      name: user.name,
      intakeData: (user.intake_data ?? {}) as IntakeData,
      utcOffsetMinutes: user.utc_offset_minutes ?? null,
      paymentLinkSent: !!user.payment_link_sent_at,
      sampleCoachingGiven: !!user.sample_coaching_given,
      variant: user.onboarding_variant ?? OnboardingVariant.STANDARD,
      // Quote trial length + price from config so the AI's copy can never drift
      // from what Stripe actually bills. Defaults match the agreed offer (7d / $20).
      trialDays: this.config.get<number>('STRIPE_TRIAL_DAYS', 7),
      priceDisplay: this.config.get<string>('STRIPE_PRICE_DISPLAY', '$20/month'),
    };

    // Mutable copy we mutate as tool calls land so subsequent calls in the same
    // turn see the latest state.
    const liveUser = { ...user };

    const handlers = {
      saveIntakeField: async (input: { field: string; value: string | number | boolean | string[] }) => {
        return this.saveIntakeField(liveUser, input.field, input.value);
      },
      sendPaymentLink: async () => {
        return this.sendPaymentLink(liveUser, userMessageId, { requireFullIntake: true });
      },
    };

    // Strip the "[image]" placeholder so the AI sees a real caption (or empty)
    // alongside the photo, not the literal sentinel.
    const intakeText = body !== '[image]' ? body : '';
    const { reply } = await this.coachingService.generateIntakeReply(
      user, recentMessages, intakeText, ctx, handlers, imageUrl, imageContentType,
    );

    // ── Link delivery: explicit ask + safety-net ──────────────────────────
    // PRIMARY path is unchanged: the intake AI runs the emotional build and
    // fires the link itself at the close. Two deterministic backstops sit under
    // it so a stalled/looping model can never strand a ready lead (Karibi
    // 2026-06-05 watched it re-ask the same question instead of sending the
    // link he kept requesting):
    //   (1) the user EXPLICITLY asks for the link and we have the functional
    //       minimum (name + goal + timezone) -> send it now. An explicit ask
    //       overrides the build-first preference; looping a begging lead is the
    //       worst outcome.
    //   (2) the build is complete but the AI hasn't sent it -> grace, then force.
    // Runs after the reply so the lead gets the close text then the link.
    const askedForLink = LINK_REQUEST_RE.test(intakeText);
    const hasMinimumForLink =
      !!liveUser.name &&
      !!liveUser.intake_data?.goal_description &&
      liveUser.utc_offset_minutes !== null &&
      liveUser.utc_offset_minutes !== undefined;

    if (!liveUser.payment_link_sent_at && askedForLink && hasMinimumForLink) {
      const sent = await this.sendPaymentLink(liveUser, userMessageId, { requireFullIntake: true });
      await this.userRepo.update(user.id, { intake_link_stall_turns: 0 });
      structuredLog(this.logger, 'log', {
        service: 'onboarding', operation: 'payment_link_sent_on_request',
        userId: user.id, ok: sent.ok,
      });
    } else if (!liveUser.payment_link_sent_at && intakeBuildComplete(liveUser)) {
      const stalledTurns = (user.intake_link_stall_turns ?? 0) + 1;
      if (stalledTurns >= FORCE_LINK_AFTER_STALLED_TURNS) {
        const forced = await this.sendPaymentLink(liveUser, userMessageId, { requireFullIntake: true });
        await this.userRepo.update(user.id, { intake_link_stall_turns: 0 });
        structuredLog(this.logger, 'log', {
          service: 'onboarding', operation: 'payment_link_force_sent',
          userId: user.id, afterStalledTurns: stalledTurns, ok: forced.ok,
        });
      } else {
        await this.userRepo.update(user.id, { intake_link_stall_turns: stalledTurns });
      }
    } else if ((user.intake_link_stall_turns ?? 0) !== 0) {
      await this.userRepo.update(user.id, { intake_link_stall_turns: 0 });
    }

    // If we just gave the sample-coaching reply (post-link), flip the flag so
    // the next turn falls into the PAYWALL phase.
    if (user.payment_link_sent_at && !user.sample_coaching_given && reply.trim().length > 0) {
      await this.userRepo.update(user.id, { sample_coaching_given: true });
    }

    return reply.trim().length > 0 ? reply : "got it — tell me your goal in one sentence to get started.";
  }

  /**
   * Persist a single intake field. Structured fields land on the user row;
   * everything else falls into the intake_data JSONB blob.
   */
  private async saveIntakeField(liveUser: User, field: string, value: string | number | boolean | string[]) {
    const userColumnFields: Record<string, keyof User> = {
      name: 'name',
      utc_offset_minutes: 'utc_offset_minutes',
      checkin_time: 'checkin_time',
    };

    if (field in userColumnFields) {
      const col = userColumnFields[field];
      if (col === 'utc_offset_minutes') {
        const n = typeof value === 'number' ? value : parseInt(String(value), 10);
        if (Number.isNaN(n) || n < -720 || n > 840) {
          return { ok: false as const, error: 'utc_offset_minutes must be an integer between -720 and 840' };
        }
        await this.userRepo.update(liveUser.id, { utc_offset_minutes: n });
        liveUser.utc_offset_minutes = n;
      } else if (col === 'checkin_time') {
        const s = String(value);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) {
          return { ok: false as const, error: 'checkin_time must be HH:MM (24h)' };
        }
        await this.userRepo.update(liveUser.id, { checkin_time: s });
        liveUser.checkin_time = s;
      } else if (col === 'name') {
        const s = String(value).trim().slice(0, 100);
        if (!s) return { ok: false as const, error: 'name must not be empty' };
        await this.userRepo.update(liveUser.id, { name: s });
        liveUser.name = s;
      }
      return { ok: true as const, field };
    }

    // Otherwise, persist into intake_data JSONB.
    const allowed = new Set([
      'goal_description', 'goals', 'goal_timeline', 'current_status', 'why_it_matters', 'fears', 'avoidance_patterns',
      'comparison_figure', 'public_failure_scenario', 'typical_failure_moment', 'pressure_preference',
      'cussing_ok',
    ]);
    if (!allowed.has(field)) {
      return { ok: false as const, error: `unknown field: ${field}` };
    }
    const intake: IntakeData = { ...(liveUser.intake_data ?? {}) };
    if (field === 'goals') {
      // The full multi-goal list. Accept an array of strings (the tool schema),
      // but tolerate a single string the model may pass by mistake. Trim, drop
      // blanks, cap each entry and the list so a runaway model can't bloat the
      // JSONB row. We do NOT touch goal_description here — the anchor is saved
      // separately so every downstream consumer keeps reading one string.
      const raw = Array.isArray(value) ? value : [value];
      const goals = raw
        .map((g) => String(g).trim().slice(0, 2000))
        .filter((g) => g.length > 0)
        .slice(0, 10);
      if (goals.length === 0) {
        return { ok: false as const, error: 'goals must be a non-empty array of strings' };
      }
      intake.goals = goals;
      // Guarantee an anchor exists so the payment-link guard, dunning nudges and
      // plan generation (all of which read the single goal_description) never see
      // a user with goals-but-no-anchor. The model overwrites this with the
      // user's explicit anchor pick at step 2a when they have more than one.
      if (!intake.goal_description) {
        intake.goal_description = goals[0];
      }
    } else if (field === 'pressure_preference') {
      const s = String(value).toLowerCase();
      if (s !== 'pressure' && s !== 'encouragement') {
        return { ok: false as const, error: 'pressure_preference must be "pressure" or "encouragement"' };
      }
      intake.pressure_preference = s;
    } else if (field === 'cussing_ok') {
      if (typeof value !== 'boolean') {
        return { ok: false as const, error: 'cussing_ok must be a boolean' };
      }
      intake.cussing_ok = value;
    } else {
      (intake as Record<string, unknown>)[field] = String(value).slice(0, 2000);
    }
    await this.userRepo.update(liveUser.id, { intake_data: intake });
    liveUser.intake_data = intake;
    return { ok: true as const, field };
  }

  /**
   * Create a Stripe checkout session, SMS the URL, mark the user payment_pending,
   * and schedule the dunning auto-nudges. Refuses if a recent link still exists.
   *
   * `requireFullIntake` is true for the intake-AI tool (gathers name/goal/tz first)
   * and false for the re-subscribe paths (legacy users backfilled to 'complete'
   * who already have a name but no intake_data — we just need to get them paying).
   */
  private async sendPaymentLink(
    liveUser: User,
    userMessageId: string,
    opts: { requireFullIntake: boolean } = { requireFullIntake: true },
  ) {
    // Name is required either way — Stripe customer creation uses it.
    if (!liveUser.name) {
      return { ok: false as const, error: 'user has no name yet' };
    }
    if (opts.requireFullIntake) {
      if (!liveUser.intake_data?.goal_description || liveUser.utc_offset_minutes === null) {
        return { ok: false as const, error: 'minimum intake not yet captured (need name, goal_description, utc_offset_minutes)' };
      }
    }

    // Refuse if a payment link was sent in the last 5 minutes (avoid spam).
    if (liveUser.payment_link_sent_at) {
      const ageMs = Date.now() - new Date(liveUser.payment_link_sent_at).getTime();
      if (ageMs < 5 * 60_000) {
        return { ok: false as const, error: 'a payment link was already sent within the last 5 minutes' };
      }
    }

    const priceId = this.config.getOrThrow<string>('STRIPE_PRICE_ID_INDIVIDUAL');
    // 7-day trial is the agreed offer; the intake AI quotes the same number from
    // STRIPE_TRIAL_DAYS so the checkout trial and the SMS copy always agree.
    const trialDays = this.config.get<number>('STRIPE_TRIAL_DAYS', 7);
    const appBaseUrl = this.config.get<string>('APP_BASE_URL', 'https://kiba.ai');

    // Create (or reuse) Stripe customer. We don't have a stable customer id on
    // the user row for SMS leads, so create one each time the link is sent —
    // the previous customer gets garbage-collected on the Stripe side if unused.
    // Wrap the Stripe calls: a throw here used to bubble up and get swallowed
    // into the model's tool-result context (user saw "backend thing", we saw
    // NOTHING in the logs). Log the real error and return a clean failure.
    let session: import('stripe').Stripe.Checkout.Session;
    try {
      const customer = await this.stripeService.createCustomer(liveUser.name, liveUser.phone_number);
      session = await this.stripeService.createCheckoutSession({
        customerId: customer.id,
        priceId,
        trialDays,
        userId: liveUser.id,
        successUrl: `${appBaseUrl}/onboarding/success`,
        cancelUrl: `${appBaseUrl}/onboarding/cancel`,
      });
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'onboarding',
        operation: 'payment_link_stripe_failed',
        userId: liveUser.id,
        error: (err as Error).message,
      });
      return { ok: false as const, error: 'stripe checkout creation failed' };
    }

    if (!session.url) {
      structuredLog(this.logger, 'error', {
        service: 'onboarding',
        operation: 'payment_link_no_url',
        userId: liveUser.id,
      });
      return { ok: false as const, error: 'stripe did not return a checkout url' };
    }

    // SMS the link directly (rather than letting the AI include it in its reply
    // text) so it lands on its own line and is clickable. CRITICAL: send BEFORE
    // persisting PAYMENT_PENDING / payment_link_sent_at — otherwise a SendBlue+
    // Twilio double-failure leaves the user stuck (5-min resend lockout active
    // but no link in their inbox).
    try {
      await this.messagingService.send(liveUser.phone_number, session.url);
    } catch (err) {
      this.logger.error(
        `[sendPaymentLink] SMS delivery failed for ${liveUser.id} — not persisting PAYMENT_PENDING so user can retry: ${(err as Error).message}`,
      );
      return { ok: false as const, error: 'failed to deliver payment link sms' };
    }

    const now = new Date();
    await this.userRepo.update(liveUser.id, {
      onboarding_stage: OnboardingStage.PAYMENT_PENDING,
      payment_link_sent_at: now,
      stripe_checkout_session_id: session.id,
      sample_coaching_given: false,
    });
    liveUser.onboarding_stage = OnboardingStage.PAYMENT_PENDING;
    liveUser.payment_link_sent_at = now;
    liveUser.sample_coaching_given = false;

    // Follow-up sequence for unpaid leads: first nudge ~2.5h after the link,
    // then ~next day, then ~2-3 days (final). The cadence after nudge 0 is
    // scheduled by CheckinProcessor.handlePaymentLinkNudge.
    await this.accountabilityQueue.add(
      'payment-link-nudge',
      { userId: liveUser.id, nudgeIndex: 0 },
      { delay: 2.5 * 60 * 60 * 1000 },
    );

    structuredLog(this.logger, 'log', {
      service: 'onboarding', operation: 'sms_payment_link_sent',
      userId: liveUser.id, sessionId: session.id, userMessageId,
    });

    return { ok: true as const, checkout_url: session.url };
  }

  /**
   * Tool handlers exposed to the coaching LLM. Keeps the AI module decoupled
   * from AccountabilityModule — the processor (which already wires both)
   * stitches them together.
   */
  private buildToolHandlers(
    user: User,
    sessionId: string,
    userMessageId: string,
    channel: 'sms' | 'imessage' = 'sms',
    messageHandle: string | null = null,
  ) {
    const userId = user.id;
    const userOffsetMinutes = user.utc_offset_minutes;
    const handlers: CoachingToolHandlers = {
      scheduleReminder: async (input: {
        fire_at_iso: string;
        message: string;
        recurrence?: { rule: 'daily'; local_time: string } | null;
      }) => {
        const fireAt = new Date(input.fire_at_iso);
        // Recurrence needs the user's TZ snapshotted at create time. If we
        // don't know it, refuse rather than silently dropping recurrence —
        // the AI should ask for the timezone first.
        if (input.recurrence && (userOffsetMinutes === null || userOffsetMinutes === undefined)) {
          return { ok: false as const, error: 'cannot schedule a daily reminder without the user\'s timezone — ask them first' };
        }
        const result = await this.scheduleService.enqueue({
          userId,
          sessionId,
          createdByMessageId: userMessageId,
          fireAt,
          message: input.message,
          recurrence: input.recurrence
            ? {
                rule: ReminderRecurrence.DAILY,
                localTime: input.recurrence.local_time,
                offsetMinutes: userOffsetMinutes as number,
              }
            : null,
        });
        if (result.ok) {
          return { ok: true as const, reminder_id: result.reminderId, fire_at_iso: result.fireAtIso };
        }
        return { ok: false as const, error: result.reason };
      },
      cancelReminder: async (input: { reminder_id: string }) => {
        const reminder = await this.scheduleService.findById(input.reminder_id);
        if (!reminder || reminder.user_id !== userId) {
          return { ok: false as const, error: 'reminder not found' };
        }
        // Recurring series: cancel the whole chain by parent_id.
        if (reminder.recurrence_parent_id) {
          const count = await this.scheduleService.cancelSeries(reminder.recurrence_parent_id);
          return { ok: true as const, cancelled: count };
        }
        const cancelled = await this.scheduleService.cancel(input.reminder_id);
        return { ok: true as const, cancelled: cancelled ? 1 : 0 };
      },
      listMyReminders: async () => {
        const reminders = await this.scheduleService.listPendingForUser(userId);
        return {
          ok: true as const,
          reminders: reminders.map((r) => ({
            reminder_id: r.id,
            fire_at_iso: r.fire_at.toISOString(),
            message: r.message,
            recurrence: r.recurrence_rule,
          })),
        };
      },
      addTodo: async (input: { content: string }) => {
        const trimmed = (input.content ?? '').trim();
        if (!trimmed) return { ok: false as const, error: 'content must not be empty' };
        const todo = await this.todoService.add({
          userId,
          content: trimmed,
          source: DailyTodoSource.AI,
        });
        return { ok: true as const, todo_id: todo.id, content: todo.content };
      },
      listTodayTodos: async () => {
        const todos = await this.todoService.listToday(userId);
        return {
          ok: true as const,
          todos: todos.map((t) => ({ todo_id: t.id, content: t.content, status: t.status })),
        };
      },
      markTodoDone: async (input: { todo_id: string }) => {
        const updated = await this.todoService.markDone(userId, input.todo_id);
        if (!updated) return { ok: false as const, error: 'todo not found' };
        return { ok: true as const, todo_id: updated.id, status: updated.status };
      },
      removeTodo: async (input: { todo_id: string }) => {
        const removed = await this.todoService.remove(userId, input.todo_id);
        if (!removed) return { ok: false as const, error: 'todo not found' };
        return { ok: true as const, removed: true as const };
      },
      sendPaymentLink: async () => {
        // Refuse when the user already has an active/trialing subscription —
        // the AI should then escalate to support instead of re-charging them.
        const active = await this.subscriptionRepo.findOne({
          where: [
            { user_id: userId, status: SubscriptionStatus.ACTIVE },
            { user_id: userId, status: SubscriptionStatus.TRIALING },
          ],
        });
        if (active) {
          return { ok: false as const, error: 'user already has active subscription' };
        }
        // Re-load the user — keyword guard or earlier writes may have mutated it.
        const fresh = await this.userRepo.findOne({ where: { id: userId } });
        if (!fresh) return { ok: false as const, error: 'user not found' };
        return this.sendPaymentLink(fresh, userMessageId, { requireFullIntake: false });
      },
      saveProfileField: async (input: { field: string; value: string }) => {
        return this.coachingService.saveProfileField(userId, input.field, input.value);
      },
    };

    // Tapbacks are iMessage-only and need the message_handle to target. Attach
    // the tool only when both hold, so the AI is never offered react_to_message
    // on SMS (where it would degrade to a "Liked 'x'" text) or without a target.
    if (channel === 'imessage' && messageHandle) {
      handlers.reactToMessage = async (input: { reaction: string }) => {
        const res = await this.messagingService.sendReaction(user.phone_number, messageHandle, input.reaction);
        return res.ok
          ? { ok: true as const, reaction: input.reaction }
          : { ok: false as const, error: res.error ?? 'reaction failed' };
      };
    }

    return handlers;
  }

  private async saveAndSend(user: User, sessionId: string, replyRaw: string) {
    // Deterministic voice cleanup (strip em-dashes etc.) before anything else,
    // so it applies to every AI reply — intake and coaching — regardless of how
    // the model phrased it.
    const reply = humanizeVoice(replyRaw);
    // The AI may split a reply into multiple texts with [pause] markers so it
    // lands as a natural burst (a thought, then another) instead of one block.
    const bubbles = splitBubbles(reply);
    // Store/cache the marker-free reply as ONE row (newline-joined) so [pause]
    // tokens never leak into history or the model's next-turn context.
    const stored = bubbles.length ? bubbles.join('\n') : reply.trim();

    const aiMsg = await this.messageRepo.save({
      user_id: user.id,
      session_id: sessionId,
      role: MessageRole.AI,
      message_type: MessageType.TEXT,
      content: stored,
    });

    await this.sessionCache.addMessage(user.id, 'assistant', stored);

    const toSend = bubbles.length ? bubbles : [reply.trim()].filter(Boolean);
    const delayMs = this.config.get<number>('MESSAGE_BUBBLE_DELAY_MS', 1200);
    for (let i = 0; i < toSend.length; i++) {
      await this.messagingService.send(user.phone_number, toSend[i]);
      // Small gap between bubbles so they arrive in order and feel typed, not
      // dumped. No delay after the last one.
      if (i < toSend.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    structuredLog(this.logger, 'log', {
      service: 'coaching',
      operation: 'reply_sent',
      userId: user.id,
      messageId: aiMsg.id,
      bubbles: toSend.length,
    });
  }
}
