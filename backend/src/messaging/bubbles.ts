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
 * Collapse a reply the model emitted twice back-to-back into a single copy.
 *
 * Kept from the sentence-splitting era. The degenerate self-repeat (Karibi
 * 2026-07-08) used to be caught for free: the split cut the reply at the first
 * sentence, and `dedupeBubbles` then dropped the identical second bubble. With no
 * automatic split there is nothing to dedupe, so the repeat has to be found in the
 * text itself or it ships as one message saying the same thing twice.
 */
function collapseSelfRepeat(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length < 2 || sentences.length % 2 !== 0) return text;
  const half = sentences.length / 2;
  const key = (parts: string[]) => parts.join(' ').toLowerCase().replace(/\s+/g, ' ');
  if (key(sentences.slice(0, half)) !== key(sentences.slice(half))) return text;
  return sentences.slice(0, half).join(' ');
}

/**
 * A marker-less reply is ONE text. Always.
 *
 * WHY (2026-08-18) — this used to split on a blank line, treating it as the model
 * marking its own beat. Two things killed that:
 *
 * 1. ORDERING. Two bubbles means two provider round-trips ~450-540ms apart, and
 *    SendBlue does not guarantee order at that spacing. Proven with a server log
 *    against a device screenshot of the same moment: we sent "hey. i'm KIBA." at
 *    15:50:09 and the follow-up at 15:50:10, and the phone displayed them
 *    REVERSED. Removing the concurrent-send path on 07-31 reduced this but never
 *    fixed it — the race is the gap itself, not the concurrency. Reversed, each
 *    half reads as its own answer and the two contradict; the founder's words were
 *    "this entire thing is just upside down it doesn't even make sense."
 *
 * 2. IT STOPPED DISCRIMINATING. The blank line was adopted because haiku used it
 *    only where a person would send a second text. By 08-18 it was on nearly every
 *    reply — KIBA's house style is a short acknowledgement, blank line, then the
 *    question ("5000 subs. that's real." / "so what's the actual problem then...").
 *    That is one turn of speech, not two texts, and it reads perfectly as one
 *    message. So "split on a beat" had quietly become "split always" for the
 *    second time, the same way the 80-char sentence rule did before it.
 *
 * The rhythm is NOT lost: paragraphs are joined with a single newline, so the beat
 * is still visible as a line break inside one bubble — exactly how replies that
 * already used a single newline have always rendered. One send, no race, and ~500ms
 * off every multi-paragraph reply.
 *
 * `[pause]` remains the model's explicit override and still splits (up to
 * MAX_BUBBLES). It measured 1 in 151 replies, so the ordering risk it carries is
 * rare enough to price in — and MESSAGE_BUBBLE_DELAY_MS is the lever for it.
 */
function autoSplit(text: string): string[] {
  // Checkout/payment links stay whole on EVERY path. A link that lands as its own
  // bubble can fail independently of the sentence that sets it up, and that costs a
  // conversion.
  if (/https?:\/\//i.test(text)) return [text];

  // Dedupe BEFORE joining. The degenerate self-repeat (Karibi 2026-07-08) emits the
  // same paragraph twice; that used to be caught for free because the two became
  // two bubbles and `dedupeBubbles` dropped one. Now that they merge into a single
  // message, an un-deduped repeat would ship as one text saying it twice.
  const paragraphs = dedupeBubbles(
    text
      .split(/\n[ \t]*\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  );

  return [collapseSelfRepeat(paragraphs.join('\n')) || text];
}

/** Enforce MAX_BUBBLES, folding overflow into the last so nothing is dropped. */
function capBubbles(parts: string[]): string[] {
  if (parts.length > MAX_BUBBLES) {
    const head = parts.slice(0, MAX_BUBBLES - 1);
    const tail = parts.slice(MAX_BUBBLES - 1).join(' ');
    return dedupeBubbles([...head, tail]);
  }
  return dedupeBubbles(parts);
}

/**
 * Split a reply into ordered text bubbles.
 * - `[pause]` markers win when the model emits them (up to MAX_BUBBLES).
 * - With NO marker the reply is ONE bubble. Paragraph breaks are preserved as
 *   single newlines inside it rather than becoming separate messages — see
 *   autoSplit for why (delivery order, and the blank line no longer marking a
 *   genuine beat).
 * - Trims each bubble and drops empties.
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

  if (parts.length === 0) return parts;
  // No marker: decide in code where the beats are.
  if (parts.length === 1) return capBubbles(autoSplit(parts[0]));
  return capBubbles(parts);
}

/**
 * Drop repeated bubbles so KIBA never sends the same text twice in one burst.
 * The model sometimes degenerates and emits its whole reply twice (often with a
 * [pause] between), which otherwise ships as two identical back-to-back messages
 * (Karibi 2026-07-08). Compares on a normalized form (case/whitespace-folded) so
 * a near-verbatim repeat is caught too; preserves first-seen order.
 */
export function dedupeBubbles(bubbles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of bubbles) {
    const key = b.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}
