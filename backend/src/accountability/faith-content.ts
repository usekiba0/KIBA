/**
 * Per-goal value hook — FAITH (Karibi Conversation Overhaul 2026-07-10, Rule 5).
 *
 * When a user names a faith / "closer to god" goal, their morning check-in comes
 * with one verse + one affirmation ("head right first, then the work"). This is
 * the per-goal deliverable that makes the subscription worth more than reminders.
 *
 * DESIGN (deliberate, do not change without reading):
 * - The pool is a CURATED STATIC list. We NEVER LLM-generate scripture — a
 *   misquoted verse in front of a faith audience is brand death, and the doc's
 *   own anti-fabrication rule forbids it. Every entry is authored + cited so it
 *   can be verified.
 * - Selection is DETERMINISTIC per (user, local day): the same user gets the
 *   same verse all morning even if the job re-runs, and it rotates day to day.
 *   No Math.random / Date — the caller passes the local date key.
 *
 * FOUNDER: this is a STARTER pool in a common English (NIV-style) rendering.
 * Review it, swap to your preferred translation, and expand it — it's the single
 * source of truth and safe to edit freely. The affirmations are original KIBA
 * voice (no scripture-accuracy concern).
 */

export interface FaithEntry {
  /** The verse text. */
  verse: string;
  /** Citation, e.g. "Philippians 4:13". */
  ref: string;
  /** Original KIBA-voice affirmation that fits the verse's theme. */
  affirmation: string;
}

export const FAITH_POOL: FaithEntry[] = [
  {
    verse: 'I can do all things through Christ who strengthens me.',
    ref: 'Philippians 4:13',
    affirmation: "the strength you're pulling on today isn't only yours. go use it.",
  },
  {
    verse:
      'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.',
    ref: 'Proverbs 3:5-6',
    affirmation: "you don't have to see the whole staircase. take today's step.",
  },
  {
    verse:
      'Do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you.',
    ref: 'Isaiah 41:10',
    affirmation: 'whatever you were dreading this morning, you are not carrying it alone.',
  },
  {
    verse:
      'Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.',
    ref: 'Joshua 1:9',
    affirmation: 'courage over comfort today. show up before you feel ready.',
  },
  {
    verse:
      'For I know the plans I have for you, plans to prosper you and not to harm you, plans to give you hope and a future.',
    ref: 'Jeremiah 29:11',
    affirmation: "the plan didn't fall apart. keep building the part that's yours to build.",
  },
  {
    verse: 'And we know that in all things God works for the good of those who love him.',
    ref: 'Romans 8:28',
    affirmation: 'even the messy days are working for you, not against you. do the next right thing.',
  },
  {
    verse: 'Seek first the kingdom of God and his righteousness, and all these things will be added to you.',
    ref: 'Matthew 6:33',
    affirmation: 'first things first this morning. get your head right, then handle the day.',
  },
  {
    verse: 'God is our refuge and strength, an ever-present help in trouble.',
    ref: 'Psalm 46:1',
    affirmation: "you've got a place to stand today that pressure can't move.",
  },
  {
    verse: 'Whatever you do, work at it with all your heart, as working for the Lord.',
    ref: 'Colossians 3:23',
    affirmation: 'do today like it matters, because it does. half effort is beneath you.',
  },
  {
    verse:
      'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary.',
    ref: 'Isaiah 40:31',
    affirmation: 'tired is real, but it is not the end of you. renew and go again.',
  },
  {
    verse: 'This is the day the Lord has made; let us rejoice and be glad in it.',
    ref: 'Psalm 118:24',
    affirmation: "today is a gift you didn't earn. don't waste it half-present.",
  },
  {
    verse:
      'Always give yourselves fully to the work of the Lord, because you know that your labor in the Lord is not in vain.',
    ref: '1 Corinthians 15:58',
    affirmation: 'none of the quiet work is wasted. keep putting in the reps.',
  },
  {
    verse:
      'Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.',
    ref: 'Galatians 6:9',
    affirmation: "the harvest is on a clock you can't see. don't quit right before it.",
  },
  {
    verse: 'Commit to the Lord whatever you do, and he will establish your plans.',
    ref: 'Proverbs 16:3',
    affirmation: 'hand off the outcome, own the effort. that split is the whole game.',
  },
  {
    verse:
      'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.',
    ref: 'Philippians 4:6',
    affirmation: 'name the worry, then set it down and get to work. you were not built to carry it all.',
  },
  {
    verse: 'The Lord is my shepherd; I shall not want.',
    ref: 'Psalm 23:1',
    affirmation: "you have enough for today. work from full, not from fear.",
  },
];

// Keyword detector — matches a faith / spiritual / "closer to god" goal without
// tripping on unrelated words. Word-boundary anchored; case-insensitive.
const FAITH_GOAL_PATTERN =
  /\b(god|godly|faith|jesus|christ|christian|bible|biblical|scripture|scriptural|verse|prayer|prayers|praying|pray|spiritual|spiritually|church|worship|devotion|devotional|discipleship|the\s+lord)\b/i;

/**
 * True when any of the user's stated goals is a faith / spiritual goal. Pass the
 * goal strings you have (intake_data.goals, goal_description, and the User.goals
 * string all work) — nulls/empties are ignored.
 */
export function hasFaithGoal(...goalTexts: (string | null | undefined)[]): boolean {
  const blob = goalTexts.filter((g) => g && g.trim()).join(' • ');
  if (!blob) return false;
  return FAITH_GOAL_PATTERN.test(blob);
}

/** djb2 string hash → stable non-negative int. Deterministic (no Date/random). */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Pick the faith entry for this user on this local day. Same user + same day =
 * same entry (idempotent if the check-in job re-runs); rotates across days.
 */
export function pickDailyFaithEntry(userId: string, localDateKey: string): FaithEntry {
  const idx = hashString(`${userId}|${localDateKey}`) % FAITH_POOL.length;
  return FAITH_POOL[idx];
}

/**
 * The verse + affirmation block that leads the morning check-in. Returns null
 * when the user has no faith goal, so the caller can send the plain check-in.
 */
export function buildFaithBlock(
  goalTexts: (string | null | undefined)[],
  userId: string,
  localDateKey: string,
): string | null {
  if (!hasFaithGoal(...goalTexts)) return null;
  const e = pickDailyFaithEntry(userId, localDateKey);
  return `verse for today:\n"${e.verse}"\n${e.ref}\n\n${e.affirmation}`;
}
