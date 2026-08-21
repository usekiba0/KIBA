import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient } from './anthropic.factory';
import { Message } from '../data/entities/message.entity';
import { SessionSummary, SummaryTrigger } from '../data/entities/session-summary.entity';
import { ConversationSession } from '../data/entities/conversation-session.entity';
import { User } from '../data/entities/user.entity';
import { buildSummarisationPrompt, buildRelationshipMemoryPrompt, buildHardFactsExtractionPrompt } from './prompts/summarisation.prompt';
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
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    this.client = createAnthropicClient(config);
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

  /**
   * LAYER 2 — merge the just-closed session into the user's persistent
   * relationship_memory. Loaded into every coaching prompt, so this is what lets
   * KIBA remember someone across days. CRITICAL: only overwrite the stored memory
   * when the merge produces real text — on any error or empty result we leave the
   * prior memory untouched, so a transient LLM/DB hiccup can never wipe what KIBA
   * knew (the failure mode that made the old session-summary path amnesiac).
   */
  async updateRelationshipMemory(userId: string, sessionId: string): Promise<void> {
    const messages = await this.messageRepo.find({
      where: { session_id: sessionId },
      order: { created_at: 'ASC' },
    });
    if (messages.length === 0) return;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');

    // LAYER 3 — capture new "never forget" facts FIRST (best-effort, isolated so a
    // failure here can't block the digest). These anchor the merge below.
    const anchors = await this.extractAndStoreHardFacts(userId, user, messages, model).catch((err) => {
      this.logger.warn(`hard-fact extraction failed for ${userId}: ${err}`);
      return user.intake_data?.notes ?? [];
    });

    const response = await this.client.messages.create({
      model,
      max_tokens: 600,
      messages: [
        { role: 'user', content: buildRelationshipMemoryPrompt(user.relationship_memory, messages, anchors) },
      ],
    });

    const updated = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (!updated) {
      // Keep the prior memory rather than blanking it. Logged so we can see drift.
      this.logger.warn(`relationship memory merge returned empty for ${userId}; keeping prior`);
      return;
    }

    await this.userRepo.update(userId, {
      relationship_memory: updated,
      relationship_memory_updated_at: new Date(),
    });

    structuredLog(this.logger, 'log', {
      service: 'ai', operation: 'relationship_memory_updated',
      userId, sessionId, messageCount: messages.length,
      hadPrior: Boolean(user.relationship_memory),
      inputTokens: response.usage.input_tokens,
    });
  }

  /** Max durable facts kept per user — a bounded, append-only anchor list. */
  private static readonly MAX_HARD_FACTS = 30;

  /**
   * LAYER 3 — extract NEW durable facts from the just-closed session and append
   * them to the user's append-only notes list (never rewritten, so they can't
   * drift out of the LLM-rewritten digest). Returns the full fact list (existing +
   * new) for use as digest anchors. Best-effort: parse failures keep the prior list.
   */
  private async extractAndStoreHardFacts(
    userId: string,
    user: User,
    messages: Message[],
    model: string,
  ): Promise<string[]> {
    const existing = (user.intake_data?.notes ?? []).map((f) => f.trim()).filter(Boolean);

    const response = await this.client.messages.create({
      model,
      max_tokens: 300,
      messages: [{ role: 'user', content: buildHardFactsExtractionPrompt(existing, messages) }],
    });
    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (!raw || /^none$/i.test(raw)) return existing;

    const seen = new Set(existing.map((f) => f.toLowerCase()));
    const fresh: string[] = [];
    for (const line of raw.split('\n')) {
      const fact = line.replace(/^[-*\d.)\s]+/, '').trim();
      if (!fact || /^none$/i.test(fact)) continue;
      const key = fact.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(fact);
    }
    if (fresh.length === 0) return existing;

    // Append-only, oldest-trimmed if we exceed the cap.
    const merged = [...existing, ...fresh].slice(-SummarisationService.MAX_HARD_FACTS);
    await this.userRepo.update(userId, {
      intake_data: { ...(user.intake_data ?? {}), notes: merged },
    });

    structuredLog(this.logger, 'log', {
      service: 'ai', operation: 'hard_facts_stored',
      userId, newFacts: fresh.length, totalFacts: merged.length,
    });
    return merged;
  }
}
