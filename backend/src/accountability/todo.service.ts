import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyTodo, DailyTodoSource, DailyTodoStatus } from '../data/entities/daily-todo.entity';
import { Goal } from '../data/entities/goal.entity';
import { findAllGoals } from '../data/goal-selection';
import { stripDayPrefix } from '../ai/prompts/checkin.prompt';
import { structuredLog } from '../common/logger';

/**
 * Per-day editable to-do list backing the coaching AI's awareness of what the
 * user is supposed to do today. Three entry paths:
 *   - plan seed (first message of the day → action_plan.daily_tasks[dayIdx])
 *   - user adds via chat → AI calls add_todo
 *   - AI proposes mid-coaching → AI calls add_todo with source='ai'
 *
 * Today is computed in server-local for now (matches DailyTask's startOfToday).
 * If the product later cares about user-local midnights, the call site can
 * pass an explicit date.
 */
@Injectable()
export class TodoService {
  private readonly logger = new Logger(TodoService.name);

  constructor(
    @InjectRepository(DailyTodo) private readonly todoRepo: Repository<DailyTodo>,
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
  ) {}

  async listToday(userId: string): Promise<DailyTodo[]> {
    const today = this.startOfToday();
    return this.todoRepo.find({
      where: { user_id: userId, scheduled_date: today },
      order: { created_at: 'ASC' },
    });
  }

  async add(args: {
    userId: string;
    content: string;
    source: DailyTodoSource;
  }): Promise<DailyTodo> {
    const today = this.startOfToday();
    const trimmed = args.content.trim().slice(0, 500);
    // USER/AI todos are commitments the instant they're created — the user or
    // the coach put them here in conversation (task-composition Approach C).
    const saved = await this.todoRepo.save({
      user_id: args.userId,
      scheduled_date: today,
      content: trimmed,
      status: DailyTodoStatus.OPEN,
      source: args.source,
      committed_at: new Date(),
    });
    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'todo_added',
      userId: args.userId,
      todoId: saved.id,
      source: args.source,
    });
    return saved;
  }

  async markDone(userId: string, todoId: string): Promise<DailyTodo | null> {
    const todo = await this.todoRepo.findOne({ where: { id: todoId } });
    if (!todo || todo.user_id !== userId) return null;
    if (todo.status === DailyTodoStatus.DONE) return todo;
    const now = new Date();
    await this.todoRepo.update(todoId, {
      status: DailyTodoStatus.DONE,
      completed_at: now,
      // Completing an item is agreement to it, retroactively — a proposal the
      // user actually did is now a commitment and counts (task-composition
      // Approach C). Only stamp if not already committed, to preserve the
      // original agreement time.
      ...(todo.committed_at ? {} : { committed_at: now }),
    });
    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'todo_done',
      userId,
      todoId,
    });
    return this.todoRepo.findOne({ where: { id: todoId } });
  }

  async remove(userId: string, todoId: string): Promise<boolean> {
    const todo = await this.todoRepo.findOne({ where: { id: todoId } });
    if (!todo || todo.user_id !== userId) return false;
    await this.todoRepo.delete(todoId);
    return true;
  }

  /**
   * Idempotently seed today's list from goal.action_plan.daily_tasks if it has
   * not been seeded yet. Returns the list of todos in place after seeding.
   *
   * Heuristic: if today has at least one PLAN-source todo, we've already seeded.
   * If not, parse the day-N plan entry into discrete items (the strings in
   * daily_tasks[] pack multiple actions per day separated by sentences) and
   * create one todo per item.
   */
  async ensureSeededForToday(userId: string): Promise<DailyTodo[]> {
    const today = this.startOfToday();
    const existing = await this.todoRepo.find({
      where: { user_id: userId, scheduled_date: today },
    });
    if (existing.some((t) => t.source === DailyTodoSource.PLAN)) {
      return existing;
    }

    // Seed today's plan todos from EVERY goal's action plan — multi-goal
    // coaching (Karibi 2026-06-12). Each goal contributes its day-N items so the
    // coaching AI sees what's on the plate across all goals, not just the anchor.
    const goals = await findAllGoals(this.goalRepo, userId);
    const planned = goals.filter((g) => (g.action_plan?.daily_tasks?.length ?? 0) > 0);
    if (planned.length === 0) {
      return existing;
    }

    // Use the count of distinct plan-sourced *days* this user has had as the
    // day-index — counts unique scheduled_date values to avoid drift if a day
    // was skipped or rescheduled. Falls back to row count if the query fails.
    // Shared across goals (it's a day counter); each goal cycles on its own length.
    const priorPlanRows = await this.todoRepo
      .createQueryBuilder('t')
      .select('DISTINCT t.scheduled_date', 'd')
      .where('t.user_id = :uid', { uid: userId })
      .andWhere('t.source = :src', { src: DailyTodoSource.PLAN })
      .getRawMany()
      .catch(() => null);
    const dayIndex = priorPlanRows ? priorPlanRows.length : 0;

    const created: DailyTodo[] = [];
    for (const goal of planned) {
      const dailyTasks = goal.action_plan.daily_tasks;
      const dayEntry = dailyTasks[dayIndex % dailyTasks.length];
      for (const item of splitPlanDayIntoItems(dayEntry)) {
        created.push(
          await this.todoRepo.save({
            user_id: userId,
            scheduled_date: today,
            content: item,
            status: DailyTodoStatus.OPEN,
            source: DailyTodoSource.PLAN,
          }),
        );
      }
    }
    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'todos_seeded_from_plan',
      userId,
      dayIndex,
      goalCount: planned.length,
      itemCount: created.length,
    });
    return [...existing, ...created];
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

