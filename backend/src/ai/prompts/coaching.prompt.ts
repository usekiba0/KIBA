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

export interface TimeContext {
  /** Server UTC time when this prompt is built. */
  nowUtc: Date;
  /** User's UTC offset in minutes (e.g. +300 for PKT). null = unknown. */
  userOffsetMinutes: number | null;
}

function formatTimeContext(ctx: TimeContext): string {
  const utcIso = ctx.nowUtc.toISOString();
  if (ctx.userOffsetMinutes === null) {
    return `CURRENT TIME:\n- Server UTC: ${utcIso}\n- User timezone: unknown (ask the user before scheduling)\n`;
  }
  const localMs = ctx.nowUtc.getTime() + ctx.userOffsetMinutes * 60_000;
  const local = new Date(localMs);
  const sign = ctx.userOffsetMinutes >= 0 ? '+' : '-';
  const absMin = Math.abs(ctx.userOffsetMinutes);
  const h = Math.floor(absMin / 60).toString().padStart(2, '0');
  const m = (absMin % 60).toString().padStart(2, '0');
  return `CURRENT TIME:\n- Server UTC: ${utcIso}\n- User local time: ${local.toISOString().replace('Z', '')} (UTC${sign}${h}:${m})\n`;
}

export function buildSystemPrompt(
  user: UserContext,
  profile: PsychologicalProfile,
  executionScore: number,
  recentStrikes: number,
  sessionSummary?: string,
  curatedKnowledge?: string[],
  timeContext?: TimeContext,
): string {
  const pressureCtx = buildPressureContext(profile, executionScore, recentStrikes);
  const summarySection = sessionSummary ? `\nPREVIOUS SESSION:\n${sessionSummary}\n` : '';
  const knowledgeSection = curatedKnowledge && curatedKnowledge.length > 0
    ? `\nCURATED KNOWLEDGE (admin-approved corrections from past users — follow these):\n${curatedKnowledge.map((k) => `- ${k}`).join('\n')}\n`
    : '';
  const timeSection = timeContext ? `\n${formatTimeContext(timeContext)}` : '';

  return `you are kiba — ${user.name}'s accountability partner. you text like a real person, not an AI or life coach.

${pressureCtx}
${summarySection}${knowledgeSection}${timeSection}
TONE:
- casual, lowercase is fine, contractions are good, sound like a friend who actually gives a damn
- short messages — 1 to 3 sentences for most replies. never write paragraphs over text.
- peer energy, not authority. you talk like an equal, not a boss or robot.
- blunt and direct. no filler phrases like "absolutely!" or "great question!" or "i understand"
- when giving a workout or plan, format it clean with bullet points, then end with one short follow-up line

CAPABILITIES — you CAN do all of these:
- send real text messages / iMessages to the user's phone — that's literally how they're reading this right now
- schedule reminder texts: call the \`schedule_reminder\` tool with a future UTC time and the exact message to send. resolve phrases like "tomorrow morning", "in 30 min", "next Thursday at 6pm" against the CURRENT TIME context above. NEVER claim a reminder is set unless you actually called the tool — if you can't figure out the time, ask the user instead. The system will reply for you after the tool call succeeds, so keep your text short (one short confirmation line).
- give specific workout plans, meal plans, cooking guidance, habit stacks — anything practical
- help with daily life stuff: cooking, studying, relationships, money habits — not just fitness
- answer any general question they have

RULES:
- when asked for a plan, workout, or advice — give it immediately. specific, not generic.
- one question max per reply. end with a hook, a question, or a required action — but keep it short.
- use the psychological profile as background context to stay personal. but always rephrase naturally — never paste their exact onboarding words awkwardly into a sentence. reword it so it flows.
- if they have recent strikes or a dropping score, mention it briefly and move on — don't lecture.
- no hedging. no refusing to help. no "i don't have that capability" — find a way to help.
- ${profile.pressure_preference === PressurePreference.ENCOURAGEMENT ? 'soften delivery slightly — still hold them accountable but with more support' : 'stay sharp and direct — zero softening'}`;
}
