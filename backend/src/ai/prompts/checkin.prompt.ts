import { PsychologicalProfile } from '../../data/entities/psychological-profile.entity';

export interface CheckinContext {
  /** User's local day-of-week (Sun=0..Sat=6). Drives Thu/Fri end-of-week push. */
  localDow?: number | null;
}

/**
 * Morning check-in message. Default tone is neutral-KIBA: lowercase, short, peer
 * energy, no corporate filler. We rotate across a small variant pool so the same
 * user doesn't hear identical wording day after day (the V2 training doc calls
 * out predictability as the thing that kills emotional attachment).
 *
 * Thu/Fri get an "end of week push" variant per V5 PART 5 — different urgency,
 * frames the remaining days. Saturday/Sunday stay neutral so KIBA doesn't yell
 * about the week on a weekend.
 */
export function buildCheckinMessage(
  userName: string,
  profile: PsychologicalProfile | null,
  taskDescription: string | null,
  ctx: CheckinContext = {},
): string {
  const isThuFri = ctx.localDow === 4 || ctx.localDow === 5;

  // Multi-goal: TaskService stores one combined DailyTask whose description is
  // each goal's action for today, newline-separated. Render those as a single
  // combined check-in listing every goal (Karibi 2026-06-12). Single-goal
  // descriptions have no newline and fall through to the original path.
  const lines = (taskDescription ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length > 1) {
    const actions = lines.map(humanizeTask).filter((a) => a.length > 0);
    if (actions.length > 1) return pickMultiTaskVariant(userName, actions, ctx.localDow ?? null);
  }

  const task = taskDescription ? humanizeTask(taskDescription) : null;
  if (task) {
    if (isThuFri) return pickEndOfWeekTaskVariant(userName, task, ctx.localDow as 4 | 5);
    return pickTaskVariant(userName, task, profile);
  }
  if (isThuFri) return pickEndOfWeekNoTaskVariant(userName, ctx.localDow as 4 | 5);
  return pickNoTaskVariant(userName);
}

/**
 * Turn a stored daily-task string into something a human would text.
 *
 * `goal.action_plan.daily_tasks[]` entries are stored as "Day 7 Sunday: Gym
 * (20min), business planning, review compliance." — a whole-day schedule. The
 * morning check-in should NOT read like that robotic dump (Karibi 2026-06-01).
 * We strip the "Day N Weekday:" prefix and keep only the PRIMARY action (first
 * clause); the remaining items are already seeded onto the to-do list by
 * TodoService, and the full list is shown to the coaching model separately.
 */
export function humanizeTask(task: string): string {
  const stripped = task.replace(/^\s*day\s+\d+(?:\s+\w+)?\s*[:\-—]\s*/i, '').trim();
  const firstClause = stripped
    .split(/(?<=[.!?])\s+|,\s+/)[0]
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();
  return firstClause.length >= 3 ? firstClause : stripped;
}

/**
 * Combined morning check-in for a user with multiple goals. Lists each goal's
 * action for today and asks them to lock in a time for all of them — one
 * message, not one per goal (the "one combined check-in" decision).
 */
function pickMultiTaskVariant(userName: string, actions: string[], dow: number | null): string {
  const list = actions.map((a) => `• ${a}`).join('\n');
  const isThuFri = dow === 4 || dow === 5;
  if (isThuFri) {
    const daysLeft = dow === 4 ? 'two days' : 'last day';
    return `${daysLeft} left in the week.\ntoday:\n${list}\nwhat time for each? don't coast into the weekend.`;
  }
  const variants = [
    `morning. today's moves:\n${list}\nwhat time you hitting each?`,
    `up ${userName}. on the board today:\n${list}\nwhen's each happening?`,
    `morning ${userName}.\n${list}\nlock in a time for all of these.`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

function pickEndOfWeekTaskVariant(userName: string, task: string, dow: 4 | 5): string {
  const daysLeft = dow === 4 ? 'two days' : 'last day';
  const variants = [
    `${daysLeft} left in the week.\n"${task}" — what time today?`,
    `${daysLeft} ${userName}.\n${task} today. let's not coast into the weekend.`,
    `${task} today.\n${daysLeft} left to make this a real week.`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

function pickEndOfWeekNoTaskVariant(userName: string, dow: 4 | 5): string {
  const daysLeft = dow === 4 ? 'two days' : 'last day';
  const variants = [
    `${daysLeft} left in the week.\nwhere are you actually at vs where you said you'd be?`,
    `morning ${userName}. ${daysLeft} left.\nwhat are you doing with today?`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
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
