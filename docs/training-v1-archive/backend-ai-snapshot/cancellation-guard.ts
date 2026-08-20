/**
 * Deterministic backstop for cancellation requests (Karibi 2026-07-23).
 *
 * Live, on a paid subscription:
 *
 *   user:  "Busy bro I wanna cancel"
 *   KIBA:  "nah. hold up. you're at 0/100 score right now ... that's not busy.
 *           that's running."
 *
 * Three retention pushes, and the real way out was never stated once. The
 * coaching prompt was asking for exactly that ("never accept 'i quit' /
 * "i'm cancelling" without a real conversation first ... frame leaving as
 * LOSING that"), and the model used a fabricated 0/100 score as the lever.
 * Obstructing a cancellation request is a compliance problem, not a tone one.
 *
 * `opt-out.ts` already handles the bare keyword ("cancel" alone unsubscribes)
 * and deliberately refuses to substring-match, so "cancel my 8pm reminder"
 * stays a coaching request. That leaves a gap this guard closes: cancellation
 * intent written as a SENTENCE goes straight to the model — the one component
 * prompted to keep users engaged, i.e. the worst possible judge of the ask.
 *
 * A save offer is still allowed. KIBA may ask one honest question or offer to
 * pause. What it may not do is leave the user without the exit, so this runs
 * on the finished reply and appends the path when it's missing.
 *
 * ERROR ASYMMETRY — inverted from the other guards. Elsewhere a false positive
 * (rewriting a true sentence) is the worse failure. Here a false positive adds
 * one honest line; a false negative leaves a paying customer unable to find
 * the exit. So detection leans inclusive.
 */

/** The only two real paths. There is no billing portal and no cancel endpoint —
 *  this line must never imply one exists. */
export const CANCELLATION_PATH_LINE =
  'and if you do want out for real: text STOP to stop the messages, or email support@usekiba.ai to cancel billing. no hoops.';

/** Nouns that make "cancel" a reminder operation rather than a subscription one. */
const REMINDER_OBJECT =
  /\b(reminder|remind|ping|alarm|text|notification|nudge|check-?in|session|workout|leg day|push day|pull day|meeting|appointment|call)\b/i;

/** Cancellation-of-the-SERVICE phrasings. */
const CANCEL_INTENT: RegExp[] = [
  /\b(?:i|we)\s*(?:wanna|want to|wanted to|would like to|need to|gonna|'m going to|am going to)\s+cancel\b/i,
  /\bi\s*(?:'m|am)\s*cancell?ing\b/i,
  /\bcancel\s+(?:my|the|this)\s*(?:subscription|account|membership|plan|billing|payment|service|shit)\b/i,
  /\bhow (?:do|can) i cancel\b/i,
  /\bi\s*(?:wanna|want to|'m gonna|am going to)?\s*quit\b/i,
  /\bi\s*(?:want|wanna)\s*out\b/i,
  /\b(?:unsubscribe|opt me out|take me off)\b/i,
  /\bstop\s+(?:charging|billing)\s+me\b/i,
  /\b(?:i want to|wanna|want to)\s+stop\s+paying\b/i,
  /\bcancel\s+it\b/i,
  /\bdone with (?:this|kiba)\b/i,
];

/**
 * True when the message asks to end the SERVICE. Pure and cheap — runs on the
 * inbound before the reply is composed.
 */
export function detectCancellationIntent(raw: string): boolean {
  const text = (raw ?? '').trim();
  if (!text) return false;

  // "cancel my 8pm reminder" / "my meeting got cancelled" — the word appears,
  // but it's pointed at something other than the subscription. Checked first so
  // it can veto the broader patterns below.
  if (/\bcancel(?:l?ed|l?ing)?\b/i.test(text) && REMINDER_OBJECT.test(text)) return false;

  return CANCEL_INTENT.some((re) => re.test(text));
}

/** Does the reply already tell them how to leave? */
function statesPath(reply: string): boolean {
  const t = reply.toLowerCase();
  const stop = /\btext\s+stop\b/.test(t) || /\bstop\b.*\bunsubscribe\b/.test(t);
  const email = /support@usekiba\.ai/.test(t);
  return stop || email;
}

export interface CancellationGuardResult {
  text: string;
  corrected: boolean;
}

/**
 * When the inbound asked to cancel, guarantee the outgoing reply carries the
 * real path. Additive by design: KIBA's voice and its one save attempt survive
 * untouched, the user just also learns how to actually leave.
 */
export function enforceCancellationPath(
  reply: string,
  intentDetected: boolean,
): CancellationGuardResult {
  if (!intentDetected) return { text: reply, corrected: false };
  if (statesPath(reply ?? '')) return { text: reply, corrected: false };

  const body = (reply ?? '').trim();
  const text = body ? `${body}\n\n${CANCELLATION_PATH_LINE}` : CANCELLATION_PATH_LINE;
  return { text, corrected: true };
}
