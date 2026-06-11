import { findAnchorGoal, findAllGoals } from '../../src/data/goal-selection';
import { Goal, GoalType } from '../../src/data/entities/goal.entity';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g',
    user_id: 'user-1',
    description: 'goal',
    timeline: '30 days',
    current_status: 'started',
    action_plan: { milestones: [], weekly_breakdown: [], daily_tasks: [] },
    goal_type: GoalType.OUTCOME,
    difficulty_level: 3,
    is_anchor: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('findAnchorGoal', () => {
  it('returns the flagged anchor goal when one exists', async () => {
    const anchor = makeGoal({ id: 'anchor', is_anchor: true });
    const repo: any = {
      findOne: jest.fn(async ({ where }: any) =>
        where.is_anchor === true ? anchor : makeGoal({ id: 'other' }),
      ),
    };

    const result = await findAnchorGoal(repo, 'user-1');

    expect(result?.id).toBe('anchor');
    // It must query is_anchor:true FIRST and short-circuit — never hit the fallback.
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    expect(repo.findOne.mock.calls[0][0].where).toMatchObject({ user_id: 'user-1', is_anchor: true });
  });

  it('falls back to the most-recent goal when none is flagged (legacy rows)', async () => {
    const latest = makeGoal({ id: 'latest' });
    const repo: any = {
      findOne: jest.fn(async ({ where }: any) => (where.is_anchor === true ? null : latest)),
    };

    const result = await findAnchorGoal(repo, 'user-1');

    expect(result?.id).toBe('latest');
    expect(repo.findOne).toHaveBeenCalledTimes(2);
    // The fallback orders by created_at DESC.
    expect(repo.findOne.mock.calls[1][0].order).toMatchObject({ created_at: 'DESC' });
  });

  it('returns null when the user has no goals at all', async () => {
    const repo: any = { findOne: jest.fn(async () => null) };
    expect(await findAnchorGoal(repo, 'user-1')).toBeNull();
  });
});

describe('findAllGoals', () => {
  it('returns every goal ordered anchor-first then newest', async () => {
    const goals = [makeGoal({ id: 'anchor', is_anchor: true }), makeGoal({ id: 'b' })];
    const repo: any = { find: jest.fn(async () => goals) };

    const result = await findAllGoals(repo, 'user-1');

    expect(result).toHaveLength(2);
    expect(repo.find.mock.calls[0][0].order).toMatchObject({ is_anchor: 'DESC', created_at: 'DESC' });
  });
});
