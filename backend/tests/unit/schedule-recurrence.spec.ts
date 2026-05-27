import { nextDailyFireAt } from '../../src/accountability/schedule.service';

describe('nextDailyFireAt', () => {
  // Karibi's scenario: wants 8am CDT daily reminder. CDT = UTC-5 = -300 min.
  // Sample "now" is 11am CDT = 16:00Z. Next fire should be 8am CDT next day = 13:00Z next day.
  it('schedules tomorrow when target time has already passed today (CDT, asked at 11am for 8am daily)', () => {
    const now = new Date('2026-05-27T16:00:00Z'); // 11:00 CDT
    const next = nextDailyFireAt(now, '08:00', -300);
    expect(next.toISOString()).toBe('2026-05-28T13:00:00.000Z');
  });

  it('schedules today when target time has not yet passed today (CDT, asked at 6am for 8am daily)', () => {
    const now = new Date('2026-05-27T11:00:00Z'); // 6:00 CDT
    const next = nextDailyFireAt(now, '08:00', -300);
    expect(next.toISOString()).toBe('2026-05-27T13:00:00.000Z');
  });

  it('schedules tomorrow when target equals now (strict greater-than only counts the next day)', () => {
    const now = new Date('2026-05-27T13:00:00Z'); // exactly 8:00 CDT
    const next = nextDailyFireAt(now, '08:00', -300);
    expect(next.toISOString()).toBe('2026-05-28T13:00:00.000Z');
  });

  it('handles positive offsets (PKT, +5, asked at 06:00 PKT for 22:00 PKT)', () => {
    // 06:00 PKT = 01:00 UTC. Target 22:00 PKT today = 17:00 UTC.
    const now = new Date('2026-05-27T01:00:00Z');
    const next = nextDailyFireAt(now, '22:00', 300);
    expect(next.toISOString()).toBe('2026-05-27T17:00:00.000Z');
  });

  it('crosses midnight correctly when local clock is just past target (NZST +12, asked at 03:00 NZST for 02:00 NZST)', () => {
    // 03:00 NZST = previous day 15:00 UTC. Target 02:00 NZST today already passed → tomorrow 02:00 NZST = 14:00 UTC next day.
    const now = new Date('2026-05-26T15:00:00Z'); // 03:00 NZST on 27th
    const next = nextDailyFireAt(now, '02:00', 720);
    expect(next.toISOString()).toBe('2026-05-27T14:00:00.000Z');
  });

  it('handles HH:MM at midnight', () => {
    const now = new Date('2026-05-27T16:00:00Z'); // 11:00 CDT
    const next = nextDailyFireAt(now, '00:00', -300);
    // Midnight local = 05:00 UTC. Today midnight already passed (it's 11am), so next is tomorrow.
    expect(next.toISOString()).toBe('2026-05-28T05:00:00.000Z');
  });

  it('rejects malformed HH:MM', () => {
    expect(() => nextDailyFireAt(new Date(), '8am', -300)).toThrow(/HH:MM/);
    expect(() => nextDailyFireAt(new Date(), '25:00', -300)).toThrow(/HH:MM/);
    expect(() => nextDailyFireAt(new Date(), '8:0', -300)).toThrow(/HH:MM/);
  });
});
