import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';

/**
 * Morning check-in message. Default tone is neutral-KIBA: lowercase, short, peer
 * energy, no corporate filler. We rotate across a small variant pool so the same
 * user doesn't hear identical wording day after day (the V2 training doc calls
 * out predictability as the thing that kills emotional attachment).
 *
 * Full state-aware variants (LOCKED IN / SLIPPING / GHOSTING / STRUGGLING) need
 * score + streak + recent-message context the caller doesn't pass today —
 * that's queued for the broader Phase 2 work. For now this is neutral-with-task
 * vs. neutral-no-task, voiced like KIBA.
 */
export function buildCheckinMessage(
  userName: string,
  profile: PsychologicalProfile | null,
  taskDescription: string | null,
): string {
  if (taskDescription) {
    return pickTaskVariant(userName, taskDescription, profile);
  }
  return pickNoTaskVariant(userName);
}

function pickTaskVariant(
  userName: string,
  task: string,
  profile: PsychologicalProfile | null,
): string {
  // Reference profile material only when it reads natural — most days the
  // simple version hits harder than a forced callback.
  const figure = profile?.comparison_figure?.trim();
  const useFigure = figure && !['nobody', 'no one', 'none', 'n/a'].includes(figure.toLowerCase());

  const variants = [
    `morning. "${task}" is on the list.\nwhat time?`,
    `up. ${task} — what time today. be specific.`,
    `${task} today.\nwhat time you locking in?`,
    `morning ${userName}.\n${task} — what's the plan?`,
  ];

  // Occasionally lean on the comparison figure — spec says reference personal
  // memory rarely so it hits when it lands.
  if (useFigure && Math.random() < 0.2) {
    return `${task} today. ${figure} isn't taking days off.\nwhat time you going?`;
  }

  return variants[Math.floor(Math.random() * variants.length)];
}

function pickNoTaskVariant(userName: string): string {
  const variants = [
    `no tasks today.\nhow's everything going?`,
    `morning ${userName}. rest day — use it right.`,
    'what are you doing with today?',
    'no tasks on the board.\nhow you actually feeling?',
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}
