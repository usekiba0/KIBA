import { buildCheckinMessage, humanizeTask } from '../../src/ai/prompts/checkin.prompt';
import { PressurePreference } from '../../src/data/entities/psychological-profile.entity';
import { PsychologicalProfile } from '../../src/data/entities/psychological-profile.entity';

const testProfile: PsychologicalProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  fears: 'staying stuck forever',
  avoidance_patterns: 'scrolling instead of acting',
  comparison_figure: 'college roommate who now runs a startup',
  public_failure_scenario: 'having to admit I failed again',
  typical_failure_moment: 'Sunday evenings',
  embarrassment: null,
  pressure_preference: PressurePreference.PRESSURE,
  cussing_ok: false,
  created_at: new Date(),
  updated_at: new Date(),
};

// NOTE: the message rotates across a random variant pool, so these assertions
// test invariants that hold for EVERY variant — not one specific wording. The
// old spec asserted deterministic fear/figure inclusion that the rotation never
// guaranteed; it was red on a clean checkout (see test-baseline memo).
describe('buildCheckinMessage', () => {
  it('always includes the task description', () => {
    for (let i = 0; i < 30; i++) {
      expect(buildCheckinMessage('Alex', testProfile, 'Run 5km')).toContain('Run 5km');
    }
  });

  it('humanizes a robotic "Day N Weekday:" schedule into the primary action only', () => {
    const stored = 'Day 7 Sunday: Gym optional but encouraged (20min), business planning for Week 2, review compliance.';
    for (let i = 0; i < 30; i++) {
      const msg = buildCheckinMessage('Alex', testProfile, stored);
      expect(msg).toContain('Gym optional but encouraged (20min)');
      expect(msg).not.toContain('Day 7 Sunday');        // prefix stripped
      expect(msg).not.toContain('business planning');     // secondary items dropped (they live on the to-do list)
    }
  });

  it('falls back gracefully when no profile is provided', () => {
    const msg = buildCheckinMessage('Alex', null, 'Run 5km');
    expect(msg).toContain('Run 5km');
    expect(typeof msg).toBe('string');
  });

  it('returns a non-empty message when no task is provided', () => {
    const msg = buildCheckinMessage('Alex', testProfile, null);
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe('humanizeTask', () => {
  it('strips the "Day N Weekday:" prefix', () => {
    expect(humanizeTask('Day 1 Monday: Run 5km')).toBe('Run 5km');
    expect(humanizeTask('Day 12: send the email')).toBe('send the email');
  });

  it('keeps only the first clause (primary action)', () => {
    expect(humanizeTask('Day 7 Sunday: Gym (20min), business planning, review compliance.'))
      .toBe('Gym (20min)');
    expect(humanizeTask('Block Netflix. Schedule gym 5am. Define 3 tasks.'))
      .toBe('Block Netflix');
  });

  it('leaves a plain task untouched', () => {
    expect(humanizeTask('Run 5km')).toBe('Run 5km');
  });
});
