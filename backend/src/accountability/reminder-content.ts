/**
 * Content rules for RECURRING reminders (Karibi 2026-07-21).
 *
 * A daily reminder's text is frozen when it's created and then replayed every
 * morning forever. That makes any day-specific or single-use wording a bug with
 * a very long tail. Three live chains on one account showed exactly this:
 *
 *   09:00 daily  "yo. leg day starts now…"          → said "leg day" 7 days a week
 *   09:00 daily  "Therefore do not worry…" Mt 6:34  → same verse every morning
 *   09:00 daily   Therefore do not worry…  Mt 6:34  → and again, unquoted
 *
 * The user had asked for "a bible verse every morning". The model satisfied it
 * by baking ONE verse into a repeating reminder, which is the opposite of the
 * feature — the curated rotation in `faith-content.ts` exists precisely so the
 * verse changes and is never model-authored (misquoted scripture on a faith
 * feature is worse than a duplicate).
 *
 * This is a deterministic gate, not a prompt rule, because the prompt already
 * carried the instruction and the model broke it anyway.
 */

/** Book chapter:verse — "Matthew 6:34", "1 Corinthians 15:58", "Ps 23:1". */
const SCRIPTURE_REF = /\b(?:[1-3]\s*)?[A-Z][a-z]{1,14}\.?\s+\d{1,3}:\d{1,3}\b/;

const WEEKDAY = /\b(mon|tues?|wed(nes)?|thur?s?|fri|sat(ur)?|sun)(day)?\b/i;

/** "leg day", "push day", "upper day", "rest day", … */
const SPLIT_DAY =
  /\b(leg|legs|push|pull|arm|arms|chest|back|upper|lower|rest|cardio|shoulder|shoulders)\s+day\b/i;

export type RecurringContentVerdict = { ok: true } | { ok: false; error: string };

/**
 * Vet the body of a DAILY reminder. The error strings are written for the model
 * to act on — it sees them as a tool_result and gets another iteration, so each
 * one names the fix rather than just refusing.
 */
export function validateRecurringMessage(message: string): RecurringContentVerdict {
  const text = message ?? '';

  if (SCRIPTURE_REF.test(text)) {
    return {
      ok: false,
      error:
        'do not put a scripture quotation in a recurring reminder — the text is frozen and would repeat the SAME verse every single day. ' +
        'the daily verse is a built-in system feature with its own rotation. schedule a plain reminder that prompts the action instead ' +
        '(e.g. "time to read your bible. send proof when you\'re done.") and never write out the verse yourself.',
    };
  }

  if (SPLIT_DAY.test(text)) {
    return {
      ok: false,
      error:
        'a recurring reminder cannot name a specific training day ("leg day", "push day") — it repeats every day, so it would be wrong ' +
        'on every other day of the split. word it so it holds any day (e.g. "gym time. what are you hitting today?").',
    };
  }

  if (WEEKDAY.test(text)) {
    return {
      ok: false,
      error:
        'a recurring reminder cannot name a weekday — it fires every day, so the day name would be wrong six days out of seven. ' +
        'either drop the day name, or schedule a one-off reminder for that specific day instead.',
    };
  }

  return { ok: true };
}

/**
 * The two reminder shapes the coaching prompt mandates for every committed task
 * (`coaching.prompt.ts` PRE-TASK PING): a ping 30 min before, and a proof check
 * 15 min after. Re-committing a time produces a fresh pair — and nothing
 * cancelled the old pair, so they stacked. One afternoon of a user moving their
 * gym time around (6pm → 8:30 → 8 → 4:15) left this on the books:
 *
 *   20:45  "30 min till push. lock in. you got this."
 *   20:45  "30 min til push. you locked in?"
 *   20:45  "30 min till push day. get your gym bag ready and move out…"
 *   21:30  "push time was 15 min ago. proof?"
 *   21:30  "push time was 15 min ago. proof?"
 *
 * Exact-message dedup can't collapse those — the model re-words every time. The
 * signature keys on the STRUCTURE plus the activity noun, which is stable across
 * re-wordings, so a new ping for the same activity can supersede the old one.
 *
 * Returns null for anything that isn't one of the two mandated shapes. That is
 * the safety property: an unrecognized reminder is never superseded, because
 * silently dropping a reminder the user wanted is worse than one extra ping.
 */
