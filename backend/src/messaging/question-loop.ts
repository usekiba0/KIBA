/**
 * Deterministic "KIBA is circling" detector for the COACHING path.
 *
 * The recurring failure (Bianca 2026-06-23: "i cant seem to get past this
 * circle. I keep repeating in different ways and still asking"): a new trial
 * user with no seeded plan triggers the model into an open-ended interview — it
 * asks about the workout, then breakfast, then re-asks the workout, never
 * committing the answers via add_todo. The prompt now discourages this, but a
 * model mid-loop won't always self-correct, so we detect the loop from the
 * message history and inject a hard "stop asking, lock it in" steer.
 *
 * Two independent triggers, both high-precision:
 *   1. detectQuestionLoop — KIBA's last THREE assistant messages are ALL asking
 *      something AND the newest one still re-treads a topic it already asked
 *      about in BOTH of the prior two turns. Varied coaching questions and
 *      emotional back-and-forth (not all questions) don't trip it.
 *   2. isLoopCallout — the user explicitly says we're repeating ("you already
 *      asked that", "i just told you", "we keep going in circles"). The user
 *      telling us is the strongest signal of all.
 */

// KIBA's own greeting/acknowledgement filler — carries no topic, so it must not
// count toward question similarity ("solid", "aight", "locked in").
const FILLER = new Set([
  'locked',
  'solid',
  'aight',
  'ok',
  'okay',
  'yo',
  'hey',
  'lol',
  'bro',
  'nice',
  'lets',
  'alright',
  'cool',
  'gotcha',
  'word',
  'bet',
  'fr',
  'good',
  'great',
  'yeah',
  'yep',
  'yup',
  'love',
  'got',
  'in',
]);

// Generic glue + wh-words. The wh-words drive isAsk() but are noise as topics.
const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'so',
  'to',
  'for',
  'of',
  'on',
  'at',
  'with',
  'you',
  'your',
  'youre',
  'u',
  'i',
  'im',
  'me',
  'my',
  'we',
  'is',
  'it',
  'its',
  'do',
  'does',
  'did',
  'are',
  'am',
  'be',
  'this',
  'that',
  'about',
  'right',
  'now',
  'actually',
  'though',
  'gonna',
  'wanna',
  'like',
  'here',
  'there',
  'whats',
  'what',
  'when',
  'how',
  'why',
  'who',
  'which',
  'where',
  'gonna',
  'really',
  'just',
  'still',
  'one',
  'up',
  'out',
  'today',
  'tomorrow',
  'lmk',
  'tell',
  'give',
  'whatre',
  'whatcha',
]);

// Map domain synonyms to a single canonical topic so a loop that rephrases
// ("gym" → "training" → "movement") is still recognised as the SAME topic. This
// is the vocabulary where plan-building loops actually happen.
const SYNONYM: Record<string, string> = {};
const addSynonyms = (canonical: string, words: string[]) => {
  for (const w of words) SYNONYM[w] = canonical;
};
addSynonyms('workout', [
  'workout',
  'workouts',
  'gym',
  'exercise',
  'exercises',
  'training',
  'train',
  'lift',
  'lifting',
  'lifts',
  'cardio',
  'run',
  'running',
  'jog',
  'jogging',
  'movement',
  'moving',
  'sets',
  'reps',
  'leg',
  'legs',
  'squat',
  'squats',
  'push',
  'pushups',
  'fitness',
]);
addSynonyms('food', [
  'breakfast',
  'lunch',
  'dinner',
  'meal',
  'meals',
  'eat',
  'eating',
  'food',
  'foods',
  'snack',
  'snacks',
  'diet',
  'nutrition',
  'macros',
  'protein',
  'eggs',
  'coffee',
  'cooking',
  'cook',
]);
addSynonyms('time', ['time', 'times', 'morning', 'evening', 'night', 'oclock', 'schedule']);
addSynonyms('duration', [
  'min',
  'mins',
  'minute',
  'minutes',
  'hour',
  'hours',
  'hr',
  'hrs',
  'long',
  'duration',
]);

