import { splitPlanDayIntoItems } from '../../src/accountability/todo.service';

describe('splitPlanDayIntoItems', () => {
  it('strips "Day N Weekday:" prefix and splits on sentence boundaries', () => {
    const entry = 'Day 1 Monday: Block Netflix on all devices. Schedule gym 5am appointment. Define 3 business revenue activities. Tell 1 person your 90-day goal.';
    expect(splitPlanDayIntoItems(entry)).toEqual([
      'Block Netflix on all devices',
      'Schedule gym 5am appointment',
      'Define 3 business revenue activities',
      'Tell 1 person your 90-day goal',
    ]);
  });

  it('strips "Day N:" prefix without weekday', () => {
    const entry = 'Day 4: Run 5K. Eat clean.';
    expect(splitPlanDayIntoItems(entry)).toEqual(['Run 5K', 'Eat clean']);
  });

  it('keeps commas inside items (does not over-split lists like "chicken, rice, broccoli")', () => {
    const entry = 'Day 2 Tuesday: Meal prep chicken, rice, broccoli for 3 days. Gym 45 min.';
    expect(splitPlanDayIntoItems(entry)).toEqual([
      'Meal prep chicken, rice, broccoli for 3 days',
      'Gym 45 min',
    ]);
  });

  it('drops fragments shorter than 4 chars', () => {
    const entry = 'Day 1: Hit it. No.';
    expect(splitPlanDayIntoItems(entry)).toEqual(['Hit it']);
  });

  it('returns empty for empty input', () => {
    expect(splitPlanDayIntoItems('')).toEqual([]);
  });

  it('returns empty for a prefix-only entry', () => {
    expect(splitPlanDayIntoItems('Day 1 Monday:')).toEqual([]);
  });

  it('strips a parenthesized "Day N (Weekday):" prefix (the leak from msg #35)', () => {
    const entry = 'Day 1 (Monday): Audit subscriber data. Map the journey.';
    expect(splitPlanDayIntoItems(entry)).toEqual(['Audit subscriber data', 'Map the journey']);
  });

  it('handles entries with no leading prefix', () => {
    const entry = 'Run 5K. Eat clean. Sleep 8 hours.';
    expect(splitPlanDayIntoItems(entry)).toEqual(['Run 5K', 'Eat clean', 'Sleep 8 hours']);
  });

  it('handles questions and exclamations as sentence terminators (3-char "Why" gets dropped by length filter)', () => {
    const entry = 'Day 1: Get gym time! Pick a meal plan. Why? Because consistency matters.';
    expect(splitPlanDayIntoItems(entry)).toEqual([
      'Get gym time',
      'Pick a meal plan',
      'Because consistency matters',
    ]);
  });
});
