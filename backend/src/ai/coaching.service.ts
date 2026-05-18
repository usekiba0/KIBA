import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient } from './anthropic.factory';
import { User } from '../data/entities/user.entity';
import { Message } from '../data/entities/message.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { ExecutionScore } from '../data/entities/execution-score.entity';
import { Strike } from '../data/entities/strike.entity';
import { buildSystemPrompt } from './prompts/coaching.prompt';
import { buildIntakeSystemPrompt, IntakeContext } from './prompts/intake.prompt';
import { CorrectionService } from '../data/correction.service';
import { structuredLog, warnTokenBudget } from '../common/logger';

/** Coaching-mode tools (post-payment). */
export interface CoachingToolHandlers {
  scheduleReminder: (input: { fire_at_iso: string; message: string }) =>
    Promise<{ ok: true; reminder_id: string; fire_at_iso: string } | { ok: false; error: string }>;
}

/** Intake-mode tools (pre-payment SMS onboarding). */
export interface IntakeToolHandlers {
  saveIntakeField: (input: { field: string; value: string | number }) =>
    Promise<{ ok: true; field: string } | { ok: false; error: string }>;
  sendPaymentLink: () =>
    Promise<{ ok: true; checkout_url: string } | { ok: false; error: string }>;
}

type Tool = Anthropic.Messages.Tool;

const SCHEDULE_REMINDER_TOOL: Tool = {
  name: 'schedule_reminder',
  description:
    'Schedule a text message to be sent to the user at a future absolute time. ' +
    'Use this whenever the user asks to be reminded, nudged, pinged, texted, or messaged at any future time — ' +
    'including phrases like "in 30 min", "tomorrow morning", "tonight at 9", "next Thursday at 6pm". ' +
    'Resolve relative phrases against the CURRENT TIME provided in the system prompt. ' +
    'Always provide fire_at_iso in UTC ISO 8601 form (e.g. 2026-05-19T14:30:00Z). ' +
    'If the user\'s timezone is unknown, ask them before calling this tool — do NOT guess. ' +
    'After calling the tool, write a short one-line confirmation to the user.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fire_at_iso: {
        type: 'string',
        description: 'Absolute UTC time in ISO 8601 format. Must be at least 30 seconds in the future.',
      },
      message: {
        type: 'string',
        description: 'The exact text to send when the reminder fires. Speak directly to the user.',
      },
    },
    required: ['fire_at_iso', 'message'],
  },
};

const SAVE_INTAKE_FIELD_TOOL: Tool = {
  name: 'save_intake_field',
  description:
    'Persist a single fact about the user that they just shared. Call this every time the user gives you a new fact, ' +
    'even mid-sentence. Field MUST be one of: name, goal_description, goal_timeline, current_status, fears, ' +
    'avoidance_patterns, comparison_figure, public_failure_scenario, typical_failure_moment, pressure_preference, ' +
    'utc_offset_minutes, checkin_time. For utc_offset_minutes pass an integer (minutes ahead/behind UTC, e.g. 300 for PKT). ' +
    'For pressure_preference pass "pressure" or "encouragement". For checkin_time pass HH:MM 24h. Everything else is free text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      field: {
        type: 'string',
        enum: ['name', 'goal_description', 'goal_timeline', 'current_status', 'fears', 'avoidance_patterns',
               'comparison_figure', 'public_failure_scenario', 'typical_failure_moment', 'pressure_preference',
               'utc_offset_minutes', 'checkin_time'],
        description: 'Which structured field to save.',
      },
      value: {
        description: 'The value. String for text fields, integer for utc_offset_minutes, HH:MM for checkin_time.',
      },
    },
    required: ['field', 'value'],
  },
};

