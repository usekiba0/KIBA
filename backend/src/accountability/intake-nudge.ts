/**
 * Recovery for leads who go quiet DURING intake (2026-07-21).
 *
 * The anti-ghost chain hangs off a missed check-in, and a check-in is only
 * scheduled once intake completes. So the people most likely to drop — the ones
 * who stall halfway through signing up — were the one group with no recovery at
 * all. A real lead asked KIBA to keep him on his trading plan at 1am, got a
 * question back, and sat untouched for seventeen hours with nothing scheduled.
 *
 * One nudge, ever. This is the highest-risk message the system sends: it goes to
 * someone who has NOT finished opting in, so it has to be conservative in every
 * direction. The eligibility rule is a pure function so the judgement calls are
 * visible and testable rather than buried in a queue processor.
 */

export type NudgeDecision =
  | { nudge: true }
  | { nudge: false; reason: string };

export interface NudgeCandidate {
  onboardingStage: string;
  status: string;
  /** Whether the lead ever told KIBA their name. See NAMED below. */
  name: string | null;
  lastActiveAt: Date | null;
  /** Set once a nudge has been sent. One per lead, forever. */
  intakeNudgedAt: Date | null;
  optedOutAt: Date | null;
  /** Minutes from UTC, or null when we never resolved their timezone. */
  utcOffsetMinutes: number | null;
}

/** Long enough that they're actually gone, not just mid-thought. */
export const STALL_MIN_MS = 3 * 60 * 60_000;
/**
 * Past a week, a "you still there?" reads as creepy rather than helpful, and the
 * lead is cold anyway. An upper bound also stops a deploy from carpet-bombing
 * every historical stalled lead the first time this ships.
 */
export const STALL_MAX_MS = 7 * 24 * 60 * 60_000;

/** Local hours the nudge may land in, when we know their local time. */
const LOCAL_WINDOW_START = 9;
const LOCAL_WINDOW_END = 20;
/**
 * When the offset is unknown — which is the COMMON case for a stalled lead,
 * since timezone is captured partway through intake — fall back to a UTC window
 * that is daytime across the Americas, where essentially all traffic is.
 * 15:00–01:00 UTC is 10am–8pm US Central. Texting a stranger at 3am is how you
 * earn a spam report, and spam reports are exactly what carrier review punishes.
 */
const UTC_WINDOW_START = 15;
const UTC_WINDOW_END = 1;

export function isSendableHour(now: Date, utcOffsetMinutes: number | null): boolean {
  if (utcOffsetMinutes === null || utcOffsetMinutes === undefined) {
    const h = now.getUTCHours();
    return h >= UTC_WINDOW_START || h < UTC_WINDOW_END;
  }
  const local = new Date(now.getTime() + utcOffsetMinutes * 60_000).getUTCHours();
  return local >= LOCAL_WINDOW_START && local < LOCAL_WINDOW_END;
}

export function shouldNudgeIntake(c: NudgeCandidate, now: Date): NudgeDecision {
  if (c.optedOutAt) return { nudge: false, reason: 'opted_out' };
  if (c.intakeNudgedAt) return { nudge: false, reason: 'already_nudged' };
  if (c.onboardingStage === 'complete') return { nudge: false, reason: 'intake_complete' };

  // NAMED — the guard that matters most.
  //
  // A wrong number reached KIBA believing it was someone who had been coming to
  // their house, said they felt unsafe and would call the police. They sat in
  // the database as a trial lead stuck in intake: a perfect match for every
  // other rule here. Giving KIBA their name is the first thing a real lead does
  // and the last thing someone who texted us by mistake would do, so it's the
  // cheapest available proxy for "meant to be here". Without a name we simply
  // never chase.
  if (!c.name || !c.name.trim()) return { nudge: false, reason: 'never_engaged' };

  if (!c.lastActiveAt) return { nudge: false, reason: 'no_activity_timestamp' };

  const idle = now.getTime() - c.lastActiveAt.getTime();
  if (idle < STALL_MIN_MS) return { nudge: false, reason: 'too_recent' };
  if (idle > STALL_MAX_MS) return { nudge: false, reason: 'too_cold' };

  if (!isSendableHour(now, c.utcOffsetMinutes)) return { nudge: false, reason: 'quiet_hours' };

  return { nudge: true };
}

/**
 * Deliberately not a sales pitch. They already said they wanted this — the
 * message that lost them was a question, so this hands the question back in one
 * line and gets out of the way. No guilt, no urgency, no "don't miss out": a
 * lead who hasn't finished opting in has not earned any of that.
 */
export function buildIntakeNudge(name: string): string {
  return `yo ${name.trim()} — you dropped off mid-setup. still want in? one answer and we're rolling.`;
}
