import { intakeBuildComplete, FORCE_LINK_AFTER_STALLED_TURNS } from '../../src/messaging/coaching.processor';

const full = {
  name: 'Alex',
  utc_offset_minutes: -300,
  intake_data: {
    goal_description: 'run a 5k',
    why_it_matters: 'prove i can finish something',
    avoidance_patterns: 'i quit when it gets boring',
  },
};

describe('intakeBuildComplete (payment-link safety-net gate)', () => {
  it('is true only when name + timezone + goal + why + obstacle are all captured', () => {
    expect(intakeBuildComplete(full)).toBe(true);
  });

  it('treats a UTC offset of 0 as a real timezone (not missing)', () => {
    expect(intakeBuildComplete({ ...full, utc_offset_minutes: 0 })).toBe(true);
  });

  it.each([
    ['name', { ...full, name: null }],
    ['timezone', { ...full, utc_offset_minutes: null }],
    ['goal', { ...full, intake_data: { ...full.intake_data, goal_description: undefined } }],
    ['why', { ...full, intake_data: { ...full.intake_data, why_it_matters: undefined } }],
    ['obstacle', { ...full, intake_data: { ...full.intake_data, avoidance_patterns: undefined } }],
  ])('is false when %s is missing (build still in progress — do not force the link)', (_label, user) => {
    expect(intakeBuildComplete(user as any)).toBe(false);
  });

  it('handles a totally empty intake gracefully', () => {
    expect(intakeBuildComplete({ name: null, utc_offset_minutes: null, intake_data: null })).toBe(false);
  });

  it('forces the link only after a grace period, never on the first complete turn', () => {
    expect(FORCE_LINK_AFTER_STALLED_TURNS).toBeGreaterThanOrEqual(2);
  });
});
