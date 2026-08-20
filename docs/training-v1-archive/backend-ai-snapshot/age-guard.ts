/**
 * Deterministic block on selling a subscription to a self-declared minor
 * (thread audit 2026-07-31).
 *
 * Observed on the test phone, 2026-07-30:
 *
 *   15:47Z  user: "I'm 5\"6 and 9 years old I play PG"
 *   15:48Z  KIBA correctly challenged a bogus height, user re-confirmed "9"
 *   21:03Z  KIBA: "bet. tap this and we start tonight:" + Stripe checkout link
 *   21:07Z  user: "I'm only nine I don't have money 😭"
 *   21:07Z  KIBA: "lol fair - your parents handle it. show them the link,
 *                  they tap it, and you're good."
 *
 * That was the client role-playing, not a real child — but nothing in the
 * product stopped it, and a real under-13 signup is both a COPPA problem and a
 * payment-authorization problem (a 9-year-old cannot agree to a recurring
 * charge). The intake had no age gate at all; `coaching.prompt.ts` even records
 * "We never collect age", so the only signal is what the user volunteers.
 *
 * Scope, deliberately: this blocks the CHECKOUT LINK only. It does not end the
 * conversation or stop KIBA helping — the 9-year-old was getting a genuinely
 * good shooting progression, and yanking that is a worse outcome than the thing
 * we are preventing. Whether an under-13 should be allowed to keep a thread open
 * at all is a COPPA data-collection question for the founder, not one to settle
 * silently in a guard.
 */

/** Under this age we will not sell. 18 is the contract-capacity line, not COPPA's 13. */
const ADULT_AGE = 18;

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
};
const WORDS = Object.keys(WORD_NUMBERS).join('|');

/**
 * Each pattern must capture an age in group 1. They all require an explicit age
 * marker ("years old", "yo") or the word "only" — a bare "i'm 9" is NOT enough,
 * because "i'm 9 lbs down", "i'm 5'9", "i'm 9 months in" and "i'm up at 9" are
 * all ordinary things people say.
 */
const AGE_PATTERNS: RegExp[] = [
  // "9 years old", "12-year-old", "15 yrs old"
  new RegExp(String.raw`(\d{1,2})\s*[-\s]?\s*(?:year|yr)s?\s*[-\s]?\s*old`, 'gi'),
  // "9yo", "12 y/o", "15 y.o."
  new RegExp(String.raw`(\d{1,2})\s*y\.?\s*[/.]?\s*o\.?(?![a-z])`, 'gi'),
  // "nine years old"
  new RegExp(String.raw`\b(${WORDS})\s+(?:year|yr)s?\s*[-\s]?\s*old`, 'gi'),
  // "i'm only 9", "im only nine" — "only" is the giveaway; nobody says it at 34.
  // Both apostrophes: iMessage sends the curly one and every real thread has it.
  new RegExp(String.raw`\b(?:i['’]?m|i\s+am)\s+only\s+(\d{1,2}|${WORDS})\b`, 'gi'),
  // "just turned 12", "turning 15"
  new RegExp(String.raw`\b(?:just\s+turned|turning|turned)\s+(\d{1,2}|${WORDS})\b`, 'gi'),
];

/**
 * Someone else's age, not the speaker's. "my son is 9 years old" from a paying
 * parent must not block that parent's own checkout.
 */
const THIRD_PARTY =
  /\b(?:my\s+(?:son|daughter|kid|kids|child|children|nephew|niece|brother|sister|cousin|friend|student|client|player)|his|her|their|he['’]?s|she['’]?s|they['’]?re)\b[^.!?]{0,40}$/i;

const toAge = (raw: string): number | null => {
  const lower = raw.toLowerCase();
  if (lower in WORD_NUMBERS) return WORD_NUMBERS[lower];
  const n = Number.parseInt(lower, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Scan one message for a first-person age claim below {@link ADULT_AGE}.
 * Returns the age, or null when nothing credible is found.
 */
export function detectDeclaredMinorAge(text: string): number | null {
  if (typeof text !== 'string' || !text) return null;

  let youngest: number | null = null;
  for (const pattern of AGE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      // Look at what came immediately before: "my son is 9 years old" is not a
      // claim about the person texting.
      if (THIRD_PARTY.test(text.slice(0, m.index))) continue;

      const age = toAge(m[1]);
      // 0 is a parse artefact, not an age. >= ADULT_AGE is an adult saying so.
      if (age === null || age < 1 || age >= ADULT_AGE) continue;
      if (youngest === null || age < youngest) youngest = age;
    }
  }
  return youngest;
}

/**
 * The age may have been stated many turns before the close — the 2026-07-30
 * thread declared it at 15:47Z and reached checkout at 21:03Z — so the whole
 * user side of the conversation is in scope, not just this turn.
 */
export function declaredMinorAgeInThread(
  incomingText: string,
  recentMessages: ReadonlyArray<{ role: string; content: string }>,
): number | null {
  let youngest = detectDeclaredMinorAge(incomingText);
  for (const m of recentMessages) {
    if (m.role !== 'user') continue;
    const age = detectDeclaredMinorAge(m.content);
    if (age !== null && (youngest === null || age < youngest)) youngest = age;
  }
  return youngest;
}

/**
 * Handed to the model in place of the checkout link. Written as an instruction
 * with a concrete line to say — a bare refusal makes it improvise, and the
 * failure mode we are fixing was improvisation ("your parents handle it").
 */
export function ageBlockedNote(age: number): string {
  return `they've told you they're ${age} — under 18. do NOT send a checkout link, do NOT ask them to get a parent to tap it, and do NOT bring up price or signing up again. a kid cannot agree to a recurring charge and it is not their job to sell their parents on one. say something like: "hold up - you're ${age}, so i can't sign you up. that's a parent thing. but i'm not going anywhere: tell me how the sessions go and i'll keep building your plan." then KEEP HELPING them for free, exactly as you have been. their plan, their progression, their questions — all of it stays.`;
}
