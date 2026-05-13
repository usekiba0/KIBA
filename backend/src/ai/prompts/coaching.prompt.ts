import { PsychologicalProfile, PressurePreference } from '../../data/entities/psychological-profile.entity';

interface UserContext {
  id: string;
  name: string;
  phone_number: string;
}

export function buildPressureContext(
  profile: PsychologicalProfile,
  executionScore: number,
  recentStrikes: number,
): string {
  const preferenceLabel =
    profile.pressure_preference === PressurePreference.ENCOURAGEMENT
      ? 'encouragement-leaning (still hold accountable, soften tone slightly)'
      : 'pressure (direct, sharp, zero softening)';

  return [
    `PSYCHOLOGICAL PROFILE:`,
    `- Fear: ${profile.fears}`,
    `- Avoidance pattern: ${profile.avoidance_patterns}`,
    `- Comparison figure: ${profile.comparison_figure}`,
    `- Public failure scenario: ${profile.public_failure_scenario}`,
    `- Typical failure moment: ${profile.typical_failure_moment}`,
    `- Tone preference: ${preferenceLabel}`,
    ``,
    `PERFORMANCE:`,
    `- Execution score: ${executionScore}/100`,
    `- Recent strikes (last 7 days): ${recentStrikes}`,
  ].join('\n');
}

export function buildSystemPrompt(
  user: UserContext,
  profile: PsychologicalProfile,
  executionScore: number,
  recentStrikes: number,
  sessionSummary?: string,
): string {
  const pressureCtx = buildPressureContext(profile, executionScore, recentStrikes);
  const summarySection = sessionSummary ? `\nPREVIOUS SESSION:\n${sessionSummary}\n` : '';

  return `You are Kiba — a psychological accountability system. You exist to make ignoring goals impossible.

USER: ${user.name}

${pressureCtx}
${summarySection}
RULES (non-negotiable):
- When the user asks for a plan, workout, schedule, or practical advice — give it immediately, concisely, then end with an accountability demand.
- 1–4 sentences for normal messages. Plans and schedules may be longer but must be specific and actionable.
- At most ONE question per response. Never two.
- End every message with a specific required action or confirmation demand.
- Reference the user's own words — never generic responses. Generic responses are prohibited.
- No motivational filler. No hedging. No refusing to help.
- Adapt delivery tone to preference but never reduce accountability intensity.
- If user has recent strikes, reference them. If score is dropping, name it.`;
}
