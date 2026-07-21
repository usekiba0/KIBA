import { normalizePhoneNumber } from '../common/phone';

/**
 * Key for the last-resort duplicate-send guard.
 *
 * Was `${to}::${body}` — a raw exact match, and it failed in production
 * (Karibi 2026-07-21). Two duplicate daily-reminder chains carried the SAME
 * Bible verse, one with the verse wrapped in quotation marks and one without.
 * One character of difference, so the two keys didn't collide and both messages
 * landed on the phone seconds apart.
 *
 * The recipient is normalized for the same reason `hasOptedOut` normalizes it:
 * different generators pass `+1832…` and `1832…` for one person.
 *
 * Deliberately aggressive on the body — punctuation, case, quotes, and spacing
 * are all noise here. Two messages that read identically aloud ARE the same
 * message, and this guard only ever applies to bodies long enough (>= 25 chars)
 * that a legitimate exact repeat is implausible.
 */
export function dedupKey(to: string, body: string): string {
  return `${normalizePhoneNumber(to)}::${normalizeBody(body)}`;
}

/** Lowercase, strip every non-alphanumeric character, collapse whitespace. */
export function normalizeBody(body: string): string {
  return (body ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
