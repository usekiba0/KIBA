/**
 * Deterministic guard against KIBA using something painful as leverage (INV-6).
 *
 * The doctrine is unusually blunt here, and says the same thing four times over
 * (Master 18, Master 32 §38–39, Legacy §22, Stress Test §26):
 *
 *   "Memory creates responsibility. Something being remembered does not make it
 *    fair game."
 *
 * Hard accountability is allowed and wanted. What is never allowed is reaching
 * for a breakup, a bereavement, a health scare, a money problem, body image or a
 * private confession to make a point land harder — or to close a sale. Master 32
 * lists exactly that as the line between tough love and cruelty, and Legacy §23
 * bans it again specifically for conversion.
 *
 * This is the guard where a miss costs the most. A stiff reply is a bad day; a
 * reply that turns someone's divorce into a motivational lever is the end of the
 * relationship, and quite possibly worse for them than for the product.
 *
 * PRECISION OVER RECALL, DELIBERATELY
 *
 * The trigger is not "a sensitive topic appeared". KIBA SHOULD talk about these
 * things — supportively, often, and at length. It fires only when a sensitive
 * topic shares a sentence with a pressure or ridicule frame, which is the shape
 * the doctrine actually forbids. Blocking the topic outright would break §12's
 * "be present during difficult moments", which matters just as much.
 */

/**
 * Categories the doctrine names explicitly as off-limits for leverage.
 *
 * Kept as topic words rather than per-user memories on purpose: the guard has to
 * work before any classifier or profile exists, and a user's worst moment is
 * usually described in exactly these terms.
 */
const SENSITIVE_TERMS: RegExp[] = [
  // relationship pain
  /\b(?:breakup|broke up|divorce|cheated on|left you|ex-?(?:wife|husband|girlfriend|boyfriend))\b/i,
  // bereavement and illness
  /\b(?:passed away|died|funeral|cancer|diagnosis|miscarriage|hospice|terminal)\b/i,
  // mental health
  /\b(?:depress(?:ed|ion)|anxiety|panic attack|therapy|therapist|suicid|self-?harm)\b/i,
  // body image
  /\b(?:overweight|obese|fat|skinny|ugly|disgusting|body image)\b/i,
  // money trouble
  /\b(?:bankrupt|evicted|broke af|can'?t afford|in debt|laid off|fired from)\b/i,
  // addiction and relapse. Inflections matter here: a bare /\brelapse\b/ misses "relapsed",
  // which is the form people actually use about themselves.
  /\b(?:addict(?:ed|ion)|relapse[ds]?|relapsing|rehab|sober|drinking problem|porn)\b/i,
  // confession framing
  /\b(?:i'?ve never told|never told anyone|embarrassed about|ashamed of)\b/i,
];

/**
 * Frames that turn a reference into leverage: mockery, or pressure.
 *
 * Note what is absent — sympathy, questions and offers of help. "how's your mum
 * doing after the funeral" contains a sensitive term and must sail through.
 */
const LEVERAGE_FRAMES: RegExp[] = [
  // ridicule
  /\b(?:lol|lmao|😂|💀|haha)\b/i,
  /\b(?:remember when|like when|same as when|just like your)\b/i,
  // pressure and threat
  /\b(?:don'?t (?:you )?(?:want|remember)|is that what you want|back to being|end up like)\b/i,
  /\b(?:that'?s why|this is why|no wonder)\b/i,
  // conversion leverage
  /\b(?:without me|need me|if you (?:really )?cared|you'?ll (?:fail|slip|relapse))\b/i,
  /\b(?:upgrade|subscribe|pro|checkout|payment)\b/i,
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface SensitiveUseResult {
  /** True when at least one sentence pairs a sensitive topic with a leverage frame. */
  weaponised: boolean;
  /** The offending sentences, for logging and for the regression suite. */
  offending: string[];
}

/**
 * Does this reply use something painful as leverage?
 *
 * Returns the finding rather than a rewritten reply. Unlike a false reminder
 * claim, this cannot be safely repaired by deleting a sentence: the surrounding
 * turn was built around the leverage, and what is left reads as a non-sequitur.
 * The correct response is to regenerate, which is the caller's decision to make.
 */
export function detectWeaponisedMemory(reply: string): SensitiveUseResult {
  const offending = sentences(reply).filter(
    (s) => SENSITIVE_TERMS.some((t) => t.test(s)) && LEVERAGE_FRAMES.some((f) => f.test(s)),
  );

  return { weaponised: offending.length > 0, offending };
}

/**
 * Steer appended to a regeneration attempt after a hit.
 *
 * Names the rule rather than the sentence: telling the model "don't say X" tends
 * to produce a paraphrase of X, whereas naming the principle moves it off the
 * approach entirely.
 */
export const SENSITIVE_MEMORY_RETRY_NOTE =
  'that reply used something personal they told you in confidence as leverage. never do that. ' +
  'challenge the behaviour, the excuse or the choice. never their worth, their pain, their body, ' +
  'their money or anything they confessed to you. write it again without it.';
