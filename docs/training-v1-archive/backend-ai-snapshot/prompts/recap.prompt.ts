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
  /**
   * Did the user actually talk to KIBA today? The ledger counters are all
   * structurally zero for a user who never commits a to-do and logs by text
   * rather than photo — so they cannot decide whether someone was engaged. This
   * can. See the gate in buildNightRecapMessage.
   */
  wasActive?: boolean;
}

/** Keep the text SMS-sized — list at most this many items per bucket. */
const MAX_LIST_ITEMS = 4;

function shorten(item: string): string {
  const s = item.trim().replace(/\s+/g, ' ');
  if (s.length <= 48) return s;
  // Long items are usually AI-written todos carrying task + detail
  // ("breakfast photo before eating. 2 slices PB smeared…"). The first clause
  // IS the task; the rest is detail. Prefer it over a character cut — the old
  // slice(0,45) produced mid-word fragments like "2 slices PB s…" in the recap,
  // and the closing line then QUOTED the mangled fragment back at the user
  // (Karibi 2026-07-21 screenshot).
  const clause = s
    .split(/(?<=[.;])\s+/)[0]
    .replace(/[.;]+$/, '')
    .trim();
  if (clause.length >= 8 && clause.length <= 60) return clause;
  // Fall back to a word-boundary cut — never mid-word.
  const cut = s.slice(0, 46);
  const at = cut.lastIndexOf(' ');
  return `${(at > 20 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

function renderList(items: string[], mark: string): string {
  const shown = items.slice(0, MAX_LIST_ITEMS).map((i) => `${mark} ${shorten(i)}`);
  const extra = items.length - MAX_LIST_ITEMS;
  if (extra > 0) shown.push(`${mark} +${extra} more`);
  return shown.join('\n');
}

/**
 * Build the night recap. Returns null when there was nothing on the board AND
 * no proof came in — we don't send a "you did nothing" text to someone who
 * simply had no plan; that's the ghost/check-in flow's job, not the recap's.
 *
 * `proofCount` is part of that gate (matching the weekly-review twin, which
 * always counted it). Leaving it out silently killed the feature: excluding
 * never-agreed PLAN todos from `missed` — the correct 2026-06-29 fix for the
 * "❌ 33 missed" shaming recaps — meant any user whose board is entirely
 * auto-seeded arrived here with two empty lists and got nothing, forever. Three
 * days of prod logs (2026-07-21..23) show every recap fire for every active
 * user exiting through this branch, including days they sent proof.
 */
export function buildNightRecapMessage(data: NightRecapData): string | null {
  const { done, missed, proofCount, score } = data;
  // THIRD TIME THIS GATE HAS KILLED THE FEATURE. Excluding never-agreed PLAN
  // todos (2026-06-29) emptied `missed`; adding proofCount (2026-07-23) was
  // supposed to catch the rest. It doesn't: a user who logs meals as TEXT never
  // gets is_proof_submission set, and a user who never commits a to-do has
  // nothing in `done`/`missed` either. Bianca — 843 messages, texting daily —
  // got no recap between 2026-07-14 and 2026-07-29 because all three counters
  // are structurally zero for how she actually uses the product.
  //
  // So the gate now asks the question it always meant to ask: did this person
  // engage today? If they did, they get a recap — an honest one that claims
  // nothing about a ledger we know is empty. Silence is only correct for
  // someone who never showed up at all.
  if (done.length === 0 && missed.length === 0 && proofCount === 0 && !data.wasActive) {
    return null;
  }

  // Engaged, but the ledger holds nothing we're allowed to judge. A "day recap:"
  // header over an empty list reads as a broken dashboard, so send the honest
  // line on its own: we saw them, we can't see the work, what's tomorrow.
  if (done.length === 0 && missed.length === 0 && proofCount === 0) {
    return activeButEmptyLedgerLine(data);
  }

  const lines: string[] = ['day recap:', ''];

  if (done.length) lines.push(renderList(done, '✅'));
  if (missed.length) lines.push(renderList(missed, '❌'));

  lines.push('');
  if (proofCount > 0) lines.push(`proof sent: ${proofCount}`);
  if (score !== null) lines.push(`score: ${score}/100`);

  lines.push('', closingLine(data));

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The user talked to KIBA today but nothing reached the ledger — no committed
 * to-do, no photo proof. We know they showed up and we know nothing about what
 * they actually did, so the copy must claim NEITHER success nor failure. It
 * asks, and it hands them the one thing that makes tomorrow countable.
 */
function activeButEmptyLedgerLine(data: NightRecapData): string {
  const name = data.userName?.trim();
  const tail = name ? ` ${name}` : '';
  return `we talked today${tail} but nothing made it onto the board, so i've got no read on how the day actually went. what got done — and what's the one thing you're locking in for tomorrow? name it and it's on the board.`;
}

/**
 * The "tomorrow's correction" / verdict line — the part that makes KIBA feel
 * like a coach, not a dashboard. Branches on how the day actually went.
 */
function closingLine(data: NightRecapData): string {
  const { userName, done, missed, proofCount, excusePhrase, excuseCount } = data;
  const name = userName?.trim();
  const tail = name ? ` ${name}` : '';

  // Proof came in but the board carried nothing we're allowed to judge (all of
  // it auto-seeded). We know work happened and we know nothing about what was
  // skipped — so acknowledge the proof and ask, rather than inventing a verdict
  // in either direction (KIBA_Retraining_Doc B4).
  if (done.length === 0 && missed.length === 0 && proofCount > 0) {
    return `${proofCount} proof${proofCount === 1 ? '' : 's'} in today${tail}. that's what i can actually see. what else got done that i'm not counting — and what's the one thing for tomorrow?`;
  }

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

  // Zero items checked off. The recap CANNOT verify what actually happened —
  // it reads a ledger the conversation doesn't reliably update, and it has
  // repeatedly called a day "folded" hours after the coaching layer negotiated
  // proof to tomorrow (Karibi 2026-07-21: trained, sent two gym photos, got
  // "you folded on everything. no spin." at 9pm). So the copy states the
  // BOARD's view and invites correction — it never delivers a verdict on the
  // user's day (KIBA_Retraining_Doc B4: no scheduled message may assert
  // failure without verified thread history).
  if (done.length === 0 && missed.length > 0) {
    return `nothing got checked off on my board today${tail}. if you did the work and i missed it, say so — i'll fix it. if not, tomorrow starts with "${shorten(missed[0])}" first thing, before the day talks you out of it.`;
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
  /** Days this week the user actually messaged KIBA. See the gate above. */
  activeDays?: number;
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
  // Twin of the night recap's gate, and it failed the same way: the weekly
  // review went silent for every user from 2026-07-26 onward — the first Sunday
  // after counts began keying on committed_at — because nothing in the coaching
  // flow ever stamps a commitment. The job fired and claimed the date; only the
  // copy was missing. `activeDays` is what tells an engaged week from an empty
  // one. See buildNightRecapMessage.
  if (doneCount === 0 && missedCount === 0 && proofCount === 0) {
    if (!data.activeDays) return null;
    return weekActiveButEmptyLedger(data);
  }
  const name = data.userName?.trim();
  const tail = name ? ` ${name}` : '';

  const lines: string[] = ['week in review:', ''];
  lines.push(`✅ ${doneCount} done`);
  if (missedCount > 0) lines.push(`❌ ${missedCount} missed`);
  if (proofCount > 0) lines.push(`📸 ${proofCount} proofs`);
  if (score !== null) lines.push(`score: ${score}/100`);

  if ((data.excuseCount ?? 0) >= 2 && data.excusePhrase?.trim()) {
    lines.push(
      '',
      `biggest leak: "${data.excusePhrase.trim()}" — ${data.excuseCount}x this week. that's the one we kill next week.`,
    );
  }

  lines.push('', weeklyClose(doneCount, missedCount, tail));
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * An engaged week with an empty ledger. Report the ONE thing we can actually
 * verify — that they kept showing up — and convert it into a commitment for
 * next week. Never a count, never a verdict.
 */
function weekActiveButEmptyLedger(data: WeeklyReviewData): string {
  const name = data.userName?.trim();
  const tail = name ? ` ${name}` : '';
  const days = data.activeDays ?? 0;
  const showedUp =
    days >= 6
      ? `you showed up every day this week${tail}.`
      : `you showed up ${days} day${days === 1 ? '' : 's'} this week${tail}.`;
  return [
    'week in review:',
    '',
    showedUp,
    "nothing got locked onto the board though, so i can't tell you what actually moved.",
    '',
    "that's the fix for next week: one thing, agreed up front, every day. tell me what it is and i'll hold you to it.",
  ].join('\n');
}

function weeklyClose(doneCount: number, missedCount: number, tail: string): string {
  if (doneCount === 0) {
    // Same rule as the night recap's zero-done branch: the board can be wrong
    // (un-marked chat completions, seeded items), so state its view and invite
    // correction — never a verdict on the user's week.
    return `my board says nothing got checked off this week${tail}. if that's not the real story, tell me what i missed. if it is — next week we fix it. one thing, day one. you in?`;
  }
  const ratio = doneCount / Math.max(1, doneCount + missedCount);
  if (ratio >= 0.8) {
    return `strong week${tail}. you showed up and it shows. still not at the goal — but this is the pace that gets you there. week 2 we go again.`;
  }
  return `not a bad week${tail}, not your best — you showed up more than you folded. nowhere near the goal yet, but you proved you can. tighten it up next week.`;
}
