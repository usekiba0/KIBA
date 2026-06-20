/**
 * Deterministic cleanup of KIBA's outbound voice, applied to every AI reply at
 * the send chokepoint so prompt drift can't make messages read like formal
 * writing instead of real texting.
 *
 * Does two things:
 *  1. Strips markdown the model sometimes emits (*bold*, `code`, ## headings).
 *     SMS/iMessage have no markdown, so it renders as literal asterisks/ticks on
 *     the phone — Karibi flagged the raw asterisks (2026-06-20). We deal in plain
 *     text only; real "- " bullets are kept.
 *  2. Converts em/en dashes — which the model leans on heavily and which Karibi
 *     flagged as un-human (2026-06-05) — into clean sentence breaks. Regular
 *     hyphens (tough-love, lock-in, 9-5, check-in) are deliberately left untouched.
 */
export function humanizeVoice(text: string): string {
  if (!text) return text;

  let t = stripMarkdown(text);

  // Em (—) / en (–) dash, with whatever spacing, becomes a sentence break.
  t = t.replace(/\s*[—–]\s*/g, '. ');

  // Tidy artifacts the swap can leave next to existing punctuation:
  //   "ready? . go"  -> "ready? go"      (punctuation already there)
  //   "go. . next"   -> "go. next"       (doubled period)
  t = t.replace(/([.!?,;:])\s*\.\s+/g, '$1 ');
  t = t.replace(/\.\s*\.\s*/g, '. ');
  t = t.replace(/[ \t]{2,}/g, ' ');

  return t.trim();
}

/**
 * Remove markdown formatting that renders as literal characters on SMS/iMessage.
 * Keeps the inner text, drops the syntax. Plain hyphen bullets are preserved
 * (and `*`/`+` bullets are normalised to `-`, which is how KIBA is told to
 * format lists). The `[pause]` burst marker contains no markdown chars, so it
 * passes through untouched.
 */
function stripMarkdown(input: string): string {
  let t = input;
  // Fenced code blocks then inline code: drop the backticks, keep the content.
  t = t.replace(/```+/g, '');
  t = t.replace(/`([^`]+)`/g, '$1');
  // Bold/italic (**x**, *x*) and strikethrough (~~x~~): keep the inner text.
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/\*([^*\n]+)\*/g, '$1');
  t = t.replace(/~~([^~]+)~~/g, '$1');
  // Markdown headings at line start: "## Title" -> "Title".
  t = t.replace(/^#{1,6}[ \t]+/gm, '');
  // List markers the model may use (* or +) -> a plain dash bullet.
  t = t.replace(/^([ \t]*)[*+][ \t]+/gm, '$1- ');
  // Any asterisk left over (unpaired emphasis, stray bullet) would still render
  // raw on a phone, so drop it. Multiplication math in texts is negligible here.
  t = t.replace(/\*/g, '');
  return t;
}
