import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { User } from '../data/entities/user.entity';
import { buildNutritionPrompt } from './prompts/vision.prompt';
import { structuredLog } from '../common/logger';

export interface NutritionResult {
  food_identified: boolean;
  detected_foods: string[];
  total_calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  health_condition_flags: string[];
  dietary_recommendation: string | null;
}

const EMPTY_RESULT: NutritionResult = {
  food_identified: false, detected_foods: [], total_calories: null,
  protein_grams: null, carbs_grams: null, fat_grams: null,
  health_condition_flags: [], dietary_recommendation: null,
};

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.getOrThrow('ANTHROPIC_API_KEY') });
  }

  async analyseFood(mediaUrl: string, user: User): Promise<NutritionResult> {
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    const response = await this.client.messages.create({
      model,
      max_tokens: 512,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: mediaUrl } },
          { type: 'text', text: buildNutritionPrompt(user) },
        ],
      }],
    });
    structuredLog(this.logger, 'log', {
      service: 'ai', operation: 'vision_analysis', userId: user.id,
      inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
    });
    return this.parseResponse(response);
  }

  async analyseFoodFromBytes(imageBytes: Buffer, mimeType: string, user: User): Promise<NutritionResult> {
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mediaType = (validTypes.includes(mimeType) ? mimeType : 'image/jpeg') as
      'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const response = await this.client.messages.create({
      model,
      max_tokens: 512,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBytes.toString('base64') } },
          { type: 'text', text: buildNutritionPrompt(user) },
        ],
      }],
    });
    structuredLog(this.logger, 'log', {
      service: 'ai', operation: 'vision_analysis_imessage', userId: user.id,
      inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
    });
    return this.parseResponse(response);
  }

  private parseResponse(response: Anthropic.Message): NutritionResult {
    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
    this.logger.log(`[Vision] raw response: ${raw.substring(0, 300)}`);
    // Strip markdown code fences Claude sometimes adds despite "ONLY valid JSON" instruction
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(text);
      return {
        food_identified: parsed.food_identified ?? false,
        detected_foods: parsed.detected_foods ?? [],
        total_calories: parsed.total_calories ?? null,
        protein_grams: parsed.macronutrients?.protein_grams ?? null,
        carbs_grams: parsed.macronutrients?.carbs_grams ?? null,
        fat_grams: parsed.macronutrients?.fat_grams ?? null,
        health_condition_flags: parsed.health_condition_flags ?? [],
        dietary_recommendation: parsed.dietary_recommendation ?? null,
      };
    } catch {
      return { ...EMPTY_RESULT };
    }
  }
}
