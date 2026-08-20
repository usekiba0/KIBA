import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';
import { GoalType } from '../../data/entities/goal.entity';
import { shortGoalReference } from '../goal-classifier';

/**
 * Per V5 PART 8 — scripted escalating ghost-reengagement copy, NOT an LLM call.
 *
 * Rewritten 2026-07-22 under the B7 hard lines (KIBA_Retraining_Doc): levels
 * 3-6 used to ASSERT patterns and motives the system cannot observe —
 * "disappearing is kinda your pattern" fired even with an empty profile, and
 * level 5 told a quiet user "you're probably scrolling right now". A ghost
 * message KNOWS exactly one fact: how long they've been quiet. Everything else
 * it says must be either that fact or the user's own intake words quoted AS
 * their words. Verdicts, invented history, and motive-guessing are banned in
 * every tone. Crutch emoji stripped per the founder's P0 (emoji are a VOICE
 * feature — selective and moment-tied — not template filler).
 *
 * Each level pulls from the user's psych profile (avoidance, comparison,
 * goals, excuses) so the message hits the exact pressure point they
 * disclosed at intake. This is the "I remember what you told me" feel V5
 * names as the strongest retention mechanic — and using compact template
 * variables instead of a long-context LLM call keeps cost ~zero per ghost
 * fire (Karibi's 2026-05-29 constraint).
 *
 * Multiple variants per level keep the same user from seeing identical wording
 * if they ghost more than once — level 1 carries ~5 per goal branch so a
 * repeat-ghosting user doesn't see the same line on a loop (Karibi 2026-07-16).
 *
 * Level 1 branches on goalType (Karibi 2026-06-01): a long-term OUTCOME /
 * IDENTITY / EMOTIONAL / HABIT goal must NOT be asked "did it happen?" as if it
 * could complete overnight — it gets "what's the move today?" instead. Only a
 * deadline-bound TASK keeps the literal "happen or nah?". The raw goal text is
 * also shortened so we never dump "Make 100k a month, become more fit stop
 * procrastinating" into one line.
 */
