import { isTimeQuery, formatLocalClock12h, formatLocalClockPretty } from '../../src/messaging/local-time';

describe('local-time', () => {
  describe('formatLocalClock12h', () => {
    const base = new Date('2026-06-21T22:04:00Z'); // 22:04 UTC

    it('applies a negative offset (Houston CDT, UTC-5 → 5:04pm)', () => {
      expect(formatLocalClock12h(base, -300)).toBe('5:04pm');
    });

    it('applies a positive offset (Karachi, UTC+5 → 3:04am next consideration)', () => {
      expect(formatLocalClock12h(base, 300)).toBe('3:04am');
    });

    it('renders noon and midnight as 12', () => {
      expect(formatLocalClock12h(new Date('2026-06-21T12:00:00Z'), 0)).toBe('12:00pm');
      expect(formatLocalClock12h(new Date('2026-06-21T00:00:00Z'), 0)).toBe('12:00am');
    });

    it('pads minutes', () => {
      expect(formatLocalClock12h(new Date('2026-06-21T13:05:00Z'), 0)).toBe('1:05pm');
    });
  });

  describe('formatLocalClockPretty', () => {
    it('includes the day and month', () => {
      const out = formatLocalClockPretty(new Date('2026-06-21T22:04:00Z'), -300);
      expect(out).toBe('5:04 PM, Sunday Jun 21');
    });
  });

  describe('isTimeQuery', () => {
    it.each([
      'what time is it',
      'What time is it?',
      'what time is it now',
      'what time is it rn',
      "what's the time",
      'whats the time',
      'what is the time',
      'do you know the time',
      'do you know what time it is',
      'u know what time it is',
      'got the time?',
      'current time',
      'time?',
      'so what time is it',
      'what time is it right now',
    ])('detects "%s"', (msg) => {
      expect(isTimeQuery(msg)).toBe(true);
    });

    it.each([
      'what time should i wake up',
      'what time works for you',
      'set a reminder at some time',
      'i lost track of time',
      'remind me in some time',
      'is it time to go',
      'what time do you want me to check in',
      'first time using this',
      'long time no see',
      '',
      '   ',
    ])('ignores "%s"', (msg) => {
      expect(isTimeQuery(msg)).toBe(false);
    });

    it('handles null/undefined', () => {
      expect(isTimeQuery(null)).toBe(false);
      expect(isTimeQuery(undefined)).toBe(false);
    });
  });
});
