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
 * Hard ceiling for a split WE decided on. `MAX_BUBBLES` (4) stays the limit for an
 * explicit `[pause]`, where the model asked for the break.
 *
 * Measured the hard way, 2026-07-30: shipping the blank-line split without this cap
 * let haiku's 3-4 paragraph replies through as 3-4 bubbles, and `sendMs` went from
 * 399ms to ~1,600ms median — each bubble is its own provider round-trip (~400ms)
 * plus MESSAGE_BUBBLE_DELAY_MS between them. Karibi felt it immediately. Two bubbles
 * is what the prompt calls the norm and what the latency budget actually affords;
 * beyond that the burst costs more than the human rhythm is worth.
 */
const AUTO_SPLIT_MAX = 2;

/** Fold a self-decided split down to AUTO_SPLIT_MAX, merging the tail. */
function capAuto(parts: string[]): string[] {
  if (parts.length <= AUTO_SPLIT_MAX) return parts;
  const head = parts.slice(0, AUTO_SPLIT_MAX - 1);
  return [...head, parts.slice(AUTO_SPLIT_MAX - 1).join(' ')];
}

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
 * Split a marker-less reply where the MODEL marked its own beats, and nowhere else.
 *
 * WHY THIS EXISTS: `[pause]` is a PROMPT-only instruction, and prod measured it
 * firing on 1 of 151 replies (2026-07-30) — 99.3% of replies shipped as a single
 * block while the prompt said "2 bubbles is the norm". Same failure mode as every
 * other prompt-only guard on haiku-4-5, so the behaviour lives in code and
 * `[pause]` stays as the model's explicit override.
 *
 * WHAT IS NOT HERE ANY MORE: a fallback that cut any reply over 80 chars at its
 * first sentence boundary. That fired on nearly every reply — almost nothing KIBA
 * says is under 80 chars — so "2 bubbles when there are 2 beats" became "2 bubbles
 * always", including on replies that are one continuous thought. Cutting continuous
 * prose in half produces two texts that do not follow from each other, and the
 * client reported exactly that: bubbles that "feel like two different AI responses
 * to the same prompt" (KIBA_Message_Feedback_Developer_Detailed.pdf, 2026-07-31).
 * We were guessing where a beat was. A blank line is not a guess — it is the model
 * telling us — so that is the only automatic split left. No beat marked, one text.
 *
 * Capped at TWO bubbles: each extra bubble is another send round-trip plus
 * MESSAGE_BUBBLE_DELAY_MS before the reply finishes landing (#62 — 3-4 paragraph
 * replies took sendMs from 399ms to ~1,600ms median). The first bubble still goes
 * out at the same moment it would have as a single message, so nothing is slower
 * to START.
 */
function autoSplit(text: string): string[] {
  // Checkout/payment links stay whole on EVERY path. A link that lands as its own
  // bubble can fail independently of the sentence that sets it up, and that costs a
  // conversion — so this guard runs before the blank-line split, not after it.
  if (/https?:\/\//i.test(text)) return [text];

  // The model's OWN beat marker. Measured 2026-07-30: asked haiku four unrelated
  // questions through the real coaching prompt and it separated its beats with a
  // blank line every single time — in exactly the places a person would send a
  // second text:
  //     "40. born in '84."  ⏎⏎  "why, what's the connection?"
  // Two paragraphs it wrote as two thoughts survive being sent as two texts. Half a
  // paragraph does not.
  const paragraphs = text
    .split(/\n[ \t]*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return capAuto(paragraphs);

  // One paragraph is one text.
  return [collapseSelfRepeat(text)];
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
 * - With NO marker, splits on a blank line only — the model's own beat break,
 *   max 2. Anything the model wrote as one paragraph stays one text.
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
