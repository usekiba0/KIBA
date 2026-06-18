import { computeLocalDelayMs, computeWeeklyDelayMs } from '../../src/accountability/schedule-time.util';

describe('computeLocalDelayMs', () => {
  it('fires later today when the local time has not passed', () => {
    const now = Date.parse('2026-06-18T12:00:00Z'); // UTC-5 => 07:00 local
    const d = computeLocalDelayMs('09:00', -300, now); // 09:00 local = 14:00 UTC
    expect(new Date(now + d).toISOString()).toBe('2026-06-18T14:00:00.000Z');
  });

  it('rolls to tomorrow when the local time already passed', () => {
    const now = Date.parse('2026-06-18T12:00:00Z'); // UTC-5 => 07:00 local
    const d = computeLocalDelayMs('06:00', -300, now); // 06:00 local already gone
    expect(new Date(now + d).toISOString()).toBe('2026-06-19T11:00:00.000Z');
  });
});

describe('computeWeeklyDelayMs', () => {
  it('lands on the requested weekday + local time (UTC)', () => {
    const now = Date.parse('2026-06-18T12:00:00Z');
    const d = computeWeeklyDelayMs(0, '19:00', 0, now); // next Sunday 19:00
    const fire = new Date(now + d);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    expect(fire.getUTCDay()).toBe(0);
    expect(fire.getUTCHours()).toBe(19);
    expect(fire.getUTCMinutes()).toBe(0);
  });

  it('lands on the requested weekday + local time with an offset', () => {
    const now = Date.parse('2026-06-18T12:00:00Z');
    const off = -300;
    const fire = new Date(now + computeWeeklyDelayMs(0, '19:00', off, now));
    const local = new Date(fire.getTime() + off * 60_000);
    expect(local.getUTCDay()).toBe(0); // Sunday, user-local
    expect(local.getUTCHours()).toBe(19);
  });

  it('fires the same day when the weekday matches and the time is still ahead', () => {
    const sun = Date.parse('2026-06-21T12:00:00Z'); // a Sunday, 12:00 UTC
    const d = computeWeeklyDelayMs(0, '19:00', 0, sun);
    expect(new Date(sun + d).toISOString()).toBe('2026-06-21T19:00:00.000Z');
  });

  it('rolls a full week when the weekday matches but the time already passed', () => {
    const sunLate = Date.parse('2026-06-21T20:00:00Z'); // Sunday after 19:00
    const d = computeWeeklyDelayMs(0, '19:00', 0, sunLate);
    expect(new Date(sunLate + d).toISOString()).toBe('2026-06-28T19:00:00.000Z');
  });
});
