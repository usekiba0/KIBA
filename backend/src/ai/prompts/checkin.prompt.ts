import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';

export function buildCheckinMessage(
  userName: string,
  profile: PsychologicalProfile | null,
  taskDescription: string | null,
): string {
  const task = taskDescription ?? 'your task for today';

  if (!profile) {
    return `${userName} — check in time. Did you complete "${task}"? Send proof now.`;
  }

  return `${userName}. "${task}" — did you do it? Send proof now.\n\nYou said you fear ${profile.fears}. Your ${profile.comparison_figure} isn't waiting around. Neither is time.`;
}
