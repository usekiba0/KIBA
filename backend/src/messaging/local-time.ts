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
