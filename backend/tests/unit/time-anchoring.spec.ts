import { buildCheckinMessage } from '../../src/ai/prompts/checkin.prompt';
import { formatHistoryStamp, timeOfDayLabel } from '../../src/messaging/local-time';
import { offsetMinutesForZone, resolveOffsetMinutes } from '../../src/messaging/world-time';
import { nextDailyFireAt } from '../../src/accountability/schedule.service';

describe('time-of-day anchoring (Karibi 2026-06-30)', () => {
  describe('timeOfDayLabel', () => {
    const at = (hourUtc: number, offset: number) =>
      timeOfDayLabel(new Date(Date.UTC(2026, 5, 18, hourUtc, 0, 0)), offset);

    it('labels midday as afternoon, not morning', () => {
      // 07:00 UTC + 5h = 12:00 local
      expect(at(7, 300)).toBe('the afternoon');
    });
    it('labels a 9am local clock as morning', () => {
      expect(at(4, 300)).toBe('morning'); // 09:00 local
    });
    it('labels 11pm local as the middle-of-the-night sleep window only after 9pm', () => {
      expect(at(16, 300)).toBe('night'); // 21:00 local
      expect(at(20, 300)).toContain('middle of the night'); // 01:00 local
    });
    it('handles negative offsets without going out of range', () => {
      // 20:00 UTC - 8h = 12:00 local
      expect(at(20, -480)).toBe('the afternoon');
    });
  });

  describe('formatHistoryStamp', () => {
    const now = new Date('2026-06-18T19:00:00Z'); // noon at UTC-7

    it('stamps a message sent earlier the same local day as "today"', () => {
      const msg = new Date('2026-06-18T16:30:00Z'); // 9:30am local
      expect(formatHistoryStamp(msg, -420, now)).toBe('today 9:30am');
    });
    it('stamps a previous-day late-night message as "yesterday" — the stale-context fix', () => {
      const msg = new Date('2026-06-18T08:00:00Z'); // 1:00am local on the 18th...
      // 1am local on the 18th is the SAME local day as noon on the 18th, so use a clearly prior night:
      const prevNight = new Date('2026-06-18T06:00:00Z'); // 11:00pm local on the 17th
      expect(formatHistoryStamp(prevNight, -420, now)).toBe('yesterday 11:00pm');
      // sanity: msg above is still "today"
      expect(formatHistoryStamp(msg, -420, now)).toBe('today 1:00am');
    });
    it('returns null when the offset is unknown (cannot place the message in their day)', () => {
      expect(formatHistoryStamp(now, null, now)).toBeNull();
      expect(formatHistoryStamp(now, undefined, now)).toBeNull();
    });
  });

  describe('IANA timezone / DST (R2)', () => {
    const summer = new Date('2026-07-15T17:00:00Z');
    const winter = new Date('2026-01-15T17:00:00Z');

    it('computes the live DST-correct offset for a US zone', () => {
      expect(offsetMinutesForZone(summer, 'America/New_York')).toBe(-240); // EDT
      expect(offsetMinutesForZone(winter, 'America/New_York')).toBe(-300); // EST
    });
    it('returns a fixed offset for a no-DST zone year-round', () => {
      expect(offsetMinutesForZone(summer, 'Asia/Karachi')).toBe(300);
      expect(offsetMinutesForZone(winter, 'Asia/Karachi')).toBe(300);
    });
    it('returns null for an invalid zone', () => {
      expect(offsetMinutesForZone(summer, 'Not/AZone')).toBeNull();
    });

    it('lets the live zone override a STALE frozen offset across a DST boundary', () => {
      // Captured in summer as -240 (EDT). In winter the frozen integer is wrong;
      // the zone yields the correct -300 (EST). This is the whole point of R2.
      expect(resolveOffsetMinutes('America/New_York', -240, winter)).toBe(-300);
    });
    it('falls back to the frozen offset when no zone is set', () => {
      expect(resolveOffsetMinutes(null, -300, winter)).toBe(-300);
      expect(resolveOffsetMinutes(undefined, 480, summer)).toBe(480);
    });
    it('falls back to the frozen offset when the zone is invalid', () => {
      expect(resolveOffsetMinutes('Not/AZone', -300, winter)).toBe(-300);
    });
    it('returns null when neither a zone nor an offset is known', () => {
      expect(resolveOffsetMinutes(null, null, winter)).toBeNull();
    });

    it('recurring "daily 7am" recomputes from the zone so it does not drift across DST', () => {
      // Created in summer as -240 (EDT). Re-enqueuing in winter must use the live
      // -300 (EST) so 7am local stays 7am, not 6am.
      const winterMorning = new Date('2026-01-15T05:00:00Z'); // 00:00 EST
      const liveOffset = resolveOffsetMinutes('America/New_York', -240, winterMorning);
      expect(liveOffset).toBe(-300);
      const fixed = nextDailyFireAt(winterMorning, '07:00', liveOffset!);
      expect(fixed.getUTCHours()).toBe(12); // 07:00 EST == 12:00 UTC ✓
      // With the STALE summer offset it would fire at 11:00 UTC = 06:00 EST (1h early).
      const drifted = nextDailyFireAt(winterMorning, '07:00', -240);
      expect(drifted.getUTCHours()).toBe(11);
    });
  });

  describe('buildCheckinMessage greeting', () => {
    const runMany = (hour: number) =>
      Array.from({ length: 60 }, () =>
        buildCheckinMessage('Sam', null, 'go to the gym', { localDow: 1, localHour: hour }),
      );

    it('never opens with "morning" at an afternoon check-in hour', () => {
      expect(runMany(14).some((m) => /morning/i.test(m))).toBe(false);
    });
    it('never says "morning" in the pre-dawn window', () => {
      expect(runMany(2).some((m) => /morning/i.test(m))).toBe(false);
    });
    it('can say "morning" at a 9am check-in', () => {
      // Not guaranteed every draw (some variants are greeting-free), but across 60
      // draws at least one morning-greeting variant should surface.
      expect(runMany(9).some((m) => /morning/i.test(m))).toBe(true);
    });
  });
});
