/**
 * Deterministic guard against a bare acknowledgment triggering state writes
 * (Karibi 2026-07-31).
 *
 * Observed in production, user df3b46fb, 2026-07-31T01:51Z:
 *
 *   00:37Z  user: "Yea so remind me in an hour at 830"
 *           → reminder 2bbd3fd8 created for 01:30Z. Correct.
 *   01:30Z  reminder FIRES: "yo send those business numbers - we figure out
 *           what's capping you at 560k so you can hit that million". Correct.
 *   01:51Z  user: "Bettt"
 *           → schedule_reminder called AGAIN. 20:30 local had already passed, so
 *             the resolver correctly rolled it to the next day and created
 *             eb98e3b8 for 2026-08-01T01:30Z — a reminder the user never asked
 *             for, on the wrong day.
 *           → 196 output tokens re-litigating the clock: "that's already passed
 *             by 21 minutes lol... you mean tomorrow at 8:30am?" followed by
 *             "wait - that fired for tomorrow."
 *
 * The user's report was "all I said was bet". That is the whole diagnosis: a
 * one-word acknowledgment of a message that had already done its job was read as
 * a fresh instruction. The resolver, the scheduler and the send path were all
 * correct — the turn should never have written anything.
 *
 * The prompt already says not to re-open settled things. Prod runs
 * claude-haiku-4-5, where prompt-only rules are soft (see the un-agreed board
 * incident, 2026-07-29), so this is the hard backstop — no model call, no added
 * latency, same family as `stripFalseReminderClaims` and `correctTimeClaims`.
 *
 * Deliberately narrow. It only fires when BOTH hold:
 *   1. the inbound message is nothing but acknowledgment tokens, and
 *   2. KIBA's last message did not ask a question.
 *
 * (2) is the safety valve. "bet" answering "want me building your plan tonight?"
 * or "cool, i'll hit you 9am daily?" is CONSENT and must still be allowed to
 * write — that is a normal, load-bearing intake path. Only an ack of a statement
 * is inert.
 */

/**
 * Tokens that carry no instruction on their own.
 *
 * Consent words are excluded ON PURPOSE — "yes", "yeah", "yep", "yup", "ya",
 * "sure", "deal". Those answer a question, and while rule (2) should already
 * cover them, keeping them out means a missed question mark can never suppress a
 * real yes. "done" is excluded too: in this product it reports task completion
 * and drives the proof path, so it is content, not acknowledgment.
 */
const ACK_TOKENS = new Set([
  'ok',
  'okay',
  'okey',
  'k',
  'kk',
  'kay',
  'aight',
  'ight',
  'iight',
  'aiight',
  'alright',
  'bet',
  'word',
  'facts',
  'fr',
  'frfr',
  'cool',
  'dope',
  'nice',
  'sweet',
  'solid',
  'gotcha',
  'gotchu',
  'lit',
  'perfect',
  'great',
  'awesome',
  'copy',
  'roger',
  'true',
  'indeed',
  'fine',
  'thanks',
  'thx',
  'ty',
  'bless',
  'salute',
  'respect',
  'np',
]);

/** Multi-word acknowledgments that are not simply a run of ACK_TOKENS. */
const ACK_PHRASES = new Set([
  'got it',
  'sounds good',
  'say less',
  'copy that',
  'thank you',
  'appreciate it',
  'preciate it',
  'no problem',
  'for sure',
  'my bad',
  'all good',
  'will do',
  'good looks',
  'good look',
]);

/**
 * Longer than this and it is not a bare ack — there is a clause in there doing
 * work ("bet, make it 9 instead").
 */
const MAX_ACK_WORDS = 4;

/** Emoji, variation selectors and ZWJ — a thumbs-up alone is an acknowledgment. */
const EMOJI = /\p{Extended_Pictographic}(\p{Emoji_Modifier}|️)?|‍/gu;
// Includes the curly apostrophe/quotes — iMessage substitutes them and every
// real thread is full of them.
const PUNCT = /[.!?,;:~\-–—_"'`’‘“”()[\]{}]/g;

/**
 * Stretched spellings are the norm over SMS: "bettt", "coool", "niiice".
 * Collapsing runs to ONE letter alone is not enough — it turns "coool" into
 * "col". So try both: to one ("bettt" -> "bet") and to two ("coool" -> "cool").
 */
const collapseVariants = (s: string): string[] => [
  s,
  s.replace(/(.)\1+/g, '$1'),
  s.replace(/(.)\1{2,}/g, '$1$1'),
];

const matchesAck = (s: string, set: Set<string>): boolean =>
  collapseVariants(s).some((v) => set.has(v));

/**
 * True when the message is nothing but acknowledgment — no question, no new
 * instruction, no content to act on.
 */
export function isBareAcknowledgment(raw: string): boolean {
  if (typeof raw !== 'string') return false;

  // A question is never inert, and '?' is stripped as punctuation below — so it
  // has to be caught on the raw text first. "bet?" is asking something.
  if (raw.includes('?')) return false;

  const withoutEmoji = raw.replace(EMOJI, ' ');
  const hadEmoji = withoutEmoji !== raw;

  const cleaned = withoutEmoji.toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();

  // Emoji-only: 👍 / 🙏 / 💯 with nothing else.
  if (cleaned === '') return hadEmoji;

  const words = cleaned.split(' ');
  if (words.length > MAX_ACK_WORDS) return false;

  const phrase = words.join(' ');
  if (matchesAck(phrase, ACK_PHRASES)) return true;

  return words.every((w) => matchesAck(w, ACK_TOKENS));
}

/**
 * Did KIBA's most recent message ask something? If so, a short reply is an
 * ANSWER and must keep full tool access.
 *
 * Only the last assistant message counts. Walking further back would re-arm a
 * question the user has already moved past — which is the very behaviour this
 * guard exists to stop.
 */
export function lastAssistantAskedQuestion(
  recentMessages: ReadonlyArray<{ role: string; content: string }>,
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const m = recentMessages[i];
    if (m.role === 'user') continue;
    return typeof m.content === 'string' && m.content.includes('?');
  }
  return false;
}

/**
 * The turn is inert: the user acknowledged a statement. Nothing should be
 * written and the reply should be one short line.
 */
export function isInertAcknowledgmentTurn(
  incomingText: string,
  recentMessages: ReadonlyArray<{ role: string; content: string }>,
): boolean {
  return isBareAcknowledgment(incomingText) && !lastAssistantAskedQuestion(recentMessages);
}

/**
 * Handed back to the model in place of the tool result. Phrased as an
 * instruction, never as a failure — a bare "error" makes the model improvise
 * "the system's being weird" to the user (see the fire_at_iso gating bug).
 */
export const ACK_WRITE_SUPPRESSED_NOTE =
  "they're just acknowledging what you already said — nothing new was asked for, so there's nothing to schedule or change. do NOT re-explain, re-check the time, or re-open anything that's already settled. reply with ONE short casual line, like 'bet, when you sending it?' or 'aight, take your time'.";
