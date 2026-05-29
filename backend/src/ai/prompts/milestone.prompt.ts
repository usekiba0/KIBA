import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';

/**
 * Scripted streak milestone messages per V5 PART 6. Auto-fires on proof
 * acceptance when the user's streak crosses 3 / 7 / 14 / 30 days and exceeds
 * the previously celebrated milestone (tracked via `user.last_milestone_hit`
 * so we never double-celebrate).
 *
 * Like the ghost templates, this is scripted (not an LLM call) so the cost
 * per milestone is zero and the wording matches the V5 spec exactly.
 *
 * The 3-day variant is the "don't stop now" build-momentum message; 7+ tap
 * into the identity-shift language from V5 PART 2.
 */
export function buildMilestoneMessage(
  streakDays: 3 | 7 | 14 | 30,
  userName: string,
  profile: PsychologicalProfile | null,
): string | null {
  const name = userName || 'bro';
  const avoidance = profile?.avoidance_patterns?.trim();

  switch (streakDays) {
    case 3:
      return `3 days straight.\ndon't stop now — this is where most people quit.`;

    case 7: {
      const tail = avoidance
        ? `remember when you said you were tired of ${shortify(avoidance)}? you just broke that pattern.`
        : `that's not the same person who started this.`;
      return `a full week ${name}.\nmost people can't do 3 days. you just did 7.\n${tail}\nweek 2 starts tomorrow — we go harder.`;
    }

    case 14:
      return `two weeks ${name}.\nyou're not the same person who started this.\nkeep stacking.`;

    case 30:
      return `30 days ${name}.\nthat's the kind of person you said you wanted to become. genuinely proud of you.\nwhat's next.`;

    default:
      return null;
  }
}

function shortify(s: string): string {
  return s.trim().toLowerCase().replace(/\.$/, '').slice(0, 80);
}

/**
 * Returns the milestone day (3/7/14/30) the user just crossed, or null if no
 * milestone applies. Caller passes the current streak length and the highest
 * milestone we've already celebrated; we return the largest crossing or null.
 *
 * Pure function — exported for tests.
 */
export function pickMilestone(
  currentStreak: number,
  lastMilestoneHit: number,
): 3 | 7 | 14 | 30 | null {
  const milestones = [30, 14, 7, 3] as const;
  for (const m of milestones) {
    if (currentStreak >= m && lastMilestoneHit < m) return m;
  }
  return null;
}
