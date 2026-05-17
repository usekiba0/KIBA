import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient } from '../ai/anthropic.factory';
import { Correction, CorrectionStatus } from './entities/correction.entity';
import { CoachingKnowledge } from './entities/coaching-knowledge.entity';
import { Message, MessageRole } from './entities/message.entity';
import { structuredLog } from '../common/logger';

export const CORRECTION_PREFIX = '#kibi';

interface AnalysisResult {
  validity_score: number;
  analysis: string;
  suggested_knowledge: string;
}

@Injectable()
export class CorrectionService {
  private readonly logger = new Logger(CorrectionService.name);
  private readonly client: Anthropic;

  constructor(
    @InjectRepository(Correction) private readonly correctionRepo: Repository<Correction>,
    @InjectRepository(CoachingKnowledge) private readonly knowledgeRepo: Repository<CoachingKnowledge>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    private readonly config: ConfigService,
  ) {
    this.client = createAnthropicClient(config);
  }

  /** True if the message body starts with the correction trigger (case-insensitive). */
  static isCorrectionTrigger(body: string): boolean {
    return body.trim().toLowerCase().startsWith(CORRECTION_PREFIX);
  }

  /** Strip the `#kibi` prefix and return the correction text (may be empty). */
  static extractCorrectionText(body: string): string {
    const trimmed = body.trim();
    return trimmed.slice(CORRECTION_PREFIX.length).trim();
  }

  /**
   * Capture a user correction. Finds the most recent AI message in the session as the
   * target, asks Claude to analyze (best-effort, non-blocking), and persists the row.
   * Returns the saved correction so callers can ack the user with its id if useful.
   */
  async capture(args: {
    userId: string;
    sessionId: string;
    correctionText: string;
  }): Promise<Correction> {
    const triggering = await this.messageRepo.findOne({
      where: { session_id: args.sessionId, role: MessageRole.AI },
      order: { created_at: 'DESC' },
    });

    const analysis = await this.analyze(args.correctionText, triggering?.content).catch((err) => {
      this.logger.warn(`Correction analysis failed: ${(err as Error).message}`);
      return null;
    });

    const saved = await this.correctionRepo.save({
      user_id: args.userId,
      triggering_message_id: triggering?.id ?? null,
      correction_text: args.correctionText,
      ai_analysis: analysis?.analysis ?? null,
      ai_validity_score: analysis?.validity_score ?? null,
      ai_suggested_knowledge: analysis?.suggested_knowledge ?? null,
      status: CorrectionStatus.PENDING,
    });

    structuredLog(this.logger, 'log', {
      service: 'correction',
      operation: 'captured',
      userId: args.userId,
      correctionId: saved.id,
      validityScore: analysis?.validity_score ?? null,
    });

    return saved;
  }

  /** Active knowledge entries to inject into the AI system prompt. */
  async getActiveKnowledge(): Promise<CoachingKnowledge[]> {
    return this.knowledgeRepo.find({
      where: { active: true },
      order: { created_at: 'ASC' },
    });
  }

  async listCorrections(includeReviewed: boolean): Promise<Correction[]> {
    return this.correctionRepo.find({
      where: includeReviewed
        ? undefined
        : { status: CorrectionStatus.PENDING },
      order: { created_at: 'DESC' },
      take: 200,
    });
  }

  async accept(args: {
    correctionId: string;
    reviewedBy: string;
    title: string;
    content: string;
  }): Promise<{ correction: Correction; knowledge: CoachingKnowledge }> {
    const correction = await this.correctionRepo.findOneOrFail({ where: { id: args.correctionId } });
    const knowledge = await this.knowledgeRepo.save({
      title: args.title,
      content: args.content,
      source_correction_id: correction.id,
      active: true,
      created_by: args.reviewedBy,
    });
    await this.correctionRepo.update(correction.id, {
      status: CorrectionStatus.ACCEPTED,
      knowledge_id: knowledge.id,
      reviewed_by: args.reviewedBy,
      reviewed_at: new Date(),
    });
    return {
      correction: await this.correctionRepo.findOneOrFail({ where: { id: correction.id } }),
      knowledge,
    };
  }

  async append(args: {
    correctionId: string;
    reviewedBy: string;
    knowledgeId: string;
    appendedContent: string;
  }): Promise<{ correction: Correction; knowledge: CoachingKnowledge }> {
    const correction = await this.correctionRepo.findOneOrFail({ where: { id: args.correctionId } });
    const existing = await this.knowledgeRepo.findOneOrFail({ where: { id: args.knowledgeId } });
    const newContent = `${existing.content}\n\n${args.appendedContent}`;
    await this.knowledgeRepo.update(existing.id, { content: newContent });
    await this.correctionRepo.update(correction.id, {
      status: CorrectionStatus.APPENDED,
      knowledge_id: existing.id,
      reviewed_by: args.reviewedBy,
      reviewed_at: new Date(),
    });
    return {
      correction: await this.correctionRepo.findOneOrFail({ where: { id: correction.id } }),
      knowledge: await this.knowledgeRepo.findOneOrFail({ where: { id: existing.id } }),
    };
  }

  async reject(args: {
    correctionId: string;
    reviewedBy: string;
    note?: string;
  }): Promise<Correction> {
    await this.correctionRepo.update(args.correctionId, {
      status: CorrectionStatus.REJECTED,
      admin_note: args.note ?? null,
      reviewed_by: args.reviewedBy,
      reviewed_at: new Date(),
    });
    return this.correctionRepo.findOneOrFail({ where: { id: args.correctionId } });
  }

  async listKnowledge(): Promise<CoachingKnowledge[]> {
    return this.knowledgeRepo.find({ order: { created_at: 'DESC' }, take: 200 });
  }

  async setKnowledgeActive(id: string, active: boolean): Promise<CoachingKnowledge> {
    await this.knowledgeRepo.update(id, { active });
    return this.knowledgeRepo.findOneOrFail({ where: { id } });
  }

  private async analyze(correctionText: string, triggeringMessage?: string): Promise<AnalysisResult> {
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    const systemPrompt = `You triage user corrections to an AI coaching assistant called Kiba.

For each correction, output ONLY a JSON object with three fields:
- "validity_score": integer 0-100. How reasonable does the correction look? 0 = abuse/spam/nonsense. 50 = unclear. 100 = clearly a legitimate fact/tone correction.
- "analysis": 1-2 sentences in plain English. What is the user actually correcting? Is it a fact, a tone, a safety concern, or noise?
- "suggested_knowledge": a single short paragraph (under 60 words) drafted as advice the AI could store and apply going forward. Phrase it as a rule or fact the AI should know. If the correction is not actionable, return an empty string.

Output only the JSON object, no prose, no markdown fences.`;

    const userText = triggeringMessage
      ? `Kiba previously replied:\n"""\n${triggeringMessage}\n"""\n\nThe user corrected this with:\n"""\n${correctionText}\n"""`
      : `The user submitted this correction (no prior AI message in this session):\n"""\n${correctionText}\n"""`;

    const response = await this.client.messages.create({
      model,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<AnalysisResult>;

    const score = typeof parsed.validity_score === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.validity_score)))
      : 0;
    return {
      validity_score: score,
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
      suggested_knowledge: typeof parsed.suggested_knowledge === 'string' ? parsed.suggested_knowledge : '',
    };
  }
}
