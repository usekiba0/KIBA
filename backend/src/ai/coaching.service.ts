import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
// heic-convert is a CommonJS module with no ESM default export — import=require is correct here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import heicConvert = require('heic-convert');
import { createAnthropicClient } from './anthropic.factory';
import { User, IntakeData } from '../data/entities/user.entity';
import { Message } from '../data/entities/message.entity';
import { PsychologicalProfile, PressurePreference } from '../data/entities/psychological-profile.entity';
import { ExecutionScore } from '../data/entities/execution-score.entity';
import { Strike } from '../data/entities/strike.entity';
import { buildSystemPrompt } from './prompts/coaching.prompt';
import { buildIntakeSystemPrompt, IntakeContext } from './prompts/intake.prompt';
import { buildWinbackPrompt, WinbackContext } from './prompts/winback.prompt';
import { buildPaymentNotActivePrompt, PaymentClaimContext } from './prompts/payment-claim.prompt';
import { CorrectionService } from '../data/correction.service';
import { structuredLog, warnTokenBudget } from '../common/logger';

/** Coaching-mode tools (post-payment). */
export interface CoachingToolHandlers {
  scheduleReminder: (input: {
    // The server resolves the fire time from whichever of these the model sends
    // (it no longer does timezone/relative-time math itself).
    delay_minutes?: number;
    local_clock?: string;
    fire_at_iso?: string;
    message: string;
    /** Optional "daily at HH:MM" recurrence. Local time + offset snapshotted at create time. */
    recurrence?: { rule: 'daily'; local_time: string } | null;
  }) =>
    Promise<{ ok: true; reminder_id: string; fire_at_iso: string; fires_in: string } | { ok: false; error: string }>;
  cancelReminder: (input: { reminder_id: string }) =>
    Promise<{ ok: true; cancelled: number } | { ok: false; error: string }>;
  listMyReminders: () =>
    Promise<{ ok: true; reminders: Array<{ reminder_id: string; fire_at_iso: string; fires_in: string; message: string; recurrence: string | null }> }>;
  addTodo: (input: { content: string }) =>
    Promise<{ ok: true; todo_id: string; content: string } | { ok: false; error: string }>;
  listTodayTodos: () =>
    Promise<{ ok: true; todos: Array<{ todo_id: string; content: string; status: string }> }>;
  markTodoDone: (input: { todo_id: string }) =>
    Promise<{ ok: true; todo_id: string; status: string } | { ok: false; error: string }>;
  removeTodo: (input: { todo_id: string }) =>
    Promise<{ ok: true; removed: true } | { ok: false; error: string }>;
  // Re-subscribe / late-signup link send. Coaching exposes this so a user whose
  // subscription lapsed (or who was backfilled to 'complete' without ever paying)
  // can get a fresh Stripe checkout URL by just asking in chat.
  sendPaymentLink: () =>
    Promise<{ ok: true; checkout_url: string } | { ok: false; error: string }>;
  // Lets the coaching AI fill missing psychological-profile fields elicited mid-
  // conversation (e.g. user reveals their mentor in turn 4). Mirrors the value
  // into both intake_data JSONB and the PsychologicalProfile row.
  saveProfileField: (input: { field: string; value: string | boolean }) =>
    Promise<{ ok: true; field: string } | { ok: false; error: string }>;
  // React to the user's most recent message with an iMessage tapback. Optional:
  // only present on iMessage conversations (the processor omits it on SMS), so
  // the react_to_message tool is offered to the model only when a tapback can
  // actually land.
  reactToMessage?: (input: { reaction: string }) =>
    Promise<{ ok: true; reaction: string } | { ok: false; error: string }>;
}

/** Intake-mode tools (pre-payment SMS onboarding). */
export interface IntakeToolHandlers {
  saveIntakeField: (input: { field: string; value: string | number | boolean | string[] }) =>
    Promise<{ ok: true; field: string } | { ok: false; error: string }>;
  sendPaymentLink: () =>
    Promise<{ ok: true; checkout_url: string } | { ok: false; error: string }>;
  // Trial users can set reminders too (Tomo/Poke set them up freely pre-pay).
  // Server resolves the fire time from delay_minutes / local_clock / fire_at_iso.
  scheduleReminder: (input: {
    delay_minutes?: number;
    local_clock?: string;
    fire_at_iso?: string;
    message: string;
    recurrence?: { rule: 'daily'; local_time: string } | null;
  }) =>
    Promise<{ ok: true; reminder_id: string; fire_at_iso: string; fires_in: string } | { ok: false; error: string }>;
}

type Tool = Anthropic.Messages.Tool;

