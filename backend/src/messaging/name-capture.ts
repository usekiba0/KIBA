/**
 * Deterministic name capture (2026-07-29).
 *
 * The name only ever reached the database if the model remembered to call
 * save_intake_field("name", ...). On Karibi's own live thread it didn't: KIBA
 * asked "what's your name tho?", he answered "Karibi", KIBA said the name back
 * to him — and `users.name` stayed NULL. That is not a cosmetic miss. The intake
 * recovery nudge gates on NAME (see intake-nudge.ts, the wrong-number guard), so
 * a lead whose name never persisted can never be chased: they drop out of the
 * funnel permanently and silently.
 *
 * Same shape as parseCityOffset / parseReminderTime: the server does the capture,
 * the model's tool call stays as the fallback for phrasings we don't recognise.
 *
 * This writes a real column from a stranger's first-ever text, so it is
 * deliberately narrow — it only fires when KIBA JUST asked for the name, and only
 * when the answer actually looks like one. A miss costs us the tool-call path we
 * already had; a false positive puts a wrong name in every message KIBA sends.
 */

/** KIBA's ways of asking. Only a reply to one of these is a naming turn. */
const NAME_ASK_RE =
  /(what'?s? your name|your name tho|you got a name|got a name for me|what do i call you|what should i call you|who am i (talking|speaking) to|what'?s? the name)/i;

/**
 * Lead-ins people put in front of the actual name. Stripped before we look at
 * what's left, so "my name is Karibi" and "Karibi" both land on "Karibi".
 */
// Longest alternatives first — "my name" would otherwise win over "my name is"
// and leave a stray "is" glued to the front of the name.
const LEAD_IN_RE =
  /^(?:(?:hey|yo|hi|hello|sup|aye)[\s,]+)?(?:my name is|my name'?s|the name is|the name'?s|name is|name'?s|you can call me|they call me|call me|this is|it'?s|its|i'?m|im)\s+/i;

/**
 * Words that are never the answer, even when they arrive shaped like one. Covers
 * refusals ("nah", "why"), filler ("bro", "lol"), and — critically — the carrier
 * keywords: a STOP reply must never be written into the database as someone's
 * name.
 */
const NOT_A_NAME = new Set([
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'help', 'info', 'start', 'unstop',
  'yes', 'yeah', 'yep', 'ya', 'no', 'nah', 'nope', 'none', 'nothing', 'never', 'idk',
  'why', 'what', 'who', 'how', 'when', 'where', 'huh', 'wtf', 'lol', 'lmao', 'haha',
  'ok', 'okay', 'k', 'sure', 'fine', 'bet', 'aight', 'cool', 'word', 'facts',
  'bro', 'bruh', 'man', 'dude', 'sis', 'fam', 'homie', 'boss', 'chief', 'sir', 'maam',
  'hey', 'hi', 'hello', 'yo', 'sup', 'wassup', 'whatsup',
  'me', 'you', 'him', 'her', 'them', 'us', 'myself', 'anonymous', 'secret', 'private',
  'test', 'testing', 'kiba', 'first', 'last', 'name', 'nvm', 'later', 'skip', 'pass',
]);

/** A token that could be part of a real name: letters, plus the joiners names use. */
const NAME_TOKEN_RE = /^[a-z][a-z'’.-]*$/i;

/** Long enough for "Mary-Jane O'Sullivan", short enough to reject a sentence. */
const MAX_NAME_LENGTH = 40;
const MAX_TOKENS = 3;

/** Did KIBA's previous message actually ask for the name? */
export function isNameAsk(aiMessage: string | null | undefined): boolean {
  return !!aiMessage && NAME_ASK_RE.test(aiMessage);
}

/**
 * The name in `body`, or null when it doesn't confidently look like one.
 * Casing is preserved as typed — KIBA mirrors how the user writes.
 */
export function parseNameAnswer(body: string): string | null {
  const cleaned = body
    .replace(/[“”"']/g, (m) => (m === "'" ? "'" : ''))
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim();
  if (!cleaned || cleaned.length > MAX_NAME_LENGTH) return null;

  // Digits, links and @handles mean this is an address, a time, or a question —
  // never a name we should write.
  if (/[0-9@:/\\]/.test(cleaned)) return null;

  const stripped = cleaned.replace(LEAD_IN_RE, '').trim();
  if (!stripped) return null;

  const tokens = stripped.split(/\s+/);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) return null;

  for (const token of tokens) {
    if (!NAME_TOKEN_RE.test(token)) return null;
    const bare = token.replace(/[^a-z]/gi, '').toLowerCase();
    // A single-letter token is an initial at best and a typo at worst.
    if (bare.length < 2) return null;
    if (NOT_A_NAME.has(bare)) return null;
  }

  return tokens.join(' ');
}

/**
 * The whole rule: capture only on a reply to a name ask, from a lead who has no
 * name yet. Pure so the judgement calls are testable rather than buried in the
 * processor.
 */
export function captureNameFromReply(
  body: string,
  lastAiMessage: string | null | undefined,
  existingName: string | null | undefined,
): string | null {
  if (existingName && existingName.trim()) return null;
  if (!isNameAsk(lastAiMessage)) return null;
  return parseNameAnswer(body);
}
