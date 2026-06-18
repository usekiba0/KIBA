import {
  REMINDER_REGEX,
  parseRelativeDelayMs,
  parseReminderTime,
  parseCityOffset,
  parseCity,
} from '../../src/messaging/reminder-parser';
import { RESET_INTENT_RE } from '../../src/messaging/coaching.processor';

describe('parseCity', () => {
  it.each([
    ['houston', 'Houston'],
    ["i'm in chicago", 'Chicago'],
    ['from new york', 'New York'],
  ])('resolves "%s" -> %s', (input, expected) => {
    expect(parseCity(input)).toBe(expected);
  });

  it('returns null when no known city is present', () => {
    expect(parseCity('i workout in the morning')).toBeNull();
  });
});

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

describe('parseCityOffset', () => {
  // Fixed clocks so DST promotion is deterministic in tests.
  const summer = new Date(Date.UTC(2026, 6, 1)); // July — US DST active
  const winter = new Date(Date.UTC(2026, 0, 15)); // January — US DST inactive

  it('resolves "Houston" to CDT (-300) in summer', () => {
    expect(parseCityOffset('houston', summer)).toBe(-300);
  });

  it('resolves "Houston" to CST (-360) in winter', () => {
    expect(parseCityOffset('houston', winter)).toBe(-360);
  });

  it('matches a city embedded in a sentence: "Houston boss"', () => {
    expect(parseCityOffset('houston boss', summer)).toBe(-300);
  });

  it('matches "i\'m from chicago"', () => {
    expect(parseCityOffset("i'm from chicago", summer)).toBe(-300);
  });

  it('matches multi-word "los angeles" (PDT in summer)', () => {
    expect(parseCityOffset('los angeles', summer)).toBe(-420);
  });

  it('matches standalone "nyc" (EDT in summer)', () => {
    expect(parseCityOffset('nyc', summer)).toBe(-240);
  });

  it('matches standalone short name "la"', () => {
    expect(parseCityOffset('im in la', summer)).toBe(-420);
  });

  it('does NOT match "la" inside another word (atlanta → EDT)', () => {
    // atlanta maps to Eastern; the "la" substring must not win Pacific.
    expect(parseCityOffset('atlanta', summer)).toBe(-240);
  });

  it('keeps Arizona (Phoenix) fixed at -420 regardless of DST', () => {
    expect(parseCityOffset('phoenix', summer)).toBe(-420);
    expect(parseCityOffset('phoenix', winter)).toBe(-420);
  });

  it('keeps Hawaii (Honolulu) fixed at -600', () => {
    expect(parseCityOffset('honolulu', summer)).toBe(-600);
  });

  it('resolves an international city: karachi → +300 (no US DST)', () => {
    expect(parseCityOffset('karachi', summer)).toBe(300);
  });

  it('returns null when no known city is present', () => {
    expect(parseCityOffset('make 100k/month', summer)).toBeNull();
  });

  // Coverage expansion (the original Houston bug re-loops on any unmapped city).
  it('resolves expanded US metros (Plano/Arlington-area Texas → CDT)', () => {
    expect(parseCityOffset('plano', summer)).toBe(-300);
    expect(parseCityOffset("i'm in frisco", summer)).toBe(-300);
  });

  it('resolves expanded Pacific metros (Anaheim → PDT)', () => {
    expect(parseCityOffset('anaheim', summer)).toBe(-420);
  });

  it('keeps expanded Arizona metros fixed at -420 (no DST)', () => {
    expect(parseCityOffset('chandler', summer)).toBe(-420);
    expect(parseCityOffset('gilbert', winter)).toBe(-420);
  });

  it('resolves expanded international cities', () => {
    expect(parseCityOffset('manila', summer)).toBe(480);
    expect(parseCityOffset('bogota', summer)).toBe(-300);
    expect(parseCityOffset('barcelona', summer)).toBe(60);
  });
});

describe('RESET_INTENT_RE', () => {
  it.each([
    'start fresh',
    'start over',
    "let's start fresh",
    'i want to start over',
    'reset my coaching',
    'clear my history',
    'can you clear my history please',
    'reset context',
    'fresh start',
  ])('treats a reset-dominant message as a reset: %s', (text) => {
    expect(RESET_INTENT_RE.test(text.trim())).toBe(true);
  });

  it.each([
    'i want to start fresh on monday with a new workout plan',
    'starting fresh this week feels good',
    'i cleared my history at the gym today',
    'we reset the machine between sets',
    'how do i start over on leg day',
  ])('does NOT reset when the phrase is part of a larger thought: %s', (text) => {
    expect(RESET_INTENT_RE.test(text.trim())).toBe(false);
  });
});
