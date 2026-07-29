/**
 * Deterministic cap on dumping the to-do board into a message (2026-07-29).
 *
 * The coaching prompt has said "NEVER dump the whole list. This board is YOUR
 * reference, not a message" since 2026-07-28. On 2026-07-29 the model printed
 * all fourteen items at a user anyway, under the header "on the board today:",
 * and she replied: "Not sure where all these came from cause we never discussed
 * it. So I guess it just made up new tasks for me."
 *
 * A rule the model can ignore is not a guard. This is the hard backstop, in the
 * same family as correctTimeClaims / correctWeekdayClaims: no model call, no
 * added latency, and it only ever REMOVES lines that came off the board — it
 * never rewrites the user's own words or anything the model reasoned out.
 */

export interface BoardDumpResult {
  text: string;
  /** How many board lines were dropped. 0 = the reply was left untouched. */
  dropped: number;
}

/** More than this many board items in one message reads as a database dump. */
export const MAX_BOARD_LINES = 3;

/** Offered when we truncate, so the rest of the list is still reachable. */
const TAIL_OFFER = "that's the front of it. want the rest?";

const BULLET_RE = /^\s*(?:[-*•·]|\d+[.)])\s+(.*)$/;

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drop board lines past the cap. `boardItems` is today's list — only lines that
 * match one of them are eligible for removal, so a bulleted list the model wrote
 * about something else (a recipe, a set of options) is never touched.
 */
export function capBoardDump(
  reply: string,
  boardItems: string[],
  max: number = MAX_BOARD_LINES,
): BoardDumpResult {
  if (!reply || !boardItems?.length) return { text: reply, dropped: 0 };

  const known = new Set(boardItems.map(normalise).filter((s) => s.length >= 4));
  if (known.size === 0) return { text: reply, dropped: 0 };

  const lines = reply.split('\n');
  const kept: string[] = [];
  let matched = 0;
  let dropped = 0;

  for (const line of lines) {
    const bullet = BULLET_RE.exec(line);
    if (!bullet) {
      kept.push(line);
      continue;
    }
    const isBoardItem = known.has(normalise(bullet[1]));
    if (!isBoardItem) {
      kept.push(line);
      continue;
    }
    matched += 1;
    if (matched <= max) {
      kept.push(line);
    } else {
      dropped += 1;
    }
  }

  if (dropped === 0) return { text: reply, dropped: 0 };

  // Collapse the hole the removed bullets left, then offer the remainder rather
  // than silently truncating — the user asked what's on today, they get an answer
  // and a door, not a shorter wall.
  let text = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  if (!/want the rest|the rest of/i.test(text)) {
    text = `${text}\n\n${TAIL_OFFER}`;
  }
  return { text, dropped };
}
