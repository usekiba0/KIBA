import { buildPressureContext, buildSystemPrompt } from '../../src/ai/prompts/coaching.prompt';
import { PressurePreference } from '../../src/data/entities/psychological-profile.entity';

const mockProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  fears: 'Staying stuck while everyone moves forward',
  avoidance_patterns: 'Scrolling phone when I should be working',
  comparison_figure: 'My college roommate who started his own company',
  public_failure_scenario: 'Friends finding out I quit again after one week',
  typical_failure_moment: 'Sunday evenings when motivation drops',
  pressure_preference: PressurePreference.PRESSURE,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockUser = {
  id: 'user-1',
  name: 'Alex',
  phone_number: '+12125551234',
};

describe('buildPressureContext', () => {
  it('includes the user fear', () => {
    const ctx = buildPressureContext(mockProfile as any, 72, 2);
    expect(ctx).toContain(mockProfile.fears);
  });

  it('includes the comparison figure', () => {
    const ctx = buildPressureContext(mockProfile as any, 72, 2);
    expect(ctx).toContain(mockProfile.comparison_figure);
  });

  it('includes the current execution score', () => {
    const ctx = buildPressureContext(mockProfile as any, 72, 2);
    expect(ctx).toContain('72');
  });

  it('includes the recent strike count', () => {
    const ctx = buildPressureContext(mockProfile as any, 72, 3);
    expect(ctx).toContain('3');
  });

  it('includes the public failure scenario', () => {
    const ctx = buildPressureContext(mockProfile as any, 72, 0);
    expect(ctx).toContain(mockProfile.public_failure_scenario);
  });

  it('includes the pressure preference', () => {
    const ctx = buildPressureContext(mockProfile as any, 50, 1);
    expect(ctx.toLowerCase()).toContain('pressure');
  });

  it('handles encouragement preference', () => {
    const encouragementProfile = {
      ...mockProfile,
      pressure_preference: PressurePreference.ENCOURAGEMENT,
    };
    const ctx = buildPressureContext(encouragementProfile as any, 50, 0);
    expect(ctx.toLowerCase()).toContain('encouragement');
  });
});

