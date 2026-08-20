import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';

/**
 * V5 PART 13 — surprise messages 1-2x/week. Five flavors that rotate so the
 * user can't predict which one they'll get when KIBA pops up unprompted.
 *
 * All flavors are scripted (no LLM call per fire) and pull from compact user
 * row signals — daysIn, showedUpCount, profile fields — so cost is ~zero per
 * surprise. The variation comes from (a) which flavor we pick + (b) the
 * interpolated user data, NOT from generative randomness.
 */
export type SurpriseFlavor =
  | 'progress_reflection'
  | 'pattern_interrupt'
  | 'identity'
  | 'quiet_checkin'
  | 'playful'
  | 'curiosity'
  | 'vulnerability';

export interface SurpriseInput {
  flavor: SurpriseFlavor;
  userName: string;
  daysIn: number;
  showedUpCount: number;
  profile: PsychologicalProfile | null;
}

export function buildSurpriseMessage(input: SurpriseInput): string {
  const { flavor, daysIn, showedUpCount, profile } = input;
  const avoidance = profile?.avoidance_patterns?.trim();

  switch (flavor) {
    case 'progress_reflection': {
      const hook = avoidance
        ? `when you first texted me you said you were tired of ${shortify(avoidance)}.`
        : `when you first texted me you wanted this bad.`;
      return `random.\n${hook}\nyou've shown up ${showedUpCount} times in ${daysIn} days. that's more consistent than most things in your life.\njust wanted you to know i see it.`;
    }

    case 'pattern_interrupt':
      return `you've been killing it.\ndon't let the weekend kill the momentum.`;

    case 'identity':
      return `you know what's different about you from a few weeks ago?\nyou actually show up. repeatedly.\nkeep going.`;

    case 'quiet_checkin':
      return `haven't heard much from you today.\nhow are things actually?`;

    case 'playful':
      return `scale of 1-10 how locked in are you feeling rn.\nbe honest`;

    case 'curiosity': {
      // Karibi "Curiosity Engine" — interest with no goal attached. Humans get
      // attached to people who are genuinely curious about them. Rotate the
      // question deterministically off compact row signals so it varies week to
      // week without storing anything.
      const questions = [
        `random question.\nwhat's something you've been avoiding lately?`,
        `okay wait — what's been taking up most of your brain this week?`,
        `no agenda today. what's the thing you keep meaning to deal with but haven't?`,
      ];
      return questions[(daysIn + showedUpCount) % questions.length];
    }

    case 'vulnerability': {
      // Karibi "Vulnerability Simulation" — bond through noticing, not coaching.
      const hook = avoidance
        ? `ngl i feel like you've been carrying something lately.`
        : `ngl you've felt a little quiet in a different way lately.`;
      return `${hook}\nyou don't have to get into it. but i'm here if you do.`;
    }
  }
}

function shortify(s: string): string {
  return s.trim().toLowerCase().replace(/\.$/, '').slice(0, 80);
}

/**
 * Pick a flavor pseudo-randomly. Caller can pass a seed (e.g. epoch minute of
 * the fire time) so the choice is deterministic for tests but varies per fire.
 *
 * Exported for tests.
 */
export function pickSurpriseFlavor(seed: number): SurpriseFlavor {
  const flavors: SurpriseFlavor[] = [
    'progress_reflection',
    'pattern_interrupt',
    'identity',
    'quiet_checkin',
    'playful',
    'curiosity',
    'vulnerability',
  ];
  return flavors[Math.abs(seed) % flavors.length];
}
