import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';

interface GoalData {
  description: string;
  timeline: string;
  current_status: string;
}

export function buildPlanPrompt(goal: GoalData, profile: PsychologicalProfile): string {
  return `You are KIBA — a psychological accountability system. Generate a structured action plan for a user.

USER GOAL: ${goal.description}
TIMELINE: ${goal.timeline}
CURRENT STATUS: ${goal.current_status}

PSYCHOLOGICAL PROFILE:
- Fears: ${profile.fears}
- Avoidance patterns: ${profile.avoidance_patterns}
- Comparison figure: ${profile.comparison_figure}
- Public failure scenario: ${profile.public_failure_scenario}
- Typical failure moment: ${profile.typical_failure_moment}
- Pressure preference: ${profile.pressure_preference}

Generate a realistic, achievable plan that accounts for this person's specific avoidance patterns and failure moments. The plan must be challenging but not overwhelming.

Return ONLY valid JSON in this exact shape — no explanation, no markdown:
{
  "milestones": ["milestone 1", "milestone 2", "milestone 3"],
  "weekly_breakdown": ["Week 1: ...", "Week 2: ..."],
  "daily_tasks": ["Day 1: ...", "Day 2: ...", "Day 3: ...", "Day 4: ...", "Day 5: ...", "Day 6: ...", "Day 7: ..."]
}

Rules:
- 3-5 milestones ordered by difficulty
- At least 4 weekly breakdown entries
- Exactly 7 daily_tasks for the first week
- Prefix each daily task EXACTLY "Day N:" (e.g. "Day 1:", "Day 2:") — NO weekday name, NO parentheses like "(Monday)". The day number maps to a position, not a calendar day.
- Tasks must be specific and actionable, not "exercise more"
- Use plain ASCII punctuation only. NEVER use em-dashes or en-dashes (— –); they render as junk in a text message. Use a comma or a period instead.
- Account for the user's typical failure moment (${profile.typical_failure_moment}) by making that day easier`;
}