export function reminderSignature(message: string): string | null {
  const text = (message ?? '').toLowerCase();

  const pre = text.match(/^\s*\d+\s*min(?:ute)?s?\s+(?:till|til|until|to)\s+([a-z]+)/);
  if (pre) return `pre:${stem(pre[1])}`;

  const proof = text.match(/\b([a-z]+)\s+time\s+was\s+\d+\s*min(?:ute)?s?\s+ago\b/);
  if (proof) return `proof:${stem(proof[1])}`;

  return null;
}

/**
 * True when a daily-task string is asking the user to DECIDE their recurring
 * schedule ("pick your PPL days and times", "set your workout schedule") rather
 * than to DO something. Those items go stale the moment the user answers, and
 * nothing marks them done, so the morning check-in reads them out forever.
 *
 * Requires both a decide-verb AND a schedule-noun so it can't swallow a real
 * task like "pick up groceries" or "choose a leg day exercise".
 */
const DECIDE_VERB = /\b(pick|choose|set|decide|lock in|figure out|nail down|plan out)\b/i;
const SCHEDULE_NOUN =
  /\b(ppl|split|schedule|days and times|training days|gym days|workout days)\b/i;

export function isSchedulingTask(task: string | null | undefined): boolean {
  const text = task ?? '';
  if (!text.trim()) return false;
  return DECIDE_VERB.test(text) && SCHEDULE_NOUN.test(text);
}

/** "legs" and "leg" are the same session; nothing else needs stemming here. */
function stem(word: string): string {
  return word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word;
}

/**
 * Are two free-form ONE-SHOT reminder texts the same intent? Used only when
 * they already share the exact fire minute — a typo re-confirm makes the model
 * schedule the same commitment twice with fresh wording (Karibi 2026-07-23:
 * "tailor pickup time…" 16s after "yo. tailor time…", both at 10am), and
 * `reminderSignature` only covers the structured pre/proof shapes.
 *
 * Grammar words and coaching filler ("time", "send", "proof" — present in
 * nearly every reminder) carry no intent, so the comparison runs on what's
 * left. Same safety posture as the signature: when in doubt (no content words,
 * low overlap) return false — an extra ping is visible, a silently dropped
 * reminder is not.
 */
const INTENT_STOPWORDS = new Set([
  // grammar
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'your',
  'you',
  'me',
  'my',
  'we',
  'us',
  'it',
  'its',
  'that',
  'this',
  'those',
  'these',
  'them',
  'they',
  'is',
  'are',
  'be',
  'was',
  'were',
  'do',
  'does',
  'did',
  'when',
  'what',
  'how',
  'go',
  'get',
  'got',
  'up',
  'out',
  'off',
  'now',
  'then',
  'so',
  'but',
  'if',
  'no',
  'not',
  'em',
  'yo',
  'ok',
  'okay',
  // coaching filler — in nearly every reminder body, proves nothing about intent
  'time',
  'done',
  'confirm',
  'send',
  'sent',
  'proof',
  'pic',
  'photo',
  'something',
  'shows',
  'show',
  'went',
  'min',
  'mins',
  'till',
  'til',
  'until',
  'ready',
  'morning',
  'tonight',
  'today',
  'tomorrow',
]);

function intentTokens(message: string): Set<string> {
  const tokens = (message ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !INTENT_STOPWORDS.has(w))
    .map(stem);
  return new Set(tokens);
}

export function sameIntentOneShot(a: string, b: string): boolean {
  const ta = intentTokens(a);
  const tb = intentTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.5;
}
