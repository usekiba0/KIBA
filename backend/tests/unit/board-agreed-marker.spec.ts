/**
 * [AGREED] vs [SUGGESTED] on the coaching board (2026-07-29 thread audit).
 *
 * The board reached the model as a flat list, so it could not tell a task the
 * user committed to from one auto-seeded at signup. On 2026-07-28 that produced:
 *
 *   Bianca: No snack. I shouldn't have snacks.
 *   KIBA:   hold on. you set 3pm snack time yourself last week. it's on your
 *           list. you said tracking snacks, dinner, and walk are your priority
 *           tasks. why the flip now. what changed.
 *   Bianca: No I didn't
 *   KIBA:   you're right. my bad. you didn't say that. you DO have snack time
 *           at 3pm on the board today as a task. that came from the plan we
 *           built together.
 *
 * She never set it. It came from the LLM-generated action_plan. KIBA challenged
 * her memory over it, then made a SECOND false claim of agreement while
 * apologising.
 */
import { buildCoachingDynamicContext } from '../../src/ai/prompts/coaching.prompt';

function contextWith(todos: Array<{ id: string; content: string; status: string; committed?: boolean }>) {
  return buildCoachingDynamicContext(
    { id: 'u-1', name: 'Bianca', phone_number: '+1' },
    {} as never,
    0,
    0,
    undefined,
    [],
    undefined,
    todos,
  );
}

describe('coaching board — agreed vs suggested', () => {
  const TODOS = [
    { id: 't1', content: 'Snack time at 3pm', status: 'open', committed: false },
    { id: 't2', content: 'Walk 20 minutes', status: 'open', committed: true },
  ];

  it('marks each item so the model can tell them apart', () => {
    const ctx = contextWith(TODOS);
    expect(ctx).toMatch(/\[t1\] \[SUGGESTED\] Snack time at 3pm/);
    expect(ctx).toMatch(/\[t2\] \[AGREED\] Walk 20 minutes/);
  });

  it('treats an unmarked item as un-committed — the safe direction', () => {
    const ctx = contextWith([{ id: 't3', content: 'Prep 3 dinners', status: 'open' }]);
    expect(ctx).toMatch(/\[t3\] \[SUGGESTED\] Prep 3 dinners/);
    expect(ctx).not.toMatch(/\[t3\] \[AGREED\]/);
  });

  it('forbids claiming the user agreed to a suggested item', () => {
    const ctx = contextWith(TODOS);
    expect(ctx).toMatch(/NEVER tell the user they agreed to a \[SUGGESTED\] item/);
    // The exact phrases from the real conversation are named as banned.
    expect(ctx).toMatch(/you set this yourself/);
    expect(ctx).toMatch(/the plan we built together/);
    expect(ctx).toMatch(/why the flip now/);
  });

  it('tells the model to concede when the user denies agreeing', () => {
    expect(contextWith(TODOS)).toMatch(/THEY ARE RIGHT/);
  });

  it('keeps suggested items usable — as an offer that add_todo converts', () => {
    const ctx = contextWith(TODOS);
    expect(ctx).toMatch(/yours to OFFER/);
    expect(ctx).toMatch(/Only \[AGREED\] items may be chased, counted, or referenced/);
  });
});
