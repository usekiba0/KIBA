import { resolveReminderFireAt, humanizeFireDelta } from '../../src/messaging/reminder-time';

const NOW = Date.parse('2026-06-18T12:00:00.000Z'); // user at UTC-5 → 07:00 local

describe('resolveReminderFireAt', () => {
  describe('delay_minutes (relative)', () => {
    it('fires at now + delay (5 hours = 300 min)', () => {
      const r = resolveReminderFireAt({ delay_minutes: 300 }, -300, NOW);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.fireAt.toISOString()).toBe('2026-06-18T17:00:00.000Z');
    });

    it('needs no timezone for relative delays', () => {
      const r = resolveReminderFireAt({ delay_minutes: 30 }, null, NOW);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.fireAt.toISOString()).toBe('2026-06-18T12:30:00.000Z');
    });

    it('rejects non-positive / non-finite delays', () => {
      expect(resolveReminderFireAt({ delay_minutes: 0 }, -300, NOW).ok).toBe(false);
      expect(resolveReminderFireAt({ delay_minutes: -5 }, -300, NOW).ok).toBe(false);
      expect(resolveReminderFireAt({ delay_minutes: NaN }, -300, NOW).ok).toBe(false);
    });
  });

  describe('local_clock (absolute, server converts)', () => {
    it('converts the user local clock to UTC, picking today if not passed', () => {
      // 09:00 local at UTC-5 = 14:00 UTC, and 14:00 > now (12:00) → today.
      const r = resolveReminderFireAt({ local_clock: '09:00' }, -300, NOW);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.fireAt.toISOString()).toBe('2026-06-18T14:00:00.000Z');
    });

    it('rolls to tomorrow when the local time already passed today', () => {
      // 06:00 local = 11:00 UTC, which is before now (12:00) → tomorrow.
      const r = resolveReminderFireAt({ local_clock: '06:00' }, -300, NOW);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.fireAt.toISOString()).toBe('2026-06-19T11:00:00.000Z');
    });

    it('errors without a known timezone', () => {
      expect(resolveReminderFireAt({ local_clock: '09:00' }, null, NOW).ok).toBe(false);
    });

    it('errors on a bad clock format', () => {
      expect(resolveReminderFireAt({ local_clock: '9pm' }, -300, NOW).ok).toBe(false);
    });
  });

  describe('fire_at_iso (fallback)', () => {
    it('parses a valid ISO instant', () => {
      const r = resolveReminderFireAt({ fire_at_iso: '2026-06-18T20:00:00Z' }, -300, NOW);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.fireAt.toISOString()).toBe('2026-06-18T20:00:00.000Z');
    });

    it('rejects an invalid ISO string', () => {
      expect(resolveReminderFireAt({ fire_at_iso: 'not-a-date' }, -300, NOW).ok).toBe(false);
    });
  });

  it('errors when nothing is provided', () => {
    expect(resolveReminderFireAt({}, -300, NOW).ok).toBe(false);
  });

  it('prefers delay_minutes over local_clock over fire_at_iso', () => {
    const r = resolveReminderFireAt(
      { delay_minutes: 10, local_clock: '09:00', fire_at_iso: '2026-06-18T20:00:00Z' },
      -300, NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fireAt.toISOString()).toBe('2026-06-18T12:10:00.000Z');
  });
});

describe('humanizeFireDelta', () => {
  it.each([
    [30_000, 'in under a minute'],
    [60_000, 'in 1 min'],
    [5 * 60_000, 'in 5 min'],
    [60 * 60_000, 'in 1h'],
    [90 * 60_000, 'in 1h 30m'],
    [300 * 60_000, 'in 5h'],
  ])('formats %d ms as "%s"', (ms, expected) => {
    expect(humanizeFireDelta(ms)).toBe(expected);
  });
});
