import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { User } from '../data/entities/user.entity';
import { Message } from '../data/entities/message.entity';
import { buildSystemPrompt } from './prompts/coaching.prompt';
import { structuredLog, warnTokenBudget } from '../common/logger';

@Injectable()
export class CoachingService {
  private readonly logger = new Logger(CoachingService.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.getOrThrow('ANTHROPIC_API_KEY') });
  }

  async generateReply(user: User, recentMessages: Message[], incomingText: string, sessionSummary?: string): Promise<{ reply: string; tokenCount: number }> {
    const systemPrompt = buildSystemPrompt(user, sessionSummary);
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');

    const history = recentMessages.map(m => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
    history.push({ role: 'user', content: incomingText });

    const response = await this.client.messages.create({
      model,
      max_tokens: 256,
      system: systemPrompt,
      messages: history,
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;

    structuredLog(this.logger, 'log', {
      service: 'ai', operation: 'coaching_reply',
      userId: user.id, model, inputTokens, outputTokens, totalTokens,
    });
    warnTokenBudget(this.logger, { service: 'ai', operation: 'coaching_reply', userId: user.id, inputTokens, outputTokens });

    return { reply, tokenCount: totalTokens };
  }
}
