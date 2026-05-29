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
  | 'playful';

export interface SurpriseInput {
  flavor: SurpriseFlavor;
  userName: string;
  daysIn: number;
  showedUpCount: number;
  profile: PsychologicalProfile | null;
}

export function buildSurpriseMessage(input: SurpriseInput): string {
  const { flavor, userName, daysIn, showedUpCount, profile } = input;
  const name = userName || 'bro';
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
      return `scale of 1-10 how locked in are you feeling rn.\nbe honest 😂`;
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
  ];
  return flavors[Math.abs(seed) % flavors.length];
}
