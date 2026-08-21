/**
 * Runtime wiring for the trust guards, with an observe-first switch.
 *
 * WHY THIS IS NOT SIMPLY ON
 *
 * A guard that fires wrongly is worse than no guard. `stripFalseMemoryClaims` deletes a
 * sentence and `detectWeaponisedMemory` can force a regeneration; either misfiring on real
 * traffic degrades replies for people who did nothing wrong, and neither failure announces
 * itself — the user just gets a slightly worse KIBA and never says why.
 *
 * So both start in OBSERVE mode: they run, they log exactly what they would have done, and
 * they change nothing. Once the logs show a real false-positive rate of roughly zero,
 * REPLY_GUARDS_ENFORCE flips them on. That ordering costs a few days and buys certainty, which
 * is the right trade for a guard whose whole job is protecting trust.
 *
 * Reading the counters:
 *   evt=guard_observed   would have acted; nothing changed
 *   evt=guard_enforced   acted for real
 * A steady stream of guard_observed on ordinary conversation means the pattern is too broad
 * and must be narrowed BEFORE enforcing, not after.
 */

import { Logger } from '@nestjs/common';
import { stripFalseMemoryClaims } from './memory-claim-guard';
import { detectWeaponisedMemory } from './sensitive-memory-guard';
import { structuredLog } from '../common/logger';

export type GuardMode = 'observe' | 'enforce';

/**
 * Defaults to observe. Anything other than the exact string 'true' leaves it observing, so a
 * typo in an env var can never silently start rewriting live replies.
 */
export function guardMode(env: { REPLY_GUARDS_ENFORCE?: string }): GuardMode {
  return env.REPLY_GUARDS_ENFORCE === 'true' ? 'enforce' : 'observe';
}

export interface GuardOutcome {
  /** The reply to send. Unchanged in observe mode, always. */
  reply: string;
  /** True when a sensitive-topic leverage hit needs the turn regenerated. */
  needsRegeneration: boolean;
}

/**
 * INV-2. Needs the factual context the turn was actually given, so it runs where that context
 * exists rather than at the send choke point.
 */
export function applyMemoryGuard(
  logger: Logger,
  userId: string,
  reply: string,
  context: string,
  mode: GuardMode,
): string {
  const { reply: cleaned, stripped } = stripFalseMemoryClaims(reply, context);
  if (stripped.length === 0) return reply;

  structuredLog(logger, 'warn', {
    service: 'ai',
    operation: mode === 'enforce' ? 'guard_enforced' : 'guard_observed',
    guard: 'memory_claim',
    userId,
    strippedCount: stripped.length,
    // The sentence itself, so a false positive can be read back and the pattern narrowed.
    sample: stripped[0]?.slice(0, 160),
  });

  return mode === 'enforce' ? cleaned : reply;
}

/**
 * INV-6. Needs nothing but the reply, so it runs at the send choke point and covers every path
 * including intake.
 *
 * Reports rather than repairs: the turn was built around the leverage, so deleting the sentence
 * leaves a non-sequitur. Enforcement means regenerate, which the caller decides.
 */
export function applySensitiveGuard(
  logger: Logger,
  userId: string,
  reply: string,
  mode: GuardMode,
): GuardOutcome {
  const { weaponised, offending } = detectWeaponisedMemory(reply);
  if (!weaponised) return { reply, needsRegeneration: false };

  structuredLog(logger, 'warn', {
    service: 'ai',
    operation: mode === 'enforce' ? 'guard_enforced' : 'guard_observed',
    guard: 'sensitive_memory',
    userId,
    sample: offending[0]?.slice(0, 160),
  });

  return { reply, needsRegeneration: mode === 'enforce' };
}
