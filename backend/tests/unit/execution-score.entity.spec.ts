import { ExecutionScore } from '../../src/data/entities/execution-score.entity';

describe('ExecutionScore entity', () => {
  function makeScore(overrides: Partial<ExecutionScore> = {}): ExecutionScore {
    const s = new ExecutionScore();
    s.id = 'score-1';
    s.user_id = 'user-1';
    s.current_score = 72;
    s.completion_rate = 0.8;
    s.proof_rate = 0.75;
    s.response_time_score = 0.9;
    s.streak_bonus = 0.6;
    s.snapshot_date = new Date('2026-05-10');
    s.created_at = new Date();
    Object.assign(s, overrides);
    return s;
  }

  it('creates a score with all rate fields', () => {
    const score = makeScore();
    expect(score.user_id).toBe('user-1');
    expect(score.current_score).toBe(72);
    expect(score.completion_rate).toBe(0.8);
    expect(score.proof_rate).toBe(0.75);
    expect(score.response_time_score).toBe(0.9);
    expect(score.streak_bonus).toBe(0.6);
  });

  it('has a snapshot_date for daily tracking', () => {
    const score = makeScore();
    expect(score.snapshot_date).toBeInstanceOf(Date);
  });

  it('accepts scores from 0 to 100', () => {
    expect(makeScore({ current_score: 0 }).current_score).toBe(0);
    expect(makeScore({ current_score: 100 }).current_score).toBe(100);
  });
});
