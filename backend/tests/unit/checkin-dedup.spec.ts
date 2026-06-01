import { localDateString } from '../../src/accountability/checkin.processor';

describe('localDateString (per-day check-in dedup key)', () => {
  it('returns the UTC day when offset is null', () => {
    const noonUtc = Date.UTC(2026, 5, 1, 12, 0, 0); // 2026-06-01 12:00Z
    expect(localDateString(null, noonUtc)).toBe('2026-06-01');
  });

  it('rolls to the next local day when the offset pushes past midnight', () => {
    // 2026-06-01 23:30 UTC, user at UTC+1 → local 00:30 on 2026-06-02.
    const lateUtc = Date.UTC(2026, 5, 1, 23, 30, 0);
    expect(localDateString(60, lateUtc)).toBe('2026-06-02');
  });

  it('rolls back a day for negative offsets before local midnight', () => {
    // 2026-06-02 02:00 UTC, user at UTC-5 → local 21:00 on 2026-06-01.
    const earlyUtc = Date.UTC(2026, 5, 2, 2, 0, 0);
    expect(localDateString(-300, earlyUtc)).toBe('2026-06-01');
  });

  it('zero-pads month and day', () => {
    const jan5 = Date.UTC(2026, 0, 5, 9, 0, 0);
    expect(localDateString(0, jan5)).toBe('2026-01-05');
  });

  it('two calls on the same local day produce the same key (idempotent claim)', () => {
    const morning = Date.UTC(2026, 5, 1, 6, 46, 0);
    const later = Date.UTC(2026, 5, 1, 9, 12, 0);
    expect(localDateString(0, morning)).toBe(localDateString(0, later));
  });
});
