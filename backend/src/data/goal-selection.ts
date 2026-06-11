import { Repository } from 'typeorm';
import { Goal } from './entities/goal.entity';

/**
 * Resolve a user's ANCHOR goal — the single goal the daily accountability loop
 * revolves around (morning check-in / DailyTask seeding, ghost re-engagement,
 * difficulty adjustment, plan generation).
 *
 * Users may now hold several goals (Karibi 2026-06-03 "allow more than one
 * goal"), but the product keeps a one-thing-a-day rhythm: exactly one goal is
 * flagged `is_anchor` and drives the daily loop; the rest are stored and
 * referenced, not each pushed daily.
 *
 * Prefers the flagged anchor; falls back to the most-recently-created goal so
 * rows created before the flag existed (legacy data, the web form before it set
 * the flag, etc.) still resolve to a sensible goal instead of null.
 */
export async function findAnchorGoal(
  goalRepo: Repository<Goal>,
  userId: string,
): Promise<Goal | null> {
  const anchored = await goalRepo.findOne({
    where: { user_id: userId, is_anchor: true },
  });
  if (anchored) return anchored;
  return goalRepo.findOne({
    where: { user_id: userId },
    order: { created_at: 'DESC' },
  });
}

/** All of a user's goals, anchor first then newest — for surfacing the full set. */
export async function findAllGoals(
  goalRepo: Repository<Goal>,
  userId: string,
): Promise<Goal[]> {
  return goalRepo.find({
    where: { user_id: userId },
    order: { is_anchor: 'DESC', created_at: 'DESC' },
  });
}
