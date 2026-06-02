import { detectOnboardingVariant } from '../../src/messaging/onboarding-variant';
import { OnboardingVariant } from '../../src/data/entities/user.entity';

describe('detectOnboardingVariant', () => {
  it('routes "what even is kiba" pre-fill to EXPLAINER', () => {
    expect(detectOnboardingVariant('what even is kiba')).toBe(OnboardingVariant.EXPLAINER);
    expect(detectOnboardingVariant('What even is KIBA?')).toBe(OnboardingVariant.EXPLAINER);
    expect(detectOnboardingVariant('what is kiba')).toBe(OnboardingVariant.EXPLAINER);
  });

  it('routes "what\'s up kiba" pre-fill to CASUAL', () => {
    expect(detectOnboardingVariant("what's up kiba")).toBe(OnboardingVariant.CASUAL);
    expect(detectOnboardingVariant('whats up kiba')).toBe(OnboardingVariant.CASUAL);
    expect(detectOnboardingVariant('yo kiba')).toBe(OnboardingVariant.CASUAL);
  });

  it('tolerates trailing text the user appended after the pre-fill', () => {
    expect(detectOnboardingVariant('what even is kiba lol')).toBe(OnboardingVariant.EXPLAINER);
    expect(detectOnboardingVariant("what's up kiba haha")).toBe(OnboardingVariant.CASUAL);
  });

  it('falls back to STANDARD for organic / unknown first messages', () => {
    expect(detectOnboardingVariant('hey i want to lose weight')).toBe(OnboardingVariant.STANDARD);
    expect(detectOnboardingVariant('')).toBe(OnboardingVariant.STANDARD);
    expect(detectOnboardingVariant(null)).toBe(OnboardingVariant.STANDARD);
    expect(detectOnboardingVariant(undefined)).toBe(OnboardingVariant.STANDARD);
  });

  it('does not match when "kiba" only appears mid-sentence (not an ad pre-fill)', () => {
    expect(detectOnboardingVariant('is this the kiba app')).toBe(OnboardingVariant.STANDARD);
  });
});
