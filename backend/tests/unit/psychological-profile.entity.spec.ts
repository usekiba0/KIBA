import { validate } from 'class-validator';
import { PsychologicalProfile, PressurePreference } from '../../src/data/entities/psychological-profile.entity';

describe('PsychologicalProfile entity', () => {
  function makeProfile(overrides: Partial<PsychologicalProfile> = {}): PsychologicalProfile {
    const p = new PsychologicalProfile();
    p.id = 'profile-1';
    p.user_id = 'user-1';
    p.fears = 'I fear staying stuck while everyone around me moves forward';
    p.avoidance_patterns = 'I scroll my phone when I should be working';
    p.comparison_figure = 'My college roommate who started his own company';
    p.public_failure_scenario = 'My friends finding out I quit another goal after one week';
    p.typical_failure_moment = 'Sunday evenings when motivation drops';
    p.pressure_preference = PressurePreference.PRESSURE;
    p.created_at = new Date();
    p.updated_at = new Date();
    Object.assign(p, overrides);
    return p;
  }

  it('has a valid PressurePreference enum with pressure and encouragement values', () => {
    expect(PressurePreference.PRESSURE).toBe('pressure');
    expect(PressurePreference.ENCOURAGEMENT).toBe('encouragement');
  });

  it('creates a profile with all required fields', () => {
    const profile = makeProfile();
    expect(profile.user_id).toBe('user-1');
    expect(profile.fears).toBeDefined();
    expect(profile.avoidance_patterns).toBeDefined();
    expect(profile.comparison_figure).toBeDefined();
    expect(profile.public_failure_scenario).toBeDefined();
    expect(profile.typical_failure_moment).toBeDefined();
    expect(profile.pressure_preference).toBe(PressurePreference.PRESSURE);
  });

  it('accepts encouragement as a valid pressure_preference', () => {
    const profile = makeProfile({ pressure_preference: PressurePreference.ENCOURAGEMENT });
    expect(profile.pressure_preference).toBe(PressurePreference.ENCOURAGEMENT);
  });

  it('has timestamps for created_at and updated_at', () => {
    const profile = makeProfile();
    expect(profile.created_at).toBeInstanceOf(Date);
    expect(profile.updated_at).toBeInstanceOf(Date);
  });

  it('belongs to a user via user_id', () => {
    const profile = makeProfile({ user_id: 'user-abc' });
    expect(profile.user_id).toBe('user-abc');
  });
});
