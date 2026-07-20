/**
 * Deterministic date/time guard (Karibi 2026-07-08).
 *
 * The language model cannot be trusted to do date arithmetic — it told a July
 * user that "May 29 is like 5 months out." We stop relying on it two ways:
 *
 *  1. PREVENTION — `buildDateFactsBlock` finds every calendar date the user
 *     named, computes the exact gap from today in code, and hands the model the
 *     answer so it never has to calculate.
 *  2. HARD CHECK — `correctTimeClaims` runs on KIBA's finished reply and, when a
 *     gap it states is PROVABLY wrong (off by more than a tolerance vs the real
 *     gap to a date in context), rewrites just the number before the text is
 *     sent. No model call, no latency, and it never ships a wrong date.
 *
 * Everything here is pure and unit-tested. It is deliberately CONSERVATIVE:
 * unless it can prove a claim wrong against a single unambiguous date, it leaves
 * the text untouched — a false correction would be its own insult.
 */

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30.436875, year: 365.25 };
// How far off a stated number must be, per unit, before we call it PROVABLY
// wrong and rewrite it. Loose enough that honest rounding ("about 3 weeks") is
// never touched; tight enough to catch a real blunder ("5 months" for 11).
const UNIT_TOLERANCE: Record<string, number> = { day: 3, week: 2, month: 2, year: 1 };

export interface NamedDate {
  /** The literal phrase we matched, e.g. "May 29". */
  phrase: string;
  /** Resolved to the NEXT occurrence (this year, or next if already passed). */
  date: Date;
}

/** User-local midnight for a UTC instant + offset. Returns ms since epoch. */
function localMidnightMs(nowUtc: Date, offsetMinutes: number | null): number {
  const local = new Date(nowUtc.getTime() + (offsetMinutes ?? 0) * 60_000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

/**
 * Every calendar date named in `text`, resolved to its next future occurrence.
 * Matches "May 29", "May 29th", "29 May", and numeric "5/29" / "5/29/2027".
 * A bare month with no day is ignored (too vague to compute a gap).
 */
export function extractFutureDates(text: string, nowUtc: Date, offsetMinutes: number | null): NamedDate[] {
  if (!text) return [];
  const todayMs = localMidnightMs(nowUtc, offsetMinutes);
  const local = new Date(nowUtc.getTime() + (offsetMinutes ?? 0) * 60_000);
  const thisYear = local.getUTCFullYear();
  const out: NamedDate[] = [];
  const seen = new Set<number>();

  const push = (phrase: string, month: number, day: number, explicitYear?: number) => {
    if (month < 0 || month > 11 || day < 1 || day > 31) return;
    let year = explicitYear ?? thisYear;
    let ms = Date.UTC(year, month, day);
    // No explicit year and it already passed today → the next occurrence.
    if (explicitYear === undefined && ms < todayMs) {
      year += 1;
      ms = Date.UTC(year, month, day);
    }
    if (seen.has(ms)) return;
    seen.add(ms);
    out.push({ phrase, date: new Date(ms) });
  };

  // "May 29" / "May 29th" / "September 3"
  const monthDay = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  for (const m of text.matchAll(monthDay)) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month === undefined) continue;
    push(m[0], month, parseInt(m[2], 10));
  }

  // "29 May" / "29th of May"
  const dayMonth = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;
  for (const m of text.matchAll(dayMonth)) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month === undefined) continue;
    push(m[0], month, parseInt(m[1], 10));
  }

  // Numeric "5/29" or "5/29/2027" or ISO "2027-05-29".
  const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  for (const m of text.matchAll(numeric)) {
    const month = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    let year: number | undefined;
    if (m[3]) { year = parseInt(m[3], 10); if (year < 100) year += 2000; }
    push(m[0], month, day, year);
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  for (const m of text.matchAll(iso)) {
    push(m[0], parseInt(m[2], 10) - 1, parseInt(m[3], 10), parseInt(m[1], 10));
  }

  return out;
}

