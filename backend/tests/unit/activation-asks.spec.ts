import {
  shouldSendActivationAsks,
  ActivationAsksCandidate,
  MAX_IDLE_MS,
  MIN_SETTLE_MS,
  CHECKIN_KEEP_CLEAR_MIN,
} from '../../src/accountability/activation-asks';

/**
 * The contact card IS the Apple masking — without it KIBA shows up as a bare
 * phone number forever. So unlike the intake nudge (which goes to someone who
 * hasn't finished opting in, and is weighted toward staying silent), this goes
 * to a PAYING, active user and the dominant failure mode is the one we actually
 * had in production: never firing at all.
 *
 * Tests are therefore weighted both ways — the happy path must genuinely fire,
 * and the four guards that could silently re-create "fired once in 14 days"
 * must each be provably the only thing stopping it.
 */
const NOW = new Date('2026-08-06T18:00:00Z'); // 1pm US Central — inside every window

/**
 * `now` is a parameter, not a constant, because every time-relative default has to
 * be derived from the instant under test. Pinning them to the module-level NOW made
 * any test that passed an earlier `now` fail on the WRONG guard — a fixture that
 * "paid 3h ago" relative to 18:00Z is in the FUTURE at 09:00Z, so the reply came
 * back `too_soon_after_payment` when the test was about quiet hours.
 */
function candidate(
  over: Partial<ActivationAsksCandidate> = {},
  now: Date = NOW,
): ActivationAsksCandidate {
  return {
    onboardingStage: 'complete',
    status: 'active',
    activationAsksSentAt: null,
    activatedAt: new Date(now.getTime() - 3 * 60 * 60_000), // paid 3h ago
    lastActiveAt: new Date(now.getTime() - 2 * 60 * 60_000), // active 2h ago
    optedOutAt: null,
    utcOffsetMinutes: -300,
    // 13:00 local at NOW; far from the 09:00 check-in so it never interferes
    // unless a test says so.
    checkinTime: '09:00',
    ...over,
  };
}