/**
 * Split a plan-day entry into discrete todo items. The strings in
 * `action_plan.daily_tasks` come from the LLM-generated plan and typically
 * look like:
 *   "Day 1 Monday: Block Netflix on all devices. Schedule gym 5am appointment.
 *    Define 3 business revenue activities. Tell 1 person your 90-day goal."
 *
 * We drop the "Day N {weekday}:" prefix, then split on sentence punctuation,
 * filter out fragments shorter than 4 chars, and trim trailing punctuation.
 *
 * Exported for tests.
 */
export function splitPlanDayIntoItems(entry: string): string[] {
  if (!entry) return [];
  // Strip leading "Day N:", "Day N Weekday:", or "Day N (Weekday):" prefix.
  // (parenthesized weekday previously leaked through and showed up in check-ins)
  const stripped = stripDayPrefix(entry);
  if (!stripped) return [];

  // Split on sentence terminators. Comma-only lists ("eggs, bacon, toast") would
  // over-split — we keep commas inside items so "chicken, rice, broccoli" stays one item.
  const parts = stripped.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);

  const items = parts
    .map((p) =>
      p
        .trim()
        .replace(/[.!?]+$/, '')
        .trim(),
    )
    .filter((p) => p.length >= 4);

  // Fold trailing MODIFIER sentences back into the item they belong to. A plan
  // entry like "Write down exactly why you skip legs. Be honest." is ONE task
  // with an instruction attached — but the sentence split above made "Be
  // honest" a standalone todo, which appeared on the user's list, was never
  // completable, and counted as a MISS in the weekly review
  // (KIBA_Retraining_Doc B4 — the ledger inventing items).
  //
  // What separates a modifier from a real short task is the OPENER, not the
  // length: modifiers start with copulas/connectives ("Be honest", "No
  // excuses", "Because consistency matters"), real tasks start with action
  // verbs ("Eat clean", "Run 5K", "Map the journey" — all legitimate items
  // pinned by tests). So fold only short sentences that open with a
  // non-actionable word. Folding is lossless either way — the text stays,
  // attached to the task it was modifying, instead of becoming a phantom
  // checkable.
  const MODIFIER_OPENER =
    /^(be|being|no|not|don'?t|do it|just|stay|keep it|because|why|so|and|also|then|remember|honestly|seriously|for real)\b/i;
  const folded: string[] = [];
  for (const item of items) {
    const isModifier = item.split(/\s+/).length <= 4 && MODIFIER_OPENER.test(item);
    if (isModifier && folded.length > 0) {
      folded[folded.length - 1] = `${folded[folded.length - 1]}. ${item}`;
    } else {
      folded.push(item);
    }
  }

  // Collapse near-duplicate items within the SAME day. The LLM plan entry
  // sometimes restates one action in two sentences — "Review your week. Review
  // the week.", "Repeat Day 5 routine exactly. Repeat Day 5 structure." — and
  // both used to seed onto the board, so the user saw the same instruction
  // twice (Bianca 2026-07-22/23). Two collapse signals, both conservative:
  //   1. same content words (articles/possessives/order ignored) —
  //      "review your week" == "review the week";
  //   2. same first THREE content words in order — catches a shared action with
  //      a differing descriptor ("repeat day 5 routine" / "repeat day 5
  //      structure") without merging items that only share an object
  //      ("call 5 leads" / "email 5 leads" differ at word 1, so they're kept).
  // Keep the FIRST occurrence — the earlier, usually fuller phrasing. Dropping a
  // real task is the worse error, so both keys demand strong agreement.
  const deduped: string[] = [];
  const seenExact = new Set<string>();
  const seenPrefix = new Set<string>();
  for (const item of folded) {
    const words = contentWords(item);
    const exact = [...words].sort().join(' ');
    const prefix = words.length >= 3 ? words.slice(0, 3).join(' ') : '';
    // Empty key (all stopwords) can't be compared safely — keep it verbatim.
    if (exact && (seenExact.has(exact) || (prefix && seenPrefix.has(prefix)))) continue;
    if (exact) seenExact.add(exact);
    if (prefix) seenPrefix.add(prefix);
    deduped.push(item);
  }
  return deduped;
}

const DEDUP_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'your',
  'my',
  'our',
  'this',
  'that',
  'and',
  'to',
  'of',
  'for',
  'in',
  'on',
  'it',
  'you',
]);

/** Ordered content words: lowercased, punctuation and articles/possessives
 *  dropped. Order preserved so a leading-phrase prefix can be compared. */
function contentWords(item: string): string[] {
  return item
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !DEDUP_STOPWORDS.has(w));
}
