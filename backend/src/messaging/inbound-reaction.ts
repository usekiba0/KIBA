/**
 * iMessage tapback detection.
 *
 * When a user taps back on a message (heart / thumbs / "Ha-Ha" / "!!" / "?")
 * over iMessage, SendBlue forwards it as an ordinary inbound message whose
 * `content` is the system-rendered reaction text — e.g. `Liked "let's do this"`.
 * There is no structured flag in the webhook to distinguish it, so we detect the
 * canonical reaction wording.
 *
 * Left unhandled, KIBA treats `Liked "..."` as a real user message and replies
 * to it — the "you just liked the message twice" confusion Karibi reported.
 * A tapback carries no new intent, so the inbound path drops these instead of
 * spending an AI turn on them.
 */

// The six add-reactions iMessage can apply.
const REACTION_VERBS = ['Liked', 'Loved', 'Disliked', 'Laughed at', 'Emphasized', 'Questioned'];

// `Liked "quoted original"` with straight or curly quotes. The quoted segment is
// REQUIRED so a normal message like "Loved it!" (no quotes) is never caught.
const ADD_RE = new RegExp(`^(?:${REACTION_VERBS.join('|')})\\s+["“].*["”]\\s*$`, 'is');

// The "undo" form: `Removed a heart from "..."`, `Removed an exclamation from "..."`.
const REMOVE_RE = /^Removed (?:a|an) .+ from\s+["“].*["”]\s*$/is;

/** True when the inbound text is an iMessage tapback rather than a real message. */
export function isInboundReaction(content: string | null | undefined): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  return ADD_RE.test(trimmed) || REMOVE_RE.test(trimmed);
}
