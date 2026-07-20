/**
 * Carrier-standard opt-out / opt-in keyword handling.
 *
 * Honoring STOP is a legal requirement, not a product feature, and it cannot be
 * left to the model: an LLM that is actively prompted to keep users engaged is
 * the worst possible judge of whether someone just revoked consent. So this is
 * deterministic, runs ahead of every AI path, and is deliberately dumb.
 *
 * iMessage is the reason this has to exist in our code at all. On SMS the
 * carrier intercepts STOP before it ever reaches us; over iMessage (SendBlue)
 * nothing does, and iMessage is KIBA's primary channel.
 *
 * The keyword must be the ENTIRE message. "cancel" alone is an opt-out; "cancel
 * my 8pm reminder" is a coaching request and must reach the model untouched.
 * Substring matching here would silently unsubscribe users mid-conversation,
 * which is a worse failure than missing an opt-out, because it is invisible —
 * the user just stops hearing from KIBA and never learns why.
 */

/** CTIA-standard opt-out keywords. */
const OPT_OUT = new Set([
  'stop',
  'stopall',
  'stop all',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'optout',
  'opt out',
]);

/** CTIA-standard resume keywords. */
const OPT_IN = new Set(['start', 'unstop', 'yes', 'optin', 'opt in', 'resume']);

/** CTIA-standard help keywords. */
const HELP = new Set(['help', 'info']);

/**
 * Reduce a message to a bare keyword for comparison: strip surrounding
 * whitespace and any leading/trailing punctuation or emoji, collapse inner
 * whitespace, lowercase. "STOP!" / " stop " / "Stop." all become "stop".
 *
 * Inner punctuation is preserved so "stop, i'm done" does NOT reduce to "stop"
 * — a sentence is a conversation, not a keyword.
 */
export function normalizeKeyword(raw: string): string {
  return (raw ?? '')
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export type KeywordIntent = 'opt_out' | 'opt_in' | 'help' | null;

/**
 * Classify a whole inbound message as a compliance keyword, or null if it is
 * ordinary conversation. Null is the overwhelmingly common case and must stay
 * cheap — this runs on every inbound message before anything else.
 */
export function detectKeyword(raw: string): KeywordIntent {
  const word = normalizeKeyword(raw);
  if (!word || word.length > 12) return null; // no keyword is longer than "unsubscribe"
  if (OPT_OUT.has(word)) return 'opt_out';
  if (OPT_IN.has(word)) return 'opt_in';
  if (HELP.has(word)) return 'help';
  return null;
}

/**
 * Confirmation copy. Deliberately plain rather than in KIBA's voice: someone
 * who just asked to be left alone should not be met with personality, and a
 * compliance confirmation is one of the few places where sounding like a
 * machine is correct. It must also state how to come back, or the opt-out is a
 * one-way door.
 */
export const OPT_OUT_CONFIRMATION =
  "You're unsubscribed from KIBA. You won't get any more messages. Text START if you ever want back in.";

export const OPT_IN_CONFIRMATION =
  "You're back in. KIBA will pick up where you left off. Text STOP any time to unsubscribe.";

export const HELP_REPLY =
  'KIBA is an AI accountability coach. Message and data rates may apply. Text STOP to unsubscribe.';
