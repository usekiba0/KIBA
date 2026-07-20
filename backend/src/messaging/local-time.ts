/**
 * Local-clock helpers shared by the coaching prompt and the deterministic
 * "what time is it" short-circuit.
 *
 * Why this exists: the model cannot be trusted to report the wall clock. Even
 * with a correct UTC snapshot + offset handed to it in the system prompt, it
 * intermittently *estimates* the time instead of reading the value verbatim
 * ("it's around 4:51pm" when the snapshot said 5:04). So when the user asks the
 * time outright, we compute and answer it in code — no LLM in the loop — and we
 * reuse the EXACT same formatting in the prompt so any natural-language time
 * reference the model does make matches the deterministic answer.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Shift a UTC instant into the user's local wall clock as a UTC-keyed Date. */
function toLocal(nowUtc: Date, offsetMinutes: number): Date {
  return new Date(nowUtc.getTime() + offsetMinutes * 60_000);
}

/** "5:04pm" — lowercase, no space, to match KIBA's texting voice. */
export function formatLocalClock12h(nowUtc: Date, offsetMinutes: number): string {
  const local = toLocal(nowUtc, offsetMinutes);
  const hh = local.getUTCHours();
  const mm = local.getUTCMinutes().toString().padStart(2, '0');
  const period = hh >= 12 ? 'pm' : 'am';
  const hh12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${hh12}:${mm}${period}`;
}

/** "5:04 PM, Sunday Jun 21" — the verbose form embedded in the system prompt. */
export function formatLocalClockPretty(nowUtc: Date, offsetMinutes: number): string {
  const local = toLocal(nowUtc, offsetMinutes);
  const hh = local.getUTCHours();
  const mm = local.getUTCMinutes().toString().padStart(2, '0');
  const period = hh >= 12 ? 'PM' : 'AM';
  const hh12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${hh12}:${mm} ${period}, ${DAYS[local.getUTCDay()]} ${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}`;
}

/**
 * Full calendar date WITH YEAR — "Wednesday, July 8, 2026". Injected so the
 * model can ground deadline math (e.g. "how long until May 29") in the real
 * date instead of guessing the current month/year and getting it wildly wrong
 * (Karibi 2026-07-08: told a July user May 29 was "like 5 months out"). Unlike
 * the clock, the date does NOT need the user's timezone — server UTC is accurate
 * to the day for month-level math — so `offsetMinutes` is optional and falls
 * back to UTC when unknown (the date is still injected pre-timezone-capture).
 */
export function formatDateWithYear(nowUtc: Date, offsetMinutes: number | null): string {
  const local = toLocal(nowUtc, offsetMinutes ?? 0);
  return `${DAYS[local.getUTCDay()]}, ${MONTHS_FULL[local.getUTCMonth()]} ${local.getUTCDate()}, ${local.getUTCFullYear()}`;
}

/** The user's local day of week, Sun=0..Sat=6. */
export function localDayOfWeek(nowUtc: Date, offsetMinutes: number): number {
  return toLocal(nowUtc, offsetMinutes).getUTCDay();
}

/**
 * Deterministic time-of-day label from the user's local clock. The model
 * otherwise infers day/night from the CONVERSATION (an older late-night
 * exchange still in history) and tells the user to "go to sleep" at noon —
 * Karibi 2026-06-30. This anchors the framing to the real clock.
 */
export function timeOfDayLabel(nowUtc: Date, offsetMinutes: number): string {
  const localMin =
    (((nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + offsetMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(localMin / 60);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'the afternoon';
  if (h >= 17 && h < 21) return 'the evening';
  if (h >= 21 && h <= 23) return 'night';
  return 'the middle of the night (the user should be asleep)';
}

/**
 * Compact recency stamp for a HISTORICAL message — "today 2:04am",
 * "yesterday 11:30pm", "Sun Jun 21 9:00am". The model is handed up to ~60
 * cross-day messages with no metadata, so it reads last night's "it's 2am, go
 * to sleep" as if it were now. Prefixing each past message with when it was
 * sent (in the user's local day) gives deterministic recency grounding so the
 * model stops inferring "now" from stale content. Returns null when the offset
 * is unknown — we can't place the message in the user's day. (Karibi 2026-06-30)
 */
export function formatHistoryStamp(
  msgUtc: Date,
  offsetMinutes: number | null | undefined,
  nowUtc: Date,
): string | null {
  if (offsetMinutes == null) return null;
  const local = toLocal(msgUtc, offsetMinutes);
  const nowLocal = toLocal(nowUtc, offsetMinutes);
  const clock = formatLocalClock12h(msgUtc, offsetMinutes);
  const dayMs = 24 * 60 * 60 * 1000;
  const msgDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const nowDay = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate());
  const delta = Math.round((nowDay - msgDay) / dayMs);
  if (delta <= 0) return `today ${clock}`;
  if (delta === 1) return `yesterday ${clock}`;
  return `${DAYS[local.getUTCDay()].slice(0, 3)} ${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()} ${clock}`;
}

// Whole-message intent for "what time is it" and its common phrasings, built to
// tolerate the typos people actually send over SMS ("what tme os it",
// "whts the time", "wat tym is it"). Anchored to the ENTIRE message (optional
// leading filler + optional politeness) so a mention of "time" inside a larger
// sentence can't trigger it — e.g. "what time should i wake up", "what time
// works for you", "set a reminder at some time", "time to go" must NOT match,
// while "what time is it", "what's the time", "do you know the time", "time?" do.
const WHAT = '(?:what|whats|wht|whts|wat|wats|wut)';
const TIME_W = '(?:time|tyme|tym|tme|tiem|tim)';
const IS_W = '(?:is|iz|os|s)';
const IT_W = '(?:it|i)';
const LEAD = '(?:(?:hey|yo|ok|okay|so|lol|haha|um|hmm|bro|aye|ayo|yoo+)\\s+)*';
const POLITE =
  '(?:(?:can|could)\\s+(?:you|u)\\s+tell\\s+(?:me\\s+)?|do\\s+(?:you|u)\\s+(?:even\\s+)?know\\s+|(?:you|u)\\s+know\\s+|tell\\s+me\\s+|got\\s+|have\\s+)?';
const CORE =
  '(?:' +
    WHAT + '\\s+' + TIME_W + '\\s+' + IS_W + '\\s+' + IT_W + // what time is it
    '|' + WHAT + '\\s+' + TIME_W + '\\s+' + IT_W + '\\s+' + IS_W + // what time it is
    '|' + WHAT + 's?\\s+the\\s+' + TIME_W + // whats the time
    '|' + WHAT + '\\s+' + IS_W + '\\s+the\\s+' + TIME_W + // what is the time
    '|' + WHAT + '\\s+' + TIME_W + // what time
    '|the\\s+' + TIME_W + // the time
    '|current\\s+' + TIME_W + // current time
    '|' + TIME_W + // bare "time"
  ')';
const TAIL = '(?:\\s+(?:now|rn|right\\s+now|there|currently|today|for\\s+me|where\\s+i\\s+am))?';
const TIME_QUERY_RE = new RegExp('^' + LEAD + POLITE + CORE + TAIL + '$', 'i');

/** True when the whole message is a plain request for the current time. */
export function isTimeQuery(text: string | null | undefined): boolean {
  if (!text) return false;
  // Normalise: drop punctuation/emoji, collapse whitespace, so a trailing "?"
  // or stray characters never break detection.
  const norm = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!norm) return false;
  return TIME_QUERY_RE.test(norm);
}