export function buildGhostMessage(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  userName: string,
  goalText: string | null,
  profile: PsychologicalProfile | null,
  daysSinceLastResponse: number,
  goalType: GoalType = GoalType.OUTCOME,
): string {
  const goalShort = shortGoalReference(goalText);
  const name = userName || 'bro';
  const avoidance = profile?.avoidance_patterns?.trim() ?? '';
  const comparison = profile?.comparison_figure?.trim() ?? '';
  // profile.fears holds what they said they were TIRED OF ("staying stuck") —
  // quoted back only ever as their own words, never as a diagnosis.
  const tiredOf = profile?.fears?.trim() ?? '';
  // Tough-love / cussing variants only fire if the user opted in at intake.
  // Default is clean — never cuss at someone who asked for pg.
  const cussingOk = profile?.cussing_ok === true;

  // Helper: pick a variant deterministically per level + user so two ghost
  // cycles for the same user don't always pick variant 0.
  const pick = (variants: string[]): string => {
    const idx = Math.floor(Math.random() * variants.length);
    return variants[idx];
  };

  switch (level) {
    case 1:
      // Only a deadline-bound TASK is fairly asked "did it happen?". Long-term
      // goals get "what's the move today?" — the core Karibi 2026-06-01 fix.
      switch (goalType) {
        case GoalType.TASK:
          return pick([
           `yo ${goalShort} — did it happen or nah?`,
           `${goalShort}. happen or nah? don't leave me hanging`,
          ]);
        case GoalType.EMOTIONAL:
          // Don't pile accountability on a life/feeling goal — open the door.
          return pick([
           `haven't heard from you\nwhat's actually on your mind today?`,
           `${name} — you good? what's the headspace like today?`,
          ]);
        case GoalType.HABIT:
          return pick([
           `${goalShort} today?\nwhat time you getting it in?`,
           `${goalShort} — that's the daily one. when today?`,
          ]);
        case GoalType.IDENTITY:
          return pick([
           `${goalShort} — that's the direction.\nwhat's one thing today that moves you there?`,
           `${goalShort} isn't a someday thing.\nwhat's the one rep today?`,
           `you becoming ${goalShort} or just talking about it?\npick today's move.`,
           `${goalShort} is who you're building.\nwhat's the move today that proves it?`,
           `${goalShort} — that's the identity.\nwhat's today's one thing toward it?`,
          ]);
        case GoalType.OUTCOME:
        default:
          return pick([
           `${goalShort} is the target. cool.\nwhat's the actual move today?`,
           `${goalShort} — that's the big one.\nwhat's the one thing today that gets you closer?`,
           `you still chasing ${goalShort}?\nwhat's the one thing we're doing about it today?`,
           `${goalShort} doesn't move on its own\nwhat's today's play toward it?`,
           `real talk — ${goalShort} is the mission.\nwhat's the one move today?`,
          ]);
      }

    case 2:
      // Playful callout — light, human, slightly intrusive. Still logs as a miss.
      return pick([
       `bro why you ignoring me\nyou went quiet — that's a miss. talk to me.`,
       `you can ghost your group chat but not me\nnothing back = a miss. talk to me.`,
      ]);

    case 3: {
      // B7: the old copy asserted "disappearing is kinda your pattern" — even
      // with an EMPTY profile. Two days of quiet is the only fact we hold.
      // With their intake words on file, quote them as theirs and ASK; without,
      // just ask. A question invites the real answer; a verdict invites churn.
      const tail = avoidance
        ?`you told me "${shortify(avoidance)}" is what usually gets you. is that what this is, or something else?`
        :`what's actually going on — busy, stuck, or avoiding it?`;
      return pick([
       `two days quiet.
${tail}`,
       `${name} — two days.
${tail}`,
      ]);
    }

    case 4: {
      const hook = tiredOf
        ?`you said you were tired of ${shortify(tiredOf)}.`
        :`you said you wanted this.`;
      // Stronger tough love ONLY if the user opted into direct/cussing tone.
      // "again" claimed a history of ghosting the system never verified — a
      // first-time quiet spell got treated like a rap sheet. The toxic voice
      // stays for opted-in users (founder: toxic-push is a VOICE, not a
      // mechanics package); the invented history goes, in every tone.
      if (cussingOk) {
        return pick([
         `WHERE TF YOU AT${name ?` ${name}` : ''}.
all day, nothing. did the move happen or not?`,
         `bro. WHERE TF you been — not a word all day. ${hook} what's the move?`,
        ]);
      }
      return pick([
       `${name} i'm still here.
${hook} don't go quiet on yourself.`,
       `still here.
${hook} don't go quiet on yourself now.`,
      ]);
    }

    case 5:
      // B7 rewrite: the old copy told a silent user what they were "probably"
      // doing ("scrolling right now") and diagnosed their cycle. We know two
      // facts — how many days, and what they said they wanted. Say those, then
      // offer a real fork and HONOR whichever they pick.
      return pick([
       `${daysSinceLastResponse} days quiet ${name}.
${goalShort} didn't go anywhere — it's still sitting exactly where you left it.
reset or finish it. either answer works, but pick one.`,
       `${daysSinceLastResponse} days.
you told me this mattered and i'm taking you at your word.
one message starts it back up. what's the move?`,
      ]);

    case 6: {
      const lines = [`${name}.`,`it's been ${daysSinceLastResponse} days.`];
      const hooks: string[] = [];
      if (avoidance) hooks.push(`you said you were tired of ${shortify(avoidance)}.`);
      if (tiredOf) hooks.push(`you said ${shortify(tiredOf)}.`);
      if (comparison) hooks.push(`you said ${shortify(comparison)} is who you're watching.`);
      if (hooks.length > 0) {
        lines.push(`i still remember — ${hooks.join(' ')}`);
      }
      lines.push(`none of that changed. you just got quiet.`);
      lines.push(`no pressure — i'm here when you're ready.`);
      return lines.join('\n');
    }
  }
}

/** Trim/clean a profile snippet so it reads naturally inline. */
function shortify(s: string): string {
  return s.trim().toLowerCase().replace(/\.$/, '').slice(0, 80);
}
