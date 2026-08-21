import { GoalType } from '../data/entities/goal.entity';

/**
 * Goal Type Classifier (Karibi feedback 2026-06-01, Phase 1).
 *
 * The screenshot bug: KIBA was texting "Make 100k a month, become more fit stop
 * procrastinating. happen or nah?" — asking "did it happen?" about a long-term
 * OUTCOME as if it were a task that could complete overnight.
 *
 * The fix is to label each goal with one of five types so proactive copy can
 * branch: only deadline-bound TASKS get "did it happen?"; everything else gets
 * "what's the move today?".
 *
 * This is a deterministic rule-based classifier, NOT an LLM call — matching the
 * codebase's "compact computed signals, not LLM-extracted blobs" ethos (see the
 * Tier1 derived-signals migration). Zero per-goal cost, fully testable, no new
 * failure mode at plan-generation time.
 *
 * Precedence (first match wins), ordered most-distinct → least:
 *   emotional → habit → task → outcome → identity → default(outcome)
 * The default is OUTCOME on purpose: it routes to "what's the move today?",
 * which is the safe behavior even when we guess wrong (never the broken
 * "did a long-term goal happen overnight?" prompt).
 */

/** Life/feeling issues — "overthinking girls", "feeling lost", stress, family. */
const EMOTIONAL = /\b(overthink\w*|anxious|anxiety|depress\w*|lonely|loneliness|heartbreak|breakup|broke up|grief|grieving|overwhelm\w*|burnt? ?out|feeling lost|feel lost|hopeless)\b/;

/** Recurring habits — "gym 4x/week", "post daily", "sleep by 11". */
const HABIT = /\b(every ?day|everyday|daily|each day|each morning|every morning|every night|weekly|each week|per week|times a week|x ?\/ ?week|\d+ ?x(?: ?a| per)? ?week|routine|habit)\b|\b\d+\s*x\b/;

/** One-time deliverables with a clear finish — "send email", "finish landing page", "book call". */
const TASK_VERB = /\b(send|finish|complete|submit|launch|ship|book|email|call|register|sign up|apply|publish|post the|fix the|build the|write the|record the|file)\b/;
const TASK_HORIZON = /\b(today|tonight|tomorrow|this (?:morning|afternoon|evening|week)|by (?:today|tonight|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|end of day|noon|\d))\b/;

/** Measurable long-term outcomes — money, weight, "build a company", "reach X". */
const OUTCOME = /(\$?\s?\d[\d,]*\s*k?\s*(?:\/|per|a)\s*(?:month|mo|week|year|day))|\b(\d+\s*(?:lbs?|kg|pounds|kilos|k\b))|\bmake\b.*\b(?:month|year|k\b)|\b(?:build|grow|scale|launch|start)\s+(?:a|my|the)\s+(?:business|company|brand|startup|agency|channel|audience)|\breach\b|\bhit\b\s*\d|\b(\d+)\s*(?:figure|figures)\b/;
const OUTCOME_HORIZON = /\b(\d+\s*(?:day|days|week|weeks|month|months|year|years)|90 ?day|6 ?month|one year|a year)\b/;

/** Identity / behavior patterns — "become disciplined", "stop being lazy", "stop procrastinating". */
const IDENTITY = /\b(become|be more|get more|stop being|stop|more disciplined|discipline\w*|consisten\w*|confiden\w*|lazy|laziness|procrastinat\w*|self ?control|self ?discipline|better person|less distracted|focus\w*)\b/;

export function classifyGoalType(
  description: string | null | undefined,
  timeline?: string | null,
): GoalType {
  const text = `${description ?? ''} ${timeline ?? ''}`.toLowerCase().trim();
  if (!text) return GoalType.OUTCOME;

  if (EMOTIONAL.test(text)) return GoalType.EMOTIONAL;
  if (HABIT.test(text)) return GoalType.HABIT;

  // A one-time task needs BOTH a deliverable verb AND a near horizon — otherwise
  // "send 100k/month" style outcome phrasing would be misread as a task.
  if (TASK_VERB.test(text) && (TASK_HORIZON.test(text) || (timeline ?? '').toLowerCase().match(/today|tomorrow|this week|\bday\b/))) {
    return GoalType.TASK;
  }

  if (OUTCOME.test(text) || OUTCOME_HORIZON.test(text)) return GoalType.OUTCOME;
  if (IDENTITY.test(text)) return GoalType.IDENTITY;

  return GoalType.OUTCOME;
}

/**
 * Shorten a goal description to its first clause for inline use in a text — so
 * we never dump "Make 100k a month, become more fit stop procrastinating" into
 * a single message. Splits on the first comma / " and " / sentence end.
 */
export function shortGoalReference(description: string | null | undefined): string {
  const raw = (description ?? '').trim();
  if (!raw) return 'your goal';
  const firstClause = raw.split(/,|\band\b|\.|;|—|\bstop\b/i)[0].trim();
  const clause = firstClause.length >= 3 ? firstClause : raw;
  return clause.length > 48 ? `${clause.slice(0, 45).trim()}…` : clause.toLowerCase();
}
