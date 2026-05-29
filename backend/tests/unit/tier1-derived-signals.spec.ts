import { pickMilestone, buildMilestoneMessage } from '../../src/ai/prompts/milestone.prompt';
import { buildGhostMessage } from '../../src/ai/prompts/ghost.prompt';
import { buildCheckinMessage } from '../../src/ai/prompts/checkin.prompt';
import { dowForUser } from '../../src/accountability/strike.service';

describe('pickMilestone', () => {
  it('returns 3 the first time a user crosses 3 days', () => {
    expect(pickMilestone(3, 0)).toBe(3);
  });

  it('returns null when streak hasn\'t crossed the next threshold', () => {
    expect(pickMilestone(4, 3)).toBeNull();
    expect(pickMilestone(6, 3)).toBeNull();
    expect(pickMilestone(8, 7)).toBeNull();
  });

  it('jumps straight to 7 if a user somehow crosses 7 without crossing 3 first', () => {
    expect(pickMilestone(7, 0)).toBe(7);
  });

  it('returns 14 when crossing 14 after a 7-day milestone', () => {
    expect(pickMilestone(14, 7)).toBe(14);
  });

  it('returns 30 when crossing 30 after a 14-day milestone', () => {
    expect(pickMilestone(30, 14)).toBe(30);
  });

  it('prefers the highest crossing if the user gapped (e.g. 31 days, last hit was 3)', () => {
    // 30 is higher than 14 / 7, so return 30 — celebrate the bigger milestone
    expect(pickMilestone(31, 3)).toBe(30);
  });

  it('returns null once user has been celebrated at 30 (no more thresholds wired yet)', () => {
    expect(pickMilestone(45, 30)).toBeNull();
    expect(pickMilestone(100, 30)).toBeNull();
  });

  it('handles streak < 3', () => {
    expect(pickMilestone(0, 0)).toBeNull();
    expect(pickMilestone(2, 0)).toBeNull();
  });
});

describe('buildMilestoneMessage', () => {
  it('produces a non-empty message for 3/7/14/30', () => {
    for (const m of [3, 7, 14, 30] as const) {
      expect(buildMilestoneMessage(m, 'Alex', null)?.length).toBeGreaterThan(10);
    }
  });

  it('includes the user name in 7+ day milestones', () => {
    expect(buildMilestoneMessage(7, 'Karibi', null)).toContain('Karibi');
    expect(buildMilestoneMessage(14, 'Karibi', null)).toContain('Karibi');
    expect(buildMilestoneMessage(30, 'Karibi', null)).toContain('Karibi');
  });

  it('weaves avoidance pattern into the 7-day message when available', () => {
    const profile = { avoidance_patterns: 'scrolling phone when I should be working' } as any;
    const msg = buildMilestoneMessage(7, 'Alex', profile);
    expect(msg).toContain('scrolling phone');
  });

  it('falls back to generic copy when avoidance is empty', () => {
    const msg = buildMilestoneMessage(7, 'Alex', { avoidance_patterns: '' } as any);
    expect(msg).not.toContain('scrolling');
    expect(msg).toContain('not the same person');
  });
});

describe('buildGhostMessage', () => {
  it('level 1 references the user\'s actual goal text', () => {
    const msg = buildGhostMessage(1, 'Alex', 'run 5k', null, 1);
    expect(msg.toLowerCase()).toContain('run 5k');
  });

  it('level 6 (day 7) is a multi-line emotional closer that pulls from profile', () => {
    const profile = {
      avoidance_patterns: 'starting and stopping',
      comparison_figure: 'my college roommate',
      fears: 'staying stuck',
    } as any;
    const msg = buildGhostMessage(6, 'Karibi', 'gym daily', profile, 7);
    expect(msg).toContain('Karibi');
    expect(msg).toContain('7 days');
    expect(msg.toLowerCase()).toContain('starting and stopping');
    expect(msg.toLowerCase()).toContain('staying stuck');
    expect(msg.toLowerCase()).toContain('my college roommate');
    expect(msg).toContain("i'm here when you're ready");
  });

  it('escalation feels different at each level (length grows)', () => {
    const profile = {
      avoidance_patterns: 'avoidance',
      comparison_figure: 'comp',
      fears: 'fears',
    } as any;
    const l1 = buildGhostMessage(1, 'A', 'g', profile, 1);
    const l3 = buildGhostMessage(3, 'A', 'g', profile, 2);
    const l6 = buildGhostMessage(6, 'A', 'g', profile, 7);
    expect(l3.length).toBeGreaterThan(l1.length);
    expect(l6.length).toBeGreaterThan(l3.length);
  });

  it('level 3 (day 2) references the user\'s avoidance pattern when present', () => {
    const msg = buildGhostMessage(
      3, 'A', 'g',
      { avoidance_patterns: 'going quiet when things get hard' } as any,
      2,
    );
    expect(msg.toLowerCase()).toContain('pattern');
  });

  it('null profile still produces usable messages at all levels', () => {
    for (const lvl of [1, 2, 3, 4, 5, 6] as const) {
      const msg = buildGhostMessage(lvl, 'A', null, null, lvl);
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

describe('buildCheckinMessage — end-of-week push', () => {
  it('Thursday with a task uses "two days left" variant', () => {
    // We can't pin which variant pickRandom returns, but every Thursday-with-task
    // variant references "two days" or framing about the rest of the week.
    let saw = false;
    for (let i = 0; i < 30; i++) {
      const msg = buildCheckinMessage('Alex', null, 'gym at 7', { localDow: 4 });
      if (msg.includes('two days') || msg.toLowerCase().includes('week')) saw = true;
    }
    expect(saw).toBe(true);
  });

  it('Friday with no task uses "last day" framing', () => {
    let saw = false;
    for (let i = 0; i < 30; i++) {
      const msg = buildCheckinMessage('Alex', null, null, { localDow: 5 });
      if (msg.includes('last day')) saw = true;
    }
    expect(saw).toBe(true);
  });

  it('Sat/Sun stay neutral (no end-of-week language)', () => {
    for (let i = 0; i < 30; i++) {
      const msg = buildCheckinMessage('Alex', null, null, { localDow: 0 });
      expect(msg.toLowerCase()).not.toContain('two days');
      expect(msg.toLowerCase()).not.toContain('last day');
    }
  });

  it('falls back to neutral when DOW is unknown', () => {
    const msg = buildCheckinMessage('Alex', null, null, { localDow: null });
    expect(msg.length).toBeGreaterThan(0);
  });

  it('falls back to neutral when ctx not passed (backward compat)', () => {
    const msg = buildCheckinMessage('Alex', null, null);
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe('dowForUser', () => {
  it('CDT user with task scheduled at 04:00 UTC on a Monday returns Sunday (their local clock)', () => {
    // 2026-05-25 (Monday) 04:00 UTC = 2026-05-24 (Sunday) 23:00 CDT (-300)
    const d = new Date('2026-05-25T04:00:00Z');
    expect(dowForUser(d, -300)).toBe(0); // Sunday
  });

  it('PKT user (+5) at 23:00 UTC Sunday returns Monday', () => {
    // 2026-05-24 (Sunday) 23:00 UTC = 2026-05-25 (Monday) 04:00 PKT
    const d = new Date('2026-05-24T23:00:00Z');
    expect(dowForUser(d, 300)).toBe(1); // Monday
  });

  it('returns null when offset is unknown (avoid miscounting as server-UTC day)', () => {
    expect(dowForUser(new Date(), null)).toBeNull();
  });
});
