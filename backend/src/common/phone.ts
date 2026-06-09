/**
 * Canonicalize an inbound phone number to E.164 so the same human always maps
 * to the same `users` row regardless of which channel/format it arrives in.
 *
 * Why this exists: Twilio delivers `From` in E.164 (`+17135551234`) and the web
 * onboarding form enforces E.164, but SendBlue's iMessage webhook can deliver
 * the number in looser shapes (`17135551234`, `7135551234`, `+1 (713) 555-1234`).
 * Without normalization, a returning iMessage user fails the
 * `findOne({ phone_number: from })` lookup, a brand-new INTAKE lead is created,
 * and their name/onboarding state is wiped — the "conversation keeps resetting"
 * bug. Normalizing on the inbound path makes the lookup hit the existing E.164
 * row that Twilio/the web form created.
 *
 * US-first product (numbers like Houston/713), so a bare 10-digit number is
 * assumed US and gets `+1`. Anything that already carries a `+` or country code
 * is preserved. We never throw — an unrecognizable string is returned with a
 * leading `+` as a best-effort so behavior degrades gracefully rather than
 * crashing the webhook.
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return raw;

  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) return trimmed;

  // Already carried a country code via a leading '+': trust it as-is.
  if (hadPlus) return `+${digits}`;

  // Bare US number: 10 digits → assume +1.
  if (digits.length === 10) return `+1${digits}`;

  // 11 digits starting with the US country code.
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // Anything else: best-effort — prepend '+' so it's at least E.164-shaped.
  return `+${digits}`;
}
