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
