/**
 * Multi-bubble texting.
 *
 * Real people text in bursts — a thought, then another — not one paragraph. The
 * onboarding/coaching prompts can split a single reply into separate iMessage/SMS
 * bubbles by inserting a `[pause]` marker between them (this mirrors the
 * `[pause]` notation in the client's conversion script). The send layer splits
 * on that marker and delivers each chunk as its own message with a short gap.
 */

/** Max bubbles we'll send for one reply — overflow is merged into the last. */
const MAX_BUBBLES = 4;

/**
 * Split a reply into ordered text bubbles on the `[pause]` marker.
 * - Trims each bubble and drops empties.
 * - Returns a single-element array when there's no marker (normal one-shot reply).
 * - Returns `[]` only for empty/whitespace input (caller should send nothing).
 * - Caps at MAX_BUBBLES, folding any overflow into the final bubble so nothing
 *   is silently dropped.
 */
export function splitBubbles(reply: string): string[] {
  if (!reply || !reply.trim()) return [];
  const parts = reply
    .split(/\[pause\]/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) return parts; // 0 handled above; 1 = no marker

  if (parts.length > MAX_BUBBLES) {
    const head = parts.slice(0, MAX_BUBBLES - 1);
    const tail = parts.slice(MAX_BUBBLES - 1).join(' ');
    return [...head, tail];
  }
  return parts;
}
