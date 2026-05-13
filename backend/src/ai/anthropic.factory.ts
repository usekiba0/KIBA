import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch as undiciFetch } from 'undici';

// Render drops idle keep-alive connections — use undici directly with a
// fresh dispatcher per-request so the SDK never reuses a stale socket.
const dispatcher = new Agent({
  connect: { keepAlive: false, timeout: 30_000 },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const customFetch: typeof fetch = (url, init) =>
  undiciFetch(url as string, { ...(init as any), dispatcher }) as any;

export function createAnthropicClient(config: ConfigService): Anthropic {
  return new Anthropic({
    apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    fetch: customFetch,
    maxRetries: 1,
    timeout: 30_000,
  });
}
