import {
  mintCheckoutToken,
  verifyCheckoutToken,
  planLinkFor,
} from '../../src/onboarding/checkout-link';

/**
 * Plan-selection link tokens — Karibi 2026-07-20.
 *
 * The token IS the credential for an unguarded public endpoint, so these tests
 * exist to pin the security properties, not just the happy path: a forged or
 * tampered token must never verify, and an old one must stop working.
 */
describe('checkout link tokens', () => {
  const SECRET = 'test-secret';
  const USER = '11111111-2222-3333-4444-555555555555';

  it('round-trips a freshly minted token', () => {
    const token = mintCheckoutToken(SECRET, USER);
    expect(verifyCheckoutToken(SECRET, token)).toEqual({ ok: true, userId: USER });
  });

  it('rejects a token signed with a different secret', () => {
    // The forged token is structurally perfect — same user, same expiry, valid
    // shape. Only the secret differs.
    const forged = mintCheckoutToken('attacker-secret', USER);
    expect(verifyCheckoutToken('real-secret', forged)).toEqual({
      ok: false,
      reason: 'invalid_token',
    });
  });

  it('rejects a token whose user id was swapped', () => {
    const [, exp, sig] = mintCheckoutToken(SECRET, USER).split('.');
    const tampered = `99999999-2222-3333-4444-555555555555.${exp}.${sig}`;
    expect(verifyCheckoutToken(SECRET, tampered)).toEqual({
      ok: false,
      reason: 'invalid_token',
    });
  });

  it('rejects a token whose expiry was pushed out', () => {
    // Extending your own link must require the secret, not just editing the URL.
    const [userId, , sig] = mintCheckoutToken(SECRET, USER).split('.');
    const farFuture = Math.floor(Date.now() / 1000) + 999_999;
    expect(verifyCheckoutToken(SECRET, `${userId}.${farFuture}.${sig}`)).toEqual({
      ok: false,
      reason: 'invalid_token',
    });
  });

  it('reports an untampered but aged-out token as expired', () => {
    const minted = mintCheckoutToken(SECRET, USER, Date.parse('2026-07-01T00:00:00Z'));
    // 8 days later — one past the 7-day TTL.
    const later = Date.parse('2026-07-09T00:00:00Z');
    expect(verifyCheckoutToken(SECRET, minted, later)).toEqual({ ok: false, reason: 'expired' });
  });

  it('still accepts a token inside its window', () => {
    const minted = mintCheckoutToken(SECRET, USER, Date.parse('2026-07-01T00:00:00Z'));
    const later = Date.parse('2026-07-06T00:00:00Z');
    expect(verifyCheckoutToken(SECRET, minted, later)).toEqual({ ok: true, userId: USER });
  });

  it.each([
    ['empty', ''],
    ['no separators', 'garbage'],
    ['too few parts', `${USER}.123`],
    ['too many parts', `${USER}.123.sig.extra`],
    ['empty signature', `${USER}.123.`],
  ])('rejects a malformed token (%s) without throwing', (_label, token) => {
    // timingSafeEqual throws on length mismatch, so malformed input must be
    // screened before it reaches the compare.
    expect(() => verifyCheckoutToken(SECRET, token)).not.toThrow();
    expect(verifyCheckoutToken(SECRET, token).ok).toBe(false);
  });

  it('does not verify across a secret rotation', () => {
    const minted = mintCheckoutToken('old-secret', USER);
    expect(verifyCheckoutToken('new-secret', minted).ok).toBe(false);
  });

  it('builds a plan link on the frontend origin carrying the token', () => {
    const url = planLinkFor(SECRET, 'https://kiba.example', USER);
    expect(url.startsWith('https://kiba.example/plan?t=')).toBe(true);
    const token = new URL(url).searchParams.get('t') ?? '';
    expect(verifyCheckoutToken(SECRET, token)).toEqual({ ok: true, userId: USER });
  });

  it('produces a URL-safe token that survives a round trip through a query string', () => {
    // base64url, not base64 — a '+' or '/' would be mangled by the SMS client or
    // the browser and the link would silently fail to verify.
    const token = mintCheckoutToken(SECRET, USER);
    expect(token).not.toMatch(/[+/=]/);
    const parsed = new URL(planLinkFor(SECRET, 'https://kiba.example', USER)).searchParams.get('t');
    expect(verifyCheckoutToken(SECRET, parsed ?? '').ok).toBe(true);
  });
});