const SCHEDULE_REMINDER_TOOL: Tool = {
  name: 'schedule_reminder',
  description:
    'Schedule a text to fire later. Use whenever the user asks to be reminded, nudged, pinged, texted, or ' +
    'messaged later. DO NOT DO TIMEZONE OR CLOCK MATH YOURSELF — the system computes the exact time. Just pass ' +
    'ONE of these:\n' +
    '- delay_minutes: for RELATIVE requests ("in 30 min" -> 30, "in 2 hours" -> 120, "in 5 hours" -> 300). ' +
    'Convert hours to minutes only; nothing else.\n' +
    '- local_clock: for a SPECIFIC clock time ("at 9am" -> "09:00", "tonight at 9" -> "21:00", "5:02pm" -> ' +
    '"17:02"). Pass the user\'s local wall-clock as "HH:MM" 24h; the system converts to UTC and picks today if ' +
    'it hasn\'t passed, else tomorrow.\n' +
    'Only fall back to fire_at_iso if neither fits. ' +
    'MINIMUM DELAY: 2 minutes — but this ONLY matters when they ask for UNDER 2 minutes ("in 1 min", "in 30 sec"): ' +
    'then DO NOT call the tool and tell them 2 minutes is the floor. For ANY request of 2 minutes or more ' +
    '(3 min, 5 min, an hour, tomorrow), JUST SCHEDULE IT and confirm — NEVER volunteer or mention the 2-minute ' +
    'minimum, it only confuses them. For local_clock requests the user\'s timezone must be known; if it ' +
    'is not, ask first — never guess. ' +
    'RECURRENCE: for a DAILY repeating reminder ("every day at 8am", "every morning", "daily wake-up"), pass ' +
    'local_clock for the first fire AND the `recurrence` object with rule="daily" and the same local_time. The ' +
    'system re-fires every 24h automatically — DO NOT schedule multiple one-offs. ' +
    'The tool result includes "fires_in" — echo THAT in your confirmation, never your own time estimate. ' +
    'Write ONE short confirmation line.',
  input_schema: {
    type: 'object' as const,
    properties: {
      delay_minutes: {
        type: 'integer',
        description: 'For relative requests: total minutes from now (e.g. "in 5 hours" -> 300). Server fires at now + this. Omit if using local_clock.',
      },
      local_clock: {
        type: 'string',
        description: 'For a specific clock time: the user\'s local wall-clock as "HH:MM" 24h (e.g. "09:00", "17:02"). Server converts to UTC. Omit if using delay_minutes.',
      },
      fire_at_iso: {
        type: 'string',
        description: 'LAST RESORT only (use delay_minutes or local_clock instead). Absolute UTC ISO-8601 with Z suffix.',
      },
      message: {
        type: 'string',
        description: 'The exact text to send when the reminder fires. Speak directly to the user.',
      },
      recurrence: {
        type: 'object',
        description: 'Optional. Set ONLY when the user explicitly asks for a daily-repeating reminder. Leave unset for one-off reminders.',
        properties: {
          rule: { type: 'string', enum: ['daily'], description: 'Currently only "daily" is supported.' },
          local_time: { type: 'string', description: 'The user\'s local clock time to fire every day, "HH:MM" 24h (e.g. "08:00", "22:30"). Should match local_clock.' },
        },
        required: ['rule', 'local_time'],
      },
    },
    required: ['message'],
  },
};

const LIST_MY_REMINDERS_TOOL: Tool = {
  name: 'list_my_reminders',
  description:
    'Return the user\'s currently-pending scheduled reminders (id, fire_at_iso UTC, message, recurrence). ' +
    'Call this whenever the user asks about a reminder you already set — "how long until that", ' +
    '"what reminders do i have", "did you set the reminder", "what time was it for", "what daily reminders ' +
    'do i have", "stop the morning reminder". ' +
    'NEVER answer those from memory or guess time deltas — always call this first, then translate ' +
    'fire_at_iso into the user\'s local clock before replying. The `recurrence` field is "daily" for ' +
    'repeating reminders or null for one-off.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

const ADD_TODO_TOOL: Tool = {
  name: 'add_todo',
  description:
    'Add an item to the user\'s to-do list for TODAY. Use whenever the user names something they want to ' +
    'get done today ("add gym to my list", "remind me to email steve", "throw clean my room on there"), ' +
    'OR when YOU recommend a concrete task they agree to ("aight do the leg workout" → add it). ' +
    'Don\'t use for one-off coaching observations or motivation. The list is already in the system prompt — ' +
    'don\'t add a duplicate of something already there.',
  input_schema: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description: 'Short imperative description of the task (e.g. "leg workout — 15 min squats/lunges/calves", "4 hours focused business work"). Keep under 200 chars.',
      },
    },
    required: ['content'],
  },
};

const LIST_TODAY_TODOS_TOOL: Tool = {
  name: 'list_today_todos',
  description:
    'Return today\'s to-do list (id, content, status). The list is also embedded in the system prompt at ' +
    'turn start — only call this if the user just added something via add_todo / marked something done and ' +
    'you need the fresh ids, or if the user asks "what\'s left" / "what\'s on my list".',
  input_schema: { type: 'object' as const, properties: {}, required: [] },
};

const MARK_TODO_DONE_TOOL: Tool = {
  name: 'mark_todo_done',
  description:
    'Mark a todo item complete. Use when the user reports finishing something on the list ("done with the ' +
    'workout", "knocked out the business work", "✓"). Pair with the strike/score system as usual — this just ' +
    'closes the line item. Get todo_id from the system-prompt list or list_today_todos.',
  input_schema: {
    type: 'object' as const,
    properties: { todo_id: { type: 'string', description: 'The todo id from the list.' } },
    required: ['todo_id'],
  },
};

const REMOVE_TODO_TOOL: Tool = {
  name: 'remove_todo',
  description:
    'Delete a todo item the user wants off the list ("take swimming off", "i\'m not doing the email today, ' +
    'remove it"). Different from mark_todo_done — removed items aren\'t counted as completed. Get todo_id ' +
    'from the system-prompt list.',
  input_schema: {
    type: 'object' as const,
    properties: { todo_id: { type: 'string', description: 'The todo id to delete.' } },
    required: ['todo_id'],
  },
};

