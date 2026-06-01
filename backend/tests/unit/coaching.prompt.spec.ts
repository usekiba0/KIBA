import {
  buildPressureContext,
  buildSystemPrompt,
} from '../../src/ai/prompts/coaching.prompt';
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
    const encouragementProfile = { ...mockProfile, pressure_preference: PressurePreference.ENCOURAGEMENT };
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

  it('enforces a short 1–3 sentence limit', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt).toMatch(/1.{0,5}3 sentence/i);
  });

  it('requires ending with a specific action', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt.toLowerCase()).toMatch(/action|specific|required/);
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
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0, 'Previous: user ran 2K last Tuesday');
    expect(prompt).toContain('Previous: user ran 2K last Tuesday');
  });

  it('works without session summary', () => {
    expect(() => buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0)).not.toThrow();
  });

  it('stays within a sane size budget (char count < 22000)', () => {
    // The prompt has grown well past the original 2800 guard (tools, examples,
    // state-aware tone, goal-translation rules) — it's ~18k chars / ~4.5k tokens
    // now. This guard just prevents unbounded ballooning; still tiny vs the
    // 200K/1M context window.
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 2);
    expect(prompt.length).toBeLessThan(22000);
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
  });

  describe('curated knowledge injection', () => {
    it('injects each entry as a bullet under a labeled section', () => {
      const prompt = buildSystemPrompt(
        mockUser as any, mockProfile as any, 72, 0, undefined,
        ['Always use metric units when asked about distance', 'Never recommend skipping rest days'],
      );
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
        mockUser as any, mockProfile as any, 72, 0, undefined, undefined,
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
        mockUser as any, mockProfile as any, 72, 0, undefined, undefined,
        { nowUtc: new Date('2026-05-18T10:00:00Z'), userOffsetMinutes: null },
      );
      expect(prompt).toContain('USER TIMEZONE: unknown');
      expect(prompt).toMatch(/ask the user/i);
    });

    it('formats negative offsets correctly', () => {
      const nowUtc = new Date('2026-05-18T20:00:00Z');
      const prompt = buildSystemPrompt(
        mockUser as any, mockProfile as any, 72, 0, undefined, undefined,
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
