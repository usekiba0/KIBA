import {
  resolvePressurePreference,
  hasConsentedToHardPush,
} from '../../src/ai/accountability-consent';
import { PressurePreference } from '../../src/data/entities/psychological-profile.entity';

describe('accountability consent (INV-5)', () => {
  describe('resolving the stored preference', () => {
    it('opts in only on the explicit answer', () => {
      expect(resolvePressurePreference('pressure')).toBe(PressurePreference.PRESSURE);
    });

    it('honours an explicit request for encouragement', () => {
      expect(resolvePressurePreference('encouragement')).toBe(PressurePreference.ENCOURAGEMENT);
    });

    it('treats unknown as encouragement, not as consent', () => {
      // The bug this file exists for. The old inline default sent anyone whose intake never
      // recorded an answer straight to "stay sharp and direct, zero softening" — hard
      // accountability nobody agreed to.
      for (const raw of [null, undefined, '', '   ', 'Pressure', 'PRESSURE', 'hard', 'toxic', 'yes']) {
        expect(resolvePressurePreference(raw)).toBe(PressurePreference.ENCOURAGEMENT);
      }
    });

    it('does not read a value from an older intake schema as consent', () => {
      // A renamed or reordered intake field must fail toward warmth, never toward pushing.
      expect(resolvePressurePreference('tough_love')).toBe(PressurePreference.ENCOURAGEMENT);
      expect(resolvePressurePreference('direct')).toBe(PressurePreference.ENCOURAGEMENT);
    });
  });

  describe('gating the hardest register', () => {
    it('allows it only where consent is stored', () => {
      expect(hasConsentedToHardPush(PressurePreference.PRESSURE)).toBe(true);
    });

    it('refuses it for everyone else', () => {
      expect(hasConsentedToHardPush(PressurePreference.ENCOURAGEMENT)).toBe(false);
      expect(hasConsentedToHardPush(null)).toBe(false);
      expect(hasConsentedToHardPush(undefined)).toBe(false);
    });
  });
});
