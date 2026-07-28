/**
 * Regression tests for the KIBA Training Doc v2 launch-blocker batch (2026-07-29).
 *
 * Every case here corresponds to a numbered failure the doc caught in the two
 * graded rebuild tests. The doc's own diagnosis is that the previous retraining
 * landed on the live conversational surface but NOT on templated/triggered
 * message classes, so these assertions deliberately pin the TEMPLATE text rather
 * than model behaviour — that's where the bugs actually lived.
 */
import { buildIntakeSystemPrompt, IntakeContext } from '../../src/ai/prompts/intake.prompt';
import { buildSystemPrompt } from '../../src/ai/prompts/coaching.prompt';
import { OnboardingVariant } from '../../src/data/entities/user.entity';
import { StripeWebhookController } from '../../src/onboarding/stripe-webhook.controller';

function ctx(overrides: Partial<IntakeContext> = {}): IntakeContext {
  return {
    name: null,
    intakeData: {},
    utcOffsetMinutes: null,
    paymentLinkSent: false,
    sampleCoachingGiven: false,
    variant: OnboardingVariant.STANDARD,
    trialDays: 3,
    priceDisplay: '$9.99/month',
    ...overrides,
  };
}

const mockUser: any = {
  id: 'u1',
  name: 'Marcus',
  goals: 'cut the weekend drinking',
  intake_data: {},
  miss_counts_by_dow: [0, 0, 0, 0, 0, 0, 0],
};
const mockProfile: any = {
  fears: '',
  avoidance_patterns: '',
  comparison_figure: '',
  public_failure_scenario: '',
  typical_failure_moment: '',
  pressure_preference: 'pressure',
};

describe('P0.4 — the challenge window is config-driven everywhere, never a hardcoded day 7', () => {
  // Confirmed with the founder 2026-07-29: the live Render value is 3.
  // Each phase renders a DIFFERENT block, and the "day 7" that survived longest
  // was inside PAYWALL — which the BUILD-phase default never renders. Cover all
  // three or this test passes while the bug ships.
  const PHASES: Array<[string, Partial<IntakeContext>]> = [
    ['BUILD', { paymentLinkSent: false, sampleCoachingGiven: false }],
    ['POST_LINK', { paymentLinkSent: true, sampleCoachingGiven: false }],
    ['PAYWALL', { paymentLinkSent: true, sampleCoachingGiven: true }],
  ];

  it.each(PHASES)('quotes the reveal day from config in the %s phase, never a literal "day 7"', (_name, phase) => {
    const p = buildIntakeSystemPrompt(ctx({ trialDays: 3, ...phase }));
    // The reveal job is scheduled off the real Stripe trial_end, so copy that
    // promises "day 7" on a 3-day trial is a window the billing never honours.
    expect(p).not.toContain('day 7');
    expect(p).not.toContain('day-7');
  });

  it('states the reveal day as day 3 on the live config', () => {
    const p = buildIntakeSystemPrompt(ctx({ trialDays: 3, paymentLinkSent: true, sampleCoachingGiven: true }));
    expect(p).toContain('day 3');
    expect(p).toContain('3 day lock in');
  });

  it('moves the reveal day with the configured trial length', () => {
    const p = buildIntakeSystemPrompt(ctx({ trialDays: 14, paymentLinkSent: true, sampleCoachingGiven: true }));
    expect(p).toContain('day 14');
    expect(p).toContain('14 day lock in');
    expect(p).not.toContain('day 7');
  });
});

describe('P1.2 — no identity referendum at the close', () => {
  it('bans every readiness-question close seen in the two graded tests', () => {
    const p = buildIntakeSystemPrompt(ctx());
    for (const banned of [
      'you down to actually do it, or you still thinking about it?',
      'you really wanna do this or you just testing?',
      'you wanna lock this in or nah?',
      'you ready to lock that in?',
    ]) {
      // Each must appear ONLY inside the ban list — never as example copy.
      expect(p).toContain(banned);
    }
    expect(p).toContain('HARD BANNED — THE IDENTITY REFERENDUM');
    expect(p).toContain('NEVER END A CLOSE ON A READINESS QUESTION');
  });

  it('teaches design / concrete-commit questions as the replacement', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toContain('DESIGN OR COMMIT QUESTION AS THE LAST LINE');
    expect(p).toContain('what time you want the check-in?');
  });
});

