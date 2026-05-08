import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlanService } from '../../src/ai/plan.service';
import { buildPlanPrompt } from '../../src/ai/prompts/plan.prompt';
import { PressurePreference } from '../../src/data/entities/psychological-profile.entity';
import { Goal } from '../../src/data/entities/goal.entity';

const mockPsychProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  fears: 'Staying stuck while everyone moves forward',
  avoidance_patterns: 'Scrolling phone when I should be working',
  comparison_figure: 'My college roommate who started his own company',
  public_failure_scenario: 'Friends finding out I quit again after one week',
  typical_failure_moment: 'Sunday evenings when motivation drops',
  pressure_preference: PressurePreference.PRESSURE,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockGoalData = {
  description: 'Run a 5K in under 30 minutes',
  timeline: '60 days',
  current_status: 'I can barely run 1K without stopping',
};

const mockPlanJson = {
  milestones: ['Run 2K without stopping', 'Run 3.5K', 'Complete full 5K'],
  weekly_breakdown: ['Week 1: 3x 1K runs at easy pace', 'Week 2: 3x 1.5K runs'],
  daily_tasks: ['Day 1: 1K run at easy pace', 'Day 2: Rest or 20min walk', 'Day 3: 1K run with 5min faster'],
};

describe('buildPlanPrompt', () => {
  it('includes the goal description in the prompt', () => {
    const prompt = buildPlanPrompt(mockGoalData, mockPsychProfile as any);
    expect(prompt).toContain(mockGoalData.description);
  });

  it('includes the timeline in the prompt', () => {
    const prompt = buildPlanPrompt(mockGoalData, mockPsychProfile as any);
    expect(prompt).toContain(mockGoalData.timeline);
  });

  it('includes the current status in the prompt', () => {
    const prompt = buildPlanPrompt(mockGoalData, mockPsychProfile as any);
    expect(prompt).toContain(mockGoalData.current_status);
  });

  it('includes the fear from psychological profile', () => {
    const prompt = buildPlanPrompt(mockGoalData, mockPsychProfile as any);
    expect(prompt).toContain(mockPsychProfile.fears);
  });

  it('instructs Claude to return valid JSON with milestones, weekly_breakdown, daily_tasks', () => {
    const prompt = buildPlanPrompt(mockGoalData, mockPsychProfile as any);
    expect(prompt).toContain('milestones');
    expect(prompt).toContain('weekly_breakdown');
    expect(prompt).toContain('daily_tasks');
    expect(prompt.toLowerCase()).toContain('json');
  });
});

describe('PlanService', () => {
  let service: PlanService;
  let mockAnthropicCreate: jest.Mock;

  beforeEach(async () => {
    mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockPlanJson) }],
      usage: { input_tokens: 300, output_tokens: 150 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => {
              if (key === 'AI_MODEL') return 'claude-haiku-4-5-20251001';
              return def;
            }),
            getOrThrow: jest.fn(() => 'sk-ant-test'),
          },
        },
      ],
    }).compile();

    service = module.get<PlanService>(PlanService);
    (service as any).client = { messages: { create: mockAnthropicCreate } };
  });

  it('calls Claude API with the plan prompt', async () => {
    await service.generatePlan(mockGoalData, mockPsychProfile as any);
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.system).toContain(mockGoalData.description);
    expect(callArgs.max_tokens).toBeGreaterThan(500);
  });

  it('parses Claude JSON response into ActionPlan shape', async () => {
    const result = await service.generatePlan(mockGoalData, mockPsychProfile as any);
    expect(result.milestones).toHaveLength(3);
    expect(result.weekly_breakdown).toHaveLength(2);
    expect(result.daily_tasks).toHaveLength(3);
  });

  it('returns milestones as an array of strings', async () => {
    const result = await service.generatePlan(mockGoalData, mockPsychProfile as any);
    result.milestones.forEach((m: string) => expect(typeof m).toBe('string'));
  });

  it('returns at least 3 daily_tasks', async () => {
    const result = await service.generatePlan(mockGoalData, mockPsychProfile as any);
    expect(result.daily_tasks.length).toBeGreaterThanOrEqual(3);
  });

  it('handles Claude response wrapped in markdown code block', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(mockPlanJson) + '\n```' }],
      usage: { input_tokens: 300, output_tokens: 150 },
    });
    const result = await service.generatePlan(mockGoalData, mockPsychProfile as any);
    expect(result.milestones).toHaveLength(3);
  });

  it('logs token usage', async () => {
    const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation(() => {});
    await service.generatePlan(mockGoalData, mockPsychProfile as any);
    expect(logSpy).toHaveBeenCalled();
  });
});
