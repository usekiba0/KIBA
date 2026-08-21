/**
 * Which accountability register a user has actually agreed to (INV-5).
 *
 * The doctrine treats this as consent, not configuration. Master 10 makes it a question KIBA
 * has to ask outright — "when i need to call you out, how hard are you cool with me being?" —
 * and Master 18 permits the aggressive register "only when the user explicitly opted in".
 *
 * Lives in its own file because it used to be an inline ternary in profile creation, where a
 * one-word difference silently decided how hard KIBA pushes a stranger, and nothing tested it.
 */

import { PressurePreference } from '../data/entities/psychological-profile.entity';

/**
 * Resolve the stored preference from whatever intake captured.
 *
 * Unknown means ENCOURAGEMENT. This is the direction the doctrine points, and it is also the
 * cheaper mistake: someone who wanted to be pushed and gets warmth tells you so in one message,
 * whereas someone who gets pushed without ever agreeing to it simply leaves, and never says
 * why.
 *
 * Only the literal 'pressure' opts in. Anything else — absent, empty, misspelt, a value from an
 * older intake schema — resolves to encouragement rather than being read as consent.
 */
export function resolvePressurePreference(
  raw: string | null | undefined,
): PressurePreference {
  return raw === 'pressure' ? PressurePreference.PRESSURE : PressurePreference.ENCOURAGEMENT;
}

/**
 * Has this user opted in to the hardest register?
 *
 * Separate from the resolver so call sites read as the question they are actually asking, and
 * so a future third level (Master 10 lists supportive / direct / tough love) has one place to
 * land rather than being spread across every gate.
 */
export function hasConsentedToHardPush(preference: PressurePreference | null | undefined): boolean {
  return preference === PressurePreference.PRESSURE;
}