describe('P1.1 — the close must carry a specific disclosure callback', () => {
  it('makes a callback mandatory rather than optional', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toContain('A SPECIFIC CALLBACK');
    expect(p).toContain('EVERY CLOSE CARRIES A CALLBACK');
  });
});

describe('P1.8 — settled config is visible as state and never re-asked', () => {
  it('surfaces a confirmed check-in time, city and tone as SETTLED', () => {
    const p = buildIntakeSystemPrompt(
      ctx({
        name: 'Marcus',
        checkinTime: '09:00',
        intakeData: { city: 'Macon', cussing_ok: true },
      }),
    );
    expect(p).toContain('daily check-in time: 09:00');
    expect(p).toContain('city: Macon');
    expect(p).toMatch(/tone: real and direct/);
    // The marker the prompt rules key off.
    expect(p).toContain('SETTLED');
  });

  it('omits the settled lines entirely when nothing has been confirmed yet', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).not.toContain('daily check-in time:');
    expect(p).not.toContain('- city:');
  });
});

describe('P1.3 / P1.4 — transition moments (name beat, city beat)', () => {
  it('requires a varied name reaction and forbids faking uniqueness', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toContain('THE NAME BEAT');
    expect(p).toContain('never a fixed template');
    expect(p).toContain('NEVER call a common name unique');
  });

  it('gives the cultural mirror a city -> region -> timezone fallback', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toContain('NEVER SILENT ON WHERE SOMEONE LIVES');
    // The exact miss from both tests: a mid-size city getting zero acknowledgment.
    expect(p).toContain('georgia respect');
    expect(p).toContain('east coast');
  });
});

describe('P0.3 — role boundary (no first-person hallucination)', () => {
  it('is stated in the intake prompt', () => {
    const p = buildIntakeSystemPrompt(ctx());
    expect(p).toContain('YOU ARE KIBA. YOU NEVER SPEAK AS THE USER');
    expect(p).toContain('AMBIGUOUS INPUT = ASK, NEVER EXECUTE');
    // The "doesn't matter" -> "houston" hallucination.
    expect(p).toContain('GUESSING A CITY THEY DIDN\'T NAME IS A HALLUCINATION');
  });

  it('is stated in the coaching prompt hard lines', () => {
    const p = buildSystemPrompt(mockUser, mockProfile, 72, 0);
    expect(p).toContain('YOU ARE KIBA AND YOU NEVER SPEAK AS THE USER');
    expect(p).toContain('AMBIGUOUS INPUT = ASK, NEVER EXECUTE');
    expect(p).toContain('NEVER ANSWER A QUESTION THEY DECLINED');
  });
});

describe('P0.1 — no unverified history claims (locked principle #15)', () => {
  it('bans streak / "days in" language without ledger backing', () => {
    const p = buildSystemPrompt(mockUser, mockProfile, 72, 0);
    expect(p).toContain('NEVER CLAIM HISTORY YOU HAVEN\'T VERIFIED');
    expect(p).toContain('week one');
  });
});

