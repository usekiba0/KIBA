import {
  hasFaithGoal,
  pickDailyFaithEntry,
  buildFaithBlock,
  FAITH_POOL,
} from '../../src/accountability/faith-content';

describe('faith-content (Rule 5 per-goal value hook)', () => {
  describe('hasFaithGoal', () => {
    it('matches faith / spiritual goals', () => {
      expect(hasFaithGoal('get closer to god')).toBe(true);
      expect(hasFaithGoal('grow my faith')).toBe(true);
      expect(hasFaithGoal('read the bible daily')).toBe(true);
      expect(hasFaithGoal('build a daily prayer habit')).toBe(true);
      expect(hasFaithGoal('go to church more')).toBe(true);
      expect(hasFaithGoal(null, undefined, 'become more spiritual')).toBe(true);
      // Matches when faith is ONE of several goals.
      expect(hasFaithGoal('hit 100k months', 'work out daily', 'get closer to god')).toBe(true);
    });

    it('does NOT match non-faith goals or empties', () => {
      expect(hasFaithGoal('hit 100k months')).toBe(false);
      expect(hasFaithGoal('work out daily', 'eat cleaner')).toBe(false);
      expect(hasFaithGoal('')).toBe(false);
      expect(hasFaithGoal(null, undefined)).toBe(false);
    });
  });

  describe('pickDailyFaithEntry', () => {
    it('is deterministic for the same user + day', () => {
      const a = pickDailyFaithEntry('user-1', '2026-07-10');
      const b = pickDailyFaithEntry('user-1', '2026-07-10');
      expect(a).toBe(b);
    });

    it('rotates across days (not the same entry every day)', () => {
      const days = ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14'];
      const refs = new Set(days.map((d) => pickDailyFaithEntry('user-1', d).ref));
      expect(refs.size).toBeGreaterThan(1);
    });

    it('every pool entry has a verse, a citation, and an affirmation', () => {
      for (const e of FAITH_POOL) {
        expect(e.verse.length).toBeGreaterThan(0);
        expect(e.ref).toMatch(/\d/); // has a chapter:verse number
        expect(e.affirmation.length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildFaithBlock', () => {
    it('returns null when there is no faith goal', () => {
      expect(buildFaithBlock(['hit 100k months', 'gym daily'], 'user-1', '2026-07-10')).toBeNull();
    });

    it('formats a verse + affirmation block for a faith goal', () => {
      const block = buildFaithBlock(['get closer to god'], 'user-1', '2026-07-10');
      expect(block).not.toBeNull();
      const entry = pickDailyFaithEntry('user-1', '2026-07-10');
      expect(block).toContain(entry.verse);
      expect(block).toContain(entry.ref);
      expect(block).toContain(entry.affirmation);
    });
  });
});
