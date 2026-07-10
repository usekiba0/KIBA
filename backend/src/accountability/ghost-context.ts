/**
 * Ghost context-suppression (Karibi Conversation Overhaul 2026-07-10, Rule 13 /
 * Engineering Fix #1).
 *
 * A ghost re-engagement message must never contradict what the user JUST told
 * KIBA. In the live test a user said "i'll lock in after the game" and got
 * guilt-blasted mid-game — the trigger fired blind to his own stated plan. The
 * fix is deterministic: if the user's last inbound message says they're
 * temporarily away and coming back ("after the game", "going to sleep", "at the
 * gym, talk later"), the missed-checkin ghost DEFERS once instead of firing, so
 * it never talks over a plan KIBA itself acknowledged.
 *
 * This is a pure, conservative detector: it only matches CLEAR "I'm away / back
 * later" signals. A false positive costs one deferred ghost (~3h of quiet); a
 * false negative just falls back to today's behavior. We bias toward not
 * matching when unsure.
 */

// Explicit "temporarily away, will be back" phrases. Word-boundary anchored so
// "gn" doesn't match inside "morning" and "brb" doesn't match "verb".
const STATED_RETURN_PATTERNS: RegExp[] = [
  // be-back-later / see-you-later family
  /\bbrb\b/,
  /\bbbl\b/,
  /\bttyl\b/,
  /\bgtg\b/,
  /\bg2g\b/,
  /\b(be\s+right\s+back|back\s+in\s+a\b|back\s+later|be\s+back)\b/,
  /\b(talk|text|hit|catch|holla|hmu)\s+(you|u|ya|me)?\s*(back\s+)?later\b/,
  /\b(talk|text|hit|catch)\s+(you|u|ya)\s+(in\s+a\b|after\b|when\b)/,
  /\b(i'?ll|ima|imma|finna|about\s+to|bout\s+to|gonna)\s+.*\b(later|after|tonight|tmrw|tomorrow)\b/,
  // going to sleep family
  /\b(going|go|heading|head|off)\s+(to\s+)?(sleep|bed)\b/,
  /\b(finna|bout\s+to|about\s+to|ima|imma|gonna)\s+(sleep|crash|nap|pass\s+out|lay\s+down)\b/,
  /\b(goodnight|good\s+night|gnite|goodnite)\b/,
  /\bgn\b/,
  /\bnight\s+night\b/,
  // stated return time / event the user will be back after
  /\bafter\s+(the\s+)?(game|match|gym|workout|work|shift|class|meeting|practice|dinner|lunch|this|that|show|movie|nap|call)\b/,
  /\block(ing)?\s+in\s+after\b/,
  /\b(once|when)\s+i'?m\s+(done|back|free|finished|out)\b/,
  // occupied-right-now family (implies not-ignoring, will return)
  /\b(at\s+(the\s+)?(gym|work|dinner|lunch|practice|game|office))\b/,
  /\b(in\s+(a\s+)?(meeting|class|the\s+gym))\b/,
  /\b(driving|at\s+the\s+wheel|on\s+the\s+road)\b/,
  /\b(busy|swamped|slammed|tied\s+up)\s+(rn|right\s+now|atm|at\s+the\s+moment)\b/,
  /\b(watching|at)\s+(the\s+)?(game|match)\b/,
];

/**
 * True when the message clearly states the user is temporarily away and will be
 * back (a return time / reason), so a ghost ping right now would contradict it.
 */
export function statesTemporaryReturn(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return STATED_RETURN_PATTERNS.some((re) => re.test(t));
}
