import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';

export function buildCheckinMessage(
  userName: string,
  profile: PsychologicalProfile | null,
  taskDescription: string | null,
): string {
  const task = taskDescription ?? 'your goal for today';

  if (!profile) {
    return `${userName} — did you do it? send proof now.`;
  }

  const figure = profile.comparison_figure?.trim();
  const fear = profile.fears?.trim();

  // Build motivation line that reads naturally regardless of what the user typed
  let motivationLine = '';
  if (fear) {
    motivationLine = `you said you're scared of ${fear}.`;
  }
  if (figure && figure.toLowerCase() !== 'nobody' && figure.toLowerCase() !== 'no one' && figure.toLowerCase() !== 'none') {
    motivationLine += motivationLine ? ` ${figure} isn't taking days off.` : `${figure} isn't taking days off.`;
  } else if (motivationLine) {
    motivationLine += ' time isn\'t waiting.';
  }

  const base = `${userName} — "${task}" — did you do it? send proof now.`;
  return motivationLine ? `${base}\n\n${motivationLine}` : base;
}
