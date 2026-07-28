import {
  isFiveSeries,
  isAlwaysThinking,
  deterministicParams,
  noThinking,
} from '../../src/ai/model-params';

describe('model-params — 5-series detection', () => {
  it('matches the 5-series ids we would actually deploy', () => {
    expect(isFiveSeries('claude-sonnet-5')).toBe(true);
    expect(isFiveSeries('claude-opus-5')).toBe(true);
  });

  it('does NOT match claude-haiku-4-5 — the trap this regex exists for', () => {
    // A naive /-5/ test hits both the "4-5" version and the date suffix, and
    // would send 5-series params to a 4-series model on every text turn.
    expect(isFiveSeries('claude-haiku-4-5-20251001')).toBe(false);
    expect(isFiveSeries('claude-haiku-4-5')).toBe(false);
    expect(isFiveSeries('claude-opus-4-5')).toBe(false);
    expect(isFiveSeries('claude-sonnet-4-5-20250929')).toBe(false);
  });

  it('does not match the models we run today', () => {
    expect(isFiveSeries('claude-sonnet-4-6')).toBe(false);
    expect(isFiveSeries('claude-opus-4-8')).toBe(false);
  });

  it('tolerates whitespace from a sloppy env var', () => {
    expect(isFiveSeries('  claude-sonnet-5  ')).toBe(true);
  });
});

describe('model-params — Fable 5 / Mythos 5 refuse disabled thinking', () => {
  // These two think ALWAYS: `thinking: {type:'disabled'}` returns a 400 at any
  // effort level, so the one shape every other 5-series model needs is the one
  // shape these reject. They are still 5-series for the temperature rule.
  it('flags fable and mythos as always-thinking', () => {
    expect(isAlwaysThinking('claude-fable-5')).toBe(true);
    expect(isAlwaysThinking('claude-mythos-5')).toBe(true);
  });

  it('does not flag the other 5-series models', () => {
    expect(isAlwaysThinking('claude-opus-5')).toBe(false);
    expect(isAlwaysThinking('claude-sonnet-5')).toBe(false);
  });

  it('does not flag 4-series models', () => {
    expect(isAlwaysThinking('claude-haiku-4-5-20251001')).toBe(false);
    expect(isAlwaysThinking('claude-opus-4-8')).toBe(false);
  });

  it('still treats them as 5-series for the temperature rule', () => {
    expect(isFiveSeries('claude-fable-5')).toBe(true);
    expect(isFiveSeries('claude-mythos-5')).toBe(true);
  });

  it('NEVER emits disabled thinking for them — that is the 400', () => {
    for (const model of ['claude-fable-5', 'claude-mythos-5']) {
      expect(deterministicParams(model)).toEqual({});
      expect(noThinking(model)).toEqual({});
    }
  });

  it('never emits temperature for them either', () => {
    expect(deterministicParams('claude-fable-5')).not.toHaveProperty('temperature');
  });
});

describe('model-params — deterministicParams (structured JSON calls)', () => {
  it('keeps temperature: 0 on 4-series, which is what these prompts were tuned on', () => {
    expect(deterministicParams('claude-haiku-4-5-20251001')).toEqual({ temperature: 0 });
    expect(deterministicParams('claude-sonnet-4-6')).toEqual({ temperature: 0 });
  });

  it('drops temperature on 5-series — a non-default value is a 400 there', () => {
    expect(deterministicParams('claude-sonnet-5')).not.toHaveProperty('temperature');
  });

  it('disables thinking on 5-series so max_tokens is not spent thinking', () => {
    // A 128-token proof verdict would otherwise return truncated JSON and fail
    // open silently — no error, no verdict.
    expect(deterministicParams('claude-sonnet-5')).toEqual({ thinking: { type: 'disabled' } });
  });

  it('never sends thinking to a 4-series model', () => {
    expect(deterministicParams('claude-sonnet-4-6')).not.toHaveProperty('thinking');
  });
});

describe('model-params — noThinking (conversational calls)', () => {
  it("is a no-op on 4-series, so today's text turns are byte-identical", () => {
    expect(noThinking('claude-haiku-4-5-20251001')).toEqual({});
    expect(noThinking('claude-sonnet-4-6')).toEqual({});
  });

  it('never introduces a temperature where one was not set', () => {
    expect(noThinking('claude-sonnet-5')).not.toHaveProperty('temperature');
  });

  it('turns thinking off on 5-series — latency is the product', () => {
    expect(noThinking('claude-sonnet-5')).toEqual({ thinking: { type: 'disabled' } });
  });
});
