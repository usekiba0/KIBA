import {
  Process,
  Processor,
  OnQueueFailed,
  OnQueueError,
  OnQueueActive,
  InjectQueue,
} from '@nestjs/bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import {
  User,
  OnboardingStage,
  OnboardingVariant,
  UserStatus,
  IntakeData,
} from '../data/entities/user.entity';
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
import { ReferralService } from '../data/referral.service';
import { planLinkFor } from '../onboarding/checkout-link';
import { normalizeReferralCode } from '../data/entities/referral-code.entity';
import { MessagingService } from './messaging.service';
import { SafetyService } from '../safety/safety.service';
import { AntiGhostService } from '../accountability/anti-ghost.service';
import { ProofService } from '../accountability/proof.service';
import { ScoreIntentService } from '../accountability/score-intent.service';
import { ScheduleService } from '../accountability/schedule.service';
import { ReminderRecurrence } from '../data/entities/scheduled-reminder.entity';
import { TodoService } from '../accountability/todo.service';
import { LedgerCorrectionService } from '../accountability/ledger-correction.service';
import { DailyTodoSource } from '../data/entities/daily-todo.entity';
import { StripeService } from '../onboarding/stripe.service';
import { structuredLog } from '../common/logger';
import { normalizePhoneNumber } from '../common/phone';
import {
  parseTimezoneOffset,
  parseCityOffset,
  parseCity,
  parseReminderTime,
} from './reminder-parser';
import { resolveReminderFireAt, humanizeFireDelta } from './reminder-time';
import { detectOnboardingVariant } from './onboarding-variant';
import { splitBubbles } from './bubbles';
import { referencesRecentPhoto, findRecentInboundImage } from './image-recall';
import { humanizeVoice, scrubIntakeVoice } from './voice';
import { sniffRemoteMediaType } from './media-type';
import { isTimeQuery, formatLocalClock12h } from './local-time';
import {
  detectKeyword,
  OPT_OUT_CONFIRMATION,
  OPT_IN_CONFIRMATION,
  HELP_REPLY,
  normalizeKeyword,
} from './opt-out';
import { parseTimeInPlace, resolvePlaceTimezone, formatTimeInZone, resolveOffsetMinutes } from './world-time';
import { isOffsetPlausibleForPhone } from './phone-timezone';
import { detectQuestionLoop, detectRepeatedChoiceLoop, isLoopCallout } from './question-loop';
import { humanizeTask } from '../ai/prompts/checkin.prompt';

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
  // Wall clock of the first inbound webhook in this batch (set by the debouncer).
  // Lets turn_latency report the wait the USER actually felt — debounce window
  // included — instead of only the slice after the buffer flushed. Optional so
  // older callers/tests that don't set it still type-check; falls back to
  // turnStart, which just makes debounceMs read 0.
  receivedAt?: number;
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

/**
 * Deterministic guard for the "KIBA keeps circling the same question" failure
 * (Bianca 2026-06-23). True when the inbound message explicitly calls out the
 * loop, OR KIBA's recent assistant turns show it re-asking the same topic. The
 * coaching prompt turns this into a hard "stop asking, lock it in" steer. Pure
 * read of in-memory history — no extra query.
 */
function isLoopingOnQuestion(dbMessages: Message[], inboundBody: string): boolean {
  if (isLoopCallout(inboundBody)) return true;
  const assistantTexts = dbMessages
    .filter((m) => m.role === MessageRole.AI && m.content)
    .map((m) => m.content);
  return detectQuestionLoop(assistantTexts) || detectRepeatedChoiceLoop(assistantTexts);
}

// Hard guard for billing-intent messages from COMPLETE users without an active
// subscription. Catches the case where migration 1779300000000 backfilled
// pre-existing users to 'complete' even though they never actually paid — the
// coaching LLM has no reliable way to handle a "send me the link" ask, so we
// short-circuit to the same sendPaymentLink path the intake AI uses.
// False positives are fine (extra link sent) — false negatives (LLM refuses
// a paying customer) burned us in production, so the regex stays broad.
const BILLING_INTENT_RE =
  /\b(subscri(be|ption|bed|bing)|stripe|checkout|billing|membership)\b|\b(payment|pay)\s+(link|me|the|for|to|via|by)|\b(sign\s*up|signup)\b/i;

