import { classifyGoalType, shortGoalReference } from '../../src/ai/goal-classifier';
import { GoalType } from '../../src/data/entities/goal.entity';

describe('classifyGoalType', () => {
  it('classifies measurable long-term results as OUTCOME', () => {
    expect(classifyGoalType('make 100k a month', '6 months')).toBe(GoalType.OUTCOME);
    expect(classifyGoalType('lose 30 lbs')).toBe(GoalType.OUTCOME);
    expect(classifyGoalType('build a business', '1 year')).toBe(GoalType.OUTCOME);
    expect(classifyGoalType('hit 6 figures')).toBe(GoalType.OUTCOME);
  });

  it('classifies recurring commitments as HABIT', () => {
    expect(classifyGoalType('gym 4x a week')).toBe(GoalType.HABIT);
    expect(classifyGoalType('post daily on twitter')).toBe(GoalType.HABIT);
    expect(classifyGoalType('sleep by 11 every day')).toBe(GoalType.HABIT);
    expect(classifyGoalType('build a morning routine')).toBe(GoalType.HABIT);
  });

  it('classifies one-time deliverables with a deadline as TASK', () => {
    expect(classifyGoalType('finish the landing page', 'by friday')).toBe(GoalType.TASK);
    expect(classifyGoalType('send the investor email today')).toBe(GoalType.TASK);
    expect(classifyGoalType('book the call', 'tomorrow')).toBe(GoalType.TASK);
  });

  it('classifies trait / behavior goals as IDENTITY', () => {
    expect(classifyGoalType('become more disciplined')).toBe(GoalType.IDENTITY);
    expect(classifyGoalType('stop procrastinating')).toBe(GoalType.IDENTITY);
    expect(classifyGoalType('be more confident')).toBe(GoalType.IDENTITY);
  });

  it('classifies life / feeling issues as EMOTIONAL', () => {
    expect(classifyGoalType('stop overthinking girls')).toBe(GoalType.EMOTIONAL);
    expect(classifyGoalType('i feel lost')).toBe(GoalType.EMOTIONAL);
    expect(classifyGoalType('deal with the breakup')).toBe(GoalType.EMOTIONAL);
  });

  it('classifies the screenshot goal as OUTCOME (NOT a did-it-happen task)', () => {
    // The exact bug: this multi-part goal was getting "happen or nah?".
    const t = classifyGoalType('Make 100k a month, become more fit stop procrastinating');
    expect(t).toBe(GoalType.OUTCOME);
    expect(t).not.toBe(GoalType.TASK);
  });

  it('defaults to OUTCOME (the safe "what is the move today" route) when unsure', () => {
    expect(classifyGoalType('the thing')).toBe(GoalType.OUTCOME);
    expect(classifyGoalType('')).toBe(GoalType.OUTCOME);
    expect(classifyGoalType(null)).toBe(GoalType.OUTCOME);
  });

  it('does not misread outcome phrasing as a task', () => {
    // "make ... a month" contains no real deliverable+deadline → stays OUTCOME.
    expect(classifyGoalType('make 100k a month')).not.toBe(GoalType.TASK);
  });
});

describe('shortGoalReference', () => {
  it('keeps only the first clause of a multi-part goal', () => {
    const s = shortGoalReference('Make 100k a month, become more fit stop procrastinating');
    expect(s.toLowerCase()).toContain('make 100k a month');
    expect(s.toLowerCase()).not.toContain('procrastinating');
  });

  it('caps very long single clauses', () => {
    const s = shortGoalReference('a'.repeat(100));
    expect(s.length).toBeLessThanOrEqual(48);
  });

  it('falls back to a default when empty', () => {
    expect(shortGoalReference('')).toBe('your goal');
    expect(shortGoalReference(null)).toBe('your goal');
  });
});
