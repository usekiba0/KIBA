import { buildIntakeSystemPrompt, IntakeContext } from '../../src/ai/prompts/intake.prompt';
import { OnboardingVariant } from '../../src/data/entities/user.entity';

function ctx(overrides: Partial<IntakeContext> = {}): IntakeContext {
  return {
    name: null,
    intakeData: {},
    utcOffsetMinutes: null,
    paymentLinkSent: false,
    sampleCoachingGiven: false,
    variant: OnboardingVariant.STANDARD,
    trialDays: 7,
    priceDisplay: '$20/month',
    ...overrides,
  };
}

describe('buildIntakeSystemPrompt', () => {
  it('quotes the configured trial length and price (never a hardcoded number)', () => {
    const p = buildIntakeSystemPrompt(ctx({ trialDays: 14, priceDisplay: '$29/month' }));
    expect(p).toContain('14 days free');
    expect(p).toContain('$29/month');
    expect(p).not.toContain('7 days free');
    expect(p).not.toContain('$20/month');
  });

  it('holds money talk until the close in the BUILD phase', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toContain('PHASE: build');
    expect(p).toMatch(/NO money\/price\/trial talk until step 9/i);
    // The emotional-build steps must be present and ordered before the close.
    expect(p).toContain('THE "I SEE YOU" MOMENT');
    expect(p).toContain('MICRO-COMMITMENT');
  });

  it('surfaces why_it_matters and obstacle in the known summary', () => {
    const p = buildIntakeSystemPrompt(ctx({
      name: 'Sam',
      intakeData: { goal_description: 'gym', why_it_matters: 'be there for my kid', avoidance_patterns: 'lose motivation' },
    }));
    expect(p).toContain('why it matters: be there for my kid');
    expect(p).toContain('obstacle / what makes them fold: lose motivation');
  });

  it('flags missing why/obstacle so the AI does not close early', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' }, utcOffsetMinutes: -360 }));
    expect(p).toContain('do NOT have their "why" yet');
    expect(p).toContain('do NOT have their obstacle yet');
  });

  it('switches to the objection-handling paywall after the post-link reply', () => {
    const paywall = buildIntakeSystemPrompt(ctx({ paymentLinkSent: true, sampleCoachingGiven: true }));
    expect(paywall).toContain('PHASE: paywall');
    expect(paywall).toMatch(/answer to every objection/i);

    const postLink = buildIntakeSystemPrompt(ctx({ paymentLinkSent: true, sampleCoachingGiven: false }));
    expect(postLink).toContain('PHASE: link just sent');
  });

  it('branches the opener by ad variant', () => {
    expect(buildIntakeSystemPrompt(ctx({ variant: OnboardingVariant.EXPLAINER }))).toContain('what even is kiba');
    expect(buildIntakeSystemPrompt(ctx({ variant: OnboardingVariant.CASUAL }))).toContain("what's up kiba");
  });
});
