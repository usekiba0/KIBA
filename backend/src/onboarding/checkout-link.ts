import * as crypto from 'crypto';

/**
 * Signed, expiring links to the plan-selection page.
 *
 * Deliberately PLAIN functions, not an injectable service. Both the messaging
 * side (which mints links) and the onboarding side (which verifies them) need
 * this, and wiring a shared provider between those two modules created a Nest
 * dependency cycle — MessagingModule and OnboardingModule already reference each
 * other. Since signing needs nothing but a secret, keeping it dependency-free
 * sidesteps the graph entirely.
 */

/** How long a texted plan link stays openable. Deliberately longer than the
 * dunning sequence (first nudge ~2.5h, last ~2-3 days) so a lead who comes back
 * on day 3 taps a working link instead of a dead one. */
export const LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

export type TokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid_token' | 'expired' };

function sign(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/** `<userId>.<expiryEpochSeconds>.<hmac>` — opaque to the user, verifiable by us. */
export function mintCheckoutToken(secret: string, userId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(secret, payload)}`;
}

/**
 * Verify a link token. The signature is checked with a timing-safe compare and
 * ALWAYS before the expiry, so a forged token can't be probed for validity by
 * watching which error comes back.
 */
export function verifyCheckoutToken(
  secret: string,
  token: string,
  now = Date.now(),
): TokenResult {
  const parts = (token ?? '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid_token' };
  const [userId, expRaw, sig] = parts;
  if (!userId || !expRaw || !sig) return { ok: false, reason: 'invalid_token' };

  const expected = sign(secret, `${userId}.${expRaw}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so screen that first.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid_token' };
  }

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < now) return { ok: false, reason: 'expired' };

  return { ok: true, userId };
}

/** The URL we text instead of a raw Stripe Checkout URL. */
export function planLinkFor(
  secret: string,
  frontendUrl: string,
  userId: string,
  now = Date.now(),
): string {
  return `${frontendUrl}/plan?t=${mintCheckoutToken(secret, userId, now)}`;
}
