/**
 * Deterministic backstop for arithmetic written in prose (Retraining B5).
 *
 * The `calculate` tool is the front door — the prompt tells the model every
 * derived number must come through it. This guard is the lock on the back
 * door: when the reply still contains an inline equation ("2,000 plus 500 is
 * 3,000", "$500 a week for 6 weeks gets you to 5k"), recompute it and fix the
 * stated result if it's provably wrong. Same family as correctTimeClaims /
 * correctWeekdayClaims: no model call, no latency, conservative by design.
 *
 * Deliberately narrow. It only acts when a sentence carries BOTH the operands
 * and the claimed result in a recognized shape, every number parses cleanly,
 * and the claim is wrong beyond rounding tolerance. "4x8" in a workout, times
 * of day ("6:15"), and bare numbers never match — there is no result clause.
 * A missed correction costs one wrong number; a false correction rewrites a
 * true sentence, which is worse. When unsure, do nothing.
 */

export interface MathCorrection {
  from: string;
  to: string;
  reason: string;
}

export interface MathGuardResult {
  text: string;
  corrections: MathCorrection[];
}

/** `$2,000` / `1.5k` / `450` → number. Returns null when it isn't a clean quantity. */
export function parseQuantity(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/^\$/, '').replace(/,/g, '');
  const m = /^(\d+(?:\.\d+)?)(k)?$/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] ? n * 1000 : n;
}

/** A number token: optional $, digits with commas/decimal, optional k suffix.
 *  Guarded on both sides so clock times (6:15) and set notation (4x8 — no
 *  spaces) can't be captured as operands. */
const NUM = String.raw`\$?\d[\d,]*(?:\.\d+)?k?`;
// A range like "400-500" — used only on the ADDEND side; interval sums are
// checked at both ends.
const NUM_OR_RANGE = `${NUM}(?:-${NUM})?`;

// "A plus B [plus C] is/=/comes to R"
const SUM_RE = new RegExp(
  String.raw`(?<![:\dx])(${NUM_OR_RANGE})((?:\s*(?:\+|plus)\s*(?:${NUM_OR_RANGE}))+)\s*(?:=|is|equals|makes|comes? to|adds? up to|that's)\s*(?:about |around |roughly |~)?(${NUM_OR_RANGE})(?![:\d])`,
  'gi',
);

// "A x B is/=/comes to R" (spaced multiplication only — "4x8" stays a set)
const PRODUCT_RE = new RegExp(
  String.raw`(?<![:\dx])(${NUM})\s+(?:x|×|times)\s+(${NUM})\s*(?:=|is|equals|makes|comes? to|that's)\s*(?:about |around |roughly |~)?(${NUM})(?![:\d])`,
  'gi',
);

// "$N a week for M weeks gets you to R" — the exact shape behind the live
// "gets you to 5k no problem" miss (components computed to far less).
const RATE_RE = new RegExp(
  String.raw`(${NUM})\s*(?:\/|a |per )(?:week|day|month)\s+(?:for|over|across)\s+(\d{1,3})\s+(?:weeks|days|months)\s*(?:=|is|equals|comes? to|gets? you(?: to)?|that's)\s*(?:about |around |roughly |~)?(${NUM})(?![:\d])`,
  'gi',
);

/** Rounded claims are fine — only act beyond max(1, 5%) drift. */
function withinTolerance(claimed: number, actual: number): boolean {
  return Math.abs(claimed - actual) <= Math.max(1, Math.abs(actual) * 0.05);
}

/** Format a computed value in the style the reply was already using. */
function formatLike(value: number, exemplar: string): string {
  const dollar = exemplar.trim().startsWith('$') ? '$' : '';
  const usedK = /k$/i.test(exemplar.trim());
  if (usedK && Math.abs(value) >= 1000) {
    const k = value / 1000;
    return `${dollar}${Number.isInteger(k) ? k : parseFloat(k.toFixed(1))}k`;
  }
  return `${dollar}${Number.isInteger(value) ? value.toLocaleString('en-US') : parseFloat(value.toFixed(2)).toLocaleString('en-US')}`;
}

function parseRange(raw: string): [number, number] | null {
  const parts = raw.split('-');
  if (parts.length === 1) {
    const n = parseQuantity(parts[0]);
    return n === null ? null : [n, n];
  }
  if (parts.length !== 2) return null;
  const lo = parseQuantity(parts[0]);
  const hi = parseQuantity(parts[1]);
  return lo === null || hi === null ? null : [lo, hi];
}

export function correctArithmeticClaims(text: string): MathGuardResult {
  const corrections: MathCorrection[] = [];
  let out = text ?? '';

  out = out.replace(SUM_RE, (match, first: string, rest: string, claimed: string) => {
    const firstRange = parseRange(first);
    if (!firstRange) return match;
    let lo = firstRange[0];
    let hi = firstRange[1];
    // Every "+ N" / "plus N" addend, in order.
    const addends = [...rest.matchAll(new RegExp(String.raw`(?:\+|plus)\s*(${NUM_OR_RANGE})`, 'gi'))];
    for (const a of addends) {
      const r = parseRange(a[1]);
      if (!r) return match; // an operand we can't read cleanly → touch nothing
      lo += r[0];
      hi += r[1];
    }
    const claimedRange = parseRange(claimed);
    if (!claimedRange) return match;
    const okLo = withinTolerance(claimedRange[0], lo);
    const okHi = withinTolerance(claimedRange[1], hi);
    if (okLo && okHi) return match;

    const replacement = lo === hi
      ? formatLike(lo, claimed)
      : `${formatLike(lo, claimed)}-${formatLike(hi, claimed)}`;
    corrections.push({ from: claimed, to: replacement, reason: `sum computes to ${lo === hi ? lo : `${lo}-${hi}`}` });
    return match.slice(0, match.lastIndexOf(claimed)) + replacement;
  });

  out = out.replace(PRODUCT_RE, (match, a: string, b: string, claimed: string) => {
    const x = parseQuantity(a);
    const y = parseQuantity(b);
    const c = parseQuantity(claimed);
    if (x === null || y === null || c === null) return match;
    const actual = x * y;
    if (withinTolerance(c, actual)) return match;
    const replacement = formatLike(actual, claimed);
    corrections.push({ from: claimed, to: replacement, reason: `${x} × ${y} = ${actual}` });
    return match.slice(0, match.lastIndexOf(claimed)) + replacement;
  });

  out = out.replace(RATE_RE, (match, rate: string, periods: string, claimed: string) => {
    const r = parseQuantity(rate);
    const n = parseInt(periods, 10);
    const c = parseQuantity(claimed);
    if (r === null || !Number.isFinite(n) || c === null) return match;
    const actual = r * n;
    if (withinTolerance(c, actual)) return match;
    const replacement = formatLike(actual, claimed);
    corrections.push({ from: claimed, to: replacement, reason: `${r}/period × ${n} = ${actual}` });
    return match.slice(0, match.lastIndexOf(claimed)) + replacement;
  });

  return { text: out, corrections };
}
