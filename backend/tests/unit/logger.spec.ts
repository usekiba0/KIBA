import { Logger } from '@nestjs/common';
import { warnTokenBudget } from '../../src/common/logger';

describe('warnTokenBudget', () => {
  let logger: Logger;
  let warnSpy: jest.Mock;
  const originalEnv = process.env.TOKEN_BUDGET_WARN_TOKENS;

  beforeEach(() => {
    warnSpy = jest.fn();
    logger = { warn: warnSpy } as unknown as Logger;
    delete process.env.TOKEN_BUDGET_WARN_TOKENS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.TOKEN_BUDGET_WARN_TOKENS;
    else process.env.TOKEN_BUDGET_WARN_TOKENS = originalEnv;
  });

  it('stays silent for a normal-sized coaching turn (~6k tokens)', () => {
    warnTokenBudget(logger, { service: 'ai', operation: 'coaching', inputTokens: 5500, outputTokens: 400 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns only on a genuine overage above the default ceiling', () => {
    warnTokenBudget(logger, { service: 'ai', operation: 'coaching', inputTokens: 21000, outputTokens: 500 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(logged.operation).toBe('token_budget_exceeded');
    expect(logged.totalTokens).toBe(21500);
  });

  it('honors a TOKEN_BUDGET_WARN_TOKENS env override', () => {
    process.env.TOKEN_BUDGET_WARN_TOKENS = '5000';
    warnTokenBudget(logger, { service: 'ai', operation: 'coaching', inputTokens: 5500, outputTokens: 400 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
