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

// Whole-message intent for "what time is it" and its common phrasings. Anchored
// to the entire message (optional leading filler + optional politeness) so a
// mention of "time" inside a larger sentence can't trigger it — e.g.
// "what time should i wake up", "what time works for you", "set a reminder at
// some time" must NOT match, while "what time is it", "what's the time",
// "do you know the time", "time?" do.
const TIME_QUERY_RE = new RegExp(
  '^\\s*' +
    '(?:hey|yo|ok|okay|so|lol|haha|wait|but|and|um|hmm|yoo+)?[\\s,]*' +
    '(?:can you tell me|could you tell me|do you know|do you even know|u know|you know|tell me|got|have|whats|what\'?s)?\\s*' +
    '(?:' +
      'what\\s+time\\s+is\\s+it' + // what time is it
      '|what\\s+time\\s+it\\s+is' + // (do you know) what time it is
      '|what(?:\'?s| is)\\s+the\\s+time' + // what's the time / what is the time
      '|the\\s+time' + // (do you know) the time / got the time
      '|current\\s+time' + // current time
      '|time' + // bare "time?"
    ')' +
    '(?:\\s+(?:now|there|rn|right\\s+now|currently|today|for\\s+me|where\\s+i\\s+am))?' +
    '\\s*[?.!]*\\s*$',
  'i',
);

/** True when the whole message is a plain request for the current time. */
export function isTimeQuery(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return TIME_QUERY_RE.test(trimmed);
}
