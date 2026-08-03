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
  /** The full attachment batch (added 2026-08-03). NULL on pre-migration rows. */
  media_urls?: string[] | null;
  media_content_types?: string[] | null;
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
 * Read a message's attachments as a batch. Prefers the `media_urls` array (one
 * row can carry several photos — a multi-photo send is merged into a single
 * turn); falls back to the singular pair for rows written before that column
 * existed. Index-aligned; a missing type reads as ''.
 */
function attachmentsOf(m: RecallableMessage): Array<{ url: string; contentType: string }> {
  if (m.media_urls?.length) {
    return m.media_urls.map((url, i) => ({
      url,
      contentType: (m.media_content_types?.[i] ?? '').toLowerCase(),
    }));
  }
  return m.media_url
    ? [{ url: m.media_url, contentType: (m.media_content_type ?? '').toLowerCase() }]
    : [];
}

/** A real photo — not reaction media, not audio/video. */
function isRecallablePhoto(contentType: string): boolean {
  return contentType.startsWith('image/') && contentType !== 'image/gif';
}

/**
 * EVERY photo from the most recent qualifying inbound turn within `windowMs` of
 * `nowMs`. Skips GIFs (reaction media, not a real photo) and non-image media.
 * `messages` may be in any order — we scan for the latest qualifying turn.
 *
 * Returns the whole batch rather than one image: a user who sent three photos
 * and then asks "what about the other one" was previously handed back only the
 * first, so KIBA answered about the wrong picture (Karibi 2026-08-03).
 */
export function findRecentInboundImages(
  messages: RecallableMessage[],
  nowMs: number,
  windowMs: number,
  maxImages = 4,
): RecalledImage[] {
  let best: { images: RecalledImage[]; ts: number } | null = null;
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const ts = new Date(m.created_at).getTime();
    if (Number.isNaN(ts) || nowMs - ts > windowMs || ts > nowMs) continue;
    if (best && ts <= best.ts) continue;
    const images = attachmentsOf(m)
      .filter((a) => isRecallablePhoto(a.contentType))
      .map((a) => ({ url: a.url, contentType: a.contentType }));
    if (images.length > 0) best = { images, ts };
  }
  return best ? best.images.slice(0, maxImages) : [];
}

/**
 * Back-compat single-image view of {@link findRecentInboundImages} — the first
 * photo of the most recent qualifying turn, or null.
 */
export function findRecentInboundImage(
  messages: RecallableMessage[],
  nowMs: number,
  windowMs: number,
): RecalledImage | null {
  return findRecentInboundImages(messages, nowMs, windowMs)[0] ?? null;
}
