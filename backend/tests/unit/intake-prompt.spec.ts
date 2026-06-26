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
  it('frames the trial as the configured "N day lock in", never a "free trial" (Karibi 2026-06-26)', () => {
    const p = buildIntakeSystemPrompt(ctx({ trialDays: 14, priceDisplay: '$29/month' }));
    // Lock-in framing is config-driven (never a hardcoded number)...
    expect(p).toContain('14 day lock in');
    expect(p).not.toContain('7 day lock in');
    // ...and the SaaS "free trial" framing is gone.
    expect(p).not.toContain('14 days free');
    expect(p).not.toContain('days free, then');
    // Price is still quoted (config-driven) but ONLY for the "if they directly ask" rule.
    expect(p).toContain('$29/month');
    expect(p).not.toContain('$20/month');
  });

  // Sales Psychology Guide + V2 (Karibi 2026-06-27) — train KIBA to actually close.
  it('teaches the core sales-psychology principles, applied naturally not scripted', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' } }));
    expect(p).toMatch(/SALES PSYCHOLOGY/i);
    // The named levers must be present.
    expect(p).toMatch(/SELL THE MECHANISM, NOT THE OUTCOME/i);
    expect(p).toMatch(/REMOVE SHAME FIRST/i);
    expect(p).toMatch(/PAIN AMPLIFICATION/i);
    expect(p).toMatch(/COMMITMENT STACKING/i);
    expect(p).toMatch(/LOSS AVERSION/i);
    expect(p).toMatch(/REAL URGENCY FROM THEIR OWN TIMELINE/i);
    expect(p).toMatch(/SOCIAL PROOF WITH SPECIFICITY/i);
    // Applied naturally, never as a script/checklist.
    expect(p).toMatch(/NEVER scripted or listed out|never as a script/i);
    // Fake urgency is explicitly banned.
    expect(p).toMatch(/NEVER "limited time"|fake urgency/i);
  });

  it('reads personality and matches the sales tone (joker/driven/skeptic/hesitant/price-sensitive)', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' } }));
    expect(p).toMatch(/READ THEIR PERSONALITY/i);
    expect(p).toMatch(/JOKER/);
    expect(p).toMatch(/DRIVEN/);
    expect(p).toMatch(/SKEPTIC/);
    expect(p).toMatch(/HESITANT/);
    expect(p).toMatch(/PRICE-SENSITIVE/);
    // Humor for jokers is via words, not emoji (sign-up stays emoji-free).
    expect(p).not.toMatch(/😎|🔥|😂|😭/);
  });

  it('puts the framing BEFORE the link and holds the price until day 7 (Karibi 2026-06-26)', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' }, utcOffsetMinutes: -300 }));
    // The close lead-in (framing) precedes the link, and the price waits for day 7.
    expect(p).toMatch(/tap this and we start tonight/i);
    expect(p).toMatch(/framing ALWAYS comes BEFORE the link/i);
    expect(p).toMatch(/price conversation happens later, on day 7/i);
    // The challenge is asked ONCE, no double-ask / wall-of-text at the close.
    expect(p).toMatch(/ask ONCE, then STOP and WAIT/i);
    // No decorative emoji in the sign-up flow.
    expect(p).toMatch(/NO emojis in the sign-up flow/i);
  });

  it('holds money talk until the close in the BUILD phase', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toMatch(/PHASE: be a real coach/i);
    expect(p).toMatch(/NO money ?\/ ?price ?\/ ?trial talk until the close/i);
    // The emotional-build steps must be present and ordered before the close.
    expect(p).toContain('THE "I SEE YOU" MOMENT');
    // The commitment step (reframed as a natural challenge, not a pushy "are you
    // serious" close) must still come before the money.
    expect(p).toContain('CHALLENGE');
  });

  // V4 Dev Notes — the scripted-response bug + diagnostic sequencing (Phase 1).
  it('frames the conversation as coaching, not a sale (V4 Part 1)', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).not.toMatch(/this conversation is a SALE/i);
    expect(p).toMatch(/from the very first message you are a real coach/i);
  });

  it('bans the two scripted lines the doc called out (BUG #1, #3)', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'business' } }));
    // The literal scripted questions must no longer be issued by the flow.
    expect(p).not.toContain('why does it actually matter to you though?');
    expect(p).not.toContain('be honest, what usually makes you fold?');
    // And both must be explicitly banned.
    expect(p).toMatch(/do NOT jump to "why does it matter"/i);
    expect(p).toMatch(/what usually makes you fold.*banned|banned.*what usually makes you fold/i);
  });

  it('requires diagnosing the business TYPE before bottlenecks (V4 Part 3 rule 5)', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'get to 100k' } }));
    expect(p).toMatch(/what KIND of business FIRST/i);
    expect(p).toMatch(/NEVER ask about bottlenecks before you know the business type/i);
  });

  it('collects the emotional driver by goal type, never a fixed line (V4 Part 6)', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' } }));
    expect(p).toMatch(/THE EMOTIONAL DRIVER/i);
    expect(p).toMatch(/the WORDING is never fixed/i);
    expect(p).toContain('what does life actually look like when you hit that number');
  });

  it('takes initiative on the check-in time instead of asking permission (V4 rule 9)', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' } }));
    expect(p).toMatch(/TAKE INITIATIVE on the check-in/i);
    expect(p).toMatch(/i'll lock you in at .* every morning, that work/i);
    expect(p).toMatch(/never "when would you like me to check in/i);
  });

  it('enforces the copy-paste / no-generic-response test (V4 BUG #1)', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toMatch(/if you could paste it into a different conversation/i);
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

  it('never takes a verbal payment claim as proof — payment is system-verified', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' } }));
    expect(p).toMatch(/PAYMENT IS SYSTEM-VERIFIED/i);
    expect(p).toMatch(/NEVER TAKE THEIR WORD/i);
    expect(p).toMatch(/not seeing it active on my end yet/i);
  });

  it('forbids referencing a downloadable app (KIBA is SMS-only)', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toMatch(/THERE IS NO APP/i);
    expect(p).toMatch(/never ask if they "have the app"/i);
  });

  it('frames reminders as a yes (its whole thing), never a denial', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' } }));
    expect(p).toMatch(/REMINDERS ARE LITERALLY YOUR THING/i);
    expect(p).toMatch(/NEVER say "i can't do reminders"/i);
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

  it('injects a LOOP ALERT into intake when the guard flags circling (RC-4)', () => {
    const looping = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' }, loopingOnQuestion: true }));
    expect(looping).toMatch(/LOOP ALERT/);
    expect(looping).toMatch(/do NOT re-ask|same "this or that" choice/i);
    const normal = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' } }));
    expect(normal).not.toMatch(/LOOP ALERT/);
  });

  it('forbids guessing a clock time when the timezone is unknown (RC-2)', () => {
    const p = buildIntakeSystemPrompt(ctx({ name: 'Sam', intakeData: { goal_description: 'gym' }, utcOffsetMinutes: null }));
    expect(p).toMatch(/do NOT know their timezone/i);
    expect(p).toMatch(/NEVER state or guess a clock time/i);
    expect(p).toMatch(/ask what city they're in/i);
  });

  it('hands the model the exact local clock once the timezone is known', () => {
    const p = buildIntakeSystemPrompt(ctx({
      name: 'Sam', intakeData: { goal_description: 'gym' },
      utcOffsetMinutes: -300, nowUtc: new Date('2026-06-24T15:04:00Z'),
    }));
    expect(p).toMatch(/USER LOCAL CLOCK/);
    expect(p).toContain('10:04'); // 15:04 UTC at -300 = 10:04
    expect(p).not.toMatch(/do NOT know their timezone/i);
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
