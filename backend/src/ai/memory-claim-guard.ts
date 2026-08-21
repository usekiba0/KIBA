/**
 * Deterministic guard against KIBA inventing a memory (INV-2).
 *
 * The doctrine draws a precise line rather than banning recall outright
 * (Stress Test §7, "NEVER FAKE MEMORY"):
 *
 *   allowed  — "i remember we were working on retention"
 *   banned   — "you said you'd send 30 emails by friday", when nothing in the
 *              retrieved context says 30, or emails, or friday
 *
 * Vague recall is a relationship signal and is usually right even when fuzzy. A
 * SPECIFIC claim is different: the user takes it as fact about their own life,
 * and if it is wrong they learn that KIBA's memory cannot be trusted. Master 5
 * puts it plainly — trust can be lost in one contradiction.
 *
 * This is the same shape as `stripFalseReminderClaims`: the prompt already
 * forbids it, but that instruction runs against Haiku so it is soft. No model
 * call and no added latency.
 *
 * WHAT THIS DOES NOT DO
 *
 * It cannot know whether a remembered fact is TRUE — only whether the model was
 * given it this turn. A detail the model invents that happens to be correct will
 * pass, and a correct detail that was never retrieved will be stripped. The
 * second is the safe direction to err: KIBA asking "remind me what the number
 * was?" costs nothing, while KIBA confidently stating a number it made up is the
 * failure the client called out.
 */

/**
 * Openers that assert recall of something the user previously said or did.
 *
 * Narrow on purpose. Excluded:
 *  - "i remember" with no attribution ("i remember that being hard") — a feeling,
 *    not a claim about their words.
 *  - "you mentioned" alone, which is hedged enough to read as tentative.
 *  - anything in a question ("didn't you say 30?") — asking IS the correct
 *    behaviour when confidence is low, and flagging it would punish the fix.
 */
const RECALL_PATTERNS: RegExp[] = [
  /\byou (?:said|told me|promised|committed to|agreed to)\b/i,
  /\bi remember you (?:said|saying|told me|wanted|had)\b/i,
  /\blast (?:time|week|month) you\b/i,
  /\byou mentioned (?:that )?you\b/i,
  /\bwe (?:agreed|said|locked in|settled on)\b/i,
];

/** Sentence-ish split that keeps the delimiter out of the result. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Concrete details worth verifying: bare numbers, times, weekdays, months.
 *
 * Deliberately NOT proper nouns. Names are the most common thing KIBA legitimately
 * knows about a user, they arrive through many paths, and checking them produced
 * false positives on ordinary words that happen to be capitalised mid-sentence.
 */
const DETAIL_PATTERNS: RegExp[] = [
  /\b\d+(?:[.,]\d+)?\b/g,
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
];

function detailsIn(sentence: string): string[] {
  const found: string[] = [];
  for (const p of DETAIL_PATTERNS) {
    for (const m of sentence.match(p) ?? []) found.push(m.toLowerCase());
  }
  return [...new Set(found)];
}

export function claimsSpecificRecall(text: string): boolean {
  return sentences(text).some(
    (s) => RECALL_PATTERNS.some((p) => p.test(s)) && detailsIn(s).length > 0,
  );
}

export interface MemoryClaimResult {
  reply: string;
  /** Sentences removed, for logging. Empty when nothing was stripped. */
  stripped: string[];
}

/**
 * Remove attributed-recall sentences whose concrete details are absent from the
 * context the model was actually given.
 *
 * `context` should be everything factual the turn had available — retrieved
 * memories, goals, open loops, recent messages. Anything the model could
 * legitimately have read. When in doubt pass more: a detail present in context is
 * always allowed through, so a generous context only reduces false positives.
 *
 * If stripping would empty the reply, the reply is left ALONE. A guard that
 * silences KIBA is worse than the claim it was trying to remove — the 2026-07-29
 * recap bug was exactly that: a fix that stopped KIBA saying something false
 * turned into KIBA saying nothing, and silence never shows up in logs.
 */
export function stripFalseMemoryClaims(reply: string, context: string): MemoryClaimResult {
  if (!reply.trim()) return { reply, stripped: [] };

  const haystack = context.toLowerCase();
  const kept: string[] = [];
  const stripped: string[] = [];

  for (const sentence of sentences(reply)) {
    const isRecall = RECALL_PATTERNS.some((p) => p.test(sentence));
    if (!isRecall) {
      kept.push(sentence);
      continue;
    }

    const details = detailsIn(sentence);
    // Vague recall with no specifics is explicitly allowed by the doctrine.
    if (details.length === 0) {
      kept.push(sentence);
      continue;
    }

    const unsupported = details.filter((d) => !haystack.includes(d));
    if (unsupported.length === 0) kept.push(sentence);
    else stripped.push(sentence);
  }

  const rebuilt = kept.join(' ').trim();
  if (!rebuilt) return { reply, stripped: [] };

  return { reply: rebuilt, stripped };
}
