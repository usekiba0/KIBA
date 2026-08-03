/**
 * Batch classification of a turn's inbound attachments (Karibi 2026-08-03 —
 * "when u send KIBA multiple pics it only reads one").
 *
 * iMessage and MMS both deliver ONE webhook per attachment: SendBlue's inbound
 * payload carries a single `media_url` string, and Twilio splits into
 * MediaUrl0..N across parts. The debouncer already merges those webhooks into a
 * single turn, so a 3-photo send correctly arrives here as a 3-entry batch.
 *
 * What was broken sat downstream of that merge: every consumer classified the
 * BATCH off entry [0]. Only the first attachment's content type was resolved
 * (the byte-sniff that rescues extension-less SendBlue CDN URLs ran once), and
 * the intake path forwarded a single URL. So photos 2..N either reached the
 * model with an unresolved `application/octet-stream` type and were silently
 * dropped as an unsupported format, or were never passed at all — KIBA read one
 * photo and answered as if the others didn't exist.
 *
 * These helpers are pure (the network sniff is injected) so the batch rules are
 * unit-testable without a live CDN.
 */

/** Anthropic's vision API accepts these; HEIC is transcoded to JPEG upstream. */
const IMAGE_PREFIX = 'image/';

/** A type we could not identify — extension guess fell through AND bytes didn't match. */
export function isUnidentified(contentType: string): boolean {
  const ct = contentType.toLowerCase().trim();
  return !ct || ct === 'application/octet-stream';
}

/**
 * Resolve the real MIME type of EVERY attachment, not just the first.
 *
 * The declared type comes from the controller's extension guess, which yields
 * application/octet-stream for SendBlue's extension-less CDN URLs. For those we
 * sniff the file's magic bytes. Sniffs run concurrently: they sit on the live
 * reply path, and doing four of them in series would add seconds to a photo turn
 * for no reason.
 *
 * `sniff` is injected (production passes sniffRemoteMediaType) and must resolve
 * to null on any failure — we then keep the declared value and let the caller's
 * unidentified-media handling take over, exactly as before.
 */
export async function resolveMediaContentTypes(
  urls: string[],
  declaredContentTypes: string[],
  sniff: (url: string) => Promise<string | null>,
): Promise<string[]> {
  return Promise.all(
    urls.map(async (url, i) => {
      const declared = (declaredContentTypes[i] ?? '').toLowerCase().split(';')[0].trim();
      if (!isUnidentified(declared)) return declared;
      const sniffed = await sniff(url);
      return sniffed ?? declared;
    }),
  );
}

export interface ClassifiedMedia {
  /** Every attachment that resolved to an image, in arrival order, capped. */
  imageUrls: string[];
  /** Resolved content types, index-aligned with imageUrls. */
  imageContentTypes: string[];
  /** True when at least one attachment is a usable image. */
  hasImage: boolean;
  /**
   * The attachment the single-media consumers act on (proof submission, the
   * audio/video "can't read that" reply). Prefers the first IMAGE so a mixed
   * batch — a voice note plus a gym photo — is treated as the photo turn it is,
   * instead of rejecting the whole batch on the non-image sibling.
   */
  primaryUrl: string | null;
  primaryContentType: string;
  /** True when NO attachment could be identified — the link-preview case. */
  allUnidentified: boolean;
  /** Images past the cap. Surfaced so a truncated batch is never silent. */
  droppedOverCap: number;
}

/**
 * Cap on images sent to the model in one turn. Bounds vision cost and latency.
 *
 * Raised 4 -> 6 on 2026-08-03, together with the adaptive burst window in
 * message-debouncer.service.ts. The two MUST move together: the burst window
 * merges dumps that previously split across several turns, and a 6-photo dump
 * merged into one turn but capped at 4 would show the model FEWER photos than
 * the old split-turn behaviour did — a coverage regression hiding inside a fix.
 * Six matches the largest real dump observed in prod.
 *
 * This is the single source of truth: the coaching service imports it rather
 * than keeping its own constant, so the two can't drift apart and silently
 * re-truncate the batch. Anything past the cap is reported, never dropped
 * quietly — see `droppedOverCap`.
 */
export const MAX_TURN_IMAGES = Number(process.env.MESSAGE_MAX_TURN_IMAGES ?? 6);

export function classifyInboundMedia(
  urls: string[],
  resolvedContentTypes: string[],
  maxImages: number = MAX_TURN_IMAGES,
): ClassifiedMedia {
  const allImageUrls: string[] = [];
  const allImageCts: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const ct = (resolvedContentTypes[i] ?? '').toLowerCase().trim();
    if (ct.startsWith(IMAGE_PREFIX)) {
      allImageUrls.push(urls[i]);
      allImageCts.push(ct);
    }
  }

  const imageUrls = allImageUrls.slice(0, maxImages);
  const imageContentTypes = allImageCts.slice(0, maxImages);
  const hasImage = imageUrls.length > 0;

  const firstCt = (resolvedContentTypes[0] ?? '').toLowerCase().trim();
  return {
    imageUrls,
    imageContentTypes,
    hasImage,
    primaryUrl: hasImage ? imageUrls[0] : (urls[0] ?? null),
    primaryContentType: hasImage ? imageContentTypes[0] : firstCt,
    allUnidentified:
      urls.length > 0 && resolvedContentTypes.every((ct) => isUnidentified(ct ?? '')),
    droppedOverCap: allImageUrls.length - imageUrls.length,
  };
}
