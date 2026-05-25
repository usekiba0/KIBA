import { buildCheckinMessage } from '../../src/ai/prompts/checkin.prompt';
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
  pressure_preference: PressurePreference.PRESSURE,
  cussing_ok: false,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('buildCheckinMessage', () => {
  it('includes the user name', () => {
    const msg = buildCheckinMessage('Alex', testProfile, 'Run 5km');
    expect(msg).toContain('Alex');
  });

  it('includes the task description', () => {
    const msg = buildCheckinMessage('Alex', testProfile, 'Run 5km');
    expect(msg).toContain('Run 5km');
  });

  it('references the user fear to create pressure', () => {
    const msg = buildCheckinMessage('Alex', testProfile, 'Run 5km');
    expect(msg).toContain(testProfile.fears);
  });

  it('references the comparison figure', () => {
    const msg = buildCheckinMessage('Alex', testProfile, 'Run 5km');
    expect(msg).toContain(testProfile.comparison_figure);
  });

  it('falls back gracefully when no profile is provided', () => {
    const msg = buildCheckinMessage('Alex', null, 'Run 5km');
    expect(msg).toContain('Alex');
    expect(msg).toContain('Run 5km');
  });

  it('falls back gracefully when no task is provided', () => {
    const msg = buildCheckinMessage('Alex', testProfile, null);
    expect(msg).toContain('Alex');
  });
});
