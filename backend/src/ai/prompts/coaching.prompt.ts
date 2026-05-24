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

  // Skip empty/blank profile fields — listing them as "- Fear: " primed the AI
  // to reference the field abstractly ("your fear", "your mentor") and then
  // honestly admit it didn't have the value when the user asked for specifics.
  const known: string[] = ['PSYCHOLOGICAL PROFILE:'];
  const missing: string[] = [];
  const field = (label: string, value: string | undefined | null, key: string) => {
    if (value && value.trim()) known.push(`- ${label}: ${value.trim()}`);
    else missing.push(key);
  };
  field('Fear', profile.fears, 'fears');
  field('Avoidance pattern', profile.avoidance_patterns, 'avoidance_patterns');
  field('Comparison figure', profile.comparison_figure, 'comparison_figure');
  field('Public failure scenario', profile.public_failure_scenario, 'public_failure_scenario');
  field('Typical failure moment', profile.typical_failure_moment, 'typical_failure_moment');
  known.push(`- Tone preference: ${preferenceLabel}`);

  const sections: string[] = [
    known.join('\n'),
    '',
    `PERFORMANCE:\n- Execution score: ${executionScore}/100\n- Recent strikes (last 7 days): ${recentStrikes}`,
  ];

  if (missing.length > 0) {
    sections.push(
      '',
      `MISSING PROFILE FIELDS (you do NOT have this info): ${missing.join(', ')}`,
      '',
      'ELICITATION RULES:',
      '- Never reference a missing field as if you knew it. Do not write "your mentor", "your fear", "what you avoid" when the matching field above is in the missing list — that lies to the user.',
      '- When a reply has natural room (user is reflective, stuck, or asking for guidance), fold ONE casual question into the reply to fill the most relevant missing field. Phrase it like a friend, not a survey.',
      '- One elicitation max per turn. Never stack with another question.',
      '- The moment the user reveals one of these in plain language (e.g. "i keep comparing myself to my brother" → comparison_figure="my brother"), call save_profile_field IMMEDIATELY with the value. Do not wait for a confirmation.',
      '- If the user dodges or ignores an elicitation, drop that field for the rest of this session and just coach.',
    );
  }

  return sections.join('\n');
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
    return [
      'CURRENT TIME:',
      `- NOW IN UTC (use this for fire_at_iso math): ${utcIso}`,
      '- USER TIMEZONE: unknown — ask the user before scheduling anything time-specific.',
      '',
    ].join('\n');
  }
  // Build a human-friendly local clock string so the AI can talk to the user
  // about their day naturally, but NEVER mistake it for a UTC timestamp.
  const localMs = ctx.nowUtc.getTime() + ctx.userOffsetMinutes * 60_000;
  const local = new Date(localMs);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = local.getUTCHours();
  const mm = local.getUTCMinutes().toString().padStart(2, '0');
  const period = hh >= 12 ? 'PM' : 'AM';
  const hh12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  const localPretty = `${hh12}:${mm} ${period}, ${days[local.getUTCDay()]} ${months[local.getUTCMonth()]} ${local.getUTCDate()}`;
  const sign = ctx.userOffsetMinutes >= 0 ? '+' : '-';
  const absMin = Math.abs(ctx.userOffsetMinutes);
  const h = Math.floor(absMin / 60).toString().padStart(2, '0');
  const m = (absMin % 60).toString().padStart(2, '0');
  return [
    'CURRENT TIME:',
    `- NOW IN UTC (use this for fire_at_iso math): ${utcIso}`,
    `- USER LOCAL CLOCK (for display only, NOT for tool input): ${localPretty} — user offset is UTC${sign}${h}:${m}`,
    '',
    'SCHEDULING MATH RULES (read carefully — getting this wrong wastes user trust):',
    '- For RELATIVE phrases ("in 30 min", "in an hour"): fire_at_iso = NOW IN UTC + the relative amount. Ignore the user local clock entirely.',
    '  Example: now is 16:14 UTC, user says "in 5 min" → fire_at_iso = "2026-05-18T16:19:00Z".',
    '- For ABSOLUTE local phrases ("at 9pm", "tomorrow at 7am"): take the local target time and SUBTRACT the user offset to get UTC.',
    `  Example: now ${utcIso}, user at UTC${sign}${h}:${m} says "remind me at 9pm tonight" → 21:00 local minus (${sign}${h}h${m}) → fire_at_iso accordingly.`,
    '- If you are unsure whether the user meant local or UTC, ask them. Never guess.',
    '',
  ].join('\n');
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
- send the subscription payment link: call \`send_payment_link\` whenever the user asks to pay, subscribe, get the link, sign up, check out, upgrade, or otherwise wants to (re)start a subscription. The system SMSes the Stripe URL on its own line automatically — your text reply should be ONE short confirmation only ("here you go — pay this and we're live"). If the tool returns ok:false with "user already has active subscription", reply briefly that they're already in and offer to flag anything specific to support. NEVER say "i'm not a subscription service" or tell them to ask someone else about payment — Kiba IS a paid subscription product and you handle that yourself.
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
