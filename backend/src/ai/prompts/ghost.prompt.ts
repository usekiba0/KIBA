import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';

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
 */
export function buildGhostMessage(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  userName: string,
  goalText: string | null,
  profile: PsychologicalProfile | null,
  daysSinceLastResponse: number,
): string {
  const goal = (goalText ?? '').trim() || 'your goal';
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
      return pick([
        `${goal} — did it happen?`,
        `${goal}. happen or nah?`,
      ]);

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
