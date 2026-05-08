import { Strike } from '../../src/data/entities/strike.entity';

describe('Strike entity', () => {
  function makeStrike(overrides: Partial<Strike> = {}): Strike {
    const s = new Strike();
    s.id = 'strike-1';
    s.user_id = 'user-1';
    s.daily_task_id = 'task-1';
    s.escalation_level = 1;
    s.created_at = new Date();
    Object.assign(s, overrides);
    return s;
  }

  it('creates a strike with required fields', () => {
    const strike = makeStrike();
    expect(strike.user_id).toBe('user-1');
    expect(strike.daily_task_id).toBe('task-1');
    expect(strike.escalation_level).toBe(1);
    expect(strike.created_at).toBeInstanceOf(Date);
  });

  it('accepts escalation levels 1, 2, and 3', () => {
    expect(makeStrike({ escalation_level: 1 }).escalation_level).toBe(1);
    expect(makeStrike({ escalation_level: 2 }).escalation_level).toBe(2);
    expect(makeStrike({ escalation_level: 3 }).escalation_level).toBe(3);
  });
});