/** Whole days from today (user-local) to a target date. Negative if past. */
export function gapInDays(target: Date, nowUtc: Date, offsetMinutes: number | null): number {
  const todayMs = localMidnightMs(nowUtc, offsetMinutes);
  const targetMs = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((targetMs - todayMs) / 86_400_000);
}

/** "325 days from today (about 10.7 months)" — a human, unambiguous gap. */
function describeGap(days: number): string {
  if (days === 0) return 'today';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} ago`;
  const approx =
    days >= 60 ? ` (about ${(days / 30.436875).toFixed(1)} months)`
    : days >= 14 ? ` (about ${Math.round(days / 7)} weeks)`
    : '';
  return `${days} day${days === 1 ? '' : 's'} from today${approx}`;
}

/**
 * Prevention block. Lists every date named in `text` with its resolved next
 * occurrence and exact gap, so the model reads the answer instead of computing.
 * Returns '' when no datable reference is present.
 */
export function buildDateFactsBlock(text: string, nowUtc: Date, offsetMinutes: number | null): string {
  const dates = extractFutureDates(text, nowUtc, offsetMinutes);
  if (dates.length === 0) return '';
  const lines = dates.map((d) => {
    const days = gapInDays(d.date, nowUtc, offsetMinutes);
    const full = `${DAYS_FULL[d.date.getUTCDay()]}, ${MONTHS_FULL[d.date.getUTCMonth()]} ${d.date.getUTCDate()}, ${d.date.getUTCFullYear()}`;
    return `- "${d.phrase}" → ${full} — that's ${describeGap(days)}.`;
  });
  return [
    'DATE FACTS (already computed for you — use THESE exact numbers; do NOT calculate a date gap yourself, you get it wrong):',
    ...lines,
  ].join('\n');
}

interface GapClaim {
  index: number;
  length: number;
  raw: string;   // full matched span, e.g. "5 months out"
  number: number;
  unit: 'day' | 'week' | 'month' | 'year';
}

/** Find "N days/weeks/months out|away|left|until|from now|…" style gap claims. */
function findGapClaims(text: string): GapClaim[] {
  const raw: GapClaim[] = [];
  const collect = (re: RegExp) => {
    for (const m of text.matchAll(re)) {
      raw.push({ index: m.index!, length: m[0].length, raw: m[0], number: parseInt(m[1], 10), unit: m[2].toLowerCase() as GapClaim['unit'] });
    }
  };
  // Requires a directional qualifier OR a "that's like/about" lead-in so plain
  // durations ("3 days a week", "2 hour workout") are never matched.
  collect(/\b(\d{1,3})\s+(day|week|month|year)s?\s+(?:out|away|left|to\s*go|from\s+now|from\s+today|ahead|down\s+the\s+road|until\s+then)\b/gi);
  collect(/\b(?:that'?s|thats|about|like|roughly|around|only|just|another)\s+(\d{1,3})\s+(day|week|month|year)s?\b/gi);

  // Merge overlapping matches (the two patterns can both hit "like 5 weeks away")
  // — keep the earliest, longest span so a claim is never corrected twice.
  raw.sort((a, b) => a.index - b.index || b.length - a.length);
  const merged: GapClaim[] = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last && c.index < last.index + last.length) continue; // overlaps a kept claim
    merged.push(c);
  }
  return merged;
}

export interface ClaimCorrection {
  from: string;
  to: string;
  reason: string;
}

/**
 * HARD CHECK. Scans `reply` for gap claims and, when one is provably wrong
 * against the single unambiguous future date in context, rewrites the number.
 * Returns the (possibly corrected) text plus a list of what it changed.
 *
 * Conservative by design: it only acts when exactly one future date is in play
 * (from the user's message and/or the reply itself) and the stated number is off
 * by more than the per-unit tolerance. Otherwise it leaves the text alone.
 */
