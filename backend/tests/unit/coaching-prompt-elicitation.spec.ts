import { buildPressureContext } from '../../src/ai/prompts/coaching.prompt';
import { PsychologicalProfile, PressurePreference } from '../../src/data/entities/psychological-profile.entity';

function profile(overrides: Partial<PsychologicalProfile> = {}): PsychologicalProfile {
  return {
    id: 'p1',
    user_id: 'u1',
    fears: '',
    avoidance_patterns: '',
    comparison_figure: '',
    public_failure_scenario: '',
    typical_failure_moment: '',
    embarrassment: null,
    pressure_preference: PressurePreference.PRESSURE,
    cussing_ok: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('buildPressureContext — elicitation prompting', () => {
  it('lists every empty field under MISSING PROFILE FIELDS and includes the do-not-reference rule', () => {
    const ctx = buildPressureContext(profile(), 50, 0);
    expect(ctx).toMatch(/MISSING PROFILE FIELDS \(you do NOT have this info\): fears, avoidance_patterns, comparison_figure, public_failure_scenario, typical_failure_moment/);
    expect(ctx).toMatch(/Never reference a missing field as if you knew it/);
    expect(ctx).toMatch(/save_profile_field/);
  });

  it('omits the missing section entirely when every field has a real value', () => {
    const full = profile({
      fears: 'being seen as a fraud',
      avoidance_patterns: 'scrolling reddit at night',
      comparison_figure: 'my brother',
      public_failure_scenario: 'getting laid off and ghosting my mom',
      typical_failure_moment: 'late evening after dinner',
      pressure_preference: PressurePreference.PRESSURE,
    });
    const ctx = buildPressureContext(full, 50, 0);
    expect(ctx).not.toMatch(/MISSING PROFILE FIELDS/);
    expect(ctx).not.toMatch(/ELICITATION RULES/);
    expect(ctx).toMatch(/- Fear: being seen as a fraud/);
    expect(ctx).toMatch(/- Comparison figure: my brother/);
  });

  it('skips only the empty fields and lists the rest as missing', () => {
    const partial = profile({
      fears: 'falling behind',
      comparison_figure: '   ', // whitespace-only should count as empty
    });
    const ctx = buildPressureContext(partial, 50, 0);
    expect(ctx).toMatch(/- Fear: falling behind/);
    expect(ctx).not.toMatch(/- Comparison figure:/);
    expect(ctx).toMatch(/MISSING PROFILE FIELDS \(you do NOT have this info\): avoidance_patterns, comparison_figure, public_failure_scenario, typical_failure_moment/);
  });

  describe('embarrassment — week-2 gated elicitation', () => {
    it('does NOT ask for embarrassment in week 1 (weeksIn < 2)', () => {
      const ctx = buildPressureContext(profile(), 50, 0, 1);
      expect(ctx).not.toMatch(/embarrassment/);
    });

    it('adds embarrassment to the missing list once into week 2', () => {
      const ctx = buildPressureContext(profile(), 50, 0, 2);
      expect(ctx).toMatch(/MISSING PROFILE FIELDS[^\n]*embarrassment/);
      expect(ctx).toMatch(/you'd hate for anyone to actually see/);
    });

    it('shows embarrassment as known when set, and never lists it as missing', () => {
      const ctx = buildPressureContext(
        profile({ embarrassment: 'everyone seeing i quit again' }),
        50, 0, 5,
      );
      expect(ctx).toMatch(/- Embarrassment[^\n]*everyone seeing i quit again/);
      expect(ctx).not.toMatch(/MISSING PROFILE FIELDS[^\n]*embarrassment/);
    });
  });
});
