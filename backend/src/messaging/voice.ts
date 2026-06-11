/**
 * Deterministic cleanup of KIBA's outbound voice, applied to every AI reply at
 * the send chokepoint so prompt drift can't make messages read like formal
 * writing instead of real texting.
 *
 * Currently: converts em/en dashes — which the model leans on heavily and which
 * Karibi flagged as un-human (2026-06-05) — into clean sentence breaks. Regular
 * hyphens (tough-love, lock-in, 9-5, check-in) are deliberately left untouched.
 */
export function humanizeVoice(text: string): string {
  if (!text) return text;

  // Em (—) / en (–) dash, with whatever spacing, becomes a sentence break.
  let t = text.replace(/\s*[—–]\s*/g, '. ');

  // Tidy artifacts the swap can leave next to existing punctuation:
  //   "ready? . go"  -> "ready? go"      (punctuation already there)
  //   "go. . next"   -> "go. next"       (doubled period)
  t = t.replace(/([.!?,;:])\s*\.\s+/g, '$1 ');
  t = t.replace(/\.\s*\.\s*/g, '. ');
  t = t.replace(/[ \t]{2,}/g, ' ');

  return t.trim();
}
