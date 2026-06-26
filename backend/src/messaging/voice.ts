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
 * Emoji / skin-tone / ZWJ / variation-selector / regional-indicator ranges —
 * the pictographic characters KIBA reaches for (😎 🔥 😂 😭 😈 💀 🙏 😤 👀 👆 …).
 * Plain ASCII and normal punctuation are untouched.
 */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}]/gu;

/**
 * Filler openers Karibi has flagged in EVERY intake review ("love it, ..." —
 * also "love that / great / perfect / awesome / nice ..."). Matched only at the
 * very start of a reply or right after a [pause] marker so mid-sentence uses
 * ("i love this gym") survive.
 */
const LEADING_FILLER_RE =
  /(^|\[pause\]\s*)(?:i\s+)?(?:love\s+(?:it|that|this)|great|perfect|awesome|amazing|sweet|beautiful|excellent|fantastic|wonderful)\s*[,.!]+\s*/gi;

/**
 * Intake-only scrub, layered ON TOP of humanizeVoice. The sign-up flow is where
 * Karibi repeatedly flagged two tics that prompt rules never killed for good
 * (2026-06-26): decorative emoji bolted onto a greeting/name ("yo what's up 😎",
 * "yo Karibi 🔥") and the filler opener "love it, ...". We kill both
 * deterministically here so they can NEVER reach the phone, regardless of prompt
 * drift. Post-pay coaching is deliberately untouched — it keeps natural, mirrored
 * emoji. The `[pause]` burst marker is preserved.
 */
export function scrubIntakeVoice(text: string): string {
  if (!text) return text;
  // Drop the filler opener (keeping any [pause] marker that preceded it).
  let t = text.replace(LEADING_FILLER_RE, '$1');
  // Strip emoji.
  t = t.replace(EMOJI_RE, '');
  // Tidy the gaps the removals leave: doubled spaces, a space before punctuation.
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?])/g, '$1');
  // Trim each [pause]-separated bubble without dropping the markers themselves.
  t = t
    .split(/(\[pause\])/i)
    .map((s) => (/^\[pause\]$/i.test(s) ? s : s.replace(/^[ \t]+|[ \t]+$/g, '')))
    .join('');
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
  // List markers the model may use (*, +, or a unicode bullet •·‣▪) -> a plain
  // dash bullet, which is how KIBA is told to format lists.
  t = t.replace(/^([ \t]*)[*+][ \t]+/gm, '$1- ');
  t = t.replace(/[•·‣▪]\s*/g, '- ');
  // Any asterisk left over (unpaired emphasis, stray bullet) would still render
  // raw on a phone, so drop it. Multiplication math in texts is negligible here.
  t = t.replace(/\*/g, '');
  return t;
}
