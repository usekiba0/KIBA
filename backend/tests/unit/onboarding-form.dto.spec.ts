import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OnboardingFormDto } from '../../src/onboarding/dto/onboarding-form.dto';
import { PressurePreference } from '../../src/data/entities/psychological-profile.entity';

function makeValid(): Record<string, unknown> {
  return {
    name: 'Alex',
    phone_number: '+12125551234',
    goal_description: 'Run a 5K in under 30 minutes',
    goal_timeline: '60 days',
    current_status: 'I can barely run 1K without stopping',
    fears: 'I fear staying stuck while everyone around me moves forward',
    avoidance_patterns: 'I scroll my phone when I should be working',
    comparison_figure: 'My college roommate who started his own company',
    public_failure_scenario: 'My friends finding out I quit after one week',
    typical_failure_moment: 'Sunday evenings when motivation drops',
    pressure_preference: PressurePreference.PRESSURE,
    checkin_time: '08:00',
    stripe_payment_method_id: 'pm_test_abc123',
  };
}

async function getErrors(data: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(OnboardingFormDto, data);
  const errors = await validate(dto);
  return errors.map(e => Object.values(e.constraints ?? {}).join(', ')).flat();
}

describe('OnboardingFormDto — psychological intake fields', () => {
  it('passes validation with all required fields present', async () => {
    const errors = await getErrors(makeValid());
    expect(errors).toHaveLength(0);
  });

  it('fails when goal_description is missing', async () => {
    const data = makeValid();
    delete data.goal_description;
    const errors = await getErrors(data);
    expect(errors.some(e => e.includes('goal_description') || e.length > 0)).toBe(true);
  });

  it('fails when fears is missing', async () => {
    const data = makeValid();
    delete data.fears;
    const errors = await getErrors(data);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when avoidance_patterns is missing', async () => {
    const data = makeValid();
    delete data.avoidance_patterns;
    const errors = await getErrors(data);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when comparison_figure is missing', async () => {
    const data = makeValid();
    delete data.comparison_figure;
    const errors = await getErrors(data);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when public_failure_scenario is missing', async () => {
    const data = makeValid();
    delete data.public_failure_scenario;
    const errors = await getErrors(data);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when typical_failure_moment is missing', async () => {
    const data = makeValid();
    delete data.typical_failure_moment;
    const errors = await getErrors(data);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when pressure_preference is not a valid enum value', async () => {
    const errors = await getErrors({ ...makeValid(), pressure_preference: 'invalid' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts encouragement as a valid pressure_preference', async () => {
    const errors = await getErrors({ ...makeValid(), pressure_preference: PressurePreference.ENCOURAGEMENT });
    expect(errors).toHaveLength(0);
  });

  it('fails when checkin_time is not HH:MM format', async () => {
    const errors = await getErrors({ ...makeValid(), checkin_time: 'not-a-time' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts valid checkin_time values', async () => {
    expect(await getErrors({ ...makeValid(), checkin_time: '06:00' })).toHaveLength(0);
    expect(await getErrors({ ...makeValid(), checkin_time: '23:59' })).toHaveLength(0);
  });

  it('fails when phone_number is not E.164 format', async () => {
    const errors = await getErrors({ ...makeValid(), phone_number: '555-1234' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when stripe_payment_method_id is missing', async () => {
    const data = makeValid();
    delete data.stripe_payment_method_id;
    const errors = await getErrors(data);
    expect(errors.length).toBeGreaterThan(0);
  });
});
