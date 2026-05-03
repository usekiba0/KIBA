import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CrisisService } from '../../src/ai/crisis.service';

describe('CrisisService Unit Tests', () => {
  let service: CrisisService;
  let mockAnthropicCreate: jest.Mock;

  const mockConfig = {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'CRISIS_CONFIDENCE_THRESHOLD') return 0.65;
      if (key === 'AI_MODEL') return 'claude-haiku-4-5-20251001';
      return def;
    }),
    getOrThrow: jest.fn(() => 'sk-ant-test'),
  };

  beforeEach(async () => {
    jest.mock('@anthropic-ai/sdk', () => ({
      default: jest.fn().mockImplementation(() => ({
        messages: { create: mockAnthropicCreate },
      })),
    }));

    const module = await Test.createTestingModule({
      providers: [CrisisService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    service = module.get(CrisisService);
    mockAnthropicCreate = jest.fn();
  });

  it('should return crisis=true for keyword match without API call', async () => {
    const result = await service.classify('I want to kill myself tonight');
    expect(result.crisis).toBe(true);
    expect(result.method).toBe('keyword');
    expect(result.confidence).toBe(0.95);
  });

  it('should return crisis=true for "end my life" keyword', async () => {
    const result = await service.classify('I just want to end my life');
    expect(result.crisis).toBe(true);
    expect(result.method).toBe('keyword');
  });

  it('should return crisis=false for normal messages (mocked API)', async () => {
    // Manually set up the service's internal client mock
    (service as any).client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '{"crisis":false,"confidence":0.1,"dimension":null,"reasoning":"Normal message"}',
            },
          ],
          usage: { input_tokens: 50, output_tokens: 20 },
        }),
      },
    };

    const result = await service.classify('I had a great workout today!');
    expect(result.crisis).toBe(false);
  });

  it('should fail safe when API returns malformed JSON', async () => {
    (service as any).client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'this is not json' }],
          usage: { input_tokens: 50, output_tokens: 5 },
        }),
      },
    };

    // Use a message with distress vocabulary so it bypasses the benign fast-path and reaches the API
    const result = await service.classify('I feel completely hopeless and empty inside, nothing helps');
    expect(result.crisis).toBe(false);
    expect(result.confidence).toBe(0.1);
  });

  it('should fail safe when API throws', async () => {
    (service as any).client = {
      messages: { create: jest.fn().mockRejectedValue(new Error('API unavailable')) },
    };

    // Use a message with distress vocabulary so it bypasses the benign fast-path and reaches the API
    const result = await service.classify('I feel completely hopeless and empty inside, nothing helps');
    expect(result.crisis).toBe(true);
    expect(result.dimension).toBe('classifier_unavailable');
  });
});