const CANCEL_REMINDER_TOOL: Tool = {
  name: 'cancel_reminder',
  description:
    'Cancel a pending reminder by id. Use when the user asks to stop, cancel, remove, kill, or turn off a ' +
    'reminder ("stop the daily morning text", "cancel that 8am thing", "turn off the workout reminder"). ' +
    'For a DAILY recurring reminder, cancelling cancels the whole series (every future occurrence in the chain). ' +
    'Always call list_my_reminders FIRST to get the id — never guess. ' +
    'After a successful call, confirm in one short line.',
  input_schema: {
    type: 'object' as const,
    properties: {
      reminder_id: {
        type: 'string',
        description: 'The reminder id from list_my_reminders. For a recurring series this can be any occurrence id — the whole chain cancels together.',
      },
    },
    required: ['reminder_id'],
  },
};

const SAVE_INTAKE_FIELD_TOOL: Tool = {
  name: 'save_intake_field',
  description:
    'Persist a single fact about the user that they just shared. Call this every time the user gives you a new fact, ' +
    'even mid-sentence. Field MUST be one of: name, goal_description, goals, goal_timeline, current_status, why_it_matters, ' +
    'fears, avoidance_patterns, comparison_figure, public_failure_scenario, typical_failure_moment, pressure_preference, ' +
    'cussing_ok, city, utc_offset_minutes, checkin_time. city = the user\'s home city as a plain string (e.g. "Houston"); ' +
    'save it whenever they name where they live, alongside utc_offset_minutes. For utc_offset_minutes pass an integer (minutes ahead/behind UTC, ' +
    'e.g. 300 for PKT). For pressure_preference pass "pressure" or "encouragement". For checkin_time pass HH:MM 24h. ' +
    'For cussing_ok pass a boolean (true if the user explicitly said cussing is fine, false if they said keep it pg). ' +
    'goals = an ARRAY of strings, the user\'s full list when they name more than one goal — save all of them, never drop any. ' +
    'goal_description = the single daily ANCHOR goal (one string). When the user has several goals, save the whole list to ' +
    'goals AND their chosen anchor to goal_description. When they have just one, save it to goal_description. ' +
    'why_it_matters = why their main goal actually matters to them (the emotional reason). ' +
    'avoidance_patterns = what makes them fold / the pattern that shows up when they try. ' +
    'Everything else is free text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      field: {
        type: 'string',
        enum: ['name', 'goal_description', 'goals', 'goal_timeline', 'current_status', 'why_it_matters', 'fears', 'avoidance_patterns',
               'comparison_figure', 'public_failure_scenario', 'typical_failure_moment', 'pressure_preference',
               'cussing_ok', 'utc_offset_minutes', 'checkin_time'],
        description: 'Which structured field to save.',
      },
      value: {
        description: 'The value. String for text fields, an array of strings for goals, integer for utc_offset_minutes, HH:MM for checkin_time, boolean for cussing_ok.',
      },
    },
    required: ['field', 'value'],
  },
};

const SAVE_PROFILE_FIELD_TOOL: Tool = {
  name: 'save_profile_field',
  description:
    'Persist a psychological-profile fact the user just revealed mid-coaching. ' +
    'Use whenever the user names a comparison figure / mentor, a fear, an avoidance pattern, ' +
    'a public failure scenario, a typical failure moment, or an embarrassment (the private outcome ' +
    'they\'d be ashamed for people to see if they keep failing) — even casually, even mid-sentence. ' +
    'Also use when the user explicitly grants or revokes cursing consent ("you can cuss", "keep it clean from now on"). ' +
    'Field MUST be one of: fears, avoidance_patterns, comparison_figure, public_failure_scenario, ' +
    'typical_failure_moment, embarrassment, pressure_preference, cussing_ok. ' +
    'For pressure_preference pass "pressure" or "encouragement". For cussing_ok pass a boolean. ' +
    'Everything else is free text — paraphrase tightly (3–10 words is ideal, the model reads it back later).',
  input_schema: {
    type: 'object' as const,
    properties: {
      field: {
        type: 'string',
        enum: ['fears', 'avoidance_patterns', 'comparison_figure',
               'public_failure_scenario', 'typical_failure_moment', 'embarrassment',
               'pressure_preference', 'cussing_ok'],
      },
      value: { description: 'String for free-text fields, boolean for cussing_ok.' },
    },
    required: ['field', 'value'],
  },
};

const REACT_TO_MESSAGE_TOOL: Tool = {
  name: 'react_to_message',
  description:
    'React to the user\'s most recent message with an iMessage tapback. Use SPARINGLY — only when a reaction genuinely fits and adds warmth, the way a real friend taps back. ' +
    'Guidance: a real win / something heartfelt → "love"; simple agreement or acknowledgement → "like"; something funny → "laugh"; a point you strongly want to stress → "emphasize"; a weak excuse you want to gently push back on → "dislike" (rare); a confusing or surprising message → "question". ' +
    'A tapback can REPLACE a text reply when no words are needed, or sit alongside one. Do NOT react to every message — overusing tapbacks kills the effect. iMessage only (this tool is simply absent on SMS).',
  input_schema: {
    type: 'object' as const,
    properties: {
      reaction: {
        type: 'string',
        enum: ['love', 'like', 'dislike', 'laugh', 'emphasize', 'question'],
      },
    },
    required: ['reaction'],
  },
};