describe('P0.1 — the trial-ending message is gated on the completion ledger', () => {
  /**
   * The live failure: a user paid and, seconds later, got "few days in and
   * you're actually showing up". Stripe fires trial_will_end three days BEFORE
   * the trial ends, and the live trial is 3 days, so the event lands at signup.
   *
   * The previous fix gated on elapsed time alone, which still lets the message
   * fire for someone who has been subscribed for days and done nothing — the
   * praise is just as false. The ledger is the only source that makes the
   * sentence true.
   */
  function setup(opts: { executionDays: number; subAgeDays: number }) {
    const sent: any[] = [];
    const createdAt = new Date(Date.now() - opts.subAgeDays * 86_400_000);
    const sub = { id: 's1', user_id: 'user-1', stripe_subscription_id: 'sub_1', created_at: createdAt };
    const controller = new StripeWebhookController(
      {} as any, // stripeService
      { findOne: jest.fn(async () => sub) } as any, // subRepo
      { findOne: jest.fn(async () => ({ id: 'user-1', phone_number: '+15550000000' })) } as any,
      {} as any, // eventRepo
      {} as any, // profileRepo
      {} as any, // goalRepo
      { add: jest.fn(async (name: string, payload: any) => sent.push(payload)) } as any,
      {} as any, // messagingService
      {} as any, // checkinService
      { countExecutionDays: jest.fn(async () => opts.executionDays) } as any,
      { get: () => undefined } as any,
      { add: jest.fn() } as any,
    );
    const run = () =>
      (controller as any).processEvent({
        type: 'customer.subscription.trial_will_end',
        livemode: true,
        data: { object: { id: 'sub_1' } },
      });
    return { run, sent };
  }

  it('stays silent when the user has been subscribed for days but executed nothing', async () => {
    const { run, sent } = setup({ executionDays: 0, subAgeDays: 5 });
    await run();
    expect(sent).toHaveLength(0);
  });

  it('stays silent seconds after signup even though a ledger day exists', async () => {
    const { run, sent } = setup({ executionDays: 3, subAgeDays: 0 });
    await run();
    expect(sent).toHaveLength(0);
  });

  it('sends the REAL ledger count once both time and execution back it up', async () => {
    const { run, sent } = setup({ executionDays: 2, subAgeDays: 3 });
    await run();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain('2 days you\'ve actually shown up');
    // The banned fabrication — a vague, unearned duration.
    expect(sent[0].body).not.toContain('few days in');
  });
});

describe('P0.2 — proof spec covers every goal category, not just fitness', () => {
  const p = () => buildSystemPrompt(mockUser, mockProfile, 72, 0);

  it('spells out a concrete proof ask per category', () => {
    const prompt = p();
    expect(prompt).toContain('EVERY category has its own proof');
    // The exact commitment type that was accepted on a bare "done" in Test 2.
    expect(prompt).toContain('business / outreach / sales');
    expect(prompt).toContain('screenshot of the sent DM or email');
    expect(prompt).toContain('WHO, WHAT, and the timestamp');
    // The other verticals Doc v1 never specced.
    expect(prompt).toContain('money → bank app');
    expect(prompt).toContain('submission confirmation');
  });

  it('keeps the vice category honest — text is fine except on trigger days', () => {
    const prompt = p();
    expect(prompt).toContain('quitting a vice');
    expect(prompt).toContain('still clean today');
    expect(prompt).toContain('TRIGGER day');
  });

  it('holds the line on pushback instead of softening for non-gym goals', () => {
    const prompt = p();
    expect(prompt).toContain('that\'s not proof bro');
    expect(prompt).toContain('not more honour-system than a squat');
  });

  it('never accepts a bare "done" as proof', () => {
    const prompt = p();
    expect(prompt).toContain('WORDS ARE NEVER PROOF');
  });
});

describe('P1.5 / P1.6 / P1.7 — disruption, apology and vulnerability handling', () => {
  const p = () => buildSystemPrompt(mockUser, mockProfile, 72, 0);

  it('bans menu-retreat when a late reply carries new goal-relevant content', () => {
    const prompt = p();
    expect(prompt).toContain('NO MENU RETREAT');
    // The coded confession the model blew past after a 16h ghost.
    expect(prompt).toContain('long night');
    expect(prompt).toContain('people confess sideways');
  });

  it('requires a different question CATEGORY after a tone apology', () => {
    const prompt = p();
    expect(prompt).toContain('AFTER YOU APOLOGISE, CHANGE THE QUESTION TYPE');
    expect(prompt).toContain('an apology is a mode change, not a rewrite');
  });

  it('makes vulnerability markers label-first, ask-second', () => {
    const prompt = p();
    expect(prompt).toContain('READ THE HEAVY PART, NOT THE LAST PART');
    expect(prompt).toContain('a softener means it matters MORE');
  });
});
