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
   * User-local YYYY-MM-DD of the last check-in SENT (not answered). Non-null is
   * the guard that keeps this off payment day: check-ins are only scheduled once
   * checkout completes, so having one means the activation message has already
   * landed and been given room to breathe. That is what stops this recreating
   * the three-stacked-texts-on-payment problem the proof hook was built to fix.
   */
  lastCheckinDate: string | null;
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

  // See lastCheckinDate above — this is the payment-day guard.
  if (!c.lastCheckinDate) return { send: false, reason: 'no_checkin_yet' };

  if (!c.lastActiveAt) return { send: false, reason: 'no_activity_timestamp' };
  if (now.getTime() - c.lastActiveAt.getTime() > MAX_IDLE_MS) {
    return { send: false, reason: 'dormant' };
  }

  // Shared with the intake nudge so there is one definition of quiet hours.
  if (!isSendableHour(now, c.utcOffsetMinutes)) return { send: false, reason: 'quiet_hours' };

  return { send: true };
}
