import { REFERRAL_CODE_RE } from '../../src/messaging/coaching.processor';
import { normalizeReferralCode } from '../../src/data/entities/referral-code.entity';
import { ReferralService } from '../../src/data/referral.service';

/**
 * Affiliate / referral codes — Karibi 2026-07-20 (20-user beta).
 *
 * The regex is deliberately loose because the guard only ACTS on a token that
 * resolves to a real code; these tests pin BOTH halves of that contract — it
 * must catch the real phrasings, and its false positives must stay harmless
 * (i.e. extract something, so the DB lookup misses and we fall through quietly).
 */
describe('REFERRAL_CODE_RE — extraction', () => {
  const extract = (s: string) => s.match(REFERRAL_CODE_RE)?.[1] ?? null;

  it.each([
    ['my code is KIBA20', 'KIBA20'],
    ['code KIBA20', 'KIBA20'],
    ['CODE: BETA30', 'BETA30'],
    ['redeem BETA30', 'BETA30'],
    ['referral code kiba20', 'kiba20'],
    ['promo=partner-x', 'partner-x'],
    ['affiliate code: TRAINER7', 'TRAINER7'],
    ['i have a coupon for FALL2026', 'FALL2026'],
    ['invite code is dave-100', 'dave-100'],
  ])('pulls the token out of %j', (input, expected) => {
    expect(extract(input)).toBe(expected);
  });

  it('is case-insensitive on the keyword', () => {
    expect(extract('REDEEM kiba20')).toBe('kiba20');
  });

  it('ignores a bare code with no redemption keyword', () => {
    // Without a keyword we must NOT guess — every other word in every message
    // would look like a code.
    expect(extract('KIBA20')).toBeNull();
    expect(extract('i want to lose 20 lbs')).toBeNull();
  });

  it('ignores a keyword with nothing code-shaped after it', () => {
    expect(extract('whats the code?')).toBeNull();
    expect(extract('do i need a code')).toBeNull();
  });

  it('extracts (harmlessly) from incidental chat so the lookup can miss', () => {
    // These are the accepted false positives. The token is nonsense, so
    // ReferralService.redeem returns 'unknown' and the turn falls through to the
    // intake AI without ever telling the user their "code" was invalid.
    expect(extract('the code is broken')).toBe('broken');
  });
});

describe('normalizeReferralCode', () => {
  it('uppercases and strips whitespace and dashes', () => {
    expect(normalizeReferralCode(' kiba-20 ')).toBe('KIBA20');
    expect(normalizeReferralCode('partner x')).toBe('PARTNERX');
  });

  it('maps every casing/spacing of one code to the same token', () => {
    const forms = ['kiba20', 'KIBA20', ' Kiba20 ', 'kiba-20', 'KIBA 20'];
    const normalized = new Set(forms.map(normalizeReferralCode));
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe('KIBA20');
  });

  it('caps at the column width so a long paste can never overflow', () => {
    expect(normalizeReferralCode('A'.repeat(100))).toHaveLength(32);
  });

  it('returns empty for input with nothing code-ish in it', () => {
    expect(normalizeReferralCode('   ')).toBe('');
    expect(normalizeReferralCode('')).toBe('');
  });
});

describe('ReferralService.trialDaysFor', () => {
  const service = new ReferralService(null as never, null as never, null as never);

  it('uses the configured default when the user redeemed no code', () => {
    expect(service.trialDaysFor({ referral_trial_days: null }, 7)).toBe(7);
  });

  it('uses the frozen referral grant when there is one', () => {
    expect(service.trialDaysFor({ referral_trial_days: 30 }, 7)).toBe(30);
  });

  it('falls back to the default on a nonsense grant rather than a zero-day trial', () => {
    // A 0 would mean "charge immediately" — the opposite of what a referral
    // promises, so never let a bad row produce one.
    expect(service.trialDaysFor({ referral_trial_days: 0 }, 7)).toBe(7);
    expect(service.trialDaysFor({ referral_trial_days: -5 }, 7)).toBe(7);
  });
});
