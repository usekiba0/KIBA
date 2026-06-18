/**
 * Night Recap message (V1 spec PART 7 — "Night Recap"). Sent once per evening,
 * it mirrors the day back at the user: what got done, what got dropped, proof
 * sent, the day's score, and tomorrow's correction.
 *
 * Scripted (not an LLM call) on purpose — Karibi's 2026-05-29 design constraint
 * is compact derived signals over expensive generation, and a recap is pure
 * aggregation of already-stored facts. Pure + exported for testing.
 */

export interface NightRecapData {
  userName: string;
  /** Completed mission/to-do descriptions for the local day. */
  done: string[];
  /** Still-open (i.e. dropped) mission/to-do descriptions. Skipped items excluded. */
  missed: string[];
  /** Accepted proofs submitted today. */
  proofCount: number;
  /** Today's execution score /100, or null if not computable. */
  score: number | null;
  /** Most recent repeated weak-excuse phrase, for a callback when it recurs. */
  excusePhrase?: string | null;
  /** Consecutive repeats of that excuse. >=2 triggers the callback. */
  excuseCount?: number;
}

/** Keep the text SMS-sized — list at most this many items per bucket. */
const MAX_LIST_ITEMS = 4;

function shorten(item: string): string {
  const s = item.trim().replace(/\s+/g, ' ');
  return s.length <= 48 ? s : `${s.slice(0, 45).trimEnd()}…`;
}

function renderList(items: string[], mark: string): string {
  const shown = items.slice(0, MAX_LIST_ITEMS).map((i) => `${mark} ${shorten(i)}`);
  const extra = items.length - MAX_LIST_ITEMS;
  if (extra > 0) shown.push(`${mark} +${extra} more`);
  return shown.join('\n');
}

/**
 * Build the night recap. Returns null when there was nothing on the board today
 * — we don't send a "you did nothing" text to someone who simply had no plan;
 * that's the ghost/check-in flow's job, not the recap's.
 */
export function buildNightRecapMessage(data: NightRecapData): string | null {
  const { done, missed, proofCount, score } = data;
  if (done.length === 0 && missed.length === 0) return null;

  const lines: string[] = ['day recap:', ''];

  if (done.length) lines.push(renderList(done, '✅'));
  if (missed.length) lines.push(renderList(missed, '❌'));

  lines.push('');
  if (proofCount > 0) lines.push(`proof sent: ${proofCount}`);
  if (score !== null) lines.push(`score: ${score}/100`);

  lines.push('', closingLine(data));

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The "tomorrow's correction" / verdict line — the part that makes KIBA feel
 * like a coach, not a dashboard. Branches on how the day actually went.
 */
function closingLine(data: NightRecapData): string {
  const { userName, done, missed, excusePhrase, excuseCount } = data;
  const name = userName?.trim();
  const tail = name ? ` ${name}` : '';

  // Repeated-excuse callback takes priority — naming the pattern is the point.
  if ((excuseCount ?? 0) >= 2 && excusePhrase?.trim()) {
    return `that's ${excuseCount} days running on "${excusePhrase.trim()}"${tail}. it's not the reason anymore, it's the pattern. tomorrow we kill it — hardest thing first, before the excuse shows up.`;
  }

  // Perfect day.
  if (missed.length === 0 && done.length > 0) {
    const variants = [
      `clean day${tail}. everything you said you'd do, you did. don't let tomorrow undo it — run it back.`,
      `that's a locked-in day. ${done.length}/${done.length}. this is the version of you we're keeping.`,
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  // Total fold.
  if (done.length === 0 && missed.length > 0) {
    return `real talk${tail} — you folded on everything today. no spin. tomorrow we start with "${shorten(missed[0])}" first thing, before the day talks you out of it.`;
  }

  // Mixed day — most common. Name the win, set tomorrow's first move.
  return `decent${tail}, not dominant. "${shorten(done[0])}" got done — but "${shorten(missed[0])}" is the one that actually moves you. tomorrow that goes first.`;
}

export interface WeeklyReviewData {
  userName: string;
  /** Tasks completed across the last 7 local days. */
  doneCount: number;
  /** Tasks left undone (missed) across the week. */
  missedCount: number;
  /** Accepted proofs across the week. */
  proofCount: number;
  /** Current execution score /100, or null if not computable. */
  score: number | null;
  /** Recurring weak-excuse phrase — surfaced as the week's "biggest leak". */
  excusePhrase?: string | null;
  excuseCount?: number;
}

/**
 * Weekly review (the 7-day mock's "Day 7" one-week review). Sent once a week
 * (Sunday evening, user-local), it sums the week and points at week ahead.
 * Scripted like the night recap — pure aggregation, no LLM call. Returns null
 * when the user had no activity all week (don't send a "you did nothing" text).
 */
export function buildWeeklyReviewMessage(data: WeeklyReviewData): string | null {
  const { doneCount, missedCount, proofCount, score } = data;
  if (doneCount === 0 && missedCount === 0 && proofCount === 0) return null;
  const name = data.userName?.trim();
  const tail = name ? ` ${name}` : '';

  const lines: string[] = ['week in review:', ''];
  lines.push(`✅ ${doneCount} done`);
  if (missedCount > 0) lines.push(`❌ ${missedCount} missed`);
  if (proofCount > 0) lines.push(`📸 ${proofCount} proofs`);
  if (score !== null) lines.push(`score: ${score}/100`);

  if ((data.excuseCount ?? 0) >= 2 && data.excusePhrase?.trim()) {
    lines.push('', `biggest leak: "${data.excusePhrase.trim()}" — ${data.excuseCount}x this week. that's the one we kill next week.`);
  }

  lines.push('', weeklyClose(doneCount, missedCount, tail));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function weeklyClose(doneCount: number, missedCount: number, tail: string): string {
  if (doneCount === 0) {
    return `straight up${tail} — you didn't really show up this week. next week we fix that. one thing, day one. you in?`;
  }
  const ratio = doneCount / Math.max(1, doneCount + missedCount);
  if (ratio >= 0.8) {
    return `strong week${tail}. you showed up and it shows. still not at the goal — but this is the pace that gets you there. week 2 we go again.`;
  }
  return `not a bad week${tail}, not your best — you showed up more than you folded. nowhere near the goal yet, but you proved you can. tighten it up next week.`;
}
