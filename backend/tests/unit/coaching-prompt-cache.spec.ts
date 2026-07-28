import {
  buildCoachingDynamicContext,
  COACHING_STATIC_RULES,
} from '../../src/ai/prompts/coaching.prompt';
import { PressurePreference } from '../../src/data/entities/psychological-profile.entity';

/**
 * Guards the Anthropic prompt-cache invariant.
 *
 * The live coaching call sends two system blocks: COACHING_STATIC_RULES with
 * `cache_control: ephemeral`, then the per-person context. The cached prefix only
 * pays off while it stays byte-identical for every user on every turn — if
 * anything user-specific or time-specific leaks into it, every request becomes a
 * cache MISS and (because cache writes cost more than plain input) we'd quietly
 * be paying extra for a speedup we no longer get.
 *
 * Nothing at runtime would fail loudly in that case, so these tests are the only
 * thing standing between a stray `${...}` and a silent regression.
 */

const mockProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  fears: 'Staying stuck while everyone moves forward',
  avoidance_patterns: 'Scrolling phone when I should be working',
  comparison_figure: 'My college roommate',
  public_failure_scenario: 'Friends finding out I quit again',
  typical_failure_moment: 'Sunday evenings',
  pressure_preference: PressurePreference.PRESSURE,
  cussing_ok: false,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('COACHING_STATIC_RULES (cacheable prefix)', () => {
  it('carries no unresolved template interpolation', () => {
    expect(COACHING_STATIC_RULES).not.toContain('${');
    expect(COACHING_STATIC_RULES).not.toContain('undefined');
    expect(COACHING_STATIC_RULES).not.toContain('[object Object]');
  });

  it('is long enough to clear the model minimum for caching', () => {
    // Haiku 4.5 will not cache a prefix under 2048 tokens. Chars/4 is a rough but
    // deliberately conservative proxy — the real prompt tokenizes to ~14k.
    expect(COACHING_STATIC_RULES.length / 4).toBeGreaterThan(2048);
  });

  it('still contains the load-bearing behavioral rules', () => {
    // Cheap canaries: if a future edit moves these back into the dynamic half,
    // the cached block has been gutted and the win is gone.
    expect(COACHING_STATIC_RULES).toContain('TONE — NEVER BREAK');
    expect(COACHING_STATIC_RULES).toContain('CORE RULES');
    expect(COACHING_STATIC_RULES).toContain('CANCELLING');
  });

  it('leaks no per-user data for two very different users', () => {
    const volatile = [
      'Alex',
      'Jordan',
      'Chicago',
      'Houston',
      // execution scores + streaks
      '72',
      '13',
    ];
    for (const v of volatile) {
      expect(COACHING_STATIC_RULES).not.toContain(v);
    }
  });
});

describe('buildCoachingDynamicContext (uncached half)', () => {
  const forUser = (name: string, city: string, score: number) =>
    buildCoachingDynamicContext(
      { id: 'u', name, phone_number: '+12125551234' },
      mockProfile as any,
      score,
      1,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      { city },
    );

  it('holds the volatile context that must stay OUT of the cached block', () => {
    const ctx = forUser('Alex', 'Chicago', 72);
    expect(ctx).toContain('Alex');
    expect(ctx).toContain('Chicago');
    expect(ctx).toContain('72');
  });

  it('differs per user while the cached prefix does not', () => {
    const a = forUser('Alex', 'Chicago', 72);
    const b = forUser('Jordan', 'Houston', 13);
    expect(a).not.toEqual(b);
    // The whole point: the expensive half is shared even when the cheap half isn't.
    expect(COACHING_STATIC_RULES).toEqual(COACHING_STATIC_RULES);
  });

  it('keeps the cussing directive with the person it applies to', () => {
    const clean = forUser('Alex', 'Chicago', 72);
    expect(clean).toContain('has NOT opted in');
    // Opting in must flip the dynamic half only — never the cached rulebook.
    const opted = buildCoachingDynamicContext(
      { id: 'u', name: 'Alex', phone_number: '+12125551234' },
      { ...mockProfile, cussing_ok: true } as any,
      72,
      1,
    );
    expect(opted).toContain('user opted in');
    expect(COACHING_STATIC_RULES).not.toContain('user opted in');
  });
});
