import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { CRISIS_SYSTEM_PROMPT, buildCrisisMessages } from './prompts/crisis.prompt';
import { HIGH_RISK_KEYWORDS } from '../safety/crisis-keywords';
import { structuredLog } from '../common/logger';

export interface CrisisResult {
  crisis: boolean;
  confidence: number;
  dimension: string | null;
  method: 'keyword' | 'ml_classifier';
  reasoning?: string;
}

@Injectable()
export class CrisisService {
  private readonly logger = new Logger(CrisisService.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.getOrThrow('ANTHROPIC_API_KEY') });
  }

  async classify(text: string): Promise<CrisisResult> {
    // Fast-path: keyword detection (no API call, immediate)
    const lowerText = text.toLowerCase();
    const matchedKeyword = HIGH_RISK_KEYWORDS.find(kw => lowerText.includes(kw));
    if (matchedKeyword) {
      return { crisis: true, confidence: 0.95, dimension: 'suicidal_ideation', method: 'keyword' };
    }

    const threshold = this.config.get<number>('CRISIS_CONFIDENCE_THRESHOLD', 0.65);
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: 150,
        system: CRISIS_SYSTEM_PROMPT,
        messages: buildCrisisMessages(text),
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Malformed JSON from AI — fail safe: treat as low confidence non-crisis
        this.logger.warn(`Crisis classifier returned invalid JSON: ${raw}`);
        return { crisis: false, confidence: 0.1, dimension: null, method: 'ml_classifier' };
      }

      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

      structuredLog(this.logger, 'log', {
        service: 'ai', operation: 'crisis_classify',
        confidence, dimension: parsed.dimension ?? null,
        inputTokens: response.usage.input_tokens,
        cacheReadTokens: (response.usage as any).cache_read_input_tokens ?? 0,
      });

      return {
        crisis: confidence >= threshold,
        confidence,
        dimension: (parsed.dimension as string) ?? null,
        method: 'ml_classifier',
        reasoning: parsed.reasoning as string | undefined,
      };
    } catch (err) {
      // SAFETY-CRITICAL: On any API failure, trigger conservative hold.
      // A live crisis must never be missed due to an infrastructure outage.
      this.logger.error(`Crisis classification API error — failing safe: ${err}`);
      return {
        crisis: true,
        confidence: 0.5,
        dimension: 'classifier_unavailable',
        method: 'ml_classifier',
        reasoning: 'Crisis classifier unavailable — conservative hold triggered',
      };
    }
  }
}
