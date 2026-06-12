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

  it('treats the build as best-effort and tells the AI to back off / move on when pushed', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' }, utcOffsetMinutes: -360 }));
    // why/obstacle are still part of the flow, but must NOT be a trap the AI loops on
    expect(p).toMatch(/best-effort/i);
    expect(p).toMatch(/READ THE ROOM/);
    expect(p).toMatch(/NEVER ask the exact same question more than once/i);
    // value-first during intake: it must deliver help when asked, not refuse
    expect(p).toMatch(/DELIVER VALUE WHEN THEY ASK FOR IT/i);
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

  it('lets users keep more than one goal instead of forcing one', () => {
    const p = buildIntakeSystemPrompt(ctx());
    // The goal step must invite multiple goals and tell KIBA to keep them all...
    expect(p).toMatch(/KEEP ALL OF THEM/);
    expect(p).toContain('save_intake_field("goals"');
    // ...and explicitly forbid the oppositional "you'll end up locked in on nothing" line.
    expect(p).toMatch(/NEVER tell them they have too many goals/i);
    // All goals are coached daily — no forcing them down to one.
    expect(p).toMatch(/ALL GOALS ARE COACHED DAILY/i);
  });

  it('recaps every goal as coached daily when there are several', () => {
    const p = buildIntakeSystemPrompt(ctx({
      name: 'Sam',
      intakeData: { goal_description: 'scale the business', goals: ['scale the business', 'gym every morning', 'read the bible'] },
    }));
    expect(p).toMatch(/ALL coached daily/i);
    expect(p).toContain('scale the business');
    expect(p).toContain('gym every morning');
    expect(p).toContain('read the bible');
  });

  it('bans deferring value behind the trial (deliver help first, then tie back)', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' } }));
    // The meal-plan/homework dodge: refusing OR deferring help until they sign up.
    expect(p).toMatch(/DEFERRING the help/i);
    expect(p).toMatch(/activate the trial first/i);
    // And the post-link paywall must also deliver concrete asks immediately.
    const paywall = buildIntakeSystemPrompt(ctx({ paymentLinkSent: true, sampleCoachingGiven: true }));
    expect(paywall).toMatch(/GIVE THE FULL THING right now/i);
  });

  it('forbids generic fortune-cookie reflections in the I-SEE-YOU moment', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toMatch(/short on time, you're short on structure/i);
    expect(p).toMatch(/if your reflection would fit anyone, it's wrong/i);
  });

  it('sanity-checks an evening time given as the morning check-in', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toMatch(/SANITY-CHECK the time/i);
    expect(p).toMatch(/never describe a PM time as morning/i);
  });

  it('treats a goal list (no explicit anchor) as a captured goal, not missing', () => {
    const p = buildIntakeSystemPrompt(ctx({
      name: 'Sam',
      intakeData: { goals: ['gym', 'money'] },
      utcOffsetMinutes: -360,
    }));
    expect(p).not.toMatch(/STILL MISSING[^\n]*goal_description/);
  });
});
