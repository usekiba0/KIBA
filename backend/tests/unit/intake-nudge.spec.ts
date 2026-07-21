import {
  shouldNudgeIntake,
  isSendableHour,
  buildIntakeNudge,
  NudgeCandidate,
  STALL_MIN_MS,
  STALL_MAX_MS,
} from '../../src/accountability/intake-nudge';

/**
 * This is the highest-risk message the system sends — it goes to someone who has
 * NOT finished opting in. So the tests are weighted almost entirely toward the
 * cases where we must STAY SILENT. A missed nudge costs one lead; a wrong nudge
 * is an unsolicited text to a stranger during the same week we're asking
 * carriers to trust us.
 */
const NOW = new Date('2026-07-21T18:00:00Z'); // 1pm US Central — inside every window

function candidate(over: Partial<NudgeCandidate> = {}): NudgeCandidate {
  return {
    onboardingStage: 'intake',
    status: 'trial',
    name: 'Najee',
    lastActiveAt: new Date(NOW.getTime() - 5 * 60 * 60_000), // 5h idle
    intakeNudgedAt: null,
    optedOutAt: null,
    utcOffsetMinutes: -300,
    ...over,
  };
}

describe('shouldNudgeIntake', () => {
  it('nudges the real case this was built for', () => {
    // Najee: signed up at 1am, asked KIBA to keep him on his trading plan, got a
    // question back, then silence for seventeen hours with nothing scheduled.
    expect(shouldNudgeIntake(candidate({ lastActiveAt: new Date(NOW.getTime() - 17 * 60 * 60_000) }), NOW))
      .toEqual({ nudge: true });
  });

  describe('never nudges', () => {
    it.each([
      ['someone who opted out', { optedOutAt: new Date('2026-07-20T00:00:00Z') }, 'opted_out'],
      ['someone already nudged once', { intakeNudgedAt: new Date('2026-07-20T00:00:00Z') }, 'already_nudged'],
      ['someone who finished intake', { onboardingStage: 'complete' }, 'intake_complete'],
      ['a lead with no activity timestamp', { lastActiveAt: null }, 'no_activity_timestamp'],
    ])('%s', (_label, over, reason) => {
      const d = shouldNudgeIntake(candidate(over as Partial<NudgeCandidate>), NOW);
      expect(d).toEqual({ nudge: false, reason });
    });

    it('a wrong number who never gave their name', () => {
      // The case that made this guard exist. Someone reached KIBA believing it
      // was a person who had been coming to their house, said they felt unsafe
      // and would call the police. They sat in the DB as a trial lead stuck in
      // intake — matching every OTHER rule here. A nudge would have texted
      // "you dropped off mid-setup, still want in?" to that person.
      expect(shouldNudgeIntake(candidate({ name: null }), NOW))
        .toEqual({ nudge: false, reason: 'never_engaged' });
      expect(shouldNudgeIntake(candidate({ name: '   ' }), NOW))
        .toEqual({ nudge: false, reason: 'never_engaged' });
    });
  });

  describe('timing window', () => {
    it('waits until they are actually gone, not just mid-thought', () => {
      const justNow = candidate({ lastActiveAt: new Date(NOW.getTime() - STALL_MIN_MS + 60_000) });
      expect(shouldNudgeIntake(justNow, NOW)).toEqual({ nudge: false, reason: 'too_recent' });
    });

    it('gives up once the lead is cold', () => {
      // Also what stops the first deploy carpet-bombing every historical
      // stalled lead in the table.
      const ancient = candidate({ lastActiveAt: new Date(NOW.getTime() - STALL_MAX_MS - 60_000) });
      expect(shouldNudgeIntake(ancient, NOW)).toEqual({ nudge: false, reason: 'too_cold' });
    });

    it('fires at the edges of the window', () => {
      expect(shouldNudgeIntake(candidate({ lastActiveAt: new Date(NOW.getTime() - STALL_MIN_MS - 1000) }), NOW).nudge).toBe(true);
      expect(shouldNudgeIntake(candidate({ lastActiveAt: new Date(NOW.getTime() - STALL_MAX_MS + 1000) }), NOW).nudge).toBe(true);
    });
  });

  describe('quiet hours', () => {
    /** Idle 5h as of `now`, so only the clock differs between these cases. */
    function stalledAt(now: Date, over: Partial<NudgeCandidate> = {}) {
      return candidate({ lastActiveAt: new Date(now.getTime() - 5 * 60 * 60_000), ...over });
    }

    it('does not text at 3am local', () => {
      const threeAmLocal = new Date('2026-07-21T08:00:00Z'); // 3am at UTC-5
      expect(shouldNudgeIntake(stalledAt(threeAmLocal), threeAmLocal))
        .toEqual({ nudge: false, reason: 'quiet_hours' });
    });

    it('falls back to a US-daytime UTC window when the timezone is unknown', () => {
      // The COMMON case — timezone is captured partway through intake, so a lead
      // who stalls early has none.
      const day = new Date('2026-07-21T18:00:00Z');   // 1pm CT
      const night = new Date('2026-07-21T09:00:00Z'); // 4am CT
      expect(shouldNudgeIntake(stalledAt(day, { utcOffsetMinutes: null }), day).nudge).toBe(true);
      expect(shouldNudgeIntake(stalledAt(night, { utcOffsetMinutes: null }), night))
        .toEqual({ nudge: false, reason: 'quiet_hours' });
    });
  });
});

describe('isSendableHour', () => {
  it('handles the UTC window wrapping past midnight', () => {
    expect(isSendableHour(new Date('2026-07-21T15:00:00Z'), null)).toBe(true);  // window opens
    expect(isSendableHour(new Date('2026-07-21T23:30:00Z'), null)).toBe(true);
    expect(isSendableHour(new Date('2026-07-22T00:30:00Z'), null)).toBe(true);  // past midnight
    expect(isSendableHour(new Date('2026-07-22T01:00:00Z'), null)).toBe(false); // window closes
    expect(isSendableHour(new Date('2026-07-22T09:00:00Z'), null)).toBe(false);
  });

  it('respects a known offset on both sides of the world', () => {
    // Pakistan (+5) — 16:00 UTC is 9pm local, outside the 9am-8pm window.
    expect(isSendableHour(new Date('2026-07-21T16:00:00Z'), 300)).toBe(false);
    expect(isSendableHour(new Date('2026-07-21T06:00:00Z'), 300)).toBe(true); // 11am local
  });
});

describe('buildIntakeNudge', () => {
  it('hands the question back without guilt or urgency', () => {
    const msg = buildIntakeNudge('Najee');
    expect(msg).toContain('Najee');
    // A lead who hasn't finished opting in has not earned pressure.
    expect(msg).not.toMatch(/don'?t miss|last chance|hurry|only \d|expires/i);
    expect(msg.length).toBeLessThanOrEqual(160);
  });

  it('does not render a ragged name', () => {
    expect(buildIntakeNudge('  Najee  ')).toContain('yo Najee —');
  });
});