export function correctTimeClaims(
  reply: string,
  contextText: string,
  nowUtc: Date,
  offsetMinutes: number | null,
): { text: string; corrections: ClaimCorrection[] } {
  const claims = findGapClaims(reply);
  if (claims.length === 0) return { text: reply, corrections: [] };

  // Candidate target dates: those named in the reply, then the user's message.
  const dates = [
    ...extractFutureDates(reply, nowUtc, offsetMinutes),
    ...extractFutureDates(contextText, nowUtc, offsetMinutes),
  ];
  // De-dupe by timestamp; require exactly one distinct future date to stay safe.
  const distinct = new Map<number, NamedDate>();
  for (const d of dates) if (d.date.getTime() >= localMidnightMs(nowUtc, offsetMinutes)) distinct.set(d.date.getTime(), d);
  if (distinct.size !== 1) return { text: reply, corrections: [] };
  const target = [...distinct.values()][0];
  const days = gapInDays(target.date, nowUtc, offsetMinutes);
  if (days <= 0) return { text: reply, corrections: [] };

  const corrections: ClaimCorrection[] = [];
  // Apply from the end so earlier indices stay valid as we splice.
  let text = reply;
  for (const claim of [...claims].sort((a, b) => b.index - a.index)) {
    const trueVal = Math.round(days / UNIT_DAYS[claim.unit]);
    if (trueVal < 1) continue;
    if (Math.abs(claim.number - trueVal) < UNIT_TOLERANCE[claim.unit]) continue; // close enough
    // Swap only the number inside the matched span, keep the unit + wording.
    const fixedSpan = claim.raw.replace(String(claim.number), String(trueVal));
    if (fixedSpan === claim.raw) continue;
    text = text.slice(0, claim.index) + fixedSpan + text.slice(claim.index + claim.length);
    corrections.push({
      from: claim.raw,
      to: fixedSpan,
      reason: `${target.phrase} is ${days} days from today (~${trueVal} ${claim.unit}${trueVal === 1 ? '' : 's'}), not ${claim.number}`,
    });
  }
  return { text, corrections };
}

// ── Event-timing guard (Karibi 2026-07-09) ──────────────────────────────────
// Same philosophy as correctTimeClaims, but for PAST events rather than future
// date math. The model kept fabricating WHEN the user paid — it told a user who
// had just checked out "the link went through yesterday." Future-gap correction
// never touched that, and every prior attempt to fix it was a prompt instruction
// the model ignored. This is the deterministic backstop: given the real
// activation instant (Subscription.created_at), it rewrites any payment/signup
// timing claim whose stated day is provably wrong. Conservative — it acts ONLY
// when we have the ground-truth timestamp AND the reply names a day that
// contradicts it. When unsure, it leaves the text alone.

/** Which local day a past instant fell on relative to now: 0=today, 1=yesterday, ≥2=older. */
function localDayDelta(pastUtc: Date, nowUtc: Date, offsetMinutes: number | null): number {
  return Math.round((localMidnightMs(nowUtc, offsetMinutes) - localMidnightMs(pastUtc, offsetMinutes)) / 86_400_000);
}

type DayClass = 'today' | 'yesterday' | 'old';
function dayClass(delta: number): DayClass {
  return delta <= 0 ? 'today' : delta === 1 ? 'yesterday' : 'old';
}

/**
 * Human label for when a past event happened, in the user's local day.
 * "today" / "yesterday" / "Mon Jul 8". Used to ground the coaching prompt so the
 * model reads the real activation day instead of guessing one.
 */
export function describeActivationDay(pastUtc: Date, nowUtc: Date, offsetMinutes: number | null): string {
  const delta = localDayDelta(pastUtc, nowUtc, offsetMinutes);
  if (delta <= 0) return 'today';
  if (delta === 1) return 'yesterday';
  const local = new Date(pastUtc.getTime() + (offsetMinutes ?? 0) * 60_000);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][local.getUTCDay()];
  return `${dow} ${MONTHS_FULL[local.getUTCMonth()].slice(0, 3)} ${local.getUTCDate()} (${delta} days ago)`;
}