const SEND_PAYMENT_LINK_TOOL: Tool = {
  name: 'send_payment_link',
  description:
    'Create a Stripe checkout session and SMS the URL to the user. Use ONLY when ALL THREE of the following are saved: ' +
    'name, goal_description, utc_offset_minutes. Do not call if the user already has an active payment link from a prior turn ' +
    '(check WHAT YOU KNOW). After calling, write a single-line confirmation to the user.',
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
      return ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(ct);
    }
    const lower = url.toLowerCase();
    return lower.includes('.jpg') || lower.includes('.jpeg') ||
           lower.includes('.png') || lower.includes('.gif') || lower.includes('.webp');
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
    imageUrl?: string,
    imageContentType?: string,
    toolHandlers?: CoachingToolHandlers,
  ): Promise<{ reply: string; tokenCount: number }> {
    const [profile, latestScore, strikeCount, knowledge] = await Promise.all([
      this.profileRepo.findOne({ where: { user_id: user.id } }),
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
    const systemPrompt = profile
      ? buildSystemPrompt(
          { id: user.id, name: userName, phone_number: user.phone_number },
          profile,
          latestScore?.current_score ?? 0,
          strikeCount,
          sessionSummary,
          knowledgeTexts,
          timeContext,
        )
      : `You are Kiba — a psychological accountability system. User: ${userName}. When asked for plans, workouts, or advice, give them immediately and specifically. Always end with a required action or accountability demand. No hedging, no refusing.${knowledgeTexts.length > 0 ? '\n\nADMIN-CURATED KNOWLEDGE:\n' + knowledgeTexts.map((k) => '- ' + k).join('\n') : ''}\n\nCURRENT TIME (UTC): ${timeContext.nowUtc.toISOString()}`;

    const tools = toolHandlers ? [SCHEDULE_REMINDER_TOOL] : undefined;
    const dispatch = toolHandlers
      ? (block: Anthropic.Messages.ToolUseBlock) => this.dispatchCoachingTool(block, toolHandlers, user.id)
      : undefined;

    return this.runChat({
      systemPrompt,
      recentMessages,
      incomingText,
      imageUrl,
      imageContentType,
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
  ): Promise<{ reply: string; tokenCount: number }> {
    const systemPrompt = buildIntakeSystemPrompt(ctx);
    const tools = [SAVE_INTAKE_FIELD_TOOL, SEND_PAYMENT_LINK_TOOL];
    const dispatch = (block: Anthropic.Messages.ToolUseBlock) =>
      this.dispatchIntakeTool(block, toolHandlers, user.id);

    return this.runChat({
      systemPrompt,
      recentMessages,
      incomingText,
      tools,
      dispatch,
      userId: user.id,
      operationLabel: 'intake_reply',
    });
  }

  /**
   * Shared tool-use loop. Caller provides a system prompt, optional tools, and a
   * dispatch function that turns a tool_use block into a JSON-stringifiable result.
   */
  private async runChat(args: {
    systemPrompt: string;
    recentMessages: Message[];
    incomingText: string;
    imageUrl?: string;
    imageContentType?: string;
    tools?: Tool[];
    dispatch?: (block: Anthropic.Messages.ToolUseBlock) => Promise<unknown>;
    userId: string;
    operationLabel: string;
  }): Promise<{ reply: string; tokenCount: number }> {
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');

    type MsgParam = Anthropic.Messages.MessageParam;
    const history: MsgParam[] = args.recentMessages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const usingImage = !!args.imageUrl && this.isSupportedImageFormat(args.imageUrl, args.imageContentType);
    const lastContent = usingImage
      ? [
          { type: 'image' as const, source: { type: 'url' as const, url: args.imageUrl! } },
          { type: 'text' as const, text: args.incomingText || 'What do you see? Respond as my accountability coach.' },
        ]
      : (args.incomingText || (args.imageUrl ? 'I sent you a photo.' : 'I sent you a message.'));
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

        this.logger.warn(`Image rejected by Anthropic for user ${args.userId} — unsupported format`);
        return { reply: 'heic photos don\'t work — screenshot it and send as a jpeg or png instead.', tokenCount: 0 };
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
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: (err as Error).message }),
            is_error: true,
          });
        }
      }
      history.push({ role: 'user', content: toolResults });
    }

    const finalReply = response && Array.isArray(response.content)
      ? response.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim()
      : '';

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
      const input = block.input as { fire_at_iso?: unknown; message?: unknown };
      if (typeof input.fire_at_iso !== 'string' || typeof input.message !== 'string') {
        return { ok: false, error: 'fire_at_iso and message must both be strings' };
      }
      const result = await toolHandlers.scheduleReminder({
        fire_at_iso: input.fire_at_iso,
        message: input.message,
      });
      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'tool_schedule_reminder',
        userId, ok: result.ok, fireAtIso: input.fire_at_iso,
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
      if (typeof input.value !== 'string' && typeof input.value !== 'number') {
        return { ok: false, error: 'value must be a string or number' };
      }
      const result = await toolHandlers.saveIntakeField({ field: input.field, value: input.value });
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
    return { ok: false, error: `unknown tool: ${block.name}` };
  }
}
