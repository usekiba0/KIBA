import { Logger } from '@nestjs/common';

export interface LogPayload {
  service: string;
  operation: string;
  userId?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  totalTokens?: number;
  model?: string;
  [key: string]: unknown;
}

export function structuredLog(
  logger: Logger,
  level: 'log' | 'warn' | 'error',
  payload: LogPayload,
) {
  const message = JSON.stringify({ timestamp: new Date().toISOString(), ...payload });
  logger[level](message);
}

// Default ceiling above which a single LLM exchange is flagged as unexpectedly
// expensive. A normal coaching/intake turn legitimately spends several thousand
// input tokens (the system prompt is uncached and ~5k, plus growing history),
// and tool-use turns re-send that context across iterations — so the old 4000
// ceiling fired on essentially every message and was pure noise. This is meant
// to catch genuine runaways (tool loops, oversized context); tune via env from
// real logs without a redeploy.
const DEFAULT_TOKEN_BUDGET_WARN_TOKENS = 20000;

export function warnTokenBudget(logger: Logger, payload: LogPayload) {
  const threshold = Number(process.env.TOKEN_BUDGET_WARN_TOKENS) || DEFAULT_TOKEN_BUDGET_WARN_TOKENS;
  const total = (payload.inputTokens ?? 0) + (payload.outputTokens ?? 0);
  if (total > threshold) {
    structuredLog(logger, 'warn', {
      ...payload,
      operation: 'token_budget_exceeded',
      totalTokens: total,
      thresholdTokens: threshold,
    });
  }
}
