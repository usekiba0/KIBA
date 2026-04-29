import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Message } from '../data/entities/message.entity';
import { SessionSummary, SummaryTrigger } from '../data/entities/session-summary.entity';
import { ConversationSession } from '../data/entities/conversation-session.entity';
import { buildSummarisationPrompt } from './prompts/summarisation.prompt';
import { structuredLog } from '../common/logger';

@Injectable()
export class SummarisationService {
  private readonly logger = new Logger(SummarisationService.name);
  private readonly client: Anthropic;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(SessionSummary) private readonly summaryRepo: Repository<SessionSummary>,
    @InjectRepository(ConversationSession) private readonly sessionRepo: Repository<ConversationSession>,
  ) {
    this.client = new Anthropic({ apiKey: config.getOrThrow('ANTHROPIC_API_KEY') });
  }

  async summariseSession(userId: string, sessionId: string, trigger: SummaryTrigger): Promise<string> {
    const messages = await this.messageRepo.find({
      where: { session_id: sessionId },
      order: { created_at: 'ASC' },
    });

    if (messages.length === 0) return '';

    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    const response = await this.client.messages.create({
      model,
      max_tokens: 400,
      messages: [{ role: 'user', content: buildSummarisationPrompt(messages) }],
    });

    const summary = response.content[0].type === 'text' ? response.content[0].text : '';

    await this.summaryRepo.save({
      user_id: userId,
      session_id: sessionId,
      summary,
      message_count_summarised: messages.length,
      trigger,
    });

    await this.sessionRepo.update(sessionId, { summary_generated: true });

    structuredLog(this.logger, 'log', {
      service: 'ai', operation: 'session_summarised',
      userId, sessionId, messageCount: messages.length,
      inputTokens: response.usage.input_tokens,
    });

    return summary;
  }
}
