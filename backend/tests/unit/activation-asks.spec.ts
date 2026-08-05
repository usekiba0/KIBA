import {
  shouldSendActivationAsks,
  ActivationAsksCandidate,
  MAX_IDLE_MS,
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

function candidate(over: Partial<ActivationAsksCandidate> = {}): ActivationAsksCandidate {
  return {
    onboardingStage: 'complete',
    status: 'active',
    activationAsksSentAt: null,
    lastCheckinDate: '2026-08-05',
    lastActiveAt: new Date(NOW.getTime() - 2 * 60 * 60_000), // active 2h ago
    optedOutAt: null,
    utcOffsetMinutes: -300,
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

    it('on payment day — before any check-in has gone out', () => {
      // THE guard that stops this re-creating the three-stacked-texts-on-payment
      // problem the proof hook was originally built to fix. A check-in is only
      // scheduled once checkout completes, so a null here means the activation
      // message may still be the last thing they received.
      expect(shouldSendActivationAsks(candidate({ lastCheckinDate: null }), NOW))
        .toEqual({ send: false, reason: 'no_checkin_yet' });
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
      expect(shouldSendActivationAsks(candidate({ lastActiveAt: at4am }), at4am))
        .toEqual({ send: false, reason: 'quiet_hours' });
    });

    it('at 3am UTC-fallback when the timezone was never resolved', () => {
      const at3amUtcWindow = new Date('2026-08-06T09:00:00Z'); // outside 15:00-01:00Z
      expect(
        shouldSendActivationAsks(
          candidate({ utcOffsetMinutes: null, lastActiveAt: at3amUtcWindow }),
          at3amUtcWindow,
        ),
      ).toEqual({ send: false, reason: 'quiet_hours' });
    });
  });

  describe('boundaries', () => {
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
            lastActiveAt: null,
          }),
          NOW,
        ),
      ).toEqual({ send: false, reason: 'opted_out' });
    });
  });
});
