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
 * Below this, a reply is already one natural text. Tomo's opener ("yooo, what's
 * the move today?", 28 chars) shipped as its own bubble, but only because a
 * SECOND thought followed it — a short reply with nothing after it is one text.
 */
const AUTO_SPLIT_MIN_CHARS = 80;
/** Neither half may be shorter than this — a 4-char orphan reads like a glitch. */
const AUTO_SPLIT_MIN_PART = 12;

/**
 * Index just past the first usable sentence boundary, or null if there isn't one.
 *
 * Deliberately conservative — every `continue` here is a case where splitting
 * would read worse than not splitting:
 *  - `...` / `?!` — trailing off is a single beat, not two (the prompt allows it).
 *  - abbreviations (`a.m.`, `e.g.`) — the dot isn't a sentence end.
 *  - a fragment on either side — see AUTO_SPLIT_MIN_PART.
 */
function firstSentenceBreak(text: string): number | null {
  const re = /[.!?]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length > 1) continue; // "..." or "?!" — one beat
    const end = m.index + 1;
    if (end >= text.length) break; // punctuation ends the reply: nothing to split
    if (!/\s/.test(text[end])) continue; // needs whitespace after to be a break

    const lastToken = text.slice(0, m.index).split(/\s+/).pop() ?? '';
    // "a" in "a.m." / "e.g" — a dot inside the token means abbreviation, not sentence.
    if (lastToken.length < 2 || lastToken.includes('.')) continue;

    const head = text.slice(0, end).trim();
    const tail = text.slice(end).trim();
    if (head.length < AUTO_SPLIT_MIN_PART || tail.length < AUTO_SPLIT_MIN_PART) continue;
    if (/^[\s.,!?;:)\]]/.test(tail)) continue; // tail must start a real thought

    return end;
  }
  return null;
}

/**
 * Split a marker-less reply into "first beat, then the rest".
 *
 * WHY THIS EXISTS: the `[pause]` marker below is a PROMPT-only instruction, and
 * prod measured it firing on 1 of 151 replies (2026-07-30) — 99.3% of replies
 * shipped as a single block while the prompt said "2 bubbles is the norm". That
 * is the same failure mode as every other prompt-only guard on haiku-4-5, so the
 * behaviour moves into code and `[pause]` stays as the model's explicit override.
 *
 * Capped at TWO bubbles on purpose: the prompt calls 2 the norm, and each extra
 * bubble is another send round-trip plus MESSAGE_BUBBLE_DELAY_MS before the reply
 * finishes landing. The first bubble goes out at exactly the same moment it would
 * have as a single message, so nothing gets slower to START.
 */
function autoSplit(text: string): string[] {
  // Checkout/payment links stay whole on EVERY path. A link that lands as its own
  // bubble can fail independently of the sentence that sets it up, and that costs a
  // conversion — so this guard runs before the blank-line split, not after it.
  if (/https?:\/\//i.test(text)) return [text];

  // The model's OWN beat marker, and the better signal. Measured 2026-07-30: asked
  // four unrelated questions, haiku separated its beats with a blank line every
  // single time — in exactly the places a person would send a second text:
  //     "40. born in '84."  ⏎⏎  "why, what's the connection?"
  // Prefer it over the sentence heuristic below: it is the model's intent rather
  // than our guess at it, and on a three-beat reply it gets all the breaks where a
  // first-sentence split would only ever get the first one.
  const paragraphs = text
    .split(/\n[ \t]*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  // No blank line: fall back to "first sentence, then the rest".
  if (text.length < AUTO_SPLIT_MIN_CHARS) return [text];
  // A plan/list is one structure — splitting it strands the intro from its items.
  if (/^\s*[-•*]\s/m.test(text)) return [text];

  const at = firstSentenceBreak(text);
  if (at === null) return [text];
  return [text.slice(0, at).trim(), text.slice(at).trim()];
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
 * - With NO marker, falls back to a deterministic first-sentence split (max 2) —
 *   see autoSplit; the marker alone left 99.3% of replies as one block.
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
