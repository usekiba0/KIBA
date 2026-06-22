import { parseTimeInPlace, resolvePlaceTimezone, formatTimeInZone } from '../../src/messaging/world-time';

describe('world-time', () => {
  describe('parseTimeInPlace', () => {
    it.each([
      ['what time is it in germany', 'germany'],
      ['What time is it in New York', 'new york'],
      ['whats the time in london', 'london'],
      ["what's the time in tokyo?", 'tokyo'],
      ['time in dubai', 'dubai'],
      ['what time is it in new york right now', 'new york'],
      ['current time in los angeles', 'los angeles'],
      ['what time in the uk', 'uk'],
    ])('parses "%s" -> "%s"', (msg, place) => {
      expect(parseTimeInPlace(msg)).toBe(place);
    });

    it.each([
      'what time is it', // own time, no place
      'what time is it now',
      'what time should i wake up',
      'remind me in 3 min',
      'i love new york',
    ])('does not match "%s"', (msg) => {
      expect(parseTimeInPlace(msg)).toBeNull();
    });
  });

  describe('resolvePlaceTimezone', () => {
    it('resolves countries and cities', () => {
      expect(resolvePlaceTimezone('germany')).toEqual({ zone: 'Europe/Berlin', label: 'Germany' });
      expect(resolvePlaceTimezone('new york')).toEqual({ zone: 'America/New_York', label: 'New York' });
      expect(resolvePlaceTimezone('nyc')).toEqual({ zone: 'America/New_York', label: 'New York' });
      expect(resolvePlaceTimezone('uk')).toEqual({ zone: 'Europe/London', label: 'the UK' });
      expect(resolvePlaceTimezone('pakistan')).toEqual({ zone: 'Asia/Karachi', label: 'Pakistan' });
    });
    it('returns null for unknown places', () => {
      expect(resolvePlaceTimezone('narnia')).toBeNull();
      expect(resolvePlaceTimezone('')).toBeNull();
    });
  });

  describe('formatTimeInZone', () => {
    // Fixed instant: 2026-06-22 15:03 UTC (summer → DST active in N. hemisphere)
    const now = new Date('2026-06-22T15:03:00Z');
    it('computes other-zone time correctly with DST', () => {
      expect(formatTimeInZone(now, 'Europe/Berlin')).toBe('5:03pm'); // CEST UTC+2
      expect(formatTimeInZone(now, 'America/New_York')).toBe('11:03am'); // EDT UTC-4
      expect(formatTimeInZone(now, 'Asia/Karachi')).toBe('8:03pm'); // PKT UTC+5
      expect(formatTimeInZone(now, 'Asia/Kolkata')).toBe('8:33pm'); // IST UTC+5:30
    });
    it('returns null for an invalid zone', () => {
      expect(formatTimeInZone(now, 'Not/AZone')).toBeNull();
    });
  });

  describe('end-to-end (parse -> resolve -> format)', () => {
    it('answers "what time is it in germany" correctly', () => {
      const now = new Date('2026-06-22T15:03:00Z');
      const place = parseTimeInPlace('What time is it in Germany');
      const r = resolvePlaceTimezone(place);
      expect(r).not.toBeNull();
      expect(formatTimeInZone(now, r!.zone)).toBe('5:03pm');
      expect(r!.label).toBe('Germany');
    });
  });
});