// A pre-pay lead CLAIMING they already paid ("i paid", "just subscribed", "card
// went through", "bought the plan"). Payment is system-verified — only the Stripe
// webhook flips a user to COMPLETE — so a claim from someone still in intake is
// either false or a lagged webhook; either way the LLM must NOT be talked into
// acting like they're in (Karibi 2026-06-16: "i lied and it fell for it").
// Deliberately does NOT match the build-phase micro-commitment "i'm in" / "i'm
// ready" — that's the emotional yes before the close, not a payment claim.
export const PAYMENT_CLAIM_RE =
  /\bi\s+(?:already\s+|just\s+)?paid\b|\b(?:already|just)\s+paid\b|\bpaid\s+(?:you|already|it|for\s+(?:it|the|this))\b|\bpayment\s+(?:went|done|sent|made|through|cleared)|\b(?:just\s+)?(?:subscribed|purchased)\b|\bbought\s+(?:the\s+)?(?:plan|subscription|it)\b|\bcard\s+(?:went\s+through|charged|worked|cleared)|\b(?:charged|billed)\s+me\b|\b(?:i'?m|im)\s+(?:a\s+)?(?:member|subscriber)\b/i;

// An intake lead explicitly asking us to send the payment link. Used to deliver
// the link deterministically the moment they ask (once we have name+goal+tz),
// instead of letting the model loop re-asking build questions (Karibi 2026-06-05).
export const LINK_REQUEST_RE =
  /\b(send|resend|drop|share|gimme|give\s+me|text|where(?:'?s| is)?)\b[^.\n]{0,15}\blink\b|\bsend\s+it\b|\blink\s+(?:again|now|please|pls)\b|\b(?:don'?t|do\s+not|dont)\s+have\b[^.\n]{0,15}\blink\b/i;

/**
 * A lead handing us an affiliate / referral code ("my code is KIBA20", "redeem
 * BETA30", "promo: partner-x"). Capture group 1 is the raw token, canonicalized
 * by `normalizeReferralCode` before lookup.
 *
 * Deliberately loose — the guard that uses it only ACTS when the extracted token
 * resolves to a real code, and otherwise falls through to the intake AI in
 * silence. That asymmetry is the point: a chatty false positive ("the code is
 * broken") costs nothing, whereas replying "that code isn't valid" to someone who
 * never tried to redeem one is confusing and off-voice.
 */
export const REFERRAL_CODE_RE =
  /\b(?:referral|affiliate|promo(?:tion)?|invite|discount|coupon|redeem|code)\b[\s:=]*(?:(?:code|is|for|my|the|a)\b[\s:=]*)*([A-Za-z0-9][A-Za-z0-9-]{2,31})\b/i;

/**
 * The user is actively asking KIBA to explain itself / prove its value
 * ("how are you gonna help me?", "explain first", "what's the point?", "how
 * does this work?"). On these turns the force-link safety-net must NOT fire —
 * dropping a checkout link in response to a sincere question is the exact
 * money-hungry behavior the client flagged. KIBA answers first; we reset the
 * stall counter so the model gets a fresh runway to earn the close naturally.
 * An EXPLICIT link request (LINK_REQUEST_RE) still overrides this — if they ask
 * for the link, they get it.
 */
export const EXPLAIN_REQUEST_RE =
  /\bexplain\b|\bhow\s+(?:are|r|u|you|would|will|do|does|can|exactly)\b[^?\n]{0,30}\bhelp\b|\bhow\s+does\s+(?:this|it)\b|\bwhat\s+(?:do|does|are|is|even)\b|\bwhat'?s\s+the\s+point\b|\bwhy\s+(?:should|would)\b|\bis\s+(?:this|it)\s+(?:worth|legit|real|gonna)\b|\bwdym\b/i;

// Strong commitment phrases — the lead saying YES to the close challenge.
const COMMITMENT_PHRASE_RE =
  /\b(i'?m\s+in|im\s+in|i\s+am\s+in|count\s+me\s+in|sign\s+me\s+up|let'?s\s+(do\s+it|go|get\s+it|start|run\s+it|lock)|lets\s+(do\s+it|go|get\s+it|start|run\s+it|lock)|i'?m\s+(serious|ready|down)|im\s+(serious|ready|down)|lock\s+(me\s+)?in|locked\s+in)\b/i;
// A bare affirmative as the WHOLE message ("yeah", "bet", "let's go") — a yes to
// whatever was just asked. Only treated as commitment when the prior KIBA message
// was the close/challenge (see lastIntakeMsgWasClose), so a "yeah" answering a
// diagnostic question can't fire the link.
const BARE_YES_RE =
  /^(?:hell\s+)?(?:ye(?:s|a|ah|p|h)|yup|ya|sure|bet|aight|ok(?:ay)?|word|fr|deadass|100|absolutely|for\s+sure|do\s+it|done)[\s!.]*$/i;
const CLOSE_CUE_RE =
  /\byou\s+in\b|\bserious\b|\bfollow\s+through\b|\b\d+\s+days?\b|\block\s+(?:it|in|this|you)\b|\bor\s+nah\b|\bready\b|\bcommit\b|\byou\s+down\b/i;

/**
 * The framing line that ALWAYS precedes the checkout URL (Karibi 2026-06-26: the
 * link kept landing first and the "free trial" framing came after — backwards).
 * Sent as the `leadIn` to sendPaymentLink so the order is guaranteed: framing →
 * link. Deliberately a challenge, NOT a subscription pitch — no price, no "free
 * trial", no "cancel anytime". The price conversation happens on day 7.
 */
const CLOSE_LEAD_IN = 'bet. tap this and we start tonight:';

/** The lead is committing to start (a yes to the close). */
export function isIntakeCommitment(text: string): boolean {
  const t = (text ?? '').trim();
  if (COMMITMENT_PHRASE_RE.test(t)) return true;
  return BARE_YES_RE.test(t.replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Intake turns with the full emotional build captured but no link sent before
 * the system force-sends one. Gives the AI the turn it completed the build plus
 * one grace turn to close naturally; if it still hasn't, the safety-net fires.
 */
export const FORCE_LINK_AFTER_STALLED_TURNS = 2;

/**
 * How many recent messages of raw conversation the coaching AI carries.
 * LAYER 1 of persistent memory: this fetch is scoped to user_id, NOT the current
 * session, so a 4-hour idle reset or a mid-burst session boundary no longer wipes
 * what was just said. KIBA sees the last N turns across days — "yesterday you said
 * you'd train the bot at 8:30" — instead of waking up a stranger every morning.
 * Bounded so the prompt stays cheap; older context is carried by the relationship
 * digest (Layer 2), not raw history. Set above the session message-count threshold
 * (RC-3 hardening, 2026-06-29) so an active back-and-forth never loses raw context
 * to a session boundary before the Layer-2 digest has absorbed it.
 */
export const COACHING_HISTORY_LIMIT = 60;

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
    private readonly ledgerCorrectionService: LedgerCorrectionService,
    private readonly correctionService: CorrectionService,
    private readonly stripeService: StripeService,
    private readonly referralService: ReferralService,
    @InjectQueue('accountability') private readonly accountabilityQueue: Queue,
  ) {}

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`[Queue] Job ${job.id} started — ${job.name}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `[Queue] Job ${job.id} FAILED after ${job.attemptsMade} attempts: ${err.message}\n${err.stack}`,
    );
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
    const { body, twilioSid, numMedia: inboundNumMedia, mediaUrls, mediaContentTypes, channel } = data;
    // Mutable: a shared LINK arrives as an unidentifiable attachment and gets
    // demoted to a plain text turn below, once byte-sniffing has had its say.
    let numMedia = inboundNumMedia;
    // Canonicalize to E.164 so a returning user always resolves to their existing
    // row. Twilio/web are already E.164, but SendBlue can hand us looser formats
    // ("7135551234", "+1 (713)...") — without this the lookup below misses and a
    // fresh INTAKE lead is created, wiping the user's name/state (the "keeps
    // resetting" bug). See common/phone.ts.
    const from = normalizePhoneNumber(data.from);
    const messageHandle = data.messageHandle ?? null;
    // Latency instrumentation: time from processing-start (debounce already
    // elapsed) to the reply being sent, plus the model-generation slice, so we can
    // see where the controllable latency actually goes before tuning it (2026-06-29).
    const turnStart = Date.now();
    // ...and the full wait the user felt, measured from the first inbound webhook.
    // `debounceMs` is the buffer window (a config knob), `genMs` the model call
    // (model-bound), `sendMs` the outbound bubbles (bubble delay × n). Splitting
    // them is the whole point: "8-10 seconds" is not actionable until we know
    // which of the three owns it (2026-07-20).
    const receivedAt = data.receivedAt ?? turnStart;
    const debounceMs = turnStart - receivedAt;
    this.logger.log(`[Handler] Processing message from ${from} via ${channel}`);

    // Carrier shortcodes (e.g. +195686 from Citi) get misrouted to our SendBlue
    // number. They're not humans — silently drop before we create a lead row
    // and burn an LLM call replying to spam. Real E.164 numbers are ≥ 8 digits
    // after the `+`; shortcodes are 4–7.
    const digitsOnly = from.replace(/\D/g, '');
    if (digitsOnly.length < 8) {
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'shortcode_dropped',
        from,
        channel,
        bodyPreview: body.slice(0, 80),
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
      user = await this.userRepo.save(
        this.userRepo.create({
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
        }),
      );
      this.logger.log(`[Onboarding] Created lead ${user.id} for ${from} (variant: ${variant})`);
    }

    // Update last active
    await this.userRepo.update(user.id, { last_active_at: new Date() });

    // ── Compliance keywords (STOP / START) ───────────────────────────────────
    // Runs before EVERYTHING: dedup, crisis detection, intake, coaching. Consent
    // is not a conversation topic the model gets an opinion on — and the coaching
    // prompt is explicitly built to talk people out of quitting, which is exactly
    // the wrong instinct here.
    if (await this.handleComplianceKeyword(user, body, from)) return;

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

    // Save inbound message with real session_id. The unique twilio_sid /
    // provider_message_id columns make this the ATOMIC, cross-instance dedup
    // point: a re-delivered webhook (SMS SID or iMessage message_handle already
    // seen) fails the insert with 23505, and we abort before generating a second
    // reply. Belt-and-suspenders over the debouncer's in-memory guard, which
    // can't dedupe across instances (Karibi 2026-07-08 — duplicate replies).
    let inboundMsg: Message;
    try {
      inboundMsg = await this.messageRepo.save({
        user_id: user.id,
        session_id: boundary.sessionId,
        role: MessageRole.USER,
        message_type: numMedia > 0 ? MessageType.MMS : MessageType.TEXT,
        content: body,
        media_url: mediaUrls[0] ?? null,
        media_content_type: mediaContentTypes[0] ?? null,
        twilio_sid: twilioSid,
        provider_message_id: messageHandle,
      });
    } catch (err) {
      if (err instanceof QueryFailedError && (err as unknown as { code?: string }).code === '23505') {
        structuredLog(this.logger, 'log', {
          service: 'messaging',
          operation: 'duplicate_inbound_suppressed',
          from,
          channel,
          twilioSid,
          messageHandle,
        });
        return;
      }
      throw err;
    }

    // Phase 1: crisis check + DB fetches in parallel (crisis never waits for DB)
    // LAYER 1 — cross-session memory: history is scoped to the USER, not the
    // current session, and fetched newest-first then reversed to chronological.
    // A session reset (4h idle or message-count) no longer hands the model an
    // empty window; it keeps seeing the last COACHING_HISTORY_LIMIT real turns.
    const [crisisResult, dbMessages, latestSummary, seededTodos] = await Promise.all([
      this.crisisService.classify(body),
      this.messageRepo
        .find({
          where: { user_id: user.id },
          order: { created_at: 'DESC' },
          take: COACHING_HISTORY_LIMIT,
        })
        .then((rows) => rows.reverse()),
      boundary.isNewSession
        ? this.summaryRepo.findOne({ where: { user_id: user.id }, order: { created_at: 'DESC' } })
        : Promise.resolve(null),
      // Seed today's plan todos HERE so the once-a-day seeding write overlaps the
      // crisis-classify LLM call instead of blocking the reply on its own await
      // later (latency, 2026-06-29). Idempotent — a cheap read on every turn after
      // the first of the day; reused by both the vision and text reply paths below.
      this.todoService.ensureSeededForToday(user.id).catch(() => []),
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
    await this.antiGhostService
      .onUserResponse(userIdForAntiGhost)
      .catch((err) =>
        this.logger.warn(
          `onUserResponse failed for ${userIdForAntiGhost}: ${(err as Error).message}`,
        ),
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
    if (
      numMedia > 0 &&
      firstMediaUrl &&
      (!resolvedMediaCt || resolvedMediaCt === 'application/octet-stream')
    ) {
      const sniffed = await sniffRemoteMediaType(firstMediaUrl);
      if (sniffed) {
        structuredLog(this.logger, 'log', {
          service: 'messaging',
          operation: 'media_type_sniffed',
          userId: user.id,
          channel,
          contentType: sniffed,
        });
        resolvedMediaCt = sniffed;
      }
    }
    // A shared LINK (whop.com, YouTube, an article) reaches us as an iMessage
    // link-preview attachment, NOT a photo: the URL has no media extension so
    // guessContentType yields application/octet-stream, and the preview payload
    // matches no magic number so the sniff above returns null too. It therefore
    // fell into the unsupported-media branch and got answered "i can't read that
    // file type. send a jpeg, png, or screenshot." — nonsense for a link — while
    // the message text (which carries the URL) was discarded without ever
    // reaching the coach. When the attachment is unidentifiable but the message
    // has text, drop the attachment and run the turn as plain text so KIBA
    // actually responds to what they sent. (Karibi 2026-07-21)
    if (
      numMedia > 0 &&
      (!resolvedMediaCt || resolvedMediaCt === 'application/octet-stream') &&
      (body ?? '').trim().length > 0
    ) {
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'unidentified_media_demoted_to_text',
        userId: user.id,
        channel,
        contentType: resolvedMediaCt || 'none',
      });
      numMedia = 0;
      resolvedMediaCt = '';
    }
    const inboundIsImage = numMedia > 0 && resolvedMediaCt.startsWith('image/');

    // "what time is it in <place>" — compute deterministically from the runtime's
    // DST-aware tz database. The model hallucinates other-city times ("it's 3:31pm
    // in germany" when it's 5:03pm), so resolve the place to an IANA zone and
    // answer for real. Unknown place → fall through to the AI.
    if (numMedia === 0) {
      const place = parseTimeInPlace(body);
      if (place) {
        const resolved = resolvePlaceTimezone(place);
        const clock = resolved ? formatTimeInZone(new Date(), resolved.zone) : null;
        if (resolved && clock) {
          structuredLog(this.logger, 'log', {
            service: 'messaging',
            operation: 'time_in_place_answered',
            userId: user.id,
            channel,
            zone: resolved.zone,
          });
          await this.saveAndSend(
            user,
            boundary.sessionId,
            `it's ${clock} in ${resolved.label} right now.`,
          );
          return;
        }
      }
    }

    // "what time is it" — answer deterministically, for EVERY stage (intake and
    // coaching both route through here, and the recurring "wrong time" report was
    // an intake-stage user). The model can't be trusted to read the wall clock
    // even when handed a fresh UTC snapshot + offset — it estimates and lands
    // minutes off. Compute it here at send time so it's always correct. Gate on
    // no media so a photo + "what time is it" caption still routes to vision, and
    // on a known offset so we never guess a timezone — without one, fall through
    // and the AI asks the user for their city.
    if (numMedia === 0 && isTimeQuery(body)) {
      // DST-correct live offset from the IANA zone when we have one, else the
      // frozen integer. null = no timezone known yet.
      const clockOffset = resolveOffsetMinutes(user.iana_timezone, user.utc_offset_minutes);
      if (clockOffset != null) {
        const clock = formatLocalClock12h(new Date(), clockOffset);
        structuredLog(this.logger, 'log', {
          service: 'messaging',
          operation: 'time_query_answered',
          userId: user.id,
          channel,
        });
        await this.saveAndSend(user, boundary.sessionId, `it's ${clock} your time.`);
        return;
      }
      // No known timezone (RC-2). NEVER let the model answer — it fabricates
      // ("it's 3:13pm" when it's 10:05pm). Ask for their city deterministically;
      // the city->offset parser below captures it and the next "what time is it"
      // is answered exactly. Covers intake and coaching alike.
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'time_query_no_offset_ask_city',
        userId: user.id,
        channel,
      });
      await this.saveAndSend(
        user,
        boundary.sessionId,
        "what city are you in? i'll lock it in so i always know your time.",
      );
      return;
    }

    // === Stage routing: SMS-first onboarding ===
    // Pre-payment users go through the intake AI flow, not the coaching flow.
    // Correction triggers, score queries, reminders, etc. are all coach-mode
    // features and are gated behind onboarding_stage === COMPLETE.

    // SELF-HEAL webhook lag: a user who already has an entitled sub
    // (ACTIVE/TRIALING) but is still not COMPLETE has paid — the
    // checkout.session.completed webhook lagged or failed. If we route them to
    // intake they get re-pitched the link they already bought ("trial's free,
    // tap that link"). Promote them to COMPLETE NOW so they fall through to
    // coaching. The webhook still flips the stage on its own; this just closes
    // the window where an inbound message beats it.
    if (user.onboarding_stage !== OnboardingStage.COMPLETE) {
      const entitledSub = await this.subscriptionRepo.findOne({
        where: [
          { user_id: user.id, status: SubscriptionStatus.ACTIVE },
          { user_id: user.id, status: SubscriptionStatus.TRIALING },
        ],
      });

      // A local entitled sub means the webhook already ran but the stage flip
      // lagged. If there's NO local sub yet but they were sent a checkout link,
      // the webhook itself may simply not have landed — verify with Stripe
      // directly off the stored checkout session. Without this, a user who just
      // paid (KIBA "knows" via Stripe) keeps getting re-pitched the link in the
      // intake PAYWALL phase ("tap the link and confirm you're in") until the
      // webhook catches up — the exact FOMO-to-a-paid-user bug (Karibi 2026-06-30).
      let entitled = !!entitledSub;
      let healSource: 'local_sub' | 'stripe_session' = 'local_sub';
      if (!entitled && user.payment_link_sent_at && user.stripe_checkout_session_id) {
        try {
          const session = await this.stripeService.getCheckoutSession(
            user.stripe_checkout_session_id,
          );
          // 'complete' = checkout finished (subscription + trial created). For a
          // trial there's no immediate charge, so payment_status is
          // 'no_payment_required' — gate on session status, not payment_status.
          if (session.status === 'complete') {
            entitled = true;
            healSource = 'stripe_session';
          }
        } catch (err) {
          // Stripe hiccup must never block the live reply — fall through to the
          // normal intake path (worst case: the webhook heals it momentarily).
          this.logger.warn(
            `[StageSelfHeal] Stripe session lookup failed for ${user.id}: ${(err as Error).message}`,
          );
        }
      }

      if (entitled) {
        this.logger.warn(
          `[StageSelfHeal] paid (${healSource}) but stage=${user.onboarding_stage} for ${user.id} — promoting to COMPLETE`,
        );
        user.onboarding_stage = OnboardingStage.COMPLETE;
        await this.userRepo.update(user.id, { onboarding_stage: OnboardingStage.COMPLETE });
        structuredLog(this.logger, 'log', {
          service: 'messaging',
          operation: 'stage_self_heal_to_complete',
          userId: user.id,
          source: healSource,
        });
      }
    }

    if (user.onboarding_stage !== OnboardingStage.COMPLETE) {
      // AFFILIATE / REFERRAL CODE (deterministic — Karibi 2026-07-20).
      // Runs before the payment-claim backstop and before the intake AI: the
      // model has no tool for this and would either ignore the code or, worse,
      // promise a free month it can't actually grant. Redemption is a DB fact,
      // so it's settled here.
      const codeMatch = body.match(REFERRAL_CODE_RE);
      if (codeMatch) {
        const redeemed = await this.referralService.redeem(user.id, codeMatch[1]);
        if (redeemed.ok) {
          // Re-read: redeem() wrote referral_trial_days on the row we're holding
          // a stale copy of, and sendPaymentLink reads it for the trial length.
          const liveUser = (await this.userRepo.findOne({ where: { id: user.id } })) ?? user;
          const days = redeemed.trialDays;
          // If they're already holding a link, it was minted with the OLD trial
          // length — replace it rather than let them check out on the short one.
          const hadLink = !!liveUser.payment_link_sent_at;
          if (hadLink) {
            const resent = await this.sendPaymentLink(liveUser, inboundMsg.id, {
              requireFullIntake: true,
              bypassRateLimit: true,
              leadIn: `code works — that's ${days} days free instead. here's your fresh link 👇`,
            });
            // Intake not finished yet (no goal/timezone), so there's nothing to
            // re-link. The code is still banked on their row and applies when the
            // link does go out — just acknowledge it.
            if (!resent.ok) {
              await this.saveAndSend(
                user,
                boundary.sessionId,
                `code works — locked in ${days} days free for you. let's finish getting you set up.`,
              );
            }
          } else {
            await this.saveAndSend(
              user,
              boundary.sessionId,
              `code works — that's ${days} days free once we're done. let's keep going.`,
            );
          }
          structuredLog(this.logger, 'log', {
            service: 'messaging',
            operation: 'referral_code_redeemed',
            userId: user.id,
            code: redeemed.code,
            owner: redeemed.owner,
            trialDays: days,
            relinked: hadLink,
          });
          return;
        }
        // 'unknown' is the common case for a false-positive match on ordinary
        // chat ("the code is broken"), so it falls through to the intake AI in
        // silence — see REFERRAL_CODE_RE. The other reasons mean they really did
        // try to redeem something, so answer them.
        if (redeemed.reason !== 'unknown') {
          const line =
            redeemed.reason === 'already_redeemed'
              ? "you've already got a code on your account — can't stack two."
              : redeemed.reason === 'exhausted'
                ? "that code's maxed out, all the spots are claimed. you're still good to keep going though."
                : "that code's not active anymore. you're still good to keep going though.";
          await this.saveAndSend(user, boundary.sessionId, line);
          structuredLog(this.logger, 'log', {
            service: 'messaging',
            operation: 'referral_code_refused',
            userId: user.id,
            reason: redeemed.reason,
          });
          return;
        }
        structuredLog(this.logger, 'log', {
          service: 'messaging',
          operation: 'referral_code_no_match',
          userId: user.id,
          token: normalizeReferralCode(codeMatch[1]),
        });
      }

      // PAYMENT-CLAIM BACKSTOP (deterministic — don't trust the LLM here).
      // A lead who's been sent the link but still isn't COMPLETE telling us they
      // "already paid" is either lying or hit a webhook lag. Never let the model
      // congratulate/activate them on their word. Scoped to payment_link_sent so a
      // stray "paid" during the build can't derail it before there's a link.
      if (user.payment_link_sent_at && PAYMENT_CLAIM_RE.test(lowerBody)) {
        const activeSub = await this.subscriptionRepo.findOne({
          where: [
            { user_id: user.id, status: SubscriptionStatus.ACTIVE },
            { user_id: user.id, status: SubscriptionStatus.TRIALING },
          ],
        });
        if (activeSub) {
          // Rare: payment cleared but the stage flip lagged/failed. Do NOT send
          // another checkout link (double-charge risk) or restart the build —
          // reassure and let the webhook promote them. Logged as it signals a bug.
          this.logger.warn(
            `[IntakePaymentClaim] active sub but stage=${user.onboarding_stage} for ${user.id}`,
          );
          await this.saveAndSend(
            user,
            boundary.sessionId,
            "got it — your payment's processing on my end. give it a sec and i'll have your plan ready 🔥",
          );
        } else {
          // Deterministic decision (distrust the claim) but LLM-varied wording so a
          // repeat claimant doesn't get the identical canned line. Falls back to a
          // static string if the generation fails/empties.
          const generated = await this.coachingService.generatePaymentNotActiveReply({
            name: user.name,
            goal: user.intake_data?.goal_description ?? null,
            cussingOk: user.intake_data?.cussing_ok ?? false,
            trialDays: this.config.get<number>('STRIPE_TRIAL_DAYS', 3),
            priceDisplay: this.config.get<string>('STRIPE_PRICE_DISPLAY', '$9.99/month'),
          });
          await this.saveAndSend(
            user,
            boundary.sessionId,
            generated ??
              "hmm not seeing it active on my end yet 🤔 tap the link i sent and it kicks in the second it goes through. lmk if the link's giving you trouble.",
          );
        }
        structuredLog(this.logger, 'log', {
          service: 'messaging',
          operation: 'intake_payment_claim_backstop',
          userId: user.id,
          hasActiveSub: !!activeSub,
        });
        return;
      }

      // RESUME, DON'T RESTART. The 4h session boundary opens a fresh empty session
      // whenever a lead comes back hours/days later (or just texts "yo"). Load the
      // lead's recent messages ACROSS sessions so the intake build picks up exactly
      // where it left off and everything they told us before paying stays in
      // context, instead of falling back to the cold opener ("what's your name
      // tho?") and wiping the whole pre-pay conversation (Karibi 2026-06-16).
      // (Coaching does the same cross-session fetch above — see COACHING_HISTORY_LIMIT.)
      const intakeHistory = await this.messageRepo.find({
        where: { user_id: user.id },
        order: { created_at: 'DESC' },
        take: 20,
      });
      intakeHistory.reverse();
      const genStart = Date.now();
      const reply = await this.handleIntakeMessage(
        user,
        intakeHistory,
        body,
        boundary.sessionId,
        inboundMsg.id,
        inboundIsImage ? (firstMediaUrl ?? undefined) : undefined,
        inboundIsImage ? resolvedMediaCt : undefined,
      );
      const genMs = Date.now() - genStart;
      const sendStart = Date.now();
      await this.saveAndSend(user, boundary.sessionId, reply);
      structuredLog(this.logger, 'log', {
        service: 'coaching', operation: 'turn_latency', userId: user.id,
        path: 'intake', debounceMs, genMs, sendMs: Date.now() - sendStart,
        totalMs: Date.now() - turnStart, e2eMs: Date.now() - receivedAt,
      });
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
          'send `#kibi` or `#kiba` followed by what was wrong so i can flag it for review.',
        );
        return;
      }
      this.correctionService
        .capture({ userId: user.id, sessionId: boundary.sessionId, correctionText })
        .catch((err) => this.logger.error(`Correction capture failed: ${(err as Error).message}`));
      await this.saveAndSend(
        user,
        boundary.sessionId,
        'got it — flagged for review. appreciate you keeping me honest.',
      );
      return;
    }

    // === Entitlement gate (COMPLETE users) ===
    // Routing trusts onboarding_stage, but migration 1779300000000 backfilled
    // legacy users to COMPLETE without ever paying, and churned users keep COMPLETE
    // after cancellation. Neither is entitled to free coaching. The billing-intent
    // guard below only catches billing *asks* ("send me the link"); this closes the
    // gap for every OTHER message so a never-paid/churned user can't just chat their
    // way into unlimited coaching. Entitled = any non-cancelled sub
    // (ACTIVE/TRIALING/PAST_DUE) — a paying customer in dunning grace still gets
    // coached; only "no sub at all" or a cancelled-only sub gets diverted.
    const entitledSub = await this.subscriptionRepo.findOne({
      where: [
        { user_id: user.id, status: SubscriptionStatus.ACTIVE },
        { user_id: user.id, status: SubscriptionStatus.TRIALING },
        { user_id: user.id, status: SubscriptionStatus.PAST_DUE },
      ],
    });
    if (!entitledSub) {
      const linkResult = await this.sendPaymentLink(user, inboundMsg.id, {
        requireFullIntake: false,
        leadIn:
          "looks like your coaching isn't active right now. here's the link to start it back up:",
      });
      if (!linkResult.ok) {
        if (linkResult.reason === 'rate_limited') {
          // Link already sent moments ago — reassure, never alarm.
          await this.saveAndSend(
            user,
            boundary.sessionId,
            'i just sent you that link a sec ago. tap it above to start back up 👆',
          );
        } else {
          this.logger.warn(
            `[EntitlementGate] sendPaymentLink failed for ${user.id}: ${linkResult.error}`,
          );
          await this.saveAndSend(
            user,
            boundary.sessionId,
            "i'm having trouble generating that — an admin will reach out shortly.",
          );
        }
      }
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'entitlement_gate_diverted',
        userId: user.id,
        ok: linkResult.ok,
        reason: linkResult.ok ? undefined : linkResult.reason,
      });
      return;
    }

    // Billing-intent guard: a COMPLETE user whose only sub is PAST_DUE (made it
    // past the entitlement gate on dunning grace) asking about billing gets a
    // fresh checkout link instead of the LLM. ACTIVE/TRIALING subscribers fall
    // through so the LLM can use the send_payment_link tool with full context (or
    // refuse gracefully when the tool reports they're already in). Reuses
    // entitledSub from the gate above — no second query.
    if (BILLING_INTENT_RE.test(lowerBody)) {
      const isActiveOrTrial =
        entitledSub.status === SubscriptionStatus.ACTIVE ||
        entitledSub.status === SubscriptionStatus.TRIALING;
      if (!isActiveOrTrial) {
        const linkResult = await this.sendPaymentLink(user, inboundMsg.id, {
          requireFullIntake: false,
          leadIn: "got you. here's the link to lock this in:",
        });
        if (!linkResult.ok) {
          if (linkResult.reason === 'rate_limited') {
            await this.saveAndSend(
              user,
              boundary.sessionId,
              'already sent you that link a sec ago. tap it above 👆',
            );
          } else {
            this.logger.warn(
              `[BillingGuard] sendPaymentLink failed for ${user.id}: ${linkResult.error}`,
            );
            await this.saveAndSend(
              user,
              boundary.sessionId,
              "i'm having trouble generating that — an admin will reach out shortly.",
            );
          }
        }
        structuredLog(this.logger, 'log', {
          service: 'messaging',
          operation: 'billing_intent_guard',
          userId: user.id,
          ok: linkResult.ok,
          reason: linkResult.ok ? undefined : linkResult.reason,
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

    // Queue session summarisation + relationship-memory merge if a session just
    // closed (non-blocking). Both target closedSessionId — the session that was
    // just ended — NOT boundary.sessionId, which is the fresh empty one. The
    // memory merge is what lets KIBA remember this person next time (Layer 2);
    // it only overwrites stored memory on success, so a failure here never wipes
    // what KIBA already knew.
    if (boundary.shouldSummarise && boundary.closedSessionId) {
      const closedSessionId = boundary.closedSessionId;
      this.summarisationService
        .summariseSession(user.id, closedSessionId, SummaryTrigger.SESSION_EXPIRY)
        .catch((err) => this.logger.error(`Summarisation error: ${err}`));
      this.summarisationService
        .updateRelationshipMemory(user.id, closedSessionId)
        .catch((err) => this.logger.error(`Relationship memory update error: ${err}`));
    }

    // Image = proof submission — look up today's pending task
    if (numMedia > 0) {
      const mediaUrl = firstMediaUrl;
      const mediaCt = resolvedMediaCt;
      const isImage = inboundIsImage;
      const isAudio = mediaCt.startsWith('audio/');
      const isVideo = mediaCt.startsWith('video/');
      // A GIF is reaction media (Giphy/Tenor/meme), not a photo of real work.
      // Anthropic vision only reads one frozen frame of it, so treating it like
      // a proof photo both (a) auto-logs a meme as completed-task proof — proof
      // validation fails OPEN, so a reaction would award a score — and (b) makes
      // the model describe a single ambiguous frame, then contradict itself
      // ("why you looking at me like that" → "nah what gif?"). Branch it out of
      // proof, and ground the reply so it reacts coherently. (Karibi 2026-06-30)
      const isGif = mediaCt === 'image/gif';

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
          service: 'messaging',
          operation: 'unsupported_media_dropped',
          userId: user.id,
          contentType: mediaCt,
          channel,
        });
        await this.saveAndSend(user, boundary.sessionId, reply);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const task = await this.dailyTaskRepo.findOne({
        where: { user_id: user.id, scheduled_date: today, status: TaskStatus.PENDING },
      });

      // Validate proof leniently: accept unless the model is CONFIDENT (>=0.8)
      // the photo doesn't match the task. Uncertain / infra failure fails OPEN
      // (accept) — wrongly rejecting a real user's proof is far worse than letting
      // a borderline one through.
      let proofMatch: 'accept' | 'mismatch' = 'accept';
      if (task && mediaUrl && !isGif) {
        const verdict = await this.visionService.validateProofFromUrl(task.task_description, mediaUrl, mediaCt);
        if (!verdict.is_valid && verdict.confidence >= 0.8) proofMatch = 'mismatch';
      }

      if (task && proofMatch === 'accept' && !isGif) {
        await this.proofService.submitProof({
          userId: user.id,
          taskId: task.id,
          type: ProofType.PHOTO,
          mediaUrl: mediaUrl ?? undefined,
          content: body !== '[image]' ? body : undefined,
        });
        await this.saveAndSend(
          user,
          boundary.sessionId,
          `proof in ✓ "${humanizeTask(task.task_description)}" logged. score updated 💪`,
        );
        return;
      }

      // Either there's NO pending task, OR the photo confidently isn't the proof.
      // Do NOT fire a canned "that doesn't look like X" rejection — it repeats
      // verbatim (reads like a bot) and ignores what the user actually sent (a
      // question, feedback, an unrelated photo, like a logo they want an opinion
      // on). React to what's ACTUALLY in the photo via the vision coaching reply;
      // KIBA has today's task in its todo context and can nudge about real proof
      // naturally if it fits.
      if (task && proofMatch === 'mismatch') {
        structuredLog(this.logger, 'log', {
          service: 'accountability',
          operation: 'proof_unmatched_routed_to_vision',
          userId: user.id,
          taskId: task.id,
        });
      }
      const visionTodos = seededTodos; // seeded in Phase 1 (overlapped the crisis call)
      const visionPatterns = {
        ...derivePatternSignals(user),
        loopingOnQuestion: isLoopingOnQuestion(dbMessages, body),
      };
      const caption = body !== '[image]' ? body : '';
      // Ground the model that a reaction GIF arrived so it reacts naturally and
      // never denies seeing it / asks them to resend (it only gets one frame).
      const incomingText = isGif
        ? [caption, '(the user sent a reaction GIF — react to it like a text from a friend; never say you can\'t see it or ask them to send it again)']
            .filter(Boolean)
            .join(' ')
        : caption;
      const genStart = Date.now();
      const { reply, tokenCount } = await this.coachingService.generateReply(
        user,
        dbMessages,
        incomingText,
        latestSummary?.summary,
        mediaUrls.slice(0, 4),
        mediaContentTypes.slice(0, 4),
        this.buildToolHandlers(user, boundary.sessionId, inboundMsg.id, channel, messageHandle),
        visionTodos.map((t) => ({ id: t.id, content: t.content, status: t.status })),
        visionPatterns,
      );
      const genMs = Date.now() - genStart;
      // Token-count bookkeeping is nobody's critical path — start it, but let the
      // user's first bubble go out ahead of the round-trip instead of behind it.
      const tokenWrite = this.messageRepo.update(inboundMsg.id, { token_count: tokenCount });
      const sendStart = Date.now();
      await this.saveAndSend(user, boundary.sessionId, reply);
      await tokenWrite;
      structuredLog(this.logger, 'log', {
        service: 'coaching', operation: 'turn_latency', userId: user.id,
        path: 'vision', debounceMs, genMs, sendMs: Date.now() - sendStart,
        totalMs: Date.now() - turnStart, e2eMs: Date.now() - receivedAt, tokenCount,
      });
      return;
    }

    // Today's todos were seeded in Phase 1 (parallel with the crisis call) so the
    // reply isn't blocked on the per-day seeding write. Pass the list into the
    // coaching reply so the AI stops asking "what's the workout?" when the answer's
    // already in the action plan.
    const todos = seededTodos;

    const patterns = {
      ...derivePatternSignals(user),
      loopingOnQuestion: isLoopingOnQuestion(dbMessages, body),
    };

    // Photo recall: the model only sees images on the CURRENT turn, so a
    // text-only follow-up about a photo the user sent a message ago ("you see
    // the pic i sent?") otherwise gets "i don't see a photo in this thread."
    // When the text refers to a photo, re-attach the most recent inbound image
    // from the last 30 min so KIBA can actually look at it. (Karibi 2026-07-08)
    let recallUrls: string[] | undefined;
    let recallCts: string[] | undefined;
    if (referencesRecentPhoto(body)) {
      const recalled = findRecentInboundImage(dbMessages, Date.now(), 30 * 60_000);
      if (recalled) {
        recallUrls = [recalled.url];
        recallCts = [recalled.contentType];
        structuredLog(this.logger, 'log', {
          service: 'messaging',
          operation: 'image_recall_reattached',
          userId: user.id,
        });
      }
    }

    // Phase 2: coaching reply (DB context already fetched in Phase 1)
    const genStart = Date.now();
    const { reply, tokenCount } = await this.coachingService.generateReply(
      user,
      dbMessages,
      body,
      latestSummary?.summary,
      recallUrls,
      recallCts,
      this.buildToolHandlers(user, boundary.sessionId, inboundMsg.id, channel, messageHandle),
      todos.map((t) => ({ id: t.id, content: t.content, status: t.status })),
      patterns,
    );
    const genMs = Date.now() - genStart;
    // See the vision path: bookkeeping write runs alongside the send, not in
    // front of it.
    const tokenWrite = this.messageRepo.update(inboundMsg.id, { token_count: tokenCount });
    const sendStart = Date.now();
    await this.saveAndSend(user, boundary.sessionId, reply);
    await tokenWrite;
    structuredLog(this.logger, 'log', {
      service: 'coaching', operation: 'turn_latency', userId: user.id,
      path: 'text', debounceMs, genMs, sendMs: Date.now() - sendStart,
      totalMs: Date.now() - turnStart, e2eMs: Date.now() - receivedAt, tokenCount,
    });
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
        // Persist the city NAME too (not just the derived offset) so the coaching
        // prompt can use it and catch contradictions ("since when are you in X?").
        const cityName = parseCity(body);
        // Capture the IANA zone too (DST-correct year-round) when the city is one
        // world-time knows; falls back to the frozen offset otherwise. Karibi 2026-06-30.
        const cityZone = resolvePlaceTimezone(cityName)?.zone ?? null;
        const intakeWithCity: IntakeData = { ...(user.intake_data ?? {}) };
        if (cityName && !intakeWithCity.city) intakeWithCity.city = cityName;
        await this.userRepo.update(user.id, {
          utc_offset_minutes: cityOffset,
          ...(cityZone ? { iana_timezone: cityZone } : {}),
          intake_data: intakeWithCity,
        });
        user = {
          ...user,
          utc_offset_minutes: cityOffset,
          ...(cityZone ? { iana_timezone: cityZone } : {}),
          intake_data: intakeWithCity,
        };
        structuredLog(this.logger, 'log', {
          service: 'onboarding',
          operation: 'tz_captured_from_city',
          userId: user.id,
          utcOffsetMinutes: cityOffset,
          ianaTimezone: cityZone ?? undefined,
          city: cityName ?? undefined,
        });
        this.flagOffsetPhoneMismatch(user.id, user.phone_number, cityOffset, 'city');
      }
    }
    if (!user.checkin_time) {
      const checkinTime = parseReminderTime(body);
      if (checkinTime) {
        await this.userRepo.update(user.id, { checkin_time: checkinTime });
        user = { ...user, checkin_time: checkinTime };
        structuredLog(this.logger, 'log', {
          service: 'onboarding',
          operation: 'checkin_captured_from_text',
          userId: user.id,
          checkinTime,
        });
      }
    }

    // Build the intake context snapshot used by the prompt.
    const ctx = {
      name: user.name,
      intakeData: (user.intake_data ?? {}) as IntakeData,
      utcOffsetMinutes: resolveOffsetMinutes(user.iana_timezone, user.utc_offset_minutes),
      nowUtc: new Date(),
      paymentLinkSent: !!user.payment_link_sent_at,
      sampleCoachingGiven: !!user.sample_coaching_given,
      variant: user.onboarding_variant ?? OnboardingVariant.STANDARD,
      // Quote trial length + price from config so the AI's copy can never drift
      // from what Stripe actually bills. Defaults match the agreed offer (3d / $9.99).
      trialDays: this.config.get<number>('STRIPE_TRIAL_DAYS', 3),
      priceDisplay: this.config.get<string>('STRIPE_PRICE_DISPLAY', '$9.99/month'),
      // RC-4: the loop guard now runs for intake too (it was coaching-only). The
      // "today or tomorrow. pick one. ... today or tomorrow morning" circling
      // happened during the SMS build, so intake needs the same hard steer.
      loopingOnQuestion: isLoopingOnQuestion(recentMessages, body),
    };

    // Mutable copy we mutate as tool calls land so subsequent calls in the same
    // turn see the latest state.
    const liveUser = { ...user };
    // Whether a link existed BEFORE this turn — lets us tell "the model/backstop
    // just sent the link this turn" (suppress the trailing reply so nothing lands
    // AFTER the URL) apart from a resend to someone who already had it.
    const linkSentAtEntry = !!liveUser.payment_link_sent_at;

    const handlers = {
      saveIntakeField: async (input: {
        field: string;
        value: string | number | boolean | string[];
      }) => {
        return this.saveIntakeField(liveUser, input.field, input.value);
      },
      sendPaymentLink: async () => {
        // Framing always precedes the URL (CLOSE_LEAD_IN), so even when the model
        // fires the tool itself the link is never cold and never "free-trial"-framed.
        return this.sendPaymentLink(liveUser, userMessageId, {
          requireFullIntake: true,
          leadIn: CLOSE_LEAD_IN,
        });
      },
      // Trial users can set reminders too. Same deterministic resolution as the
      // coaching path — the server computes the fire time, never the model.
      scheduleReminder: async (input: {
        delay_minutes?: number;
        local_clock?: string;
        fire_at_iso?: string;
        message: string;
        recurrence?: { rule: 'daily'; local_time: string } | null;
      }) => {
        const offset = resolveOffsetMinutes(liveUser.iana_timezone, liveUser.utc_offset_minutes);
        const now = Date.now();
        const resolved = resolveReminderFireAt(input, offset, now);
        if (!resolved.ok) return { ok: false as const, error: resolved.error };
        if (input.recurrence && (offset === null || offset === undefined)) {
          return {
            ok: false as const,
            error: "cannot schedule a daily reminder without the user's timezone — ask them first",
          };
        }
        const result = await this.scheduleService.enqueue({
          userId: liveUser.id,
          sessionId,
          createdByMessageId: userMessageId,
          fireAt: resolved.fireAt,
          message: input.message,
          recurrence: input.recurrence
            ? {
                rule: ReminderRecurrence.DAILY,
                localTime: input.recurrence.local_time,
                offsetMinutes: offset as number,
                ianaTimezone: liveUser.iana_timezone,
              }
            : null,
        });
        if (result.ok) {
          return {
            ok: true as const,
            reminder_id: result.reminderId,
            fire_at_iso: result.fireAtIso,
            fires_in: humanizeFireDelta(new Date(result.fireAtIso).getTime() - now),
          };
        }
        return { ok: false as const, error: result.reason };
      },
    };

    // Strip the "[image]" placeholder so the AI sees a real caption (or empty)
    // alongside the photo, not the literal sentinel.
    const intakeText = body !== '[image]' ? body : '';
    const { reply } = await this.coachingService.generateIntakeReply(
      user,
      recentMessages,
      intakeText,
      ctx,
      handlers,
      imageUrl ? [imageUrl] : undefined,
      imageContentType ? [imageContentType] : undefined,
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
    // A sincere "how does this help me / explain first" must never trigger the
    // force-net — answering with a checkout link is the money-hungry feel we're
    // killing. (An explicit link request still wins below.)
    const askedToUnderstand = !askedForLink && EXPLAIN_REQUEST_RE.test(intakeText);
    const hasMinimumForLink =
      !!liveUser.name &&
      !!liveUser.intake_data?.goal_description &&
      liveUser.utc_offset_minutes !== null &&
      liveUser.utc_offset_minutes !== undefined;

    if (askedForLink && hasMinimumForLink) {
      // An EXPLICIT link request always gets a link — even for a PAYMENT_PENDING
      // lead who already has one. The original Stripe session expires ~24h out,
      // and the dunning nudge no longer auto-resends (Karibi 2026-07-08 — "why 2
      // payment links"), so this deterministic on-ask resend is the ONLY thing
      // keeping a ready-to-buy lead from being stranded with a dead link when the
      // model doesn't call the tool. sendPaymentLink's own 5-minute guard blocks
      // spam, so re-sending on request is safe.
      const sent = await this.sendPaymentLink(liveUser, userMessageId, {
        requireFullIntake: true,
        leadIn: CLOSE_LEAD_IN,
      });
      await this.userRepo.update(user.id, { intake_link_stall_turns: 0 });
      structuredLog(this.logger, 'log', {
        service: 'onboarding',
        operation: 'payment_link_sent_on_request',
        userId: user.id,
        ok: sent.ok,
      });
    } else if (
      !liveUser.payment_link_sent_at &&
      intakeBuildComplete(liveUser) &&
      !askedToUnderstand &&
      isIntakeCommitment(intakeText) &&
      CLOSE_CUE_RE.test([...recentMessages].reverse().find((m) => m.role === MessageRole.AI)?.content ?? '')
    ) {
      // The build is done, KIBA's last message was the close/challenge, and the
      // lead just committed ("yeah, i'm in") — send the link if the model didn't.
      // There is NO stall-counter auto-send anymore: with the V4 diagnostic the
      // build completes EARLY, so the old "build complete + 2 stalled turns" rule
      // fired a checkout link mid-diagnostic, out of nowhere (Karibi 2026-06-25,
      // at "5k a month LMAO"). The link now only follows a real yes to the close.
      const forced = await this.sendPaymentLink(liveUser, userMessageId, {
        requireFullIntake: true,
        leadIn: CLOSE_LEAD_IN,
      });
      structuredLog(this.logger, 'log', {
        service: 'onboarding',
        operation: 'payment_link_sent_on_commitment',
        userId: user.id,
        ok: forced.ok,
      });
    }

    // If a link was sent THIS turn (model tool or either backstop), the close is
    // complete: CLOSE_LEAD_IN framing + the URL already went out, in that order.
    // Suppress the model's trailing reply so nothing lands AFTER the link — no
    // "say done / 7 days free / $20" tail (Karibi 2026-06-26: framing must come
    // before the link, and the price talk waits for day 7). A resend to someone
    // who already had the link (linkSentAtEntry) keeps its reply.
    if (!linkSentAtEntry && !!liveUser.payment_link_sent_at) {
      return '';
    }

    // Strip the two intake tics Karibi keeps flagging — decorative emoji and the
    // "love it, ..." filler opener — deterministically, on top of humanizeVoice.
    const outReply = scrubIntakeVoice(reply);

    // If we just gave the sample-coaching reply (post-link), flip the flag so
    // the next turn falls into the PAYWALL phase.
    if (user.payment_link_sent_at && !user.sample_coaching_given && outReply.trim().length > 0) {
      await this.userRepo.update(user.id, { sample_coaching_given: true });
    }

    if (outReply.trim().length > 0) return outReply;
    // Non-destructive fallback for the rare empty model reply. NEVER ask them to
    // restate a goal we already have — that "tell me your goal in one sentence"
    // mid-conversation reset (it forgets everything) was the #1 flow complaint
    // (Karibi 2026-06-20). Re-anchor on what we already know instead of resetting.
    const knownGoal = liveUser.intake_data?.goal_description?.trim();
    if (knownGoal) return `still with you on ${knownGoal}. what's on your mind?`;
    if (liveUser.name) return `still here, ${liveUser.name}. what's on your mind?`;
    return 'still here. what are you trying to lock in?';
  }

  /**
   * Persist a single intake field. Structured fields land on the user row;
   * everything else falls into the intake_data JSONB blob.
   */
  private async saveIntakeField(
    liveUser: User,
    field: string,
    value: string | number | boolean | string[],
  ) {
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
          return {
            ok: false as const,
            error: 'utc_offset_minutes must be an integer between -720 and 840',
          };
        }
        await this.userRepo.update(liveUser.id, { utc_offset_minutes: n });
        liveUser.utc_offset_minutes = n;
        this.flagOffsetPhoneMismatch(liveUser.id, liveUser.phone_number, n, 'model');
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
      'goal_description',
      'goals',
      'goal_timeline',
      'current_status',
      'why_it_matters',
      'fears',
      'avoidance_patterns',
      'comparison_figure',
      'public_failure_scenario',
      'typical_failure_moment',
      'pressure_preference',
      'cussing_ok',
      'city',
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
        return {
          ok: false as const,
          error: 'pressure_preference must be "pressure" or "encouragement"',
        };
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
   * Sanity-check a freshly-saved UTC offset against the phone's country code and
   * WARN (don't block) on a gross mismatch — e.g. a +92 (Pakistan, UTC+5) number
   * stored as UTC-5 from a role-played US city (the "Ali" wrong-time case). The
   * typed value can be legitimate (travel / VoIP number), so this only surfaces a
   * likely-wrong timezone in logs/admin instead of letting KIBA confidently give
   * the wrong local clock. null = unknown country code → no judgement, no flag.
   */
  private flagOffsetPhoneMismatch(
    userId: string,
    phone: string | null | undefined,
    offsetMinutes: number,
    source: 'city' | 'model',
  ): void {
    if (isOffsetPlausibleForPhone(phone, offsetMinutes) === false) {
      structuredLog(this.logger, 'warn', {
        service: 'onboarding',
        operation: 'tz_phone_mismatch',
        userId,
        utcOffsetMinutes: offsetMinutes,
        phone: phone ?? undefined,
        source,
      });
    }
  }

  /**
   * Handle STOP / START. Returns true when the message was a compliance keyword
   * and the turn is finished — no logging to the conversation, no AI call.
   *
   * Deliberate scope limits:
   *
   * - The keyword must be the WHOLE message (see opt-out.ts). "cancel my 8pm
   *   reminder" is coaching, not consent.
   * - A resume keyword only counts when the user is actually opted out. "yes" is
   *   a carrier-standard opt-in word AND the single most common reply in normal
   *   coaching — treating it as a resume would derail live conversations.
   * - HELP is NOT intercepted for an active user. A lone "help" from someone
   *   mid-conversation is far more likely distress than a request for terms, and
   *   swallowing it would bypass crisis detection. It falls through to the normal
   *   path instead.
   */
  private async handleComplianceKeyword(user: User, body: string, from: string): Promise<boolean> {
    const intent = detectKeyword(body);
    if (!intent) return false;

    // HELP: carriers require a bare "HELP" to be answered with what the program
    // is and how to leave — it's a hard A2P campaign requirement. But a lone
    // "help" from someone mid-conversation can also be distress, and swallowing
    // it would bypass crisis detection entirely.
    //
    // So we do BOTH: send the compliance reply, then return false so the message
    // still flows through crisis detection and coaching. Only a bare keyword
    // reaches here — detectKeyword already returns null for "i need help",
    // "help me", "please help im struggling" — so this never intercepts a
    // sentence, only the single word. `allowOptedOut` because carriers require
    // HELP to be answerable even after someone has opted out.
    if (intent === 'help') {
      await this.messagingService.send(user.phone_number, HELP_REPLY, undefined, true);
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'help_keyword_answered',
        from,
      });
      return false;
    }

    const wasOptedOut = user.opted_out_at !== null && user.opted_out_at !== undefined;

    if (intent === 'opt_in') {
      if (!wasOptedOut) return false; // ordinary "yes"/"start" — let coaching handle it

      await this.userRepo.update(user.id, { opted_out_at: null, opt_out_keyword: null });
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'opt_in',
        userId: user.id,
        keyword: normalizeKeyword(body),
      });
      // allowOptedOut: the flag is only cleared above moments earlier and the
      // outbound gate reads the DB — belt and braces so the confirmation can
      // never be eaten by its own guard.
      await this.messagingService.send(from, OPT_IN_CONFIRMATION, undefined, true);
      return true;
    }

    // opt_out
    if (wasOptedOut) {
      // Already unsubscribed. Silence is correct — re-confirming would mean
      // sending another message to someone who has asked twice to be left alone.
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'opt_out_repeat_ignored',
        userId: user.id,
      });
      return true;
    }

    await this.userRepo.update(user.id, {
      opted_out_at: new Date(),
      opt_out_keyword: normalizeKeyword(body).slice(0, 20),
    });

    // Stopping new sends is not enough — check-ins, reminders, ghost chains and
    // recaps are already sitting in Redis with a delay on them. Without this
    // drain the user keeps hearing from KIBA for days after unsubscribing, which
    // is the exact failure the opt-out is meant to prevent.
    await this.drainScheduledJobs(user.id);

    structuredLog(this.logger, 'log', {
      service: 'messaging',
      operation: 'opt_out',
      userId: user.id,
      keyword: normalizeKeyword(body),
    });

    await this.messagingService.send(from, OPT_OUT_CONFIRMATION, undefined, true);
    return true;
  }

  /**
   * Remove a user's not-yet-run accountability jobs. Mirrors the drain in
   * DataRightsService (user deletion) — same reason, different trigger. Fails
   * soft: the opted_out_at flag is the real guarantee, since the outbound gate
   * blocks any job that does fire, so a Redis blip must not fail the opt-out.
   */
  private async drainScheduledJobs(userId: string): Promise<void> {
    try {
      const jobs = await this.accountabilityQueue.getJobs(['delayed', 'waiting', 'paused']);
      for (const job of jobs) {
        if (job?.data?.userId === userId) await job.remove().catch(() => undefined);
      }
    } catch (err) {
      structuredLog(this.logger, 'error', {
        service: 'messaging',
        operation: 'opt_out_drain_failed',
        userId,
        error: (err as Error).message,
      });
    }
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
    opts: { requireFullIntake: boolean; leadIn?: string; bypassRateLimit?: boolean } = {
      requireFullIntake: true,
    },
  ): Promise<
    | { ok: true; checkout_url: string }
    | { ok: false; reason: 'incomplete' | 'rate_limited' | 'error'; error: string }
  > {
    // Name is required either way — Stripe customer creation uses it.
    if (!liveUser.name) {
      return { ok: false as const, reason: 'incomplete' as const, error: 'user has no name yet' };
    }
    if (opts.requireFullIntake) {
      if (!liveUser.intake_data?.goal_description || liveUser.utc_offset_minutes === null) {
        return {
          ok: false as const,
          reason: 'incomplete' as const,
          error:
            'minimum intake not yet captured (need name, goal_description, utc_offset_minutes)',
        };
      }
    }

    // Refuse if a payment link was sent in the last 5 minutes (avoid spam). This
    // is NOT a failure — the user already has a fresh link — so callers must say
    // "already sent it" rather than the alarming "having trouble / admin will
    // reach out" line (the bug Ali hit: re-asked 90s after a link and got told
    // it was broken).
    // `bypassRateLimit` exists for one case: the lead just redeemed a referral
    // code and the link they're holding was minted with the OLD trial length.
    // Making them wait 5 minutes for the trial they were just promised is worse
    // than the spam the limiter guards against.
    if (liveUser.payment_link_sent_at && !opts.bypassRateLimit) {
      const ageMs = Date.now() - new Date(liveUser.payment_link_sent_at).getTime();
      if (ageMs < 5 * 60_000) {
        return {
          ok: false as const,
          reason: 'rate_limited' as const,
          error: 'a payment link was already sent within the last 5 minutes',
        };
      }
    }

    // We text a link to OUR plan-selection page, not a raw Stripe Checkout URL.
    // Stripe can't show a monthly/yearly toggle inside one subscription session,
    // so the choice happens on our page and only the chosen price reaches Stripe
    // (Karibi 2026-07-20). The Stripe customer + session are created when they
    // tap Continue — see CheckoutService.createSession — which also means no
    // orphaned Stripe customer for a lead who never opens the link.
    //
    // Minting is local (HMAC, no network), so unlike the old flow there's no
    // Stripe round-trip that can fail between "we promised a link" and sending
    // one.
    const planUrl = planLinkFor(
      this.config.get<string>('CHECKOUT_LINK_SECRET') ||
        this.config.get<string>('INTERNAL_API_KEY') ||
        '',
      this.config.get<string>('FRONTEND_URL', 'https://usekiba.ai'),
      liveUser.id,
    );

    // SMS the link directly (rather than letting the AI include it in its reply
    // text) so it lands on its own line and is clickable. CRITICAL: send BEFORE
    // persisting PAYMENT_PENDING / payment_link_sent_at — otherwise a SendBlue+
    // Twilio double-failure leaves the user stuck (5-min resend lockout active
    // but no link in their inbox).
    try {
      // Optional lead-in (e.g. "here's the link to start back up:") goes out ONLY
      // once we know a real link follows — sent here, not by the caller upfront,
      // so a rate-limit/failure never leaves a dangling "here's the link" with no
      // link after it.
      if (opts.leadIn) await this.messagingService.send(liveUser.phone_number, opts.leadIn);
      await this.messagingService.send(liveUser.phone_number, planUrl);
    } catch (err) {
      this.logger.error(
        `[sendPaymentLink] SMS delivery failed for ${liveUser.id} — not persisting PAYMENT_PENDING so user can retry: ${(err as Error).message}`,
      );
      return {
        ok: false as const,
        reason: 'error' as const,
        error: 'failed to deliver payment link sms',
      };
    }

    const now = new Date();
    await this.userRepo.update(liveUser.id, {
      onboarding_stage: OnboardingStage.PAYMENT_PENDING,
      payment_link_sent_at: now,
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
      service: 'onboarding',
      operation: 'sms_payment_link_sent',
      userId: liveUser.id,
      userMessageId,
    });

    return { ok: true as const, checkout_url: planUrl };
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
    // DST-correct live offset from the IANA zone when known, else the frozen integer.
    const userOffsetMinutes = resolveOffsetMinutes(user.iana_timezone, user.utc_offset_minutes);
    const handlers: CoachingToolHandlers = {
      scheduleReminder: async (input: {
        fire_at_iso?: string;
        delay_minutes?: number;
        local_clock?: string;
        message: string;
        recurrence?: { rule: 'daily'; local_time: string } | null;
      }) => {
        // Resolve the fire time DETERMINISTICALLY in code — never trust the
        // model's timezone/relative-time arithmetic (it gets it wrong).
        const now = Date.now();
        const resolved = resolveReminderFireAt(input, userOffsetMinutes, now);
        if (!resolved.ok) return { ok: false as const, error: resolved.error };
        const fireAt = resolved.fireAt;
        // Recurrence needs the user's TZ snapshotted at create time. If we
        // don't know it, refuse rather than silently dropping recurrence —
        // the AI should ask for the timezone first.
        if (input.recurrence && (userOffsetMinutes === null || userOffsetMinutes === undefined)) {
          return {
            ok: false as const,
            error: "cannot schedule a daily reminder without the user's timezone — ask them first",
          };
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
                ianaTimezone: user.iana_timezone,
              }
            : null,
        });
        if (result.ok) {
          // Hand back the system-computed "fires in X" so the AI echoes our
          // number instead of computing its own (the source of the time bug).
          return {
            ok: true as const,
            reminder_id: result.reminderId,
            fire_at_iso: result.fireAtIso,
            fires_in: humanizeFireDelta(new Date(result.fireAtIso).getTime() - now),
          };
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
        const now = Date.now();
        return {
          ok: true as const,
          reminders: reminders.map((r) => ({
            reminder_id: r.id,
            fire_at_iso: r.fire_at.toISOString(),
            // System-computed countdown so "how long until that?" never depends
            // on the model doing the math (which it gets wrong).
            fires_in: humanizeFireDelta(r.fire_at.getTime() - now),
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
      // Retraining doc #49/#127: a conceded wrong strike must actually be
      // undone in the DB, not just apologised for in prose.
      correctMissedTask: async (input: { day: 'today' | 'yesterday' }) =>
        this.ledgerCorrectionService.correctMiss(userId, input.day),
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
      saveWeeklySchedule: async (input: { schedule: string }) => {
        const schedule = input.schedule.trim().slice(0, 500);
        if (!schedule) return { ok: false as const, error: 'schedule must be a non-empty string' };
        await this.userRepo.update(userId, {
          weekly_schedule: schedule,
          weekly_schedule_updated_at: new Date(),
        });
        return { ok: true as const, schedule };
      },
    };

    // Tapbacks are iMessage-only and need the message_handle to target. Attach
    // the tool only when both hold, so the AI is never offered react_to_message
    // on SMS (where it would degrade to a "Liked 'x'" text) or without a target.
    if (channel === 'imessage' && messageHandle) {
      handlers.reactToMessage = async (input: { reaction: string }) => {
        const res = await this.messagingService.sendReaction(
          user.phone_number,
          messageHandle,
          input.reaction,
        );
        return res.ok
          ? { ok: true as const, reaction: input.reaction }
          : { ok: false as const, error: res.error ?? 'reaction failed' };
      };
    }

    return handlers;
  }

  private async saveAndSend(user: User, sessionId: string, replyRaw: string) {
    // An empty reply means the turn's outbound was already sent by another path
    // (e.g. the intake close: CLOSE_LEAD_IN framing + the checkout URL). Nothing
    // to add — don't send a blank text or persist an empty AI row.
    if (!replyRaw || !replyRaw.trim()) return;
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

    // Persist the AI row + warm the session cache CONCURRENTLY with the send so
    // those two writes don't sit in front of the user's first bubble (latency,
    // 2026-06-29). Awaited before this function returns, so next-turn ordering is
    // unaffected — only the perceived time-to-first-bubble drops.
    const persist = this.messageRepo
      .save({
        user_id: user.id,
        session_id: sessionId,
        role: MessageRole.AI,
        message_type: MessageType.TEXT,
        content: stored,
      })
      .then(async (aiMsg) => {
        await this.sessionCache.addMessage(user.id, 'assistant', stored);
        return aiMsg;
      });

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

    const aiMsg = await persist;

    structuredLog(this.logger, 'log', {
      service: 'coaching',
      operation: 'reply_sent',
      userId: user.id,
      messageId: aiMsg.id,
      bubbles: toSend.length,
    });
  }
}
