import {
  extractFutureDates,
  gapInDays,
  buildDateFactsBlock,
  correctTimeClaims,
} from '../../src/ai/time-claim-guard';

// Fixed "now" = Wednesday, July 8, 2026, 15:00 UTC. Offset -300 (UTC-5) → still
// July 8 local. All expectations computed against this anchor.
const NOW = new Date('2026-07-08T15:00:00Z');
const OFF = -300;

describe('extractFutureDates', () => {
  it('resolves "May 29" to NEXT year when it already passed this year', () => {
    const [d] = extractFutureDates('lock in before May 29th', NOW, OFF);
    expect(d.date.getUTCFullYear()).toBe(2027);
    expect(d.date.getUTCMonth()).toBe(4); // May
    expect(d.date.getUTCDate()).toBe(29);
  });

  it('keeps a still-upcoming date in the SAME year', () => {
    const [d] = extractFutureDates('my trip is December 20', NOW, OFF);
    expect(d.date.getUTCFullYear()).toBe(2026);
    expect(d.date.getUTCMonth()).toBe(11);
  });

  it('parses "29 May", numeric 5/29, and ISO forms', () => {
    expect(extractFutureDates('29 May', NOW, OFF)[0].date.getUTCMonth()).toBe(4);
    expect(extractFutureDates('deadline 5/29', NOW, OFF)[0].date.getUTCDate()).toBe(29);
    const iso = extractFutureDates('2027-05-29', NOW, OFF)[0];
    expect(iso.date.getUTCFullYear()).toBe(2027);
  });

  it('ignores a bare month with no day', () => {
    expect(extractFutureDates('sometime in May', NOW, OFF)).toHaveLength(0);
  });
});

describe('gapInDays', () => {
  it('counts the real days to next May 29 (~10.7 months, NOT 5)', () => {
    const target = extractFutureDates('May 29', NOW, OFF)[0].date;
    const days = gapInDays(target, NOW, OFF);
    expect(days).toBe(325); // Jul 8 2026 → May 29 2027
    expect(Math.round(days / 30.436875)).toBe(11); // ~11 months, not 5
  });
});

describe('buildDateFactsBlock (prevention)', () => {
  it('hands the model the exact resolved date + gap', () => {
    const block = buildDateFactsBlock('get to 100k before May 29th', NOW, OFF);
    expect(block).toContain('DATE FACTS');
    expect(block).toContain('Saturday, May 29, 2027');
    expect(block).toContain('325 days from today');
    expect(block.toLowerCase()).toContain('do not calculate');
  });

  it('returns empty string when no date is referenced', () => {
    expect(buildDateFactsBlock('i wanna get fit and make money', NOW, OFF)).toBe('');
  });
});

describe('correctTimeClaims (hard check)', () => {
  it('rewrites a provably-wrong gap (the exact Karibi bug)', () => {
    const reply = 'aight locked. may 29th is the window. that\'s like 5 months out.';
    const { text, corrections } = correctTimeClaims(reply, 'get to 100k before May 29th', NOW, OFF);
    expect(corrections).toHaveLength(1);
    expect(text).toContain('11 months out');
    expect(text).not.toContain('5 months out');
    expect(corrections[0].from).toContain('5 months');
  });

  it('leaves an already-correct gap untouched', () => {
    const reply = "may 29th's about 11 months out, plenty of runway.";
    const { text, corrections } = correctTimeClaims(reply, 'before May 29', NOW, OFF);
    expect(corrections).toHaveLength(0);
    expect(text).toBe(reply);
  });

  it('does NOT touch durations that are not gap claims ("3 days a week")', () => {
    const reply = 'lift 3 days a week and you win.';
    const { corrections } = correctTimeClaims(reply, 'before May 29', NOW, OFF);
    expect(corrections).toHaveLength(0);
  });

  it('stays silent when the target date is ambiguous (2+ dates)', () => {
    const reply = "that's 2 months out.";
    const { corrections } = correctTimeClaims(reply, 'between May 29 and August 1', NOW, OFF);
    expect(corrections).toHaveLength(0);
  });

  it('tolerates honest rounding (off by 1 is left alone)', () => {
    // Dec 20 2026 is ~24 weeks out; "23 weeks" is within tolerance.
    const reply = 'december 20 is about 23 weeks away.';
    const { corrections } = correctTimeClaims(reply, 'trip December 20', NOW, OFF);
    expect(corrections).toHaveLength(0);
  });

  it('corrects a wildly wrong week count', () => {
    const reply = 'december 20 is like 5 weeks away.';
    const { text, corrections } = correctTimeClaims(reply, 'trip December 20', NOW, OFF);
    expect(corrections).toHaveLength(1);
    expect(text).toMatch(/2\d weeks away/); // ~24 weeks
  });
});