// A payment/activation event KIBA might reference. Present-tense mentions ("the
// link went through", "you're locked in") are always fine — only an explicit
// WRONG day attached to one of these is corrected.
const PAY_EVENT =
  '(?:(?:the\\s+)?(?:link|payment|checkout|charge|sub(?:scription)?)\\s+' +
  '(?:went\\s+through|came\\s+through|cleared|processed|went\\s+in|got\\s+processed)' +
  '|you\\s+(?:paid|signed\\s+up|joined|subscribed|got\\s+in|locked\\s+in|came\\s+in|started))';

const PAY_QUALIFIERS: Array<{ re: string; cls: DayClass }> = [
  { re: 'just\\s+now', cls: 'today' },
  { re: 'earlier\\s+today', cls: 'today' },
  { re: 'today', cls: 'today' },
  { re: 'last\\s+night', cls: 'yesterday' },
  { re: 'yesterday', cls: 'yesterday' },
  { re: 'last\\s+week', cls: 'old' },
  { re: 'the\\s+other\\s+day', cls: 'old' },
  { re: 'a\\s+few\\s+days\\s+ago', cls: 'old' },
  { re: '(?:a\\s+)?couple\\s+(?:of\\s+)?days\\s+ago', cls: 'old' },
  { re: '\\d+\\s+days\\s+ago', cls: 'old' },
];

/**
 * HARD CHECK for payment/signup timing. Given the real activation instant, strips
 * any day-word attached to a payment event that contradicts it (e.g. "the link
 * went through yesterday" when they paid today → "the link went through"). Leaving
 * the event present-tense is always truthful and natural. No-op without a
 * ground-truth timestamp, or when the stated day already matches reality.
 */
export function correctEventTimingClaims(
  reply: string,
  activatedAtUtc: Date | null | undefined,
  nowUtc: Date,
  offsetMinutes: number | null,
): { text: string; corrections: ClaimCorrection[] } {
  if (!reply || !activatedAtUtc) return { text: reply, corrections: [] };
  const actual = dayClass(localDayDelta(activatedAtUtc, nowUtc, offsetMinutes));

  const corrections: ClaimCorrection[] = [];
  let text = reply;
  for (const q of PAY_QUALIFIERS) {
    if (q.cls === actual) continue; // the stated day agrees with reality — leave it
    // "...the link went through yesterday" → drop the false trailing day
    const after = new RegExp(`(${PAY_EVENT})\\s+(?:on\\s+)?(?:${q.re})\\b`, 'gi');
    text = text.replace(after, (m, ev) => {
      corrections.push({ from: m, to: ev, reason: `payment cleared ${actual}, not ${q.cls}` });
      return ev;
    });
    // "yesterday the link went through" → drop the false leading day
    const before = new RegExp(`\\b(?:${q.re})[,\\s]+(${PAY_EVENT})`, 'gi');
    text = text.replace(before, (m, ev) => {
      corrections.push({ from: m, to: ev, reason: `payment cleared ${actual}, not ${q.cls}` });
      return ev;
    });
  }
  // Tidy whitespace/punctuation left by a splice, without disturbing newlines.
  if (corrections.length > 0) text = text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.,!?])/g, '$1');
  return { text, corrections };
}

// ── Weekday guard (Bianca 2026-07-20) ───────────────────────────────────────
// KIBA told a user on Monday July 20 "today's thursday equivalent" and then
// leaned a whole coaching turn on it. The clock was never wrong — the prompt
// stated the right date, and the model read it correctly the second she pushed
// back. It asserted the weekday anyway because the BEHAVIORAL SIGNALS block used
// to make it work out for itself whether today was the user's weakest day. That
// framing is now computed in code (see PatternSignals.todayDow), and this is the
// backstop for every other way a wrong weekday could reach the user: if the reply
// says today or tomorrow is a named weekday and it provably isn't, fix the word.

