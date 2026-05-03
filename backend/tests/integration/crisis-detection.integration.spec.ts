import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CrisisService } from '../../src/ai/crisis.service';

describe('Crisis Detection Integration', () => {
  let crisisService: CrisisService;

  const mockConfig = {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'CRISIS_CONFIDENCE_THRESHOLD') return 0.65;
      if (key === 'AI_MODEL') return process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001';
      return def;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'ANTHROPIC_API_KEY') return process.env.ANTHROPIC_API_KEY ?? '';
      throw new Error(`Missing: ${key}`);
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrisisService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    crisisService = module.get(CrisisService);
  });

  describe('Keyword fast-path', () => {
    it('should detect explicit suicide keyword without API call', async () => {
      const result = await crisisService.classify('I want to kill myself');
      expect(result.crisis).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.method).toBe('keyword');
    });

    it('should detect self-harm keyword', async () => {
      const result = await crisisService.classify('I keep hurting myself');
      expect(result.crisis).toBe(true);
      expect(result.method).toBe('keyword');
    });
  });

  describe('Normal messages — should not trigger', () => {
    it('should not flag a normal fitness message', async () => {
      if (!process.env.ANTHROPIC_API_KEY) return;

      const result = await crisisService.classify('I went for a 30-minute run today!');
      expect(result.crisis).toBe(false);
      expect(result.confidence).toBeLessThan(0.65);
    }, 15000);

    it('should not flag mild frustration', async () => {
      if (!process.env.ANTHROPIC_API_KEY) return;

      const result = await crisisService.classify('Ugh, I missed my workout again, feeling lazy');
      expect(result.crisis).toBe(false);
    }, 15000);
  });

  describe('Fail-safe behaviour', () => {
    it('should return crisis=true when classifier throws (API down simulation)', async () => {
      const badConfig = {
        get: jest.fn((key: string, def?: unknown) => {
          if (key === 'CRISIS_CONFIDENCE_THRESHOLD') return 0.65;
          return def;
        }),
        getOrThrow: jest.fn(() => 'invalid_key_that_will_fail'),
      };

      const failModule = await Test.createTestingModule({
        providers: [CrisisService, { provide: ConfigService, useValue: badConfig }],
      }).compile();

      const failService = failModule.get(CrisisService);
      // Message with distress words that bypasses benign fast-path and reaches the API
      const result = await failService.classify('I feel completely hopeless and empty, nothing helps me anymore');
      // Should fail safe — return crisis:true when API fails
      expect(result.crisis).toBe(true);
      expect(result.dimension).toBe('classifier_unavailable');
    }, 10000);
  });
});
