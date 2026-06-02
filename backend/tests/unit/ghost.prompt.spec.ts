import { buildGhostMessage } from '../../src/ai/prompts/ghost.prompt';
import { GoalType } from '../../src/data/entities/goal.entity';

const NAME = 'Alex';
const LONG_GOAL = 'Make 100k a month, become more fit stop procrastinating';

describe('buildGhostMessage — level 1 goal-type branching (Karibi 2026-06-01)', () => {
  it('asks "happen or nah?" ONLY for a deadline-bound TASK', () => {
    // Run several times since the level picks a variant at random.
    const msgs = Array.from({ length: 20 }, () =>
      buildGhostMessage(1, NAME, 'finish the landing page', null, 1, GoalType.TASK),
    );
    expect(msgs.some((m) => /happen or nah|did it happen/i.test(m))).toBe(true);
  });

  it('NEVER asks "happen or nah?" / "did it happen?" for a long-term OUTCOME', () => {
    for (let i = 0; i < 50; i++) {
      const msg = buildGhostMessage(1, NAME, LONG_GOAL, null, 1, GoalType.OUTCOME);
      expect(msg).not.toMatch(/happen or nah|did it happen/i);
      expect(msg.toLowerCase()).toMatch(/move today|one thing|toward/);
    }
  });

  it('never dumps the full multi-part goal text into the message', () => {
    for (let i = 0; i < 50; i++) {
      const msg = buildGhostMessage(1, NAME, LONG_GOAL, null, 1, GoalType.OUTCOME);
      // The raw goal includes "procrastinating" at the end — the shortened
      // reference must drop it.
      expect(msg.toLowerCase()).not.toContain('procrastinating');
    }
  });

  it('opens a door (no accountability pressure) for an EMOTIONAL goal', () => {
    for (let i = 0; i < 30; i++) {
      const msg = buildGhostMessage(1, NAME, 'stop overthinking girls', null, 1, GoalType.EMOTIONAL);
      expect(msg).not.toMatch(/happen or nah|did it happen|proof/i);
      expect(msg.toLowerCase()).toMatch(/mind|good|headspace|heard from you/);
    }
  });

  it('frames an IDENTITY goal as one move today, not a status check', () => {
    for (let i = 0; i < 30; i++) {
      const msg = buildGhostMessage(1, NAME, 'become more disciplined', null, 1, GoalType.IDENTITY);
      expect(msg).not.toMatch(/did it happen|happen or nah/i);
      expect(msg.toLowerCase()).toMatch(/one thing|one move|today/);
    }
  });

  it('defaults to the OUTCOME framing when goal type is omitted', () => {
    const msg = buildGhostMessage(1, NAME, LONG_GOAL, null, 1);
    expect(msg).not.toMatch(/happen or nah|did it happen/i);
  });

  it('still produces the later escalation levels unchanged', () => {
    expect(buildGhostMessage(2, NAME, LONG_GOAL, null, 1)).toMatch(/miss/i);
    expect(buildGhostMessage(6, NAME, LONG_GOAL, null, 7)).toContain(NAME);
  });
});

describe('buildGhostMessage — tough-love is gated on cussing consent', () => {
  const profile = (cussing_ok: boolean) =>
    ({ cussing_ok, avoidance_patterns: '', comparison_figure: '', fears: '' } as any);

  it('uses the harsh level-4 variant only when the user opted into cussing', () => {
    const optedIn = Array.from({ length: 30 }, () =>
      buildGhostMessage(4, NAME, 'finish the deck', profile(true), 1, GoalType.TASK),
    );
    expect(optedIn.some((m) => /TF/.test(m))).toBe(true);
  });

  it('NEVER uses the harsh variant when the user wants it clean (pg)', () => {
    for (let i = 0; i < 30; i++) {
      const m = buildGhostMessage(4, NAME, 'finish the deck', profile(false), 1, GoalType.TASK);
      expect(m).not.toMatch(/TF/);
    }
  });

  it('defaults to clean when there is no profile at all', () => {
    for (let i = 0; i < 30; i++) {
      expect(buildGhostMessage(4, NAME, 'finish the deck', null, 1, GoalType.TASK)).not.toMatch(/TF/);
    }
  });
});
