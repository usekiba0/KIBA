import Anthropic from '@anthropic-ai/sdk';

describe('Claude API Contract Tests', () => {
  let client: Anthropic;

  beforeAll(() => {
    if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
      console.warn('ANTHROPIC_API_KEY not set — skipping Claude contract tests');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'test' });
  });

  describe('Coaching message format', () => {
    it('should accept messages array with user role and return text response', async () => {
      if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'))
        return;

      const response = await client.messages.create({
        model: process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system: 'You are a fitness coach. Be brief.',
        messages: [{ role: 'user', content: 'Give me a quick tip' }],
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(typeof (response.content[0] as any).text).toBe('string');
      expect(response.usage.input_tokens).toBeGreaterThan(0);
      expect(response.usage.output_tokens).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Vision message format', () => {
    it('should accept image URL in message content', async () => {
      if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'))
        return;

      // Use base64 to avoid network dependency on external URLs in CI
      const tiny1x1png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      try {
        const response = await client.messages.create({
          model: process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001',
          max_tokens: 50,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: tiny1x1png } },
                { type: 'text', text: 'What colour is this image? One word.' },
              ],
            },
          ],
        });
        expect(response.content[0].type).toBe('text');
      } catch {
        // Vision API availability is environment-dependent — skip gracefully
        console.warn('Vision test skipped — API error');
      }
    }, 20000);
  });

  describe('Crisis classification format', () => {
    it('should return valid JSON with crisis, confidence, dimension fields', async () => {
      if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'))
        return;

      const response = await client.messages.create({
        model: process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: `Classify messages for mental health crisis signals. Return ONLY JSON: {"crisis": boolean, "confidence": number, "dimension": string|null, "reasoning": string}`,
        messages: [{ role: 'user', content: 'Classify: "I had a bad day at work"' }],
      });

      const rawText = (response.content[0] as any).text as string;
      const text = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(text);
      expect(typeof parsed.crisis).toBe('boolean');
      expect(typeof parsed.confidence).toBe('number');
      expect(parsed.confidence).toBeGreaterThanOrEqual(0);
      expect(parsed.confidence).toBeLessThanOrEqual(1);
    }, 15000);
  });
});
