import Anthropic from '@anthropic-ai/sdk';
import * as https from 'https';
import { ConfigService } from '@nestjs/config';

// Render drops idle keep-alive connections — pass a fresh agent so the SDK
// never tries to reuse a stale socket across requests.
const agent = new https.Agent({ keepAlive: false, timeout: 30_000 });

export function createAnthropicClient(config: ConfigService): Anthropic {
  return new Anthropic({
    apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpAgent: agent as any,
    maxRetries: 1,
    timeout: 30_000,
  });
}
