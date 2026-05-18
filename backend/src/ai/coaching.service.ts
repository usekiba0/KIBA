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
import { CorrectionService } from '../data/correction.service';
import { structuredLog, warnTokenBudget } from '../common/logger';

/**
 * Tool handlers passed in from the caller (the processor) so this service
 * doesn't need a hard dependency on AccountabilityModule. Each handler returns
 * a stringifiable result that gets sent back to Claude as the tool_result.
 */
export interface ToolHandlers {
  scheduleReminder: (input: { fire_at_iso: string; message: string }) =>
    Promise<{ ok: true; reminder_id: string; fire_at_iso: string } | { ok: false; error: string }>;
}

const SCHEDULE_REMINDER_TOOL = {
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
        description: 'The exact text to send when the reminder fires. Speak directly to the user (e.g. "time to hit the workout you locked in").',
      },
    },
    required: ['fire_at_iso', 'message'],
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

  async generateReply(
    user: User,
    recentMessages: Message[],
    incomingText: string,
    sessionSummary?: string,
    imageUrl?: string,
    imageContentType?: string,
    toolHandlers?: ToolHandlers,
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
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    const systemPrompt = profile
      ? buildSystemPrompt(user, profile, latestScore?.current_score ?? 0, strikeCount, sessionSummary, knowledgeTexts, timeContext)
      : `You are Kiba — a psychological accountability system. User: ${user.name}. When asked for plans, workouts, or advice, give them immediately and specifically. Always end with a required action or accountability demand. No hedging, no refusing.${knowledgeTexts.length > 0 ? '\n\nADMIN-CURATED KNOWLEDGE:\n' + knowledgeTexts.map((k) => '- ' + k).join('\n') : ''}\n\nCURRENT TIME (UTC): ${timeContext.nowUtc.toISOString()}`;

    type MsgParam = Anthropic.Messages.MessageParam;
    const history: MsgParam[] = recentMessages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const usingImage = !!imageUrl && this.isSupportedImageFormat(imageUrl, imageContentType);
    const lastContent = usingImage
      ? [
          { type: 'image' as const, source: { type: 'url' as const, url: imageUrl! } },
          { type: 'text' as const, text: incomingText || 'What do you see? Respond as my accountability coach.' },
        ]
      : (incomingText || (imageUrl ? 'I sent you a photo.' : 'I sent you a message.'));
    history.push({ role: 'user', content: lastContent });

    const tools = toolHandlers ? [SCHEDULE_REMINDER_TOOL] : undefined;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let response: Anthropic.Messages.Message | undefined;

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      try {
        response = await this.client.messages.create({
          model,
          max_tokens: 512,
          system: systemPrompt,
          tools,
          messages: history,
        });
      } catch (err: unknown) {
        const isImageError = usingImage && iter === 0 &&
          err instanceof Error &&
          (err.message.includes('invalid_request_error') || err.message.includes('image'));
        if (!isImageError) throw err;

        this.logger.warn(`Image rejected by Anthropic for user ${user.id} — unsupported format`);
        return { reply: 'heic photos don\'t work — screenshot it and send as a jpeg or png instead.', tokenCount: 0 };
      }

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      if (response.stop_reason !== 'tool_use' || !toolHandlers) break;

      // Echo the assistant turn so the next call has full context.
      history.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        if (block.name === 'schedule_reminder') {
          const result = await this.dispatchSchedule(block, toolHandlers, user.id);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
            is_error: !('ok' in result) || !result.ok,
          });
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: `unknown tool: ${block.name}` }),
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
      operation: 'coaching_reply',
      userId: user.id,
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
    });
    warnTokenBudget(this.logger, {
      service: 'ai',
      operation: 'coaching_reply',
      userId: user.id,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    return { reply: finalReply, tokenCount: totalInputTokens + totalOutputTokens };
  }

  private async dispatchSchedule(
    block: Anthropic.Messages.ToolUseBlock,
    toolHandlers: ToolHandlers,
    userId: string,
  ): Promise<{ ok: true; reminder_id: string; fire_at_iso: string } | { ok: false; error: string }> {
    const input = block.input as { fire_at_iso?: unknown; message?: unknown };
    if (typeof input.fire_at_iso !== 'string' || typeof input.message !== 'string') {
      return { ok: false, error: 'fire_at_iso and message must both be strings' };
    }
    try {
      const result = await toolHandlers.scheduleReminder({
        fire_at_iso: input.fire_at_iso,
        message: input.message,
      });
      structuredLog(this.logger, 'log', {
        service: 'ai',
        operation: 'tool_schedule_reminder',
        userId,
        ok: result.ok,
        fireAtIso: input.fire_at_iso,
      });
      return result;
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