const SEND_PAYMENT_LINK_TOOL: Tool = {
  name: 'send_payment_link',
  description:
    'Create a Stripe checkout session and SMS the URL to the user. ' +
    'In INTAKE mode: use ONLY at the payment close — after you have name, goal_description, and utc_offset_minutes ' +
    'saved AND you have walked them through the build (why it matters, their obstacle, the "i see you" moment, value) ' +
    'AND they gave you a clear yes to the micro-commitment ("are you actually ready"). Do NOT send it the moment the ' +
    'three fields exist — the emotional yes comes before the link. ' +
    'In COACHING mode: call this whenever the user asks to pay, subscribe, get the link, sign up, ' +
    'check out, upgrade, or otherwise wants to start/restart their subscription — even mid-coaching. ' +
    'The system SMSes the URL on its own line automatically; your text reply should be a SHORT confirmation only ' +
    '("here you go — pay through this and we\\\'re live"). If the tool returns ok:false with reason ' +
    '"user already has active subscription", apologise briefly and offer to escalate to support. ' +
    'NEVER tell the user you are not a subscription service or that they should ask someone else about payment.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

const MAX_TOOL_ITERATIONS = 3;

@Injectable()
export class CoachingService {
  private readonly logger = new Logger(CoachingService.name);
  private readonly client: Anthropic;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PsychologicalProfile)
    private readonly profileRepo: Repository<PsychologicalProfile>,
    @InjectRepository(ExecutionScore)
    private readonly scoreRepo: Repository<ExecutionScore>,
    @InjectRepository(Strike)
    private readonly strikeRepo: Repository<Strike>,
    private readonly correctionService: CorrectionService,
  ) {
    this.client = createAnthropicClient(config);
  }

  private isSupportedImageFormat(url: string, contentType?: string): boolean {
    if (contentType) {
      const ct = contentType.toLowerCase().split(';')[0].trim();
      return ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
              'image/heic', 'image/heif'].includes(ct);
    }
    const lower = url.toLowerCase().split('?')[0];
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
           lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.webp') ||
           lower.endsWith('.heic') || lower.endsWith('.heif');
  }

  // Anthropic's vision API rejects HEIC, but iPhone iMessage uploads land as
  // .heic via SendBlue's CDN. Fetch + transcode to JPEG before sending so we
  // don't have to tell users to screenshot every photo.
  private async prepareImageBlock(
    imageUrl: string,
    imageContentType?: string,
  ): Promise<
    | { ok: true; block: Anthropic.Messages.ImageBlockParam }
    | { ok: false; reason: string }
  > {
    const ct = (imageContentType ?? '').toLowerCase().split(';')[0].trim();
    const urlLower = imageUrl.toLowerCase().split('?')[0];
    const isHeic = ct === 'image/heic' || ct === 'image/heif' ||
      urlLower.endsWith('.heic') || urlLower.endsWith('.heif');

    if (!isHeic) {
      return {
        ok: true,
        block: { type: 'image', source: { type: 'url', url: imageUrl } },
      };
    }

    try {
      const resp = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
      });
      const jpegBytes = await heicConvert({
        buffer: resp.data,
        format: 'JPEG',
        quality: 0.9,
      });
      const data = Buffer.from(jpegBytes).toString('base64');
      return {
        ok: true,
        block: {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data },
        },
      };
    } catch (err) {
      this.logger.warn(
        `HEIC conversion failed for ${imageUrl}: ${(err as Error).message}`,
      );
      return { ok: false, reason: 'heic_conversion_failed' };
    }
  }

  /**
   * Return the user's PsychologicalProfile, creating one from intake_data if
   * it doesn't exist yet. Bridges the SMS-first onboarding (which writes only
   * intake_data JSONB) to the coaching prompt (which reads PsychologicalProfile).
   */
  async ensureProfile(userId: string, intakeData: IntakeData | null): Promise<PsychologicalProfile> {
    const existing = await this.profileRepo.findOne({ where: { user_id: userId } });
    if (existing) return existing;

    const created = this.profileRepo.create({
      user_id: userId,
      fears: intakeData?.fears ?? '',
      avoidance_patterns: intakeData?.avoidance_patterns ?? '',
      comparison_figure: intakeData?.comparison_figure ?? '',
      public_failure_scenario: intakeData?.public_failure_scenario ?? '',
      typical_failure_moment: intakeData?.typical_failure_moment ?? '',
      pressure_preference: intakeData?.pressure_preference === 'encouragement'
        ? PressurePreference.ENCOURAGEMENT
        : PressurePreference.PRESSURE,
      cussing_ok: intakeData?.cussing_ok === true,
    });
    await this.profileRepo.save(created);
    return created;
  }

  /**
   * Persist a single psychological-profile field elicited mid-coaching. Mirrors
   * into both intake_data JSONB (source of truth for replay/backfill) and the
   * PsychologicalProfile row (what the coaching prompt reads on the next turn).
   */
  async saveProfileField(
    userId: string,
    field: string,
    value: string | boolean,
  ): Promise<{ ok: true; field: string } | { ok: false; error: string }> {
    const allowed = ['fears', 'avoidance_patterns', 'comparison_figure',
                     'public_failure_scenario', 'typical_failure_moment', 'embarrassment',
                     'pressure_preference', 'cussing_ok'];
    if (!allowed.includes(field)) return { ok: false, error: `unknown field: ${field}` };

    // cussing_ok takes a boolean; everything else takes a non-empty string.
    if (field === 'cussing_ok') {
      if (typeof value !== 'boolean') {
        return { ok: false, error: 'cussing_ok must be a boolean' };
      }
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) return { ok: false, error: 'user not found' };

      const intake: IntakeData = { ...(user.intake_data ?? {}), cussing_ok: value };
      await this.userRepo.update(userId, { intake_data: intake });

      const profile = await this.ensureProfile(userId, intake);
      profile.cussing_ok = value;
      await this.profileRepo.save(profile);

      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'save_profile_field', userId, field, value,
      });
      return { ok: true, field };
    }

    if (typeof value !== 'string') {
      return { ok: false, error: `${field} must be a string` };
    }
    let trimmed = value.trim().slice(0, 2000);
    if (!trimmed) return { ok: false, error: 'value must not be empty' };

    if (field === 'pressure_preference') {
      const lower = trimmed.toLowerCase();
      if (lower !== 'pressure' && lower !== 'encouragement') {
        return { ok: false, error: 'pressure_preference must be "pressure" or "encouragement"' };
      }
      trimmed = lower;
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return { ok: false, error: 'user not found' };

    const intake: IntakeData = { ...(user.intake_data ?? {}) };
    (intake as Record<string, unknown>)[field] = trimmed;
    await this.userRepo.update(userId, { intake_data: intake });

    const profile = await this.ensureProfile(userId, intake);
    if (field === 'pressure_preference') {
      profile.pressure_preference = trimmed === 'encouragement'
        ? PressurePreference.ENCOURAGEMENT
        : PressurePreference.PRESSURE;
    } else {
      (profile as unknown as Record<string, string>)[field] = trimmed;
    }
    await this.profileRepo.save(profile);

    structuredLog(this.logger, 'log', {
      service: 'ai', operation: 'save_profile_field', userId, field,
    });
    return { ok: true, field };
  }

  /**
   * Post-payment coaching reply. Uses the full coaching prompt + curated knowledge
   * and exposes the schedule_reminder tool.
   */
  async generateReply(
    user: User,
    recentMessages: Message[],
    incomingText: string,
    sessionSummary?: string,
    imageUrls?: string[],
    imageContentTypes?: string[],
    toolHandlers?: CoachingToolHandlers,
    todos?: Array<{ id: string; content: string; status: string }>,
    patterns?: {
      weakestDow: number | null;
      weakestDowMisses: number;
      recurringExcuse: string | null;
      recurringExcuseCount: number;
      lastMilestoneHit: number;
      loopingOnQuestion?: boolean;
    },
  ): Promise<{ reply: string; tokenCount: number }> {
    const [profile, latestScore, strikeCount, knowledge] = await Promise.all([
      // SMS-first onboarding never created a profile row — lazy-create from
      // intake_data so the coaching prompt always has structured psych context
      // (and the AI never falls back to the no-profile generic prompt).
      this.ensureProfile(user.id, user.intake_data ?? null),
      this.scoreRepo.findOne({
        where: { user_id: user.id },
        order: { snapshot_date: 'DESC' },
      }),
      this.strikeRepo.count({
        where: {
          user_id: user.id,
          created_at: MoreThanOrEqual(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        },
      }),
      this.correctionService.getActiveKnowledge(),
    ]);

    const knowledgeTexts = knowledge.map((k) => k.content);
    const timeContext = {
      nowUtc: new Date(),
      userOffsetMinutes: user.utc_offset_minutes ?? null,
    };
    const userName = user.name ?? 'friend';
    // Whole weeks since signup — gates the week-2 embarrassment elicitation.
    const weeksIn = Math.floor(
      (Date.now() - new Date(user.registered_at).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    // Core facts from intake so the coaching prompt can use memory actively and
    // catch contradictions. Goals: full list if present, else the anchor.
    const intake = user.intake_data ?? {};
    const goalsText = intake.goals && intake.goals.length
      ? intake.goals.join(', ')
      : (intake.goal_description ?? null);
    const knownFacts = {
      goals: goalsText,
      city: intake.city ?? null,
      why: intake.why_it_matters ?? null,
      // Layer 3 — durable "never forget" facts (append-only anchor list).
      facts: intake.notes && intake.notes.length ? intake.notes : null,
    };
    const systemPrompt = buildSystemPrompt(
      { id: user.id, name: userName, phone_number: user.phone_number },
      profile,
      latestScore?.current_score ?? 0,
      strikeCount,
      sessionSummary,
      knowledgeTexts,
      timeContext,
      todos,
      patterns,
      weeksIn,
      knownFacts,
      user.relationship_memory ?? null,
    );

    const tools = toolHandlers
      ? [
          SCHEDULE_REMINDER_TOOL, LIST_MY_REMINDERS_TOOL, CANCEL_REMINDER_TOOL,
          ADD_TODO_TOOL, LIST_TODAY_TODOS_TOOL, MARK_TODO_DONE_TOOL, REMOVE_TODO_TOOL,
          SEND_PAYMENT_LINK_TOOL, SAVE_PROFILE_FIELD_TOOL,
          // Only offered on iMessage — the handler is present only then.
          ...(toolHandlers.reactToMessage ? [REACT_TO_MESSAGE_TOOL] : []),
        ]
      : undefined;
    const dispatch = toolHandlers
      ? (block: Anthropic.Messages.ToolUseBlock) => this.dispatchCoachingTool(block, toolHandlers, user.id)
      : undefined;

    return this.runChat({
      systemPrompt,
      recentMessages,
      incomingText,
      imageUrls,
      imageContentTypes,
      tools,
      dispatch,
      userId: user.id,
      operationLabel: 'coaching_reply',
    });
  }

  /**
   * Pre-payment intake reply. Uses the intake prompt and exposes save_intake_field +
   * send_payment_link. The processor passes the right tool handlers based on stage.
   */
  async generateIntakeReply(
    user: User,
    recentMessages: Message[],
    incomingText: string,
    ctx: IntakeContext,
    toolHandlers: IntakeToolHandlers,
    imageUrls?: string[],
    imageContentTypes?: string[],
  ): Promise<{ reply: string; tokenCount: number }> {
    const systemPrompt = buildIntakeSystemPrompt(ctx);
    const tools = [SAVE_INTAKE_FIELD_TOOL, SEND_PAYMENT_LINK_TOOL, SCHEDULE_REMINDER_TOOL];
    const dispatch = (block: Anthropic.Messages.ToolUseBlock) =>
      this.dispatchIntakeTool(block, toolHandlers, user.id);

    return this.runChat({
      systemPrompt,
      recentMessages,
      incomingText,
      imageUrls,
      imageContentTypes,
      tools,
      dispatch,
      userId: user.id,
      operationLabel: 'intake_reply',
    });
  }

  /**
   * Generate ONE personalised win-back text for an unpaid lead who went quiet
   * after getting the link. Replaces the old fixed template that read identically
   * to every lead. Single short, tool-less LLM call (fires <=3x per lead, so the
   * cost is negligible). Returns trimmed text, or null on any failure/empty so the
   * caller can fall back to the deterministic template — a missed nudge must never
   * become a crash or a blank send.
   */
  async generateWinbackNudge(ctx: WinbackContext): Promise<string | null> {
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: 200,
        system: buildWinbackPrompt(ctx),
        messages: [{ role: 'user', content: 'Write the win-back text now.' }],
      });
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'winback_nudge',
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        nudgeIndex: ctx.nudgeIndex,
      });
      return text.length > 0 ? text : null;
    } catch (err) {
      this.logger.warn(`generateWinbackNudge failed (falling back to template): ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Generate ONE payment-not-active reply for the deterministic payment-claim
   * backstop: a lead claims they paid but no active sub exists. The DECISION to
   * distrust the claim is made in the caller; this only varies the WORDING so a
   * repeat claimant doesn't get the identical canned line. Single short, tool-less
   * call. Returns trimmed text or null on failure/empty so the caller falls back
   * to its static string — the refusal must never crash or send blank.
   */
  async generatePaymentNotActiveReply(ctx: PaymentClaimContext): Promise<string | null> {
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: 160,
        system: buildPaymentNotActivePrompt(ctx),
        messages: [{ role: 'user', content: 'Write the reply now.' }],
      });
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'payment_not_active_reply',
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      });
      return text.length > 0 ? text : null;
    } catch (err) {
      this.logger.warn(`generatePaymentNotActiveReply failed (falling back to static): ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Shared tool-use loop. Caller provides a system prompt, optional tools, and a
   * dispatch function that turns a tool_use block into a JSON-stringifiable result.
   */
  private async runChat(args: {
    systemPrompt: string;
    recentMessages: Message[];
    incomingText: string;
    imageUrls?: string[];
    imageContentTypes?: string[];
    tools?: Tool[];
    dispatch?: (block: Anthropic.Messages.ToolUseBlock) => Promise<unknown>;
    userId: string;
    operationLabel: string;
  }): Promise<{ reply: string; tokenCount: number }> {
    const baseModel = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    // Photos need real OCR + brand/world knowledge — read the "Salata" sign off a
    // storefront, know what a McDonald's is. Haiku's vision is too weak for that
    // (it saw "a restaurant" but couldn't read the sign), so route image-bearing
    // turns to a stronger vision model. Text-only turns stay on the cheaper base
    // model so cost only rises on photo turns. (Karibi 2026-06-29 — vision feedback)
    const visionModel = this.config.get<string>('AI_VISION_MODEL', 'claude-sonnet-4-6');
    const hasImages = (args.imageUrls ?? []).length > 0;
    const model = hasImages ? visionModel : baseModel;

    type MsgParam = Anthropic.Messages.MessageParam;
    const history: MsgParam[] = args.recentMessages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    // Multi-image: people send several photos at once (a few angles, a couple of
    // screenshots). Claude sees them all in one message, so KIBA reacts to the
    // SET in one reply instead of one-per-photo. Cap at 4 to bound vision cost.
    const MAX_IMAGES = 4;
    const urls = (args.imageUrls ?? []).slice(0, MAX_IMAGES);
    let usingImage = false;
    let lastContent: string | Array<Anthropic.Messages.ImageBlockParam | Anthropic.Messages.TextBlockParam>;
    if (urls.length > 0) {
      const blocks: Anthropic.Messages.ImageBlockParam[] = [];
      let sawUnsupported = false;
      for (let i = 0; i < urls.length; i++) {
        const ct = args.imageContentTypes?.[i];
        if (!this.isSupportedImageFormat(urls[i], ct)) { sawUnsupported = true; continue; }
        const prep = await this.prepareImageBlock(urls[i], ct);
        if (prep.ok) blocks.push(prep.block);
      }
      if (blocks.length === 0) {
        return {
          reply: sawUnsupported
            ? "i can't read that file type — send a jpeg, png, or screenshot."
            : "couldn't open that photo — try sending it again as a screenshot or jpeg.",
          tokenCount: 0,
        };
      }
      usingImage = true;
      const fallbackCaption = blocks.length > 1
        ? 'The user sent these photos with no caption — react to what you actually see across them, in your voice.'
        : 'The user sent this photo with no caption — react to what you actually see in it, in your voice.';
      lastContent = [
        ...blocks,
        { type: 'text', text: args.incomingText || fallbackCaption },
      ];
    } else {
      lastContent = args.incomingText || 'I sent you a message.';
    }
    history.push({ role: 'user', content: lastContent });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let response: Anthropic.Messages.Message | undefined;

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      try {
        response = await this.client.messages.create({
          model,
          max_tokens: 512,
          system: args.systemPrompt,
          tools: args.tools,
          messages: history,
        });
      } catch (err: unknown) {
        const isImageError = usingImage && iter === 0 &&
          err instanceof Error &&
          (err.message.includes('invalid_request_error') || err.message.includes('image'));
        if (!isImageError) throw err;

        this.logger.warn(`Image rejected by Anthropic for user ${args.userId} — ${(err as Error).message}`);
        return { reply: "couldn't read that photo — try a screenshot or resend.", tokenCount: 0 };
      }

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      if (response.stop_reason !== 'tool_use' || !args.dispatch) break;

      history.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        try {
          const result = await args.dispatch(block);
          const isError = typeof result === 'object' && result !== null && 'ok' in result && !(result as { ok: boolean }).ok;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
            is_error: isError,
          });
        } catch (err) {
          // Never feed raw internal error text back to the model — it can parrot
          // it to the user ("my database is lagging"). Log the real cause for us,
          // hand the model a generic, self-contained instruction instead.
          this.logger.warn(
            `tool dispatch failed (user ${args.userId}, tool ${block.name}): ${(err as Error).message}`,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({
              ok: false,
              error: 'action_failed',
              note: "that didn't go through. tell the user briefly it didn't work and to try again — never mention errors, servers, databases, or anything technical.",
            }),
            is_error: true,
          });
        }
      }
      history.push({ role: 'user', content: toolResults });
    }

    const extractText = (msg: Anthropic.Messages.Message | undefined): string =>
      msg && Array.isArray(msg.content)
        ? msg.content
            .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim()
        : '';

    let finalReply = extractText(response);

    // The model can spend its whole turn (or hit the tool-iteration cap) calling
    // tools without ever emitting user-facing text — intake especially, since it's
    // told to call save_intake_field aggressively. That left `finalReply` empty and
    // tripped the destructive "tell me your goal in one sentence" fallback (Karibi
    // 2026-06-20). The history already carries the tool calls + their results, so
    // force ONE final completion WITHOUT tools to get the human-facing reply.
    if (!finalReply && args.dispatch) {
      // Re-sending the same history without tools often STILL comes back empty —
      // the last thing the model sees is its own tool_result, so it thinks it's
      // already responded and ends the turn silently. Append an explicit nudge to
      // actually speak, so it can never leave the user on the canned fallback.
      const nudge: Anthropic.Messages.MessageParam = {
        role: 'user',
        content:
          "(system: you just saved that. now reply to the user in your normal texting voice — react to what they actually said and move the conversation forward. text only, do not call any tools, and do not mention this note.)",
      };
      for (let retry = 0; retry < 2 && !finalReply; retry++) {
        try {
          const forced = await this.client.messages.create({
            model,
            max_tokens: 512,
            system: args.systemPrompt,
            messages: [...history, nudge],
          });
          totalInputTokens += forced.usage.input_tokens;
          totalOutputTokens += forced.usage.output_tokens;
          finalReply = extractText(forced);
        } catch (err) {
          this.logger.warn(`forced text completion failed (user ${args.userId}): ${(err as Error).message}`);
          break;
        }
      }
    }

    structuredLog(this.logger, 'log', {
      service: 'ai',
      operation: args.operationLabel,
      userId: args.userId,
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
    });
    warnTokenBudget(this.logger, {
      service: 'ai',
      operation: args.operationLabel,
      userId: args.userId,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    return { reply: finalReply, tokenCount: totalInputTokens + totalOutputTokens };
  }

  private async dispatchCoachingTool(
    block: Anthropic.Messages.ToolUseBlock,
    toolHandlers: CoachingToolHandlers,
    userId: string,
  ): Promise<unknown> {
    if (block.name === 'schedule_reminder') {
      // The model is told to send ONE of delay_minutes / local_clock / fire_at_iso
      // (fire_at_iso is the last resort) and the server resolves the fire time.
      // This dispatch must forward whichever it sent — gating on fire_at_iso alone
      // silently rejected every normal "remind me at 8:30am" / "in 5 min" request
      // and made the model improvise "system's being weird".
      const input = block.input as {
        delay_minutes?: number; local_clock?: string; fire_at_iso?: string;
        message?: unknown; recurrence?: unknown;
      };
      if (typeof input.message !== 'string' || !input.message.trim()) {
        return { ok: false, error: 'message must be a non-empty string' };
      }
      let recurrence: { rule: 'daily'; local_time: string } | null = null;
      if (input.recurrence != null) {
        const r = input.recurrence as { rule?: unknown; local_time?: unknown };
        if (r.rule !== 'daily') {
          return { ok: false, error: 'recurrence.rule must be "daily" (only daily is supported)' };
        }
        if (typeof r.local_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.local_time)) {
          return { ok: false, error: 'recurrence.local_time must be HH:MM 24h' };
        }
        recurrence = { rule: 'daily', local_time: r.local_time };
      }
      const result = await toolHandlers.scheduleReminder({
        delay_minutes: input.delay_minutes,
        local_clock: input.local_clock,
        fire_at_iso: input.fire_at_iso,
        message: input.message,
        recurrence,
      });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_schedule_reminder',
        userId, ok: result.ok,
        delayMinutes: input.delay_minutes ?? null, localClock: input.local_clock ?? null,
        fireAtIso: input.fire_at_iso ?? null, recurrence: recurrence?.rule ?? null,
      });
      return result;
    }
    if (block.name === 'list_my_reminders') {
      const result = await toolHandlers.listMyReminders();
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_list_my_reminders',
        userId, count: result.ok ? result.reminders.length : 0,
      });
      return result;
    }
    if (block.name === 'cancel_reminder') {
      const input = block.input as { reminder_id?: unknown };
      if (typeof input.reminder_id !== 'string') {
        return { ok: false, error: 'reminder_id must be a string' };
      }
      const result = await toolHandlers.cancelReminder({ reminder_id: input.reminder_id });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_cancel_reminder',
        userId, ok: result.ok, reminderId: input.reminder_id,
      });
      return result;
    }
    if (block.name === 'add_todo') {
      const input = block.input as { content?: unknown };
      if (typeof input.content !== 'string') {
        return { ok: false, error: 'content must be a string' };
      }
      const result = await toolHandlers.addTodo({ content: input.content });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_add_todo', userId, ok: result.ok,
      });
      return result;
    }
    if (block.name === 'list_today_todos') {
      const result = await toolHandlers.listTodayTodos();
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_list_today_todos',
        userId, count: result.ok ? result.todos.length : 0,
      });
      return result;
    }
    if (block.name === 'mark_todo_done') {
      const input = block.input as { todo_id?: unknown };
      if (typeof input.todo_id !== 'string') {
        return { ok: false, error: 'todo_id must be a string' };
      }
      const result = await toolHandlers.markTodoDone({ todo_id: input.todo_id });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_mark_todo_done', userId, ok: result.ok,
      });
      return result;
    }
    if (block.name === 'remove_todo') {
      const input = block.input as { todo_id?: unknown };
      if (typeof input.todo_id !== 'string') {
        return { ok: false, error: 'todo_id must be a string' };
      }
      const result = await toolHandlers.removeTodo({ todo_id: input.todo_id });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_remove_todo', userId, ok: result.ok,
      });
      return result;
    }
    if (block.name === 'send_payment_link') {
      const result = await toolHandlers.sendPaymentLink();
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_send_payment_link_coaching',
        userId, ok: result.ok,
      });
      return result;
    }
    if (block.name === 'save_profile_field') {
      const input = block.input as { field?: unknown; value?: unknown };
      if (typeof input.field !== 'string') {
        return { ok: false, error: 'field must be a string' };
      }
      if (typeof input.value !== 'string' && typeof input.value !== 'boolean') {
        return { ok: false, error: 'value must be a string or boolean' };
      }
      const result = await toolHandlers.saveProfileField({ field: input.field, value: input.value });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_save_profile_field',
        userId, ok: result.ok, field: input.field,
      });
      return result;
    }
    if (block.name === 'react_to_message') {
      if (!toolHandlers.reactToMessage) {
        return { ok: false, error: 'reactions are only available on iMessage' };
      }
      const input = block.input as { reaction?: unknown };
      if (typeof input.reaction !== 'string') {
        return { ok: false, error: 'reaction must be a string' };
      }
      const result = await toolHandlers.reactToMessage({ reaction: input.reaction });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_react_to_message',
        userId, ok: result.ok, reaction: input.reaction,
      });
      return result;
    }
    return { ok: false, error: `unknown tool: ${block.name}` };
  }

  private async dispatchIntakeTool(
    block: Anthropic.Messages.ToolUseBlock,
    toolHandlers: IntakeToolHandlers,
    userId: string,
  ): Promise<unknown> {
    if (block.name === 'save_intake_field') {
      const input = block.input as { field?: unknown; value?: unknown };
      if (typeof input.field !== 'string') {
        return { ok: false, error: 'field must be a string' };
      }
      // `goals` is an array of strings (multi-goal intake); everything else is a
      // string/number/boolean. Reject anything outside that set BEFORE it reaches
      // the handler — but DO let string[] through (this guard used to drop arrays
      // silently, so save_intake_field("goals", [...]) always failed).
      const value = input.value;
      const isValid =
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (Array.isArray(value) && value.every((v) => typeof v === 'string'));
      if (!isValid) {
        return { ok: false, error: 'value must be a string, number, boolean, or array of strings' };
      }
      const result = await toolHandlers.saveIntakeField({ field: input.field, value: value as string | number | boolean | string[] });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_save_intake_field',
        userId, ok: result.ok, field: input.field,
      });
      return result;
    }
    if (block.name === 'send_payment_link') {
      const result = await toolHandlers.sendPaymentLink();
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_send_payment_link',
        userId, ok: result.ok,
      });
      return result;
    }
    if (block.name === 'schedule_reminder') {
      const input = block.input as {
        delay_minutes?: number; local_clock?: string; fire_at_iso?: string;
        message?: unknown; recurrence?: { rule: 'daily'; local_time: string } | null;
      };
      if (typeof input.message !== 'string' || !input.message.trim()) {
        return { ok: false, error: 'message must be a non-empty string' };
      }
      const result = await toolHandlers.scheduleReminder({
        delay_minutes: input.delay_minutes,
        local_clock: input.local_clock,
        fire_at_iso: input.fire_at_iso,
        message: input.message,
        recurrence: input.recurrence ?? null,
      });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_schedule_reminder_intake',
        userId, ok: result.ok,
      });
      return result;
    }
    return { ok: false, error: `unknown tool: ${block.name}` };
  }
}
