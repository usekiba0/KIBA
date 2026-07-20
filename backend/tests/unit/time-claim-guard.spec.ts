import {
  extractFutureDates,
  gapInDays,
  buildDateFactsBlock,
  correctTimeClaims,
  correctEventTimingClaims,
  correctWeekdayClaims,
  describeActivationDay,
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

// NOW = Jul 8 2026 15:00 UTC, OFF -300 → Jul 8 local. Activation instants below
// are chosen to land on a known local day relative to that anchor.
const PAID_TODAY = new Date('2026-07-08T14:00:00Z'); // Jul 8 09:00 local → today
const PAID_YESTERDAY = new Date('2026-07-07T14:00:00Z'); // Jul 7 → yesterday
const PAID_LAST_WEEK = new Date('2026-07-01T14:00:00Z'); // Jul 1 → 7 days ago

describe('describeActivationDay', () => {
  it('labels same-local-day activation "today"', () => {
    expect(describeActivationDay(PAID_TODAY, NOW, OFF)).toBe('today');
  });
  it('labels the prior local day "yesterday"', () => {
    expect(describeActivationDay(PAID_YESTERDAY, NOW, OFF)).toBe('yesterday');
  });
  it('labels older activation with an absolute date + day count', () => {
    expect(describeActivationDay(PAID_LAST_WEEK, NOW, OFF)).toBe('Wed Jul 1 (7 days ago)');
  });
});

describe('correctEventTimingClaims (payment-timing hard check)', () => {
  it('strips the fabricated day — the EXACT Karibi 2026-07-09 bug', () => {
    // User checked out just now; the model claimed it happened yesterday.
    const reply = "you're already locked in. the link went through yesterday.";
    const { text, corrections } = correctEventTimingClaims(reply, PAID_TODAY, NOW, OFF);
    expect(corrections).toHaveLength(1);
    expect(text).toBe("you're already locked in. the link went through.");
    expect(text).not.toMatch(/yesterday/i);
  });

  it('leaves the claim alone when the stated day is actually correct', () => {
    // They really did pay yesterday, and the model said yesterday.
    const reply = 'the link went through yesterday, so we start fresh today.';
    const { text, corrections } = correctEventTimingClaims(reply, PAID_YESTERDAY, NOW, OFF);
    expect(corrections).toHaveLength(0);
    expect(text).toBe(reply);
  });

  it('corrects "you signed up last week" when they paid today', () => {
    const reply = 'you signed up last week, remember?';
    const { text, corrections } = correctEventTimingClaims(reply, PAID_TODAY, NOW, OFF);
    expect(corrections).toHaveLength(1);
    expect(text).toBe('you signed up, remember?');
  });

  it('handles the day BEFORE the event too ("yesterday you paid")', () => {
    const reply = 'yesterday you paid and vanished on me.';
    const { text, corrections } = correctEventTimingClaims(reply, PAID_TODAY, NOW, OFF);
    expect(corrections).toHaveLength(1);
    expect(text).toBe('you paid and vanished on me.');
  });

  it('is a no-op without a ground-truth activation timestamp', () => {
    const reply = 'the link went through yesterday.';
    const { text, corrections } = correctEventTimingClaims(reply, null, NOW, OFF);
    expect(corrections).toHaveLength(0);
    expect(text).toBe(reply);
  });

  it('never touches a present-tense "you\'re locked in"', () => {
    const reply = "you're already locked in. what's the first move today?";
    const { text, corrections } = correctEventTimingClaims(reply, PAID_TODAY, NOW, OFF);
    expect(corrections).toHaveLength(0);
    expect(text).toBe(reply);
  });

  it('does not invent a correction when no payment event is mentioned', () => {
    const reply = 'you slept through yesterday, that stops now.';
    const { corrections } = correctEventTimingClaims(reply, PAID_TODAY, NOW, OFF);
    expect(corrections).toHaveLength(0);
  });
});

// NOW is Wednesday July 8 2026; with OFF (-300) the user's local day is still
// Wednesday, so "today" = Wednesday and "tomorrow" = Thursday throughout.
describe('correctWeekdayClaims (Bianca 2026-07-20 fake Thursday)', () => {
  it('rewrites the exact failure: "today\'s thursday equivalent" on a non-Thursday', () => {
    const reply = "today's thursday equivalent. historically your weakest day.";
    const { text, corrections } = correctWeekdayClaims(reply, NOW, OFF);
    expect(corrections).toHaveLength(1);
    expect(text).toBe("today's wednesday. historically your weakest day.");
  });

  it('fixes "today is thursday" and keeps the sentence shape', () => {
    const { text } = correctWeekdayClaims('today is thursday, lock in.', NOW, OFF);
    expect(text).toBe('today is wednesday, lock in.');
  });

  it('fixes a wrong TOMORROW claim against the real next day', () => {
    const { text, corrections } = correctWeekdayClaims("tomorrow's saturday.", NOW, OFF);
    expect(corrections).toHaveLength(1);
    expect(text).toBe("tomorrow's thursday.");
  });

  it('leaves a CORRECT tomorrow claim alone', () => {
    const reply = "tomorrow's thursday, historically your weakest day — not this time.";
    const { text, corrections } = correctWeekdayClaims(reply, NOW, OFF);
    expect(corrections).toHaveLength(0);
    expect(text).toBe(reply);
  });

  it('leaves a CORRECT today claim alone', () => {
    const { corrections } = correctWeekdayClaims("today's wednesday. what's the move.", NOW, OFF);
    expect(corrections).toHaveLength(0);
  });

  it('fixes a bare "it\'s <weekday>" assertion', () => {
    const { text } = correctWeekdayClaims("it's friday. weigh-in day.", NOW, OFF);
    expect(text).toBe("it's wednesday. weigh-in day.");
  });

  it('never touches a conditional "if it\'s friday"', () => {
    const reply = "if it's friday and you skip again, we're changing the plan.";
    const { text, corrections } = correctWeekdayClaims(reply, NOW, OFF);
    expect(corrections).toHaveLength(0);
    expect(text).toBe(reply);
  });

  it('never mangles ordinary words that look like day abbreviations', () => {
    const reply = 'you sat out the whole week. we wed ourselves to the plan now.';
    const { text, corrections } = correctWeekdayClaims(reply, NOW, OFF);
    expect(corrections).toHaveLength(0);
    expect(text).toBe(reply);
  });

  it('handles an abbreviation behind an anchor and preserves casing', () => {
    const { text } = correctWeekdayClaims('Today is Thurs.', NOW, OFF);
    expect(text).toBe('Today is Wednesday.');
  });

  it('is a no-op on an empty reply', () => {
    expect(correctWeekdayClaims('', NOW, OFF).corrections).toHaveLength(0);
  });
});
