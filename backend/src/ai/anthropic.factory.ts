import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';

// Use axios (proven to work on Render) as the HTTP transport for the Anthropic SDK.
// Native fetch / undici have keep-alive connection issues on Render's infrastructure.
const httpsAgent = new https.Agent({ keepAlive: false, timeout: 30_000 });

async function axiosFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      (init.headers as [string, string][]).forEach(([k, v]) => { headers[k] = v; });
    } else {
      Object.assign(headers, init.headers as Record<string, string>);
    }
  }

  const res = await axios.request({
    url: url.toString(),
    method: (init?.method ?? 'GET') as string,
    headers,
    data: init?.body,
    httpsAgent,
    timeout: 30_000,
    responseType: 'arraybuffer',
    validateStatus: () => true,
  });

  const responseHeaders = new Headers();
  Object.entries(res.headers).forEach(([k, v]) => {
    if (v != null) responseHeaders.set(k, String(v));
  });

  return new Response(res.data as ArrayBuffer, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export function createAnthropicClient(config: ConfigService): Anthropic {
  return new Anthropic({
    apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    fetch: axiosFetch,
    maxRetries: 1,
    timeout: 30_000,
  });
}
