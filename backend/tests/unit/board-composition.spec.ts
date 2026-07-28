import { splitPlanDayIntoItems } from '../../src/accountability/todo.service';

/**
 * Guards against phantom board items — text that reaches the daily list but can
 * never be "done", so it sits open forever and lands in the weekly review as a
 * MISS the user never actually made.
 */
describe('splitPlanDayIntoItems — narrative openers', () => {
  it('folds a leading scene-setter into the first real task instead of boarding it', () => {
    // The exact prod case (2026-07-28): "This is your easiest day" became its own
    // uncheckable board item on a 13-item day.
    const items = splitPlanDayIntoItems(
      'Day 3: This is your easiest day. Eat normally but use smaller plates for all meals. Take a 15-minute walk.',
    );

    expect(items).not.toContain('This is your easiest day');
    expect(items[0]).toBe(
      'This is your easiest day. Eat normally but use smaller plates for all meals',
    );
    expect(items).toHaveLength(2);
    // Lossless — the framing text still reaches the user.
    expect(items.join(' ')).toContain('This is your easiest day');
  });

  it('keeps a narrative-only entry rather than dropping the day entirely', () => {
    const items = splitPlanDayIntoItems('This is a rest day.');
    expect(items).toEqual(['This is a rest day']);
  });

  it('does not swallow real tasks that merely start with a pronoun', () => {
    // "You'll" can open a genuine task, so it must NOT be treated as narrative.
    const items = splitPlanDayIntoItems("You'll run 5K. Log the time.");
    expect(items).toContain("You'll run 5K");
  });

  it('still folds trailing modifiers backwards (existing behavior preserved)', () => {
    const items = splitPlanDayIntoItems('Write down why you skip legs. Be honest.');
    expect(items).toHaveLength(1);
    expect(items[0]).toBe('Write down why you skip legs. Be honest');
  });

  it('still collapses near-duplicate items (existing behavior preserved)', () => {
    const items = splitPlanDayIntoItems('Review your week. Review the week.');
    expect(items).toHaveLength(1);
  });
});
