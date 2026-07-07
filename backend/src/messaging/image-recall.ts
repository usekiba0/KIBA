/**
 * Photo recall (Karibi 2026-07-08).
 *
 * The model only ever sees images attached to the CURRENT turn — history is
 * text-only. So when a user sends a photo and then, a message later, asks about
 * it ("you see the pic i sent?", "what's faster, the GT63 or the Porsche in that
 * pic"), the follow-up turn carries no image and KIBA answers "i don't see a
 * photo in this thread." — which reads broken, because the user just sent one.
 *
 * These helpers detect that the user is referring to a photo and pull the most
 * recent inbound image back out of history so it can be re-attached to the turn.
 * Both are pure + unit-tested.
 */

/** Minimal shape of a stored message this module reads. */
export interface RecallableMessage {
  role: string; // 'user' | 'ai'
  media_url: string | null;
  media_content_type: string | null;
  created_at: Date | string;
}

const PHOTO_NOUN = /\b(pic|pics|picture|pictures|photo|photos|image|images|screenshot|screenshots|selfie|selfies)\b/i;
// "you see", "i (just) sent", "in that/the pic", "the one i sent" — references
// to a photo without naming the word "photo".
const PHOTO_REF =
  /\b(you|u)\s+see\b|\b(i|just)\s+sent\b|\bin\s+(the|that|this)\s+(pic|photo|image|one|shot)\b|\bthe\s+one\s+i\s+sent\b|\bthat\s+(pic|photo|image|shot)\b/i;

/** True when the text plausibly refers to a photo the user sent. */
export function referencesRecentPhoto(text: string | null | undefined): boolean {
  if (!text) return false;
  return PHOTO_NOUN.test(text) || PHOTO_REF.test(text);
}

export interface RecalledImage {
  url: string;
  contentType: string;
}

/**
 * The most recent INBOUND image within `windowMs` of `nowMs`, newest first.
 * Skips GIFs (reaction media, not a real photo) and non-image media. `messages`
 * may be in any order — we scan for the latest qualifying one.
 */
export function findRecentInboundImage(
  messages: RecallableMessage[],
  nowMs: number,
  windowMs: number,
): RecalledImage | null {
  let best: { url: string; contentType: string; ts: number } | null = null;
  for (const m of messages) {
    if (m.role !== 'user' || !m.media_url) continue;
    const ct = m.media_content_type ?? '';
    if (!ct.startsWith('image/') || ct === 'image/gif') continue;
    const ts = new Date(m.created_at).getTime();
    if (Number.isNaN(ts) || nowMs - ts > windowMs || ts > nowMs) continue;
    if (!best || ts > best.ts) best = { url: m.media_url, contentType: ct, ts };
  }
  return best ? { url: best.url, contentType: best.contentType } : null;
}
