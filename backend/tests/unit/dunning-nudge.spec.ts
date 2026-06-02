import { buildDunningNudge } from '../../src/accountability/checkin.processor';

describe('buildDunningNudge', () => {
  const full = { name: 'Sam', goal: 'get in the gym', obstacle: 'losing motivation', trialDays: 7 };

  it('personalises nudge 0 with name, goal and obstacle', () => {
    const m = buildDunningNudge(0, full);
    expect(m).toContain('Sam');
    expect(m).toContain('get in the gym');
    expect(m).toContain('losing motivation');
    expect(m).toContain('7 days');
  });

  it('references the goal/obstacle again in the final nudge', () => {
    const m = buildDunningNudge(2, full);
    expect(m.toLowerCase()).toContain('last time');
    expect(m).toContain('get in the gym');
    expect(m).toContain('losing motivation');
  });

  it('quotes the configured trial length, not a hardcoded number', () => {
    expect(buildDunningNudge(0, { ...full, trialDays: 14 })).toContain('14 days');
    expect(buildDunningNudge(1, { ...full, trialDays: 14 })).toContain('14 days');
  });

  it('never renders "undefined" when goal/obstacle are missing', () => {
    for (const i of [0, 1, 2]) {
      const m = buildDunningNudge(i, { name: null, goal: null, obstacle: null, trialDays: 7 });
      expect(m).not.toMatch(/undefined|null/);
      expect(m.trim().length).toBeGreaterThan(0);
    }
  });

  it('omits the name cleanly when unknown', () => {
    const m = buildDunningNudge(0, { name: null, goal: 'launch my business', obstacle: null, trialDays: 7 });
    expect(m).not.toMatch(/undefined|null/);
    expect(m).toContain('launch my business');
  });
});
