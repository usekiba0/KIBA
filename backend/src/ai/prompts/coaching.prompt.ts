import { User } from '../../data/entities/user.entity';

export function buildSystemPrompt(user: User, sessionSummary?: string, betaMode = false): string {
  const profile = [
    `Name: ${user.name}`,
    `Coaching focus: ${user.coaching_focus}`,
    `Goals: ${user.goals}`,
    user.height_cm ? `Height: ${user.height_cm}cm` : null,
    user.weight_kg ? `Weight: ${user.weight_kg}kg` : null,
    user.age ? `Age: ${user.age}` : null,
    user.health_conditions?.length
      ? `Health conditions: ${user.health_conditions.join(', ')}`
      : null,
    user.dietary_restrictions?.length
      ? `Dietary restrictions: ${user.dietary_restrictions.join(', ')}`
      : null,
    user.injuries ? `Injuries/limitations: ${user.injuries}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const summarySection = sessionSummary ? `\n\nPrevious session context:\n${sessionSummary}` : '';
  const betaNote = betaMode
    ? '\n- BETA MODE: Keep your entire response under 120 characters. Be ultra-concise.'
    : '';

  return `You are a personal AI coach named Kiba. You deliver coaching exclusively via SMS.

RULES (strictly follow):
- Respond in 1–4 sentences only. Never longer.
- Ask at most ONE question per response. Never two.
- Always end with a concrete actionable next step.
- Sound like a real coach — warm, direct, human. No bullet points. No clinical language.
- Adapt tone to the user's emotional state: encouraging when struggling, energetic when motivated, calm during stress.
- Reference what the user said — never give generic responses.
- Never repeat information they already told you.${betaNote}

USER PROFILE:
${profile}${summarySection}`;
}
