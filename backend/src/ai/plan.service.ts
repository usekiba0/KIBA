import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { ActionPlan } from '../data/entities/goal.entity';
import { buildPlanPrompt } from './prompts/plan.prompt';
import { structuredLog } from '../common/logger';

interface GoalData {
  description: string;
  timeline: string;
  current_status: string;
}

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.getOrThrow('ANTHROPIC_API_KEY') });
  }

  async generatePlan(goal: GoalData, profile: PsychologicalProfile): Promise<ActionPlan> {
    const model = this.config.get<string>('AI_MODEL', 'claude-haiku-4-5-20251001');
    const systemPrompt = buildPlanPrompt(goal, profile);

    const response = await this.client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate my action plan now.' }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const plan: ActionPlan = JSON.parse(cleaned);

    structuredLog(this.logger, 'log', {
      service: 'ai',
      operation: 'plan_generated',
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return plan;
  }
}
