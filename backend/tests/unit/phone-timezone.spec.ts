import { isOffsetPlausibleForPhone, expectedOffsetRangeForPhone } from '../../src/messaging/phone-timezone';

describe('phone-timezone sanity check', () => {
  describe('expectedOffsetRangeForPhone', () => {
    it('maps Pakistan (+92) to UTC+5', () => {
      expect(expectedOffsetRangeForPhone('+923323043863')).toEqual([300, 300]);
    });
    it('maps US/Canada (+1) to a wide western range', () => {
      expect(expectedOffsetRangeForPhone('+13058798468')).toEqual([-600, -180]);
    });
    it('prefers the longest calling-code prefix (353 Ireland over 3)', () => {
      expect(expectedOffsetRangeForPhone('+353871234567')).toEqual([0, 60]);
    });
    it('returns null for an unknown country code', () => {
      expect(expectedOffsetRangeForPhone('+9991234567')).toBeNull();
    });
    it('returns null for empty/missing input', () => {
      expect(expectedOffsetRangeForPhone(null)).toBeNull();
      expect(expectedOffsetRangeForPhone('')).toBeNull();
    });
  });

  describe('isOffsetPlausibleForPhone', () => {
    it('flags the Ali case: +92 number stored as UTC-5', () => {
      expect(isOffsetPlausibleForPhone('+923323043863', -300)).toBe(false);
    });
    it('accepts a +92 number stored as UTC+5', () => {
      expect(isOffsetPlausibleForPhone('+923323043863', 300)).toBe(true);
    });
    it('accepts a US number at Central (UTC-5/-6)', () => {
      expect(isOffsetPlausibleForPhone('+13058798468', -300)).toBe(true);
      expect(isOffsetPlausibleForPhone('+13058798468', -360)).toBe(true);
    });
    it('tolerates a 1h DST/edge slack but rejects gross errors', () => {
      // India is exactly +330; +390 (1h over) is within tolerance, +600 is not.
      expect(isOffsetPlausibleForPhone('+919812345678', 390)).toBe(true);
      expect(isOffsetPlausibleForPhone('+919812345678', 600)).toBe(false);
    });
    it('returns null (no judgement) for unknown country codes', () => {
      expect(isOffsetPlausibleForPhone('+9991234567', -300)).toBeNull();
    });
  });
});
