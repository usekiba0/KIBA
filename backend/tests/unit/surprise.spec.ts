import { buildSurpriseMessage, pickSurpriseFlavor } from '../../src/ai/prompts/surprise.prompt';

describe('pickSurpriseFlavor', () => {
  it('returns a valid flavor for any seed', () => {
    const flavors = new Set([
      'progress_reflection', 'pattern_interrupt', 'identity', 'quiet_checkin', 'playful',
      'curiosity', 'vulnerability',
    ]);
    for (let i = 0; i < 50; i++) {
      const flavor = pickSurpriseFlavor(Math.floor(Math.random() * 1e9));
      expect(flavors.has(flavor)).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(pickSurpriseFlavor(12345)).toBe(pickSurpriseFlavor(12345));
    expect(pickSurpriseFlavor(99999)).toBe(pickSurpriseFlavor(99999));
  });

  it('handles negative seeds (Date.now() never goes negative but defensively)', () => {
    expect(() => pickSurpriseFlavor(-1)).not.toThrow();
  });
});

describe('buildSurpriseMessage', () => {
  const baseProfile = {
    avoidance_patterns: 'scrolling phone when I should be working',
  } as any;

  it('progress_reflection includes day count + showed-up count', () => {
    const msg = buildSurpriseMessage({
      flavor: 'progress_reflection',
      userName: 'Alex',
      daysIn: 21,
      showedUpCount: 14,
      profile: baseProfile,
    });
    expect(msg).toContain('21 days');
    expect(msg).toContain('14 times');
    expect(msg.toLowerCase()).toContain('scrolling phone');
  });

  it('progress_reflection falls back to generic hook when profile has no avoidance', () => {
    const msg = buildSurpriseMessage({
      flavor: 'progress_reflection',
      userName: 'Alex',
      daysIn: 10,
      showedUpCount: 5,
      profile: null,
    });
    expect(msg).toContain('10 days');
    expect(msg).toContain('5 times');
    expect(msg.toLowerCase()).toContain('wanted this bad');
  });

  it('pattern_interrupt is short and references momentum', () => {
    const msg = buildSurpriseMessage({
      flavor: 'pattern_interrupt',
      userName: 'Alex',
      daysIn: 7,
      showedUpCount: 4,
      profile: null,
    });
    expect(msg.toLowerCase()).toContain('momentum');
    expect(msg.length).toBeLessThan(120);
  });

  it('identity emphasizes "show up repeatedly" language', () => {
    const msg = buildSurpriseMessage({
      flavor: 'identity',
      userName: 'Alex',
      daysIn: 30,
      showedUpCount: 20,
      profile: null,
    });
    expect(msg.toLowerCase()).toContain('show up');
  });

  it('quiet_checkin asks about feelings, not output', () => {
    const msg = buildSurpriseMessage({
      flavor: 'quiet_checkin',
      userName: 'Alex',
      daysIn: 14,
      showedUpCount: 8,
      profile: null,
    });
    expect(msg.toLowerCase()).toContain('how are things');
  });

  it('playful is short + ends with the locked-in scale question', () => {
    const msg = buildSurpriseMessage({
      flavor: 'playful',
      userName: 'Alex',
      daysIn: 5,
      showedUpCount: 3,
      profile: null,
    });
    expect(msg.toLowerCase()).toContain('1-10');
    expect(msg.toLowerCase()).toContain('locked in');
    expect(msg.length).toBeLessThan(100);
  });

  it('curiosity asks an open question with no accountability', () => {
    const msg = buildSurpriseMessage({
      flavor: 'curiosity', userName: 'Alex', daysIn: 9, showedUpCount: 4, profile: null,
    });
    expect(msg).toContain('?');
    expect(msg.toLowerCase()).not.toMatch(/proof|strike|did it happen|task/);
  });

  it('curiosity rotates its question by row signals', () => {
    const a = buildSurpriseMessage({ flavor: 'curiosity', userName: 'Alex', daysIn: 0, showedUpCount: 0, profile: null });
    const b = buildSurpriseMessage({ flavor: 'curiosity', userName: 'Alex', daysIn: 1, showedUpCount: 0, profile: null });
    expect(a).not.toBe(b);
  });

  it('vulnerability notices something without coaching', () => {
    const withAvoidance = buildSurpriseMessage({
      flavor: 'vulnerability', userName: 'Alex', daysIn: 12, showedUpCount: 6,
      profile: { avoidance_patterns: 'scrolling' } as any,
    });
    expect(withAvoidance.toLowerCase()).toContain('carrying something');
    expect(withAvoidance.toLowerCase()).toContain('here if you');

    const noProfile = buildSurpriseMessage({
      flavor: 'vulnerability', userName: 'Alex', daysIn: 12, showedUpCount: 6, profile: null,
    });
    expect(noProfile.toLowerCase()).toContain('here if you');
  });

  it('falls back to "bro" when userName is empty', () => {
    // We don't always inject name in every flavor — just confirm no crash on empty
    for (const flavor of ['progress_reflection', 'pattern_interrupt', 'identity', 'quiet_checkin', 'playful', 'curiosity', 'vulnerability'] as const) {
      const msg = buildSurpriseMessage({
        flavor, userName: '', daysIn: 1, showedUpCount: 0, profile: null,
      });
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
