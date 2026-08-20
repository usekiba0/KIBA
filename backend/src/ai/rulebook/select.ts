/**
 * Chooses which rulebook a turn runs on, and splits it across the two prompt blocks.
 *
 * THE CACHE CONSTRAINT, WHICH DRIVES THE SHAPE OF THIS FILE
 *
 * `coaching.service.ts` sends two system blocks: the first is marked `ephemeral` so Anthropic
 * serves it from cache, the second carries per-user context. The cached block only pays off
 * while it is byte-identical for every user on every turn — one person's message keeps it warm
 * for everybody else.
 *
 * That rules out the obvious wiring. Appending the domain playbook to the cached block would
 * give seven different prefixes (six topics plus none), splintering one shared cache entry
 * into seven colder ones. So the playbook goes in the DYNAMIC block instead, where it can vary
 * per turn at no cache cost, and the cached block stays exactly the invariant L0+L1.
 *
 * Same reason V1's warning existed: put anything variable in the cached half and the win
 * disappears with no error and no log line, just a quietly larger bill.
 */

import { COACHING_STATIC_RULES } from '../prompts/coaching.prompt';
import { buildCachePrefix, buildL2 } from './compile';
import { classifyTopic } from './topic';
import { Topic } from './rules';

export interface RulebookSelection {
  /** Goes in the cached block. Byte-identical across users by construction. */
  cachedRules: string;
  /**
   * Goes in the dynamic block, ahead of the per-user context. Empty string when no playbook
   * applies, which is the common case.
   */
  playbook: string;
  /** Which doctrine served this turn. Logged so a flagged rollout can be read from traffic. */
  version: 'v1' | 'v2';
  /** Null when no playbook was selected. Logged for classifier tuning. */
  topic: Topic | null;
}

export interface SelectRulebookArgs {
  /** The user's current message. */
  incomingText: string;
  /** Recent turns, if available. Gives the classifier context for replies like "did you go?". */
  recentContext?: string;
  /** Whether V2 is enabled for this user. Resolved by the caller from config. */
  useV2: boolean;
}

/**
 * V1 keeps its single monolithic string and no playbook — that is what it has always been, and
 * the point of the flag is that V1 behaviour is unchanged while V2 is being tested.
 */
export function selectRulebook(args: SelectRulebookArgs): RulebookSelection {
  if (!args.useV2) {
    return {
      cachedRules: COACHING_STATIC_RULES,
      playbook: '',
      version: 'v1',
      topic: null,
    };
  }

  const topic = classifyTopic(args.incomingText, args.recentContext ?? '');
  return {
    cachedRules: buildCachePrefix(),
    playbook: buildL2(topic),
    version: 'v2',
    topic,
  };
}

/**
 * Is V2 on for this user?
 *
 * Two switches, deliberately. `TRAINING_V2_ENABLED` is the global rollout. `TRAINING_V2_NUMBERS`
 * is an allowlist so the founder can test the rebuild on his own number while every live user
 * stays on V1 — the same shape as `LATENCY_ECHO_NUMBERS`, which is already the established
 * pattern here for exactly this situation.
 *
 * Fails closed: anything unparseable leaves the user on V1. A bad env value should never
 * silently move real users onto an untested rulebook.
 */
export function isV2EnabledFor(
  phoneNumber: string | null | undefined,
  env: { TRAINING_V2_ENABLED?: string; TRAINING_V2_NUMBERS?: string },
): boolean {
  if (env.TRAINING_V2_ENABLED === 'true') return true;

  const allowlist = (env.TRAINING_V2_NUMBERS ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (allowlist.length === 0 || !phoneNumber) return false;

  // Compare the last ten digits, not the whole string. The same number reaches us as
  // +18327355182, 18327355182 and (832) 735-5182 depending on the path, so a full-string
  // comparison matches only whichever form happens to be in the env var — it would pass in
  // testing and fail in production the moment someone typed it without the country code.
  //
  // Ten digits is the right window for a US 10DLC product: it makes the country code optional
  // without truncating a real subscriber number. It would be too loose for international
  // numbers, which this allowlist is not for — it exists so the founder can test on his own
  // line.
  const last10 = (s: string) => s.replace(/\D/g, '').slice(-10);
  const target = last10(phoneNumber);
  if (target.length < 10) return false;
  return allowlist.some((entry) => last10(entry) === target);
}
