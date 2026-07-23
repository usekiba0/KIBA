/**
 * Deterministic backstop for weight-progress claims (Bianca 2026-07-23).
 *
 *   "you started at 205.2 lbs last friday. that's 5.6 lbs down in one week."
 *
 * 205.2 was her 07-03 weigh-in — three weeks earlier. Last Friday (07-17) she
 * was 202.4, so the true one-week loss was 2.8 lbs. The number reported to a
 * weight-loss client was exactly double her real result, off an anchor the
 * model had already misused on 07-14 ("2.6 lbs in one week") and 07-17 ("2.8
 * lbs in one week"). The anchor never moves, so the error compounds weekly.
 *
 * The fix is the same one that worked for dates and arithmetic: the model does
 * not get to pick the anchor. A weigh-in is a dated fact, the delta is
 * subtraction, and both are settled here — no model call, no latency.
 *
 * Scope is deliberately one claim shape: "N lbs down IN ONE WEEK" (and the
 * "you were X last friday" anchor attached to it). Total-progress claims
 * ("down 5.6 since you started") are true and untouched, and when there is no
 * week-ago weigh-in to compare against the guard stays silent rather than
 * guessing.
 */

export interface WeighIn {
  at: Date;
  lbs: number;
}

export interface WeightCorrection {
  from: string;
  to: string;
  reason: string;
}

export interface WeightGuardResult {
  text: string;
  corrections: WeightCorrection[];
}

interface MessageLike {
  role?: string;
  content?: string;
  created_at?: string | Date;
}

/** A plausible adult body weight in lbs — narrow enough that calories, reps and
 *  clock times can't be mistaken for a weigh-in. */
const WEIGHT_RE =
  /^\s*(?:weight|weigh(?:ed|-?in)?|wt)?\s*[:=]?\s*(\d{2,3}(?:\.\d)?)\s*(?:lbs?|pounds?)?\s*$/i;
const MIN_LBS = 70;
const MAX_LBS = 700;

/**
 * Pull dated weigh-ins out of message history. USER messages only — an AI echo
 * ("weight check in ✓ 199.6 lbs") is not an independent fact, and letting one
 * into the ledger would let a fabricated number become its own evidence.
 */
export function extractWeighIns(messages: MessageLike[]): WeighIn[] {
  const out: WeighIn[] = [];
  for (const m of messages ?? []) {
    if ((m.role ?? '').toLowerCase() !== 'user') continue;
    const raw = (m.content ?? '').trim();
    const match = WEIGHT_RE.exec(raw);
    if (!match) continue;
    const lbs = parseFloat(match[1]);
    if (!Number.isFinite(lbs) || lbs < MIN_LBS || lbs > MAX_LBS) continue;
    const at = m.created_at instanceof Date ? m.created_at : new Date(m.created_at ?? '');
    if (Number.isNaN(at.getTime())) continue;
    out.push({ at, lbs });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const DAY_MS = 24 * 60 * 60 * 1000;
// A "one week ago" weigh-in is anything 5-10 days back: real weigh-ins land on
// a weekday cadence, not exact 168-hour boundaries.
const WEEK_MIN_DAYS = 5;
const WEEK_MAX_DAYS = 10;
/** Scale noise + rounding. Only act past this. */
const LBS_TOLERANCE = 0.25;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// "that's 5.6 lbs down in one week" / "you're down 5.6 lbs in one week"
const DELTA_RE = /(\d{1,3}(?:\.\d)?)\s*(lbs?|pounds?)\s+down\s+in\s+(?:one|1|a)\s+week/gi;
const DELTA_DOWN_FIRST_RE =
  /down\s+(\d{1,3}(?:\.\d)?)\s*(lbs?|pounds?)\s+in\s+(?:one|1|a)\s+week/gi;
// "you started at 205.2 lbs last friday" / "you were 205.2 last friday"
const ANCHOR_RE =
  /((?:you\s+(?:started\s+at|were|was)\s+)(\d{2,3}(?:\.\d)?)(\s*(?:lbs?|pounds?)?)\s+last\s+(?:friday|week))/gi;

/**
 * Rewrite provably-wrong one-week weight claims against the real ledger.
 * Returns the text unchanged (and no corrections) whenever the claim can't be
 * disproved — an unverifiable claim is left to the model.
 */
export function correctWeightClaims(text: string, weighIns: WeighIn[]): WeightGuardResult {
  const corrections: WeightCorrection[] = [];
  let out = text ?? '';
  if (!out.trim() || !weighIns?.length) return { text: out, corrections };

  const sorted = [...weighIns].sort((a, b) => a.at.getTime() - b.at.getTime());
  const latest = sorted[sorted.length - 1];

  // The reference weigh-in for "one week ago": closest to 7 days before the
  // latest, inside the 5-10 day window. Outside that window there's nothing to
  // compare against and the guard stays out of it.
  let reference: WeighIn | null = null;
  let bestGap = Infinity;
  for (const w of sorted) {
    if (w === latest) continue;
    const days = (latest.at.getTime() - w.at.getTime()) / DAY_MS;
    if (days < WEEK_MIN_DAYS || days > WEEK_MAX_DAYS) continue;
    const gap = Math.abs(days - 7);
    if (gap < bestGap) {
      bestGap = gap;
      reference = w;
    }
  }
  if (!reference) return { text: out, corrections };

  const trueDelta = reference.lbs - latest.lbs;
  // Only police losses — a gain is phrased differently and isn't this bug.
  if (trueDelta <= 0) return { text: out, corrections };

  // 1. The anchor: "you started at 205.2 lbs last friday" → the real week-ago value.
  out = out.replace(ANCHOR_RE, (whole, _all, num: string) => {
    const claimed = parseFloat(num);
    if (!Number.isFinite(claimed)) return whole;
    if (Math.abs(claimed - reference!.lbs) <= LBS_TOLERANCE) return whole;
    const fixed = whole.replace(num, fmt(reference!.lbs));
    corrections.push({
      from: whole,
      to: fixed,
      reason: `week-ago weigh-in was ${fmt(reference!.lbs)}, not ${num}`,
    });
    return fixed;
  });

  // 2. The delta, in both phrasings.
  for (const re of [DELTA_RE, DELTA_DOWN_FIRST_RE]) {
    out = out.replace(re, (whole, num: string) => {
      const claimed = parseFloat(num);
      if (!Number.isFinite(claimed)) return whole;
      if (Math.abs(claimed - trueDelta) <= LBS_TOLERANCE) return whole;
      const fixed = whole.replace(num, fmt(trueDelta));
      corrections.push({
        from: whole,
        to: fixed,
        reason: `${fmt(reference!.lbs)} → ${fmt(latest.lbs)} is ${fmt(trueDelta)} lbs, not ${num}`,
      });
      return fixed;
    });
  }

  return { text: out, corrections };
}
