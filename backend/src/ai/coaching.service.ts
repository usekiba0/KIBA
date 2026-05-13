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
import { structuredLog, warnTokenBudget } from '../common/logger';

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
  ) {
    this.client = createAnthropicClient(config);
  }

  private isSupportedImageFormat(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
           lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.webp');
  }

  async generateReply(
    user: User,
    recentMessages: Message[],
    incomingText: string,
    sessionSummary?: string,
    imageUrl?: string,
  ): Promise<{ reply: string; tokenCount: number }> {
    const [profile, latestScore, strikeCount] = await Promise.all([
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
    ]);

    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    const systemPrompt = profile
      ? buildSystemPrompt(user, profile, latestScore?.current_score ?? 0, strikeCount, sessionSummary)
      : `You are Kiba — a psychological accountability system. User: ${user.name}. When asked for plans, workouts, or advice, give them immediately and specifically. Always end with a required action or accountability demand. No hedging, no refusing.`;

    type MsgParam = Anthropic.Messages.MessageParam;
    const history: MsgParam[] = recentMessages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

    const lastContent = imageUrl && this.isSupportedImageFormat(imageUrl)
      ? [
          { type: 'image' as const, source: { type: 'url' as const, url: imageUrl } },
          { type: 'text' as const, text: incomingText || 'What do you see? Respond as my accountability coach.' },
        ]
      : (incomingText || (imageUrl ? 'I sent you a photo.' : 'I sent you a message.'));
    history.push({ role: 'user', content: lastContent });

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
      service: 'ai',
      operation: 'coaching_reply',
      userId: user.id,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
    });
    warnTokenBudget(this.logger, {
      service: 'ai',
      operation: 'coaching_reply',
      userId: user.id,
      inputTokens,
      outputTokens,
    });

    return { reply, tokenCount: totalTokens };
  }
}
