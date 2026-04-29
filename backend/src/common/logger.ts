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

export function structuredLog(logger: Logger, level: 'log' | 'warn' | 'error', payload: LogPayload) {
  const message = JSON.stringify({ timestamp: new Date().toISOString(), ...payload });
  logger[level](message);
}

export function warnTokenBudget(logger: Logger, payload: LogPayload) {
  const total = (payload.inputTokens ?? 0) + (payload.outputTokens ?? 0);
  if (total > 500) {
    structuredLog(logger, 'warn', {
      ...payload,
      operation: 'token_budget_exceeded',
      totalTokens: total,
    });
  }
}
