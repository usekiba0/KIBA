import { normalizePhoneNumber } from '../../src/common/phone';

describe('normalizePhoneNumber', () => {
  it('leaves a well-formed E.164 number unchanged', () => {
    expect(normalizePhoneNumber('+17135551234')).toBe('+17135551234');
  });

  it('adds +1 to a bare 10-digit US number (the reset-bug case)', () => {
    expect(normalizePhoneNumber('7135551234')).toBe('+17135551234');
  });

  it('adds + to an 11-digit number already carrying the US country code', () => {
    expect(normalizePhoneNumber('17135551234')).toBe('+17135551234');
  });

  it('strips formatting punctuation and spaces', () => {
    expect(normalizePhoneNumber('+1 (713) 555-1234')).toBe('+17135551234');
    expect(normalizePhoneNumber('713.555.1234')).toBe('+17135551234');
  });

  it('collapses every common inbound shape of one number to the same canonical value', () => {
    const canonical = '+17135551234';
    for (const variant of ['+17135551234', '17135551234', '7135551234', '+1 713-555-1234', '(713) 555 1234']) {
      expect(normalizePhoneNumber(variant)).toBe(canonical);
    }
  });

  it('preserves non-US country codes that arrive with a leading +', () => {
    expect(normalizePhoneNumber('+442071234567')).toBe('+442071234567');
    expect(normalizePhoneNumber('+92 300 1234567')).toBe('+923001234567');
  });

  it('returns empty/garbage input without throwing', () => {
    expect(normalizePhoneNumber('')).toBe('');
    expect(normalizePhoneNumber('not a number')).toBe('not a number');
  });
});
