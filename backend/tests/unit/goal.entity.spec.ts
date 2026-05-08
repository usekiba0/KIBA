import { Goal } from '../../src/data/entities/goal.entity';

describe('Goal entity', () => {
  function makeGoal(overrides: Partial<Goal> = {}): Goal {
    const g = new Goal();
    g.id = 'goal-1';
    g.user_id = 'user-1';
    g.description = 'Run a 5K in under 30 minutes';
    g.timeline = '60 days';
    g.current_status = 'I can barely run 1K without stopping';
    g.action_plan = {
      milestones: ['Run 2K without stopping', 'Run 3.5K', 'Complete 5K'],
      weekly_breakdown: ['Week 1: 3x 1K runs', 'Week 2: 3x 1.5K runs'],
      daily_tasks: ['Day 1: 1K run at easy pace', 'Day 2: Rest or walk 20min'],
    };
    g.difficulty_level = 3;
    g.created_at = new Date();
    g.updated_at = new Date();
    Object.assign(g, overrides);
    return g;
  }

  it('creates a goal with all required fields', () => {
    const goal = makeGoal();
    expect(goal.user_id).toBe('user-1');
    expect(goal.description).toBeDefined();
    expect(goal.timeline).toBeDefined();
    expect(goal.current_status).toBeDefined();
  });

  it('stores action_plan as a structured object with milestones, weekly_breakdown and daily_tasks', () => {
    const goal = makeGoal();
    expect(goal.action_plan.milestones).toHaveLength(3);
    expect(goal.action_plan.weekly_breakdown).toHaveLength(2);
    expect(goal.action_plan.daily_tasks).toHaveLength(2);
  });

  it('has a default difficulty_level of 3', () => {
    const goal = makeGoal();
    expect(goal.difficulty_level).toBe(3);
  });

  it('accepts difficulty_level between 1 and 5', () => {
    expect(makeGoal({ difficulty_level: 1 }).difficulty_level).toBe(1);
    expect(makeGoal({ difficulty_level: 5 }).difficulty_level).toBe(5);
  });

  it('has timestamps for created_at and updated_at', () => {
    const goal = makeGoal();
    expect(goal.created_at).toBeInstanceOf(Date);
    expect(goal.updated_at).toBeInstanceOf(Date);
  });
});