describe('buildSystemPrompt', () => {
  it('names the AI as KIBA', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 2);
    expect(prompt).toMatch(/kiba/i);
  });

  it('includes the pressure context', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 2);
    expect(prompt).toContain(mockProfile.fears);
  });

  it('enforces lowercase real-texting tone', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt.toLowerCase()).toMatch(/lowercase/);
  });

  it('enforces a short 1–2 sentence limit', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt).toMatch(/1.{0,8}2 short sentence/i);
  });

  it('bans em-dashes in the outbound voice', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt.toLowerCase()).toMatch(/never use em-dash|long dashes/);
  });

  it('requires ending with a specific action', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt.toLowerCase()).toMatch(/action|specific|required/);
  });

  it('forbids surfacing internal/technical errors to the user', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt.toLowerCase()).toMatch(/never surface anything technical or internal/);
    expect(prompt.toLowerCase()).toMatch(/databases|servers|lag/);
  });

  it('surfaces known facts (goals, city) when provided', () => {
    const prompt = buildSystemPrompt(
      mockUser as any,
      mockProfile as any,
      72,
      0,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      { goals: 'gym, sports betting business', city: 'Chicago', why: 'freedom' },
    );
    expect(prompt).toMatch(/WHAT YOU KNOW ABOUT THEM/i);
    expect(prompt).toContain('gym, sports betting business');
    expect(prompt).toContain('Chicago');
  });

  // V4 Dev Notes — apply the same achievement-partner / no-scripts rules to the
  // post-pay coaching prompt (Phase 1 Piece 2).
  it('frames KIBA as enforcer AND achievement partner (V4 Part 1)', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt).toMatch(/enforcer AND/i);
    expect(prompt).toMatch(/build them a real plan|build the thing/i);
  });

  it('tells coaching to diagnose by goal type and build a real deliverable (V4 rules 3-6)', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt).toMatch(/DIAGNOSE & BUILD/i);
    expect(prompt).toMatch(/what KIND of business FIRST/i);
    expect(prompt).toMatch(/never ask the bottleneck before you know the model/i);
    expect(prompt).toMatch(/grocery list/i);
  });

  it('enforces the no-generic / copy-paste rule and take-initiative in coaching (V4 rules 1, 9)', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt).toMatch(/pasted into a different conversation/i);
    expect(prompt).toMatch(/TAKE INITIATIVE/i);
  });

  it('surfaces durable "never forget" hard facts in known facts (Layer 3)', () => {
    const prompt = buildSystemPrompt(
      mockUser as any, mockProfile as any, 72, 0,
      undefined, undefined, undefined, undefined, undefined, 0,
      { goals: 'gym', city: null, why: null, facts: ['Dad passed away March 2026', 'Celiac — no gluten'] },
    );
    expect(prompt).toContain('Dad passed away March 2026');
    expect(prompt).toContain('Celiac');
  });

  it('injects the persistent relationship memory when provided (Layer 2)', () => {
    const memory =
      'Marcus, 27, runs a sports-betting side business and trains 4x/week. Ghosted Tuesday, said work was brutal. Anchor goal is 100k by Q4.';
    const prompt = buildSystemPrompt(
      mockUser as any,
      mockProfile as any,
      72,
      0,
      undefined, // sessionSummary
      undefined, // curatedKnowledge
      undefined, // timeContext
      undefined, // todos
      undefined, // patterns
      0, // weeksIn
      undefined, // knownFacts
      memory, // relationshipMemory
    );
    expect(prompt).toMatch(/WHAT YOU REMEMBER ABOUT THEM/i);
    expect(prompt).toContain('100k by Q4');
  });

  it('omits the relationship-memory block when memory is empty', () => {
    const prompt = buildSystemPrompt(
      mockUser as any, mockProfile as any, 72, 0,
      undefined, undefined, undefined, undefined, undefined, 0, undefined,
      '   ',
    );
    expect(prompt).not.toMatch(/WHAT YOU REMEMBER ABOUT THEM/i);
  });

  it('omits the known-facts block when no facts are provided', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt).not.toMatch(/WHAT YOU KNOW ABOUT THEM/i);
  });

  it('instructs answering general questions and forbids deflection', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt.toLowerCase()).toMatch(/answer any question/);
    expect(prompt.toLowerCase()).toMatch(/not my lane/); // listed as banned
  });

  it('prohibits generic responses', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt.toLowerCase()).toMatch(/generic|prohibited|never generic/);
  });

  it('includes the user name', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt).toContain('Alex');
  });

  it('includes optional session summary when provided', () => {
    const prompt = buildSystemPrompt(
      mockUser as any,
      mockProfile as any,
      72,
      0,
      'Previous: user ran 2K last Tuesday',
    );
    expect(prompt).toContain('Previous: user ran 2K last Tuesday');
  });

  it('works without session summary', () => {
    expect(() => buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0)).not.toThrow();
  });

  // Regression guards for the 2026-06-29 behavioral fixes — this prompt is edited
  // often and the size budget is the only other guard, so lock the rules in by
  // presence so a future edit can't silently drop them.
  it('keeps the don\'t-assume / don\'t-accuse rule', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0).toLowerCase();
    expect(prompt).toMatch(/never assume the worst or accuse/);
  });

  it('keeps the after-a-miss circuit-breaker rule', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0).toLowerCase();
    expect(prompt).toMatch(/circuit-breaker/);
    expect(prompt).toMatch(/zero day/);
  });

  it('keeps proof depth: specific critique + meal-photo-before-eating', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0).toLowerCase();
    expect(prompt).toMatch(/specific reaction to what's actually in it/);
    expect(prompt).toMatch(/before they eat/);
  });

  it('keeps the long-term-goal-is-not-yes/no rule', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0).toLowerCase();
    expect(prompt).toMatch(/never ask "did it happen\?" about it/);
  });

  it('keeps the vision read-signs / name-the-brand rule', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0).toLowerCase();
    expect(prompt).toMatch(/name the place\/brand/);
  });

  it('stays within a sane size budget (char count < 27500)', () => {
    // The prompt has grown with deliberate capability expansion (tools, examples,
    // state-aware tone, answer-anything, vision engagement, memory/contradiction)
    // — ~26k chars / ~6.5k tokens now. This guard just prevents unbounded
    // ballooning; still tiny vs the 200K/1M context window (and ~$0.005 of Haiku
    // input per message). Raised 22k→24k for the 2026-06-18 batch, 24k→25k for the
    // 2026-06-20 batch (dry-responder mirroring, strikes/recovery, no-zero-days).
    // Raised 25k->26k for the 2026-06-23 anti-loop batch (DON'T LOOP convergence
    // rule). Raised 26k->26.5k for the 2026-06-27 sales-psychology batch (Duolingo
    // loss-aversion retention lever: frame leaving as losing the score they built).
    // Raised 26.5k->27k for the 2026-06-29 batch (don't-assume/accuse + don't-claim-a-
    // contradicting-behavior; after-a-miss zero-day redirect + stress circuit-breaker)
    // — net small after trimming a redundant identity-language example. Raised
    // 27k->27.5k same day for proof depth (specific critique on proof, meal-photo-
    // before-eating, lift-video form check, post-activity acknowledge-AND-pivot).
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 2);
    expect(prompt.length).toBeLessThan(27500);
  });

  describe('goal handling + conversation order (Karibi 2026-06-01)', () => {
    it('forbids asking "did it happen?" about long-term goals', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt.toLowerCase()).toContain('did it happen');
      expect(prompt.toLowerCase()).toMatch(/move today|one thing today|translate/);
    });

    it('tells KIBA to react before advising', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt.toLowerCase()).toMatch(/react/);
      expect(prompt.toLowerCase()).toMatch(/clarifying|understand it/);
    });

    it('states the personality mix', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt.toLowerCase()).toContain('older brother');
    });

    it('does NOT demand stored goals in every single message', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt).not.toContain('every message should communicate three things');
    });

    it('treats "pick one thing" as a last resort, not the universal answer', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt.toLowerCase()).toContain('last resort');
      expect(prompt.toLowerCase()).toMatch(/actually understand|real opinionated|real problem/);
    });
  });

  describe('anti-loop / convergence (Bianca "can\'t get past this circle" 2026-06-23)', () => {
    it('explicitly forbids re-asking an already-answered question', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt.toLowerCase()).toMatch(/never ask the same question twice/);
      expect(prompt.toLowerCase()).toMatch(/already answered/);
    });

    it('forbids stacking two asks in one message', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt.toLowerCase()).toMatch(/never stack two asks/);
    });

    it('tells KIBA to commit and move on instead of gathering forever', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt.toLowerCase()).toMatch(/don'?t loop/);
      expect(prompt.toLowerCase()).toMatch(
        /the second you have enough to act, act|good-enough-and-moving/,
      );
    });

    it('renders a LOOP ALERT steer when the looping signal is set', () => {
      const patterns = {
        weakestDow: null,
        weakestDowMisses: 0,
        recurringExcuse: null,
        recurringExcuseCount: 0,
        lastMilestoneHit: 0,
        loopingOnQuestion: true,
      };
      const prompt = buildSystemPrompt(
        mockUser as any,
        mockProfile as any,
        72,
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        patterns,
      );
      expect(prompt).toContain('LOOP ALERT');
      expect(prompt.toLowerCase()).toMatch(/stop\b/);
    });

    it('omits the LOOP ALERT when not looping', () => {
      const patterns = {
        weakestDow: null,
        weakestDowMisses: 0,
        recurringExcuse: null,
        recurringExcuseCount: 0,
        lastMilestoneHit: 0,
        loopingOnQuestion: false,
      };
      const prompt = buildSystemPrompt(
        mockUser as any,
        mockProfile as any,
        72,
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        patterns,
      );
      expect(prompt).not.toContain('LOOP ALERT');
    });
  });

  describe('curated knowledge injection', () => {
    it('injects each entry as a bullet under a labeled section', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0, undefined, [
        'Always use metric units when asked about distance',
        'Never recommend skipping rest days',
      ]);
      expect(prompt).toContain('CURATED KNOWLEDGE');
      expect(prompt).toContain('- Always use metric units when asked about distance');
      expect(prompt).toContain('- Never recommend skipping rest days');
    });

    it('omits the knowledge section entirely when none provided', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      expect(prompt).not.toContain('CURATED KNOWLEDGE');
    });

    it('omits the knowledge section when an empty array is provided', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0, undefined, []);
      expect(prompt).not.toContain('CURATED KNOWLEDGE');
    });
  });

  describe('time context injection', () => {
    it('includes server UTC and computed local clock when offset is known', () => {
      const nowUtc = new Date('2026-05-18T10:00:00Z');
      const prompt = buildSystemPrompt(
        mockUser as any,
        mockProfile as any,
        72,
        0,
        undefined,
        undefined,
        { nowUtc, userOffsetMinutes: 300 }, // PKT, UTC+5
      );
      expect(prompt).toContain('CURRENT TIME');
      expect(prompt).toContain('NOW IN UTC');
      expect(prompt).toContain('2026-05-18T10:00:00.000Z');
      expect(prompt).toContain('USER LOCAL CLOCK');
      expect(prompt).toContain('UTC+05:00');
    });

    it('includes a fallback message when offset is unknown so the AI asks before scheduling', () => {
      const prompt = buildSystemPrompt(
        mockUser as any,
        mockProfile as any,
        72,
        0,
        undefined,
        undefined,
        { nowUtc: new Date('2026-05-18T10:00:00Z'), userOffsetMinutes: null },
      );
      expect(prompt).toContain('USER TIMEZONE: unknown');
      expect(prompt).toMatch(/ask the user/i);
    });

    it('formats negative offsets correctly', () => {
      const nowUtc = new Date('2026-05-18T20:00:00Z');
      const prompt = buildSystemPrompt(
        mockUser as any,
        mockProfile as any,
        72,
        0,
        undefined,
        undefined,
        { nowUtc, userOffsetMinutes: -480 }, // PST, UTC-8
      );
      expect(prompt).toContain('UTC-08:00');
    });

    it('omits time section when no context provided', () => {
      const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
      // "CURRENT TIME" appears in CAPABILITIES prose referencing the section, so
      // test for the unique structural markers instead.
      expect(prompt).not.toContain('NOW IN UTC');
      expect(prompt).not.toContain('USER LOCAL CLOCK');
      expect(prompt).not.toContain('USER TIMEZONE: unknown');
    });
  });
});
