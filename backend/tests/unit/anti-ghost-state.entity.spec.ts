import { AntiGhostState, GhostState } from '../../src/data/entities/anti-ghost-state.entity';

describe('AntiGhostState entity', () => {
  function makeState(overrides: Partial<AntiGhostState> = {}): AntiGhostState {
    const s = new AntiGhostState();
    s.user_id = 'user-1';
    s.state = GhostState.ACTIVE;
    s.last_response_at = new Date();
    s.next_escalation_at = null;
    s.current_job_id = null;
    Object.assign(s, overrides);
    return s;
  }

  it('has GhostState enum with all four states', () => {
    expect(GhostState.ACTIVE).toBe('active');
    expect(GhostState.GHOST_1).toBe('ghost_1');
    expect(GhostState.GHOST_2).toBe('ghost_2');
    expect(GhostState.GHOST_3).toBe('ghost_3');
  });

  it('creates a state defaulting to active', () => {
    const state = makeState();
    expect(state.state).toBe(GhostState.ACTIVE);
    expect(state.user_id).toBe('user-1');
  });

  it('tracks escalation timing via next_escalation_at', () => {
    const escalationTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const state = makeState({
      state: GhostState.GHOST_1,
      next_escalation_at: escalationTime,
    });
    expect(state.state).toBe(GhostState.GHOST_1);
    expect(state.next_escalation_at).toBe(escalationTime);
  });

  it('stores BullMQ job id for cancellation', () => {
    const state = makeState({ current_job_id: 'bull-job-abc123' });
    expect(state.current_job_id).toBe('bull-job-abc123');
  });

  it('can progress through all ghost states', () => {
    const states = [GhostState.ACTIVE, GhostState.GHOST_1, GhostState.GHOST_2, GhostState.GHOST_3];
    states.forEach(gs => {
      const state = makeState({ state: gs });
      expect(state.state).toBe(gs);
    });
  });
});
