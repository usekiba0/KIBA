/**
 * Fallback trigger for the one-time "save my contact" + "pin our chat" asks
 * (2026-08-06).
 *
 * WHY THIS EXISTS
 * The contact card IS the Apple masking. Apple offers no native way to brand a
 * text sent to a user first — Business Caller ID brands calls only, and Messages
 * for Business is inbound-only — so the ONLY thing that makes KIBA show up as
 * "KIBA" with a logo instead of a bare number is the user saving our .vcf.
 *
 * That send was moved off the Stripe webhook and onto the user's first accepted
 * proof (see ProofService.maybeSendActivationAsks for why — payment must send
 * exactly ONE message). The intent was right; the hook was not. The proof
 * pipeline records almost nothing, so measured over the 14 days to 2026-08-06
 * the asks fired ONCE across the whole user base. Every component was healthy —
 * CONTACT_CARD_URL set, the .vcf serving as text/x-vcard with both numbers and
 * the logo, zero send failures — and virtually nobody was ever asked.
 *
 * So this is a second, independent trigger. It does not replace the proof hook;
 * ProofService still fires first when a proof does land, and the shared
 * `activation_asks_sent_at` stamp keeps the pair strictly one-shot either way.
 *
 * Shape deliberately mirrors intake-nudge.ts: the eligibility judgement is a
 * pure function so the calls are visible and testable rather than buried in a
 * queue processor.
 */
import { isSendableHour } from './intake-nudge';

export type ActivationAsksDecision =
  | { send: true }
  | { send: false; reason: string };

export interface ActivationAsksCandidate {
  onboardingStage: string;
  status: string;
  /** Set once the pair has been sent. One per user, forever. */
  activationAsksSentAt: string | null;
  /**
   * When the user actually paid — MIN(subscriptions.created_at), so a later
   * reactivation cannot reset the clock and re-open a window that already closed.
   *
   * This replaced a `lastCheckinDate IS NOT NULL` gate on 2026-08-18. That gate
   * was meant only as "let the activation message breathe", but because
   * `last_checkin_date` is stamped when a check-in actually FIRES, it really
   * meant "wait for the first daily check-in" — up to 24h after payment. Measured
   * in prod: a user who paid 08-17 18:48Z at UTC-5 with a 09:00 check-in would
   * not have been eligible for ~19h. Since the contact card IS the Apple masking,
   * that is 19h of every new subscriber seeing a bare phone number, and it is
   * exactly what a founder testing with a fresh signup would hit. See MIN_SETTLE_MS.
   */
  activatedAt: Date | null;
  lastActiveAt: Date | null;
  optedOutAt: Date | null;
  /** Minutes from UTC, or null when we never resolved their timezone. */
  utcOffsetMinutes: number | null;
}

/**
 * Past a week of silence, "save my contact" reads as a cold marketing text
 * rather than housekeeping from a coach they're actively working with. An upper
 * bound also stops the first deploy carpet-bombing every dormant user who ever
 * activated — the backlog we DO want to reach is the live one.
 */
export const MAX_IDLE_MS = 7 * 24 * 60 * 60_000;

/**
 * How long after payment the asks must wait.
 *
 * Payment has to send exactly ONE message — Training Doc v2 called out
 * "message stacking on payment. Doc v1 said one message then wait. T1 stacked 3
 * messages back-to-back post-purchase" — and that constraint is unchanged. What
 * changed is how we enforce it: a short settle window instead of "wait for the
 * first check-in", so the card still lands on payment DAY while the user is warm
 * and most likely to save it, rather than up to 24h later.
 *
 * 30 minutes is deliberately longer than the sweep's own hourly tick is precise,
 * so in practice the asks arrive 30-90 minutes after payment — comfortably a
 * separate moment from the activation text, still the same session.
 */
export const MIN_SETTLE_MS = 30 * 60_000;

export function shouldSendActivationAsks(
  c: ActivationAsksCandidate,
  now: Date,
): ActivationAsksDecision {
  if (c.optedOutAt) return { send: false, reason: 'opted_out' };
  if (c.activationAsksSentAt) return { send: false, reason: 'already_sent' };

  // Never ask a lead who hasn't paid. The .vcf is post-activation housekeeping,
  // not a sales asset.
  if (c.onboardingStage !== 'complete') return { send: false, reason: 'not_activated' };
  if (c.status === 'cancelled') return { send: false, reason: 'cancelled' };

  // Anti-stacking guard. `complete` without a subscription row should not
  // happen, but if it does we stay silent rather than guess when they paid —
  // a missed one-time nudge is far cheaper than one stacked onto the tap.
  if (!c.activatedAt) return { send: false, reason: 'no_activation_timestamp' };
  if (now.getTime() - c.activatedAt.getTime() < MIN_SETTLE_MS) {
    return { send: false, reason: 'too_soon_after_payment' };
  }

  if (!c.lastActiveAt) return { send: false, reason: 'no_activity_timestamp' };
  if (now.getTime() - c.lastActiveAt.getTime() > MAX_IDLE_MS) {
    return { send: false, reason: 'dormant' };
  }

  // Shared with the intake nudge so there is one definition of quiet hours.
  if (!isSendableHour(now, c.utcOffsetMinutes)) return { send: false, reason: 'quiet_hours' };

  return { send: true };
}
