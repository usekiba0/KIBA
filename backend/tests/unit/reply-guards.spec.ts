import { Logger } from '@nestjs/common';
import {
  guardMode,
  applyMemoryGuard,
  applySensitiveGuard,
} from '../../src/ai/reply-guards';

const silent = () => {
  const logger = new Logger('test');
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  return logger;
};

describe('guard mode', () => {
  it('defaults to observe', () => {
    // The important default in the file. A missing env var must never start rewriting live
    // replies.
    expect(guardMode({})).toBe('observe');
  });

  it('enforces only on the exact string true', () => {
    expect(guardMode({ REPLY_GUARDS_ENFORCE: 'true' })).toBe('enforce');
    // A typo must fail safe rather than silently half-enabling anything.
    for (const v of ['TRUE', 'True', '1', 'yes', 'enforce', '']) {
      expect(guardMode({ REPLY_GUARDS_ENFORCE: v })).toBe('observe');
    }
  });
});

describe('memory guard wiring (INV-2)', () => {
  const context = 'goal: 30 cold emails a day. gym at 6pm.';

  it('leaves a clean reply untouched in both modes', () => {
    const reply = 'what are you hitting today?';
    expect(applyMemoryGuard(silent(), 'u1', reply, context, 'observe')).toBe(reply);
    expect(applyMemoryGuard(silent(), 'u1', reply, context, 'enforce')).toBe(reply);
  });

  it('observes without changing the reply', () => {
    // The whole point of the staged rollout: it sees the problem and does nothing.
    const bad = 'nice. you said you would send 75 emails by thursday.';
    expect(applyMemoryGuard(silent(), 'u1', bad, context, 'observe')).toBe(bad);
  });

  it('strips only when enforcing', () => {
    const bad = 'nice. you said you would send 75 emails by thursday.';
    expect(applyMemoryGuard(silent(), 'u1', bad, context, 'enforce')).toBe('nice.');
  });

  it('logs a sample so a false positive can be read back and the pattern narrowed', () => {
    const logger = silent();
    // Two sentences on purpose: stripFalseMemoryClaims refuses to empty a reply, so a
    // single-sentence fixture is silently a no-op and logs nothing.
    applyMemoryGuard(logger, 'u1', 'nice. you said 75 emails by thursday.', context, 'observe');
    expect(logger.warn).toHaveBeenCalled();
    const payload = JSON.parse((logger.warn as jest.Mock).mock.calls[0][0]);
    expect(payload.guard).toBe('memory_claim');
    expect(payload.operation).toBe('guard_observed');
    expect(payload.sample).toContain('75');
  });

  it('labels the operation differently when enforcing', () => {
    const logger = silent();
    applyMemoryGuard(logger, 'u1', 'nice. you said 75 emails by thursday.', context, 'enforce');
    const payload = JSON.parse((logger.warn as jest.Mock).mock.calls[0][0]);
    expect(payload.operation).toBe('guard_enforced');
  });
});

describe('sensitive guard wiring (INV-6)', () => {
  it('passes ordinary replies through with no regeneration', () => {
    const r = applySensitiveGuard(silent(), 'u1', 'how did the gym go?', 'enforce');
    expect(r.needsRegeneration).toBe(false);
    expect(r.reply).toBe('how did the gym go?');
  });

  it('passes supportive talk about a hard topic', () => {
    // Blocking the topic would break "be present during difficult moments", which the doctrine
    // weights as heavily as the ban on leverage.
    const r = applySensitiveGuard(silent(), 'u1', 'how are you doing after the funeral?', 'enforce');
    expect(r.needsRegeneration).toBe(false);
  });

  it('flags but does not act in observe mode', () => {
    const logger = silent();
    const r = applySensitiveGuard(logger, 'u1', "lol remember when you relapsed?", 'observe');
    expect(r.needsRegeneration).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('requests regeneration when enforcing', () => {
    const r = applySensitiveGuard(silent(), 'u1', "lol remember when you relapsed?", 'enforce');
    expect(r.needsRegeneration).toBe(true);
  });

  it('never rewrites the reply itself', () => {
    // Deleting the sentence leaves a non-sequitur, because the turn was built around the
    // leverage. Regeneration is the only correct repair.
    const bad = "you'll relapse without me. upgrade to pro";
    expect(applySensitiveGuard(silent(), 'u1', bad, 'enforce').reply).toBe(bad);
  });
});
