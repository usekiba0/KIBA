import axios from 'axios';

/**
 * Identify a media file from its leading "magic number" bytes.
 *
 * SendBlue forwards inbound iMessage/MMS attachments through a CDN URL that
 * carries NO content-type header and frequently NO file extension, so
 * extension-based guessing (see MessagingController.guessContentType) falls back
 * to application/octet-stream and a perfectly valid photo gets rejected as
 * "that file type doesn't come through". Sniffing the actual bytes recovers the
 * real type regardless of URL shape — and also catches the inverse mislabel
 * (a .caf voice note that an extension guess would have called an image).
 *
 * Returns a MIME string, or null when the bytes don't match a format we handle.
 */
export function sniffMimeFromBytes(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // --- Images ---
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  // WEBP: "RIFF"...."WEBP"
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  // --- ISO base-media containers (HEIC/HEIF, MP4, MOV) share the "ftyp" box ---
  // Layout: [4-byte box size][ "ftyp" ][ 4-byte major brand ]
  if (buf.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buf.toString('latin1', 8, 12).toLowerCase().trimEnd();
    const heicBrands = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'];
    if (heicBrands.includes(brand)) return 'image/heic';
    if (brand === 'qt') return 'video/quicktime';
    if (brand === 'm4a') return 'audio/mp4';
    // isom / mp41 / mp42 / m4v / avc1 / dash → mp4 video family
    return 'video/mp4';
  }

  // --- Audio (iMessage voice notes + common formats) ---
  // CAF (iOS Core Audio): "caff"
  if (buf.toString('latin1', 0, 4) === 'caff') return 'audio/x-caf';
  // MP3: "ID3" tag or an MPEG frame sync (FF Ex)
  if (buf.toString('latin1', 0, 3) === 'ID3') return 'audio/mpeg';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  // AMR: "#!AMR"
  if (buf.toString('latin1', 0, 5) === '#!AMR') return 'audio/amr';
  // WAV: "RIFF"...."WAVE"
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE') {
    return 'audio/wav';
  }

  return null;
}

/**
 * Fetch just the header bytes of a remote attachment and sniff its MIME type.
 *
 * Magic numbers live in the first ~32 bytes, so we ask for a tiny byte range —
 * fast, and cheap on CDNs (e.g. Google Cloud Storage, which SendBlue uses) that
 * honour Range requests. Servers that ignore the header simply return the full
 * body; we still only read the prefix. Returns null on any failure so callers
 * can fall back to their existing extension-based classification.
 */
export async function sniffRemoteMediaType(url: string): Promise<string | null> {
  try {
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 10_000,
      headers: { Range: 'bytes=0-63' },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return sniffMimeFromBytes(Buffer.from(resp.data));
  } catch {
    return null;
  }
}
