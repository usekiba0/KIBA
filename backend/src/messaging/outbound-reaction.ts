/**
 * Outbound iMessage tapbacks, as an inline reply marker.
 *
 * Karibi's ask (2026-08-07): "if i say i went to the gym it can thumbs up or put
 * !! on it and then talk. or if i send a fake proof picture it can put 🤣 and
 * then talk abt it." — i.e. react on MOST turns, not rarely.
 *
 * This replaced the `react_to_message` TOOL. A tool call forces a second model
 * round-trip before the text can be written (~1.6-2.5s on that turn, given
 * genMs ~= 1624ms + 8.0ms/output-token), which made "react more often" and
 * "reply faster" directly opposed — the objection raised against the ask. As a
 * marker the reaction rides along in the reply the model was already writing, so
 * frequency costs nothing and the SPARINGLY guidance could be dropped.
 *
 * The model opens a reply with `[react:laugh]`; the send path strips the marker
 * and fires the tapback alongside the first bubble. Same shape as the `[pause]`
 * burst marker (see bubbles.ts) — a token the model emits and the phone never
 * sees.
 */

/** The six tapbacks iMessage/SendBlue accept. Mirrors MessagingService.VALID_REACTIONS. */
const VALID = ['love', 'like', 'dislike', 'laugh', 'emphasize', 'question'] as const;
export type OutboundReaction = (typeof VALID)[number];

/**
 * Any `[react:...]` token, valid word or not. Deliberately WIDER than the six
 * valid names: an invented reaction (`[react:fire]`) must still be stripped, or
 * a model typo renders as literal junk on the phone.
 */
const MARKER_RE = /\[\s*react\s*:\s*([a-z]*)\s*\]/gi;

/**
 * Pull the tapback out of an AI reply and return the text with every marker
 * removed.
 *
 * The FIRST valid marker wins — one tapback per reply, so a model that emits two
 * can't spray reactions. Invalid markers are stripped and ignored. Returns
 * `reaction: null` when there is nothing to send, which is the common case.
 *
 * Runs BEFORE humanizeVoice/splitBubbles so no marker can reach a bubble, the
 * stored message row, or the model's next-turn context.
 */
export function extractReaction(input: string | null | undefined): {
  reaction: OutboundReaction | null;
  text: string;
} {
  if (!input) return { reaction: null, text: '' };

  let reaction: OutboundReaction | null = null;
  const stripped = input.replace(MARKER_RE, (_match, word: string) => {
    const name = word.toLowerCase() as OutboundReaction;
    if (!reaction && (VALID as readonly string[]).includes(name)) reaction = name;
    return '';
  });

  // Tidy what the removal leaves behind: a leading blank line where the marker
  // sat on its own, and the doubled space of a mid-sentence strip. [pause]
  // markers are untouched — bubble splitting still needs them.
  const text = stripped
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t\r\n]+/, '')
    .trim();

  return { reaction, text };
}
