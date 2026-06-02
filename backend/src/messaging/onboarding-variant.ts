import { OnboardingVariant } from '../data/entities/user.entity';

/**
 * Maps the pre-filled text of an ad's SMS deep-link to an onboarding variant.
 *
 * Ads can ship distinct pre-filled first messages (e.g. one creative opens the
 * SMS app with "what even is kiba", another with "what's up kiba"). That text
 * arrives as the lead's very first inbound message. We normalise it and match it
 * here so each ad can open with a different first reply while still funnelling
 * into the same intake → payment flow.
 *
 * Data-driven on purpose: adding a new ad keyword is a one-line edit to the
 * table below — no branching logic to touch. Phrases must be pre-normalised
 * (lowercase, alphanumerics + single spaces only) to match `normalise()`.
 */
const VARIANT_KEYWORDS: { variant: OnboardingVariant; phrases: string[] }[] = [
  {
    variant: OnboardingVariant.EXPLAINER,
    phrases: ['what even is kiba', 'what is kiba', 'whats kiba', 'who is kiba', 'who even is kiba'],
  },
  {
    variant: OnboardingVariant.CASUAL,
    phrases: ['whats up kiba', 'what up kiba', 'wassup kiba', 'sup kiba', 'yo kiba', 'hey kiba'],
  },
];

/** Lowercase, strip punctuation/emoji, collapse whitespace. */
function normalise(body: string): string {
  return body
    .toLowerCase()
    // Drop apostrophes entirely so "what's" → "whats" (don't split into two words).
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify a cold lead's first inbound message into an onboarding variant.
 * Returns STANDARD when nothing matches (organic texters, unknown keywords).
 *
 * Matches on exact phrase OR prefix, so trailing text the user appended after
 * the pre-fill (e.g. "what even is kiba lol") still routes correctly.
 */
export function detectOnboardingVariant(body: string | null | undefined): OnboardingVariant {
  if (!body) return OnboardingVariant.STANDARD;
  const norm = normalise(body);
  if (!norm) return OnboardingVariant.STANDARD;
  for (const { variant, phrases } of VARIANT_KEYWORDS) {
    if (phrases.some((p) => norm === p || norm.startsWith(`${p} `))) return variant;
  }
  return OnboardingVariant.STANDARD;
}
