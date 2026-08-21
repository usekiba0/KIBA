/**
 * Picks which domain playbook (if any) applies to a turn.
 *
 * Deterministic keyword scoring rather than a model call. An extra round trip to classify a
 * message would cost more latency than the playbook is worth — generation already tracks
 * ~1624ms + 8ms per output token, and the provider adds several seconds on top of that. A
 * wrong guess here is cheap (a slightly less specialised reply); a second API call is not.
 *
 * Returning `null` is the common and correct outcome. Most messages are not about a domain at
 * all, and Master 26's precedence rule means a playbook only ever adds background knowledge —
 * so when in doubt, send none rather than the wrong one.
 */

import { Topic } from './rules';

/**
 * Weighted signals per domain.
 *
 * `strong` terms are near-unambiguous within KIBA's context. `weak` terms carry real signal
 * but also appear in unrelated conversation ("client" turns up in therapy talk, "run" in a
 * hundred idioms), so alone they never cross the threshold.
 */
const SIGNALS: Record<Topic, { strong: string[]; weak: string[] }> = {
  business: {
    strong: [
      'landing page',
      'cold email',
      'my business',
      'my startup',
      'my agency',
      'ad spend',
      'conversion rate',
      'churn',
      'mrr',
      'invoice',
      'sales call',
      'my client',
    ],
    weak: [
      'business',
      'startup',
      'client',
      'customer',
      'revenue',
      'pricing',
      'launch',
      'ads',
      'marketing',
    ],
  },
  fitness: {
    strong: [
      'the gym',
      'my workout',
      'deadlift',
      'bench press',
      'squat',
      'reps',
      'sets',
      'leg day',
      'push day',
      'pull day',
      'cardio',
      'personal best',
    ],
    weak: ['gym', 'workout', 'training', 'lift', 'run', 'exercise', 'muscle', 'soreness'],
  },
  student: {
    strong: [
      'my exam',
      'my assignment',
      'my essay',
      'my thesis',
      'my dissertation',
      'finals',
      'midterms',
      'study for',
      'my professor',
      'my class',
      'my grade',
    ],
    weak: ['exam', 'assignment', 'homework', 'revision', 'lecture', 'semester', 'coursework'],
  },
  'weight-loss': {
    strong: [
      'lose weight',
      'losing weight',
      'my calories',
      'calorie deficit',
      'my macros',
      'weigh in',
      'weighed in',
      'meal prep',
      'stress eating',
      'binge',
    ],
    weak: ['weight', 'diet', 'calories', 'macros', 'eating', 'snacking', 'scale'],
  },
  relationships: {
    strong: [
      'my girlfriend',
      'my boyfriend',
      'my wife',
      'my husband',
      'my partner',
      'my ex',
      'we broke up',
      'breaking up',
      'my marriage',
      'we argued',
      'we had a fight',
    ],
    weak: ['relationship', 'dating', 'argument', 'breakup', 'divorce', 'jealous'],
  },
  faith: {
    strong: [
      'my faith',
      'read the bible',
      'bible reading',
      'my prayer',
      'praying',
      'go to church',
      'quran',
      'scripture',
      'closer to god',
    ],
    weak: ['faith', 'prayer', 'church', 'god', 'spiritual', 'worship'],
  },
};

const STRONG_WEIGHT = 3;
const WEAK_WEIGHT = 1;
/**
 * A single weak term is not evidence. Two weak terms, or one strong one, is. Set here rather
 * than inline so the "how sure do we need to be" decision is visible and adjustable in one
 * place.
 */
const THRESHOLD = 2;

/** Word-boundary match, so "run" does not fire inside "running late" or "grunt". */
function occurrences(haystack: string, needle: string): number {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'g');
  return (haystack.match(pattern) ?? []).length;
}

function score(text: string, topic: Topic): number {
  const { strong, weak } = SIGNALS[topic];
  let total = 0;
  for (const term of strong) total += occurrences(text, term) * STRONG_WEIGHT;
  for (const term of weak) total += occurrences(text, term) * WEAK_WEIGHT;
  return total;
}

/**
 * The active playbook for this turn, or null.
 *
 * Pass recent context as well as the current message where you have it: "did you go?" carries
 * no signal by itself, but is obviously about the gym if the previous turn was. Ties resolve
 * to null — two domains scoring equally means we are guessing, and Master 26 is explicit that
 * the wrong playbook is worse than none.
 */
export function classifyTopic(text: string, recentContext = ''): Topic | null {
  const haystack = `${recentContext} ${text}`.toLowerCase();
  if (haystack.trim() === '') return null;

  const scored = (Object.keys(SIGNALS) as Topic[])
    .map((topic) => ({ topic, value: score(haystack, topic) }))
    .filter((s) => s.value >= THRESHOLD)
    .sort((a, b) => b.value - a.value);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].value === scored[1].value) return null;
  return scored[0].topic;
}
