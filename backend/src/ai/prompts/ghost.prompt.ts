import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';
import { GoalType } from '../../data/entities/goal.entity';
import { shortGoalReference } from '../goal-classifier';

/**
 * Per V5 PART 8 — scripted escalating ghost-reengagement copy, NOT an LLM call.
 *
 * Each level pulls from the user's psych profile (avoidance, comparison,
 * goals, excuses) so the message hits the exact pressure point they
 * disclosed at intake. This is the "I remember what you told me" feel V5
 * names as the strongest retention mechanic — and using compact template
 * variables instead of a long-context LLM call keeps cost ~zero per ghost
 * fire (Karibi's 2026-05-29 constraint).
 *
 * Two variants per level keep the same user from seeing identical wording
 * if they ghost more than once.
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
  const goal = (goalText ?? '').trim() || 'your goal';
  const goalShort = shortGoalReference(goalText);
  const name = userName || 'bro';
  const avoidance = profile?.avoidance_patterns?.trim() ?? '';
  const comparison = profile?.comparison_figure?.trim() ?? '';
  const goalsFromProfile = profile?.fears?.trim() ?? '';
  const excuse = '';  // user.last_excuse_phrase is read by caller, not used here

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
            `${goalShort} — did it happen?`,
            `${goalShort}. happen or nah?`,
          ]);
        case GoalType.EMOTIONAL:
          // Don't pile accountability on a life/feeling goal — open the door.
          return pick([
            `haven't heard from you.\nwhat's actually on your mind today?`,
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
            `not asking if you became a new person overnight 😭\nwhat's the one move today?`,
          ]);
        case GoalType.OUTCOME:
        default:
          return pick([
            `${goalShort} is the target. cool.\nwhat's the actual move today?`,
            `not asking if it happened overnight.\nwhat's the one thing we're doing today toward ${goalShort}?`,
          ]);
      }

    case 2:
      return pick([
        `you went quiet. that's a miss.\nscore drops. talk to me.`,
        `nothing back. that's a miss.\ntalk to me.`,
      ]);

    case 3: {
      const tail = avoidance
        ? `disappearing right when things get hard is kinda your pattern. we fixing that or repeating it?`
        : `disappearing right when things get hard. we fixing that or repeating it?`;
      return pick([
        `two days.\nnot gonna lie… ${tail}`,
        `${name} two days. ${tail}`,
      ]);
    }

    case 4: {
      const hook = goalsFromProfile
        ? `you said you were tired of ${shortify(goalsFromProfile)}.`
        : `you said you wanted this.`;
      return pick([
        `${name} i'm still here.\n${hook} don't ghost yourself again.`,
        `still here.\n${hook} don't disappear on yourself again.`,
      ]);
    }

    case 5:
      return pick([
        `bro you wanted this bad ${daysSinceLastResponse} days ago. what changed?\nyou're probably scrolling right now instead of doing the thing you said mattered.\nprove me wrong.`,
        `5 days ${name}.\nyou wanted this bad. what changed.\nprove me wrong.`,
      ]);

    case 6: {
      const lines = [`${name}.`, `it's been ${daysSinceLastResponse} days.`];
      const hooks: string[] = [];
      if (avoidance) hooks.push(`you said you were tired of ${shortify(avoidance)}.`);
      if (goalsFromProfile) hooks.push(`you said ${shortify(goalsFromProfile)}.`);
      if (comparison) hooks.push(`you said ${shortify(comparison)} is who you're watching.`);
      if (hooks.length > 0) {
        lines.push(`i still remember — ${hooks.join(' ')}`);
      }
      lines.push(`none of that changed. you just got quiet.`);
      lines.push(`i'm here when you're ready.`);
      return lines.join('\n');
    }
  }
}

/** Trim/clean a profile snippet so it reads naturally inline. */
function shortify(s: string): string {
  return s.trim().toLowerCase().replace(/\.$/, '').slice(0, 80);
}
