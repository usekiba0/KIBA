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
  it('names the AI as Kiba', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 2);
    expect(prompt).toContain('Kiba');
  });

  it('includes the pressure context', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 2);
    expect(prompt).toContain(mockProfile.fears);
  });

  it('forbids bullet points in rules', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt.toLowerCase()).toMatch(/no bullet|never bullet/);
  });

  it('enforces 1–4 sentence limit', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 0);
    expect(prompt).toMatch(/1.{0,5}4 sentence/i);
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

  it('stays under 600 tokens estimated (rough char count < 2400)', () => {
    const prompt = buildSystemPrompt(mockUser as any, mockProfile as any, 72, 2);
    expect(prompt.length).toBeLessThan(2400);
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
});
