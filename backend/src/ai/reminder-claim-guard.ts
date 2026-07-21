/**
 * Deterministic guard against KIBA promising a reminder it never created
 * (Karibi 2026-07-21).
 *
 * Reminder creation is entirely tool-driven. If the model emits prose without a
 * `tool_use` block, the reply ships and nothing is written. Nothing reconciled
 * the two, so this happened in production verbatim:
 *
 *   user: "just remind me to read my Bible every day"
 *   KIBA: "locked. every day at 8am. Bible reminder."
 *   KIBA: "got it. 8am daily Bible reminder with proof demanded."
 *   scheduled_reminders: (no 8am row — ever)
 *
 * This is the worst failure mode the product has: the user believes the system
 * is holding something for them, stops holding it themselves, and gets nothing.
 * It is strictly worse than refusing, because it is silent on both sides.
 *
 * The prompt already forbade it. That instruction runs against Haiku, so it is
 * soft; this is the hard backstop, in the same family as `correctTimeClaims`
 * and `correctWeekdayClaims` — no model call, no added latency.
 */

/**
 * Phrasings that assert a reminder now EXISTS. Deliberately narrow: each one
 * has to be a claim about a scheduled future send, not a general intention.
 *
 * Excluded on purpose:
 *  - "i'll check in on you" / "i'm on you about this" — relationship talk, no
 *    scheduling claim, and rewriting it would gut KIBA's voice.
 *  - "you should set a reminder" — advice, not a claim.
 */
const PROMISE_PATTERNS: RegExp[] = [
  // "i'll hit you at 5:30", "i'll ping you at 2", "i'll text you at 8am"
  /\bi(?:'| a)?ll\s+(?:hit|ping|text|message|remind|wake)\s+you\b[^.!?\n]*\b(?:at|around|by)\s+\d/i,
  // "just set your pre-push ping at 6:30", "set a 2pm check-in"
  /\b(?:just\s+)?set\s+(?:your|a|the)\b[^.!?\n]*\b(?:ping|reminder|check-?in|alarm|proof check)\b/i,
  // "reminder set", "reminder's locked in", "that reminder is set"
  /\breminder(?:'s)?\s+(?:is\s+)?(?:set|locked|scheduled|live|on)\b/i,
  // "8am daily Bible reminder", "daily reminder at 8"
  /\bdaily\s+[a-z ]{0,20}reminder\b/i,
  // "fires in 12h 51m", "fires at 8am", "it'll fire tomorrow at 9"
  /\bfires?\s+(?:in|at|tomorrow|today|every)\b/i,
  // "every day at 8am" / "every morning at 9" as a commitment
  /\bevery\s+(?:day|morning|night|evening)\s+at\s+\d/i,
  // The same commitment with the time FIRST — "9am every morning", "8 every day".
  // Split out rather than folded into the pattern above, because the two orders
  // need different anchoring and one regex covering both matched far too much.
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+every\s+(?:day|morning|night|evening)\b/i,
];

/**
 * Advice ABOUT reminders is not a claim that one exists. "you should set a
 * reminder for yourself" is KIBA telling the user to do something; "just set
 * your ping at 6:30" is KIBA reporting something it did. Without this the guard
 * deleted perfectly good coaching.
 */
const ADVICE = /\byou\s+(?:should|can|could|might|may|gotta|need\s+to|want\s+to|oughta)\b/i;

/** True if the reply asserts that a reminder is now scheduled. */
export function claimsReminderScheduled(text: string): boolean {
  const body = text ?? '';
  if (ADVICE.test(body)) return false;
  return PROMISE_PATTERNS.some((re) => re.test(body));
}

/**
 * Split into sentences while keeping their terminator, so a rewrite can drop
 * exactly the offending clause and leave the rest of the reply intact.
 * Newlines count as boundaries — KIBA writes in short stacked bubbles.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface ReminderClaimResult {
  text: string;
  corrected: boolean;
  dropped: string[];
}

const FALLBACK =
  "what time do you want that reminder? give me the time and i'll set it.";

/**
 * Strip false reminder claims from a reply.
 *
 * Only call this when NO reminder was created or confirmed during the turn —
 * see the `scheduledCount` / `listedExisting` gating at the call site. A turn
 * that really did schedule something must pass through untouched, otherwise the
 * guard would delete true statements, which is its own kind of lying.
 *
 * Removing the sentence is preferred over rewriting it: we know the claim is
 * false, we do NOT know what the true replacement is (we have no time to
 * schedule and no proof the user gave one). Asking is the only honest move, so
 * if stripping empties the reply we ask for the time.
 */
export function stripFalseReminderClaims(text: string): ReminderClaimResult {
  const original = text ?? '';
  if (!claimsReminderScheduled(original)) {
    return { text: original, corrected: false, dropped: [] };
  }

  const kept: string[] = [];
  const dropped: string[] = [];
  for (const sentence of splitSentences(original)) {
    if (claimsReminderScheduled(sentence)) dropped.push(sentence);
    else kept.push(sentence);
  }

  // The claim spanned the whole reply (or the sentence split couldn't isolate
  // it). Replace wholesale rather than shipping a half-sentence.
  if (kept.length === 0) {
    return { text: FALLBACK, corrected: true, dropped };
  }

  return { text: `${kept.join(' ')} ${FALLBACK}`.trim(), corrected: true, dropped };
}
