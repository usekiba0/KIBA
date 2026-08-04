/**
 * Pre-transcode inbound HEIC photos during the debounce window (Karibi 2026-08-04).
 *
 * WHY THIS EXISTS — measured, because the obvious answer was wrong.
 *
 * Photo turns were taking 60-90s perceived. The assumption was that vision
 * replies were too long. They aren't: with the real coaching prompt and real
 * inbound photos, the API call is ~3.1s, a third image adds ~115ms, and forcing
 * a drastically shorter reply saves ~550ms. Nothing there explains 30 seconds.
 *
 * The cost is transcoding iPhone HEIC to JPEG, which Anthropic's vision API
 * requires (it still rejects HEIC by URL — verified, HTTP 400). Per photo:
 *
 *     fetch 0.6-2.2s  +  heic-convert 2.2-5.5s  =  2.9-7.5s EACH
 *
 * and coaching.service ran that in a serial `for` loop, so three photos cost
 * ~17.8s of a turn's latency before the model saw anything.
 *
 * THE INSIGHT: the debouncer already sits idle for 4-8s while photos trickle in
 * 2-6s apart. That is dead time we are already spending. Converting each photo
 * the moment its webhook lands means the JPEG is usually ready before the turn
 * even flushes, moving the cost off the critical path entirely.
 *
 * Storing the PROMISE rather than the result is what makes this safe: if a turn
 * flushes while a conversion is still running, the consumer awaits the very same
 * work instead of kicking off a duplicate.
 *
 * (`sharp` is a dependency and claims HEIF input support, but its decoder plugin
 * is not built into the prebuilt binaries — it throws "support for this
 * compression format has not been built in". Don't swap to it without testing on
 * the deployed image.)
 */
import axios from 'axios';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import heicConvert = require('heic-convert');

export type PreparedImage =
  | { ok: true; base64: string }
  | { ok: false; reason: string };

/** A converted 1.3MB photo is ~2.4MB as base64, so this cache is memory, not disk.
 *  Small and short-lived: it only has to survive the debounce window plus the
 *  generation that follows. */
const MAX_ENTRIES = 8;
const TTL_MS = 5 * 60_000;
/** Conversions are CPU-bound on the main thread, so running many at once buys
 *  nothing and starves the event loop (webhook acks, other users' turns). */
const MAX_CONCURRENT = 2;

interface Entry {
  at: number;
  promise: Promise<PreparedImage>;
}

const cache = new Map<string, Entry>();
let inFlight = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) { inFlight++; return; }
  await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
}
function release(): void {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

/** True when this attachment needs transcoding before Anthropic will accept it. */
export function needsTranscode(url: string, contentType?: string): boolean {
  const ct = (contentType ?? '').toLowerCase().split(';')[0].trim();
  const lower = url.toLowerCase().split('?')[0];
  return (
    ct === 'image/heic' || ct === 'image/heif' ||
    lower.endsWith('.heic') || lower.endsWith('.heif')
  );
}

function prune(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [url, e] of cache) if (e.at < cutoff) cache.delete(url);
  // Map preserves insertion order, so the first key is the oldest.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function transcode(url: string): Promise<PreparedImage> {
  await acquire();
  try {
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    });
    const jpeg = await heicConvert({ buffer: resp.data, format: 'JPEG', quality: 0.9 });
    return { ok: true, base64: Buffer.from(jpeg).toString('base64') };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  } finally {
    release();
  }
}

/**
 * Get the transcoded photo, reusing in-flight or completed work for the same URL.
 * Safe to call on the critical path: if warm() already started it, this awaits
 * that same promise rather than duplicating a 5-second conversion.
 */
export function prepare(url: string): Promise<PreparedImage> {
  prune();
  const hit = cache.get(url);
  if (hit) return hit.promise;
  const promise = transcode(url);
  cache.set(url, { at: Date.now(), promise });
  // Never cache a FAILURE. transcode() resolves with ok:false rather than
  // rejecting, so a plain .catch() would never fire and one transient CDN blip
  // would pin "couldn't open that photo" to this URL for the whole TTL. Evict on
  // a failed result so the next turn genuinely retries. Consumers already
  // holding the promise are unaffected.
  void promise.then(
    (r) => { if (!r.ok) cache.delete(url); },
    () => cache.delete(url),
  );
  return promise;
}

/**
 * Fire-and-forget: start transcoding now because a photo just arrived and a turn
 * will probably want it in a few seconds. Never throws, never blocks the caller.
 */
export function warm(url: string, contentType?: string): void {
  if (!needsTranscode(url, contentType)) return;
  if (cache.has(url)) return;
  void prepare(url).catch(() => undefined);
}

/** Test seam. */
export function _reset(): void {
  cache.clear();
  inFlight = 0;
  waiting.length = 0;
}