// A bare clock token ("9am", "9:20", "920am", "7pm", "17:02") → the "time" topic.
const CLOCK_RE = /^\d{1,2}([:.]?\d{2})?(am|pm)?$/;

/**
 * Reduce a message to its set of canonical TOPIC tokens. Lowercase, strip
 * punctuation, drop filler/stopwords/pure-numbers, map synonyms + clock times
 * to canonical topics, and light-stem a trailing plural 's' on anything left.
 */
export function topicTokens(text: string): Set<string> {
  const out = new Set<string>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9:.\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const raw of words) {
    if (CLOCK_RE.test(raw) && /(am|pm|[:.])/.test(raw)) {
      out.add('time');
      continue;
    }
    // A token with stray punctuation stripped for lookup (keep ":" handled above).
    const w = raw.replace(/[:.]/g, '');
    if (!w) continue;
    if (FILLER.has(w) || STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // bare number — too ambiguous to be a topic
    const canonical = SYNONYM[w] ?? w.replace(/s$/, '');
    if (canonical.length >= 2) out.add(canonical);
  }
  return out;
}

/** Is this assistant message asking the user something? */
export function isAsk(text: string): boolean {
  if (text.includes('?')) return true;
  // Question/imperative cues even when the '?' is dropped (real texting). Includes
  // imperative demands to choose ("pick one", "choose", "decide") and bare either/or
  // prompts ("today or tomorrow") — these ARE asks even with no '?' or wh-word, and
  // missing them is exactly how the "today or tomorrow. pick one" loop slipped past.
  return /\b(what|when|where|which|how|why|who|lmk|let me know|tell me|give me|pick|choose|decide)\b/i.test(
    text,
  );
}

/**
 * Extract normalized either/or CHOICES KIBA posed in a message ("today or
 * tomorrow" -> "today|tomorrow", "gym or business" -> "business|gym"). Single
 * word per side keeps it tight and order-independent.
 */
function choiceKeys(text: string): Set<string> {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, ' ');
  const out = new Set<string>();
  const re = /\b([a-z]{2,})\s+or\s+([a-z]{2,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    if (m[1] === m[2]) continue;
    out.add([m[1], m[2]].sort().join('|'));
  }
  return out;
}

/**
 * True when KIBA poses the SAME either/or choice in 2+ of its last three turns
 * ("today or tomorrow" → "today or tomorrow. pick one" → "today or tomorrow
 * morning"). Re-posing an identical binary choice within three turns is a
 * high-precision loop signal that the topic-overlap detector misses because the
 * choice words ("today"/"tomorrow") are stopwords.
 */
export function detectRepeatedChoiceLoop(assistantTexts: string[]): boolean {
  const recent = assistantTexts.slice(-3);
  if (recent.length < 2) return false;
  const counts = new Map<string, number>();
  for (const msg of recent) {
    for (const key of choiceKeys(msg)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const c of counts.values()) if (c >= 2) return true;
  return false;
}

function shareTopic(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

/**
 * True when KIBA's recent assistant messages show it circling the same
 * question. Requires the last three assistant turns to ALL be asks, and the
 * newest to still re-tread a topic present in BOTH of the prior two asks.
 */
export function detectQuestionLoop(assistantTexts: string[]): boolean {
  const recent = assistantTexts.slice(-3);
  if (recent.length < 3) return false;
  if (!recent.every(isAsk)) return false;
  const topics = recent.map(topicTokens);
  if (topics.some((t) => t.size === 0)) return false;
  const [a, b, last] = topics;
  return shareTopic(last, a) && shareTopic(last, b);
}

/**
 * The user is explicitly telling us we're repeating. Highest-confidence trigger
 * — when they say it, break the loop immediately regardless of the heuristic.
 */
export function isLoopCallout(userText: string): boolean {
  return /\b(you|u)\s+(already|just)\s+asked|already\s+(asked|told\s+you)\b|i\s+(just|already)\s+(told|said|answered)|same\s+question|keep\s+(asking|repeating)|going\s+in\s+circles?|this\s+circle|stop\s+(asking|repeating)|asked\s+(me\s+)?(that|this)\s+already|repeating\s+(yourself|the\s+same)/i.test(
    userText,
  );
}
