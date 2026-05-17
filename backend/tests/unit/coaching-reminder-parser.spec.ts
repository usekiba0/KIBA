import {
  REMINDER_REGEX,
  parseRelativeDelayMs,
  parseReminderTime,
} from '../../src/messaging/reminder-parser';

describe('REMINDER_REGEX', () => {
  it.each([
    'remind me at 5pm',
    'remind me in 30 min',
    'remind me inn 30 to check in with u',
    'text me at 9am tomorrow',
    'ping me in 2 hours',
  ])('matches reminder intent: %s', (text) => {
    expect(REMINDER_REGEX.test(text)).toBe(true);
  });

  it.each([
    'i ran 5km this morning',
    'thanks for the help',
  ])('does not match non-reminder text: %s', (text) => {
    expect(REMINDER_REGEX.test(text)).toBe(false);
  });
});

describe('parseRelativeDelayMs', () => {
  it('parses "in 30 min" → 1,800,000 ms', () => {
    expect(parseRelativeDelayMs('remind me in 30 min')).toBe(30 * 60_000);
  });

  it('parses "in 2 hours" → 7,200,000 ms', () => {
    expect(parseRelativeDelayMs('remind me in 2 hours')).toBe(2 * 3_600_000);
  });

  it('parses "in 45 minutes" → 2,700,000 ms', () => {
    expect(parseRelativeDelayMs('hit me up in 45 minutes')).toBe(45 * 60_000);
  });

  // Bug fix: bare number after "in" should default to minutes
  it('defaults to minutes when no unit follows: "in 30"', () => {
    expect(parseRelativeDelayMs('remind me in 30 to check on me')).toBe(30 * 60_000);
  });

  // Bug fix: tolerate "inn" typo
  it('tolerates "inn" typo: "inn 30"', () => {
    expect(parseRelativeDelayMs('u remind me inn 30 to check in with u')).toBe(30 * 60_000);
  });

  it('tolerates "inn" typo with explicit unit: "inn 15 min"', () => {
    expect(parseRelativeDelayMs('remind me inn 15 min')).toBe(15 * 60_000);
  });

  // Safety: bare number too large is suspicious — likely not a delay
  it('rejects bare number > 120 (no unit) as ambiguous', () => {
    expect(parseRelativeDelayMs('remind me in 500 to call')).toBeNull();
  });

  // Hours unit always honored even when value is large
  it('accepts "in 5 hours" (above 120 cap, but unit is explicit)', () => {
    expect(parseRelativeDelayMs('remind me in 5 hours')).toBe(5 * 3_600_000);
  });

  it('returns null when no "in <number>" present', () => {
    expect(parseRelativeDelayMs('remind me at 5pm')).toBeNull();
  });

  it('does not match "check in with u" (no number)', () => {
    expect(parseRelativeDelayMs('check in with u later')).toBeNull();
  });
});

describe('parseReminderTime', () => {
  it('parses "at 5pm" → "17:00"', () => {
    expect(parseReminderTime('remind me at 5pm')).toBe('17:00');
  });

  it('parses "at 9:30am" → "09:30"', () => {
    expect(parseReminderTime('text me at 9:30am tomorrow')).toBe('09:30');
  });

  it('parses bare "5pm" without "at"', () => {
    expect(parseReminderTime('remind me 5pm please')).toBe('17:00');
  });

  it('prefers time after "at" when both present', () => {
    expect(parseReminderTime("it's 5:18pm rn remind me at 5:20pm")).toBe('17:20');
  });

  it('returns null when no time present', () => {
    expect(parseReminderTime('remind me in 30 minutes')).toBeNull();
  });
});
