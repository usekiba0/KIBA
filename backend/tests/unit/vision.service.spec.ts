import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { VisionService } from '../../src/ai/vision.service';

jest.mock('axios');

describe('VisionService — validateProof', () => {
  let service: VisionService;
  let mockCreate: jest.Mock;
  let configValues: Record<string, string>;

  async function build() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => configValues[key] ?? def),
            getOrThrow: jest.fn(() => 'sk-ant-test'),
          },
        },
      ],
    }).compile();

    service = module.get<VisionService>(VisionService);
    (service as any).client = { messages: { create: mockCreate } };
  }

  beforeEach(async () => {
    mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"is_valid":true,"confidence":0.92,"reason":"Image shows a running track"}' }],
      usage: { input_tokens: 300, output_tokens: 30 },
    });

    // Deliberately different values: a regression that reads AI_MODEL again
    // shows up as the wrong model id rather than passing silently.
    configValues = {
      AI_MODEL: 'claude-haiku-4-5-20251001',
      AI_VISION_MODEL: 'claude-sonnet-4-6',
    };

    await build();
  });

  it('returns is_valid true when Claude confirms the proof matches the task', async () => {
    const result = await service.validateProof(
      'Run 5km before work',
      Buffer.from('fake-image'),
      'image/jpeg',
    );
    expect(result.is_valid).toBe(true);
  });

  it('returns confidence score from Claude response', async () => {
    const result = await service.validateProof('Run 5km', Buffer.from('img'), 'image/jpeg');
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it('returns a reason string from Claude', async () => {
    const result = await service.validateProof('Run 5km', Buffer.from('img'), 'image/jpeg');
    expect(result.reason).toContain('running');
  });

  it('returns is_valid false when Claude rejects the proof', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"is_valid":false,"confidence":0.1,"reason":"Image shows a cat, not exercise"}' }],
      usage: { input_tokens: 200, output_tokens: 20 },
    });
    const result = await service.validateProof('Run 5km', Buffer.from('img'), 'image/jpeg');
    expect(result.is_valid).toBe(false);
  });

  it('returns is_valid false gracefully when Claude returns malformed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const result = await service.validateProof('Run 5km', Buffer.from('img'), 'image/jpeg');
    expect(result.is_valid).toBe(false);
  });

  it('passes the task description in the prompt to Claude', async () => {
    await service.validateProof('Do 50 push-ups', Buffer.from('img'), 'image/jpeg');
    const callArgs = mockCreate.mock.calls[0][0];
    const textContent = callArgs.messages[0].content.find((c: any) => c.type === 'text');
    expect(textContent.text).toContain('Do 50 push-ups');
  });

  describe('model selection', () => {
    it('judges proof photos on the VISION model, never the cheap text model', async () => {
      // Proof verification ran on Haiku until 2026-07-29 — the weakest vision
      // model in the stack deciding whether someone's evidence counts.
      await service.validateProof('Run 5km', Buffer.from('img'), 'image/jpeg');
      expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-4-6');
      expect(mockCreate.mock.calls[0][0].model).not.toBe('claude-haiku-4-5-20251001');
    });

    it('sends temperature: 0 while we are on a 4-series vision model', async () => {
      await service.validateProof('Run 5km', Buffer.from('img'), 'image/jpeg');
      expect(mockCreate.mock.calls[0][0].temperature).toBe(0);
    });

    it('adapts the request shape when AI_VISION_MODEL is moved to a 5-series id', async () => {
      configValues.AI_VISION_MODEL = 'claude-sonnet-5';
      await build();

      await service.validateProof('Run 5km', Buffer.from('img'), 'image/jpeg');
      const params = mockCreate.mock.calls[0][0];

      expect(params.model).toBe('claude-sonnet-5');
      // Non-default temperature is a 400 on the 5-series...
      expect(params).not.toHaveProperty('temperature');
      // ...and without this the 128-token budget goes on thinking, not JSON.
      expect(params.thinking).toEqual({ type: 'disabled' });
    });

    it('tells the model to say so rather than guess at an unreadable photo', async () => {
      await service.validateProof('Run 5km', Buffer.from('img'), 'image/jpeg');
      const text = mockCreate.mock.calls[0][0].messages[0].content.find(
        (c: any) => c.type === 'text',
      ).text;
      expect(text).toMatch(/low confidence rather than guessing/);
    });
  });

  describe('validateProofFromUrl', () => {
    it('fetches the photo and returns the verdict for a normal jpeg', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('fake-jpeg-bytes') });
      const result = await service.validateProofFromUrl(
        'Run 5km',
        'https://storage.googleapis.com/inbound-file-store/abc_IMG.jpeg',
        'image/jpeg',
      );
      expect(result.is_valid).toBe(true);
      expect(result.confidence).toBeCloseTo(0.92);
      expect(axios.get).toHaveBeenCalled();
    });

    it('FAILS OPEN (is_valid true, confidence 0) when the fetch throws — never block a real user on infra', async () => {
      (axios.get as jest.Mock).mockRejectedValue(new Error('network down'));
      const result = await service.validateProofFromUrl('Run 5km', 'https://cdn/x.jpg', 'image/jpeg');
      expect(result.is_valid).toBe(true);
      expect(result.confidence).toBe(0);
    });
  });
});