describe('shouldSendActivationAsks', () => {
  it('fires for the case this was built for: an active paid user who never submitted a proof', () => {
    // The production reality — 104 photos in, 1 proof ever recorded, so the
    // proof-gated trigger reached almost nobody. Nothing here mentions proof.
    expect(shouldSendActivationAsks(candidate(), NOW)).toEqual({ send: true });
  });

  it('fires for a trial user, not just a converted one', () => {
    // Masking matters most early — a trial user seeing a bare number is exactly
    // who we lose.
    expect(shouldSendActivationAsks(candidate({ status: 'trial' }), NOW)).toEqual({ send: true });
  });

  it('fires for a paused user', () => {
    // Paused is not cancelled; they still have the thread.
    expect(shouldSendActivationAsks(candidate({ status: 'paused' }), NOW)).toEqual({ send: true });
  });

  describe('never sends', () => {
    it('to someone who opted out', () => {
      expect(shouldSendActivationAsks(candidate({ optedOutAt: NOW }), NOW))
        .toEqual({ send: false, reason: 'opted_out' });
    });

    it('twice — the one-shot stamp wins', () => {
      expect(
        shouldSendActivationAsks(
          candidate({ activationAsksSentAt: '2026-08-01T12:00:00.000Z' }),
          NOW,
        ),
      ).toEqual({ send: false, reason: 'already_sent' });
    });

    it('to a lead still in intake', () => {
      expect(shouldSendActivationAsks(candidate({ onboardingStage: 'intake' }), NOW))
        .toEqual({ send: false, reason: 'not_activated' });
    });

    it('to a lead who has the payment link but has not paid', () => {
      expect(shouldSendActivationAsks(candidate({ onboardingStage: 'payment_pending' }), NOW))
        .toEqual({ send: false, reason: 'not_activated' });
    });

    it('to a cancelled user', () => {
      expect(shouldSendActivationAsks(candidate({ status: 'cancelled' }), NOW))
        .toEqual({ send: false, reason: 'cancelled' });
    });

    it('in the first half hour after payment — the activation text must land alone', () => {
      // THE guard that stops this re-creating the three-stacked-texts-on-payment
      // problem the proof hook was originally built to fix. Payment sends exactly
      // ONE message; the asks follow as a separate moment.
      expect(
        shouldSendActivationAsks(
          candidate({ activatedAt: new Date(NOW.getTime() - 60_000) }),
          NOW,
        ),
      ).toEqual({ send: false, reason: 'too_soon_after_payment' });
    });

    it('to a "complete" user with no subscription row — we will not guess when they paid', () => {
      expect(shouldSendActivationAsks(candidate({ activatedAt: null }), NOW))
        .toEqual({ send: false, reason: 'no_activation_timestamp' });
    });

    // THE regression from shipping the payment-day fix without this guard: the
    // hourly sweep fired at 14:00:25Z while the user's 09:00-local check-in fired at
    // 14:00:26Z, so Karibi got the contact card, the check-in and the pin nudge
    // inside two seconds. The settle window only protected payment; the check-in is
    // the other moment KIBA already has something to say.
    it('within 45 minutes of the daily check-in — the 2026-08-18 stacking regression', () => {
      // 14:00Z with a -300 offset is 09:00 local: the check-in is landing right now.
      const atCheckin = new Date('2026-08-06T14:00:00Z');
      expect(
        shouldSendActivationAsks(
          candidate({ checkinTime: '09:00' }, atCheckin),
          atCheckin,
        ),
      ).toEqual({ send: false, reason: 'too_close_to_checkin' });
    });

    it('just before the check-in, not only after it', () => {
      // NOW is 13:00 local. A 13:30 check-in is 30 minutes out — inside the window,
      // and mid-afternoon so quiet hours provably is not what is blocking it. (An
      // early check-in cannot be tested this way: 45 minutes before an 09:00
      // check-in is 08:15 local, which quiet hours rejects first.)
      expect(shouldSendActivationAsks(candidate({ checkinTime: '13:30' }), NOW))
        .toEqual({ send: false, reason: 'too_close_to_checkin' });
    });

    it('to a user with no activity timestamp at all', () => {
      expect(shouldSendActivationAsks(candidate({ lastActiveAt: null }), NOW))
        .toEqual({ send: false, reason: 'no_activity_timestamp' });
    });

    it('to a dormant user — "save my contact" to someone gone a week reads as spam', () => {
      expect(
        shouldSendActivationAsks(
          candidate({ lastActiveAt: new Date(NOW.getTime() - MAX_IDLE_MS - 60_000) }),
          NOW,
        ),
      ).toEqual({ send: false, reason: 'dormant' });
    });

    it('at 3am local, even when everything else qualifies', () => {
      // 09:00Z with a -300 offset is 4am local.
      const at4am = new Date('2026-08-06T09:00:00Z');
      expect(
        shouldSendActivationAsks(
          candidate({}, at4am),
          at4am,
        ),
      ).toEqual({ send: false, reason: 'quiet_hours' });
    });

    it('at 3am UTC-fallback when the timezone was never resolved', () => {
      const at3amUtcWindow = new Date('2026-08-06T09:00:00Z'); // outside 15:00-01:00Z
      expect(
        shouldSendActivationAsks(
          candidate({ utcOffsetMinutes: null }, at3amUtcWindow),
          at3amUtcWindow,
        ),
      ).toEqual({ send: false, reason: 'quiet_hours' });
    });
  });

  describe('boundaries', () => {
    it('sends on payment DAY once the settle window has passed — the 2026-08-18 fix', () => {
      // The regression this exists to prevent. The old gate keyed off
      // last_checkin_date, which is stamped only when a check-in FIRES, so a user
      // who paid at 18:48Z with an 09:00 local check-in waited ~19h for the
      // contact card — and the card IS the Apple masking. Same day, warm user.
      expect(
        shouldSendActivationAsks(
          candidate({ activatedAt: new Date(NOW.getTime() - MIN_SETTLE_MS - 1) }),
          NOW,
        ),
      ).toEqual({ send: true });
    });

    it('sends at exactly the settle boundary', () => {
      expect(
        shouldSendActivationAsks(
          candidate({ activatedAt: new Date(NOW.getTime() - MIN_SETTLE_MS) }),
          NOW,
        ),
      ).toEqual({ send: true });
    });

    it('sends once clear of the check-in window', () => {
      // 15:00Z = 10:00 local, 60min past a 09:00 check-in — outside the 45min guard.
      const clear = new Date('2026-08-06T15:00:00Z');
      expect(
        shouldSendActivationAsks(
          candidate({ checkinTime: '09:00' }, clear),
          clear,
        ),
      ).toEqual({ send: true });
    });

    it('lets quiet hours win near midnight, where the clock wraparound would apply', () => {
      // 05:10Z = 00:10 local. clockDistanceMin() would score a 23:50 check-in as 20
      // minutes away rather than 1420, but quiet hours (09:00-20:00 local) is checked
      // first and no check-in near midnight is ever reachable. The wraparound in
      // clockDistanceMin is therefore defensive, not load-bearing — asserted here so
      // nobody "fixes" a bug that the ordering already prevents.
      const justAfterMidnight = new Date('2026-08-06T05:10:00Z');
      expect(
        shouldSendActivationAsks(
          candidate({ checkinTime: '23:50' }, justAfterMidnight),
          justAfterMidnight,
        ),
      ).toEqual({ send: false, reason: 'quiet_hours' });
    });

    it('ignores a malformed or missing check-in time rather than blocking forever', () => {
      expect(shouldSendActivationAsks(candidate({ checkinTime: null }), NOW))
        .toEqual({ send: true });
      expect(shouldSendActivationAsks(candidate({ checkinTime: 'whenever' }), NOW))
        .toEqual({ send: true });
    });

    it('keeps the keep-clear window wider than the sweep tick', () => {
      // The sweep runs hourly. A window narrower than ~30min could let a tick slip
      // inside it; 45 guarantees it cannot.
      expect(CHECKIN_KEEP_CLEAR_MIN).toBeGreaterThanOrEqual(30);
    });

    it('still sends at exactly the idle limit', () => {
      // Strictly-greater-than comparison — the boundary itself is eligible.
      expect(
        shouldSendActivationAsks(
          candidate({ lastActiveAt: new Date(NOW.getTime() - MAX_IDLE_MS) }),
          NOW,
        ),
      ).toEqual({ send: true });
    });

    it('checks opt-out before everything else', () => {
      // An opted-out user who is ALSO dormant and unactivated must report
      // opted_out — the compliance reason has to win for auditability.
      expect(
        shouldSendActivationAsks(
          candidate({
            optedOutAt: NOW,
            onboardingStage: 'intake',
            activatedAt: null,
            lastActiveAt: null,
          }),
          NOW,
        ),
      ).toEqual({ send: false, reason: 'opted_out' });
    });
  });
});
