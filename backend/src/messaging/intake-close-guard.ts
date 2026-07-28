/**
 * Deterministic guard against the IDENTITY REFERENDUM at intake closes.
 *
 * The pattern — ending a challenge or close by asking whether the user REALLY
 * means it ("you really wanna do this or you just testing?") — was hard-banned
 * in the first retraining doc as part of the dark-pattern cluster. It was
 * suppressed in emotional-handling contexts and then survived inside CLOSING
 * contexts, where Training Doc v2 caught it four more times across two graded
 * tests. A second prompt-only ban was added on 2026-07-29 and the live sim still
 * produced "you ready to lock this in?" on the very first run.
 *
 * So this stops being a persuasion problem and becomes an enforcement one — the
 * same call this codebase already made for em-dashes (voice.ts), false reminder
 * claims (reminder-claim-guard.ts), fabricated time gaps (time-claim-guard.ts)
 * and question loops (question-loop.ts). When a rule must hold 100% of the time,
 * a regex holds it; the prompt only has to make the good version likely.
 *
 * WHY IT MATTERS: the user has just opened up about their kid, their dad, a
 * brother who died. Answering that with a loyalty test reads as betrayal, and it
 * invites a "no" at the exact moment the answer should be assumed. Removing the
 * question leaves the message ending on the callback, which is the strongest
 * line in it anyway ("end on insight, not a CTA").
 *
 * DELIBERATELY NOT BANNED: "you in?" — a short, warm commit question that the
 * training doc itself uses in its model-answer close. The referendum is asking
 * them to prove they mean it, not asking them to say yes.
 */

/**
 * Trailing readiness-referendum questions. Each must match a question that
 * interrogates COMMITMENT ITSELF rather than a concrete detail — "what time you
 * want the check-in?" and "you in?" are both fine and must survive.
 */
const REFERENDUM_PATTERNS: RegExp[] = [
  // "...or are you still testing it out?" / "...or you still thinking about it?"
  // / "...or you testing the waters?" — the "still"/"just" is OPTIONAL. The live
  // sim produced "you actually wanna get out of that cycle, or you testing the
  // waters?", which the first version of this pattern missed for want of it.
  /\b(?:you|u)\b[^.!?]*\bor\s+(?:are\s+)?(?:you|u)\s+(?:still\s+|just\s+)?(?:testing|thinking\s+about|playing|considering|second[\s-]?guessing)/i,
  // "you wanna lock this in or nah?" / "you down to do it or what?"
  /\b(?:you|u)\s+(?:really\s+)?(?:wanna|want\s+to|down\s+to|gonna|ready\s+to)\b[^.!?]*\bor\s+(?:nah|not|what)\b/i,
  // "you ready to lock that in?" / "you really ready to cut the drinking?"
  /\b(?:you|u)\s+(?:really\s+)?ready\s+to\b/i,
  // "are you serious or just interested" / "are you actually ready"
  /\bare\s+(?:you|u)\s+(?:actually\s+|really\s+)?(?:serious|ready|committed)\b/i,
  // "you wanna lock this in?" — the bare form, no "or nah".
  /\b(?:you|u)\s+(?:wanna|want\s+to)\s+lock\s+(?:this|that|it)\s+in\b/i,
  // "you down to actually do it?"
  /\b(?:you|u)\s+down\s+to\s+(?:actually\s+)?do\s+(?:it|this|that)\b/i,
  // "you gonna follow through or nah"
  /\b(?:you|u)\s+gonna\s+follow\s+through\b/i,
  // "no half measures" / "no half stepping" — the shame-flavoured dare.
  /\bno\s+half\s+(?:measures|stepping|steppin)\b/i,
  // "you sure you wanna do this?"
  /\b(?:you|u)\s+sure\s+(?:you|u)\s+(?:wanna|want\s+to)\b/i,
];

/** Split a message into its sentence-ish units, keeping their terminators. */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?') {
      out.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function isReferendum(sentence: string): boolean {
  return REFERENDUM_PATTERNS.some((re) => re.test(sentence));
}

/**
 * Strip a TRAILING identity-referendum question from an intake reply.
 *
 * Only the tail is examined: the referendum's harm is that it's the last thing
 * they read and the thing they must answer. A mid-message mention (e.g. KIBA
 * quoting the user, or explaining itself) is left alone.
 *
 * Operates per-bubble, since intake replies can carry [pause] burst markers and
 * only the final bubble is the one they answer.
 *
 * NON-DESTRUCTIVE: if removing the question would empty the message, the
 * original is returned untouched. Sending a flawed message always beats sending
 * nothing — the same fallback rule the intake reply path already follows.
 */
export function stripIdentityReferendum(text: string): string {
  if (!text || !text.trim()) return text;

  const bubbles = text.split('[pause]');
  const lastIdx = bubbles.length - 1;
  const last = bubbles[lastIdx];

  const sentences = splitSentences(last);
  if (sentences.length === 0) return text;

  // Walk backwards over trailing referendum sentences — the model sometimes
  // stacks two ("you ready? you sure?").
  let end = sentences.length;
  while (end > 0 && isReferendum(sentences[end - 1])) end--;
  if (end === sentences.length) return text; // nothing to strip

  const kept = sentences.slice(0, end).join('').trimEnd();

  if (kept.length === 0) {
    // The whole final bubble was the referendum. Drop the bubble entirely — but
    // only if an earlier bubble survives to carry the message.
    if (lastIdx > 0) {
      const remaining = bubbles.slice(0, lastIdx).join('[pause]').trimEnd();
      return remaining.length > 0 ? remaining : text;
    }
    return text; // single-bubble message that is nothing but the referendum
  }

  bubbles[lastIdx] = kept;
  return bubbles.join('[pause]');
}

/** True when the text ends on a readiness referendum. Exported for logging/tests. */
export function hasTrailingIdentityReferendum(text: string): boolean {
  return stripIdentityReferendum(text) !== text;
}