const DAY_TOKENS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, weds: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};
const DAY_ALT = Object.keys(DAY_TOKENS).sort((a, b) => b.length - a.length).join('|');
const DAY_FULL_ALT = DAYS_FULL.map((d) => d.toLowerCase()).join('|');

/** The user's local day of week for an instant, Sun=0..Sat=6. */
function localDow(nowUtc: Date, offsetMinutes: number | null): number {
  return new Date(nowUtc.getTime() + (offsetMinutes ?? 0) * 60_000).getUTCDay();
}

/** Match the source token's casing so a fix reads like the rest of the reply. */
function matchCase(sample: string, replacement: string): string {
  if (sample === sample.toUpperCase() && sample.length > 1) return replacement.toUpperCase();
  if (sample[0] === sample[0]?.toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement.toLowerCase();
}

/**
 * HARD CHECK on weekday claims about today/tomorrow. Rewrites only the day word,
 * leaving the sentence intact ("today's thursday" → "today's monday"), and drops
 * a trailing hedge like "equivalent" that only made sense while the claim was
 * wrong. Conservative by design:
 *  - only fires on an explicit today/tomorrow anchor, or a bare "it's <weekday>"
 *    that isn't inside a conditional ("if it's thursday…" is left alone);
 *  - abbreviations ("thurs") are accepted ONLY behind a today/tomorrow anchor, so
 *    ordinary words like "sat" and "wed" can never be mangled;
 *  - a claim that is already correct is never touched.
 * Offset falls back to UTC, matching the TODAY'S DATE line in the prompt, so the
 * reply can never contradict the date the model was actually given.
 */
export function correctWeekdayClaims(
  reply: string,
  nowUtc: Date,
  offsetMinutes: number | null,
): { text: string; corrections: ClaimCorrection[] } {
  if (!reply) return { text: reply, corrections: [] };
  const todayDow = localDow(nowUtc, offsetMinutes);
  const corrections: ClaimCorrection[] = [];
  let text = reply;

  // "today's thursday" / "today is thursday" / "tomorrow's friday" / "tmrw is fri"
  const anchored = new RegExp(
    `\\b(today|tomorrow|tmrw|tmw)(’s|'s|s\\b|\\s+is|\\s+was)\\s+(${DAY_ALT})\\b(\\s+equivalent)?`,
    'gi',
  );
  text = text.replace(anchored, (m, anchor: string, link: string, dayWord: string, hedge: string) => {
    const expected = anchor.toLowerCase() === 'today' ? todayDow : (todayDow + 1) % 7;
    const claimed = DAY_TOKENS[dayWord.toLowerCase()];
    if (claimed === undefined || claimed === expected) return m;
    const fixed = `${anchor}${link} ${matchCase(dayWord, DAYS_FULL[expected])}`;
    corrections.push({
      from: m,
      to: fixed,
      reason: `${anchor.toLowerCase()} is ${DAYS_FULL[expected]}, not ${DAYS_FULL[claimed]}`,
    });
    return fixed;
  });

  // Bare "it's thursday" — full day names only, and never inside a conditional.
  const bare = new RegExp(`(^|[^a-z])(it’s|it's|its)\\s+(${DAY_FULL_ALT})\\b`, 'gi');
  text = text.replace(bare, (m, lead: string, subject: string, dayWord: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 24), offset).toLowerCase();
    if (/\b(if|when|whenever|unless|once|until|by|say|like|come)\s*$/.test(before)) return m;
    const claimed = DAY_TOKENS[dayWord.toLowerCase()];
    if (claimed === undefined || claimed === todayDow) return m;
    const fixed = `${lead}${subject} ${matchCase(dayWord, DAYS_FULL[todayDow])}`;
    corrections.push({
      from: m.trim(),
      to: fixed.trim(),
      reason: `today is ${DAYS_FULL[todayDow]}, not ${DAYS_FULL[claimed]}`,
    });
    return fixed;
  });

  return { text, corrections };
}
