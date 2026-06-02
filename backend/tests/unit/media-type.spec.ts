import { sniffMimeFromBytes } from '../../src/messaging/media-type';

/** Build a 16-byte buffer from a list of leading bytes, zero-padded. */
function bytes(...leading: number[]): Buffer {
  const b = Buffer.alloc(16);
  for (let i = 0; i < leading.length; i++) b[i] = leading[i];
  return b;
}

/** Build a buffer whose first bytes are an ASCII string, zero-padded to 16. */
function ascii(s: string): Buffer {
  const b = Buffer.alloc(Math.max(16, s.length));
  b.write(s, 0, 'latin1');
  return b;
}

/** ISO-BMFF "ftyp" container: [size][ftyp][brand]. */
function ftyp(brand: string): Buffer {
  const b = Buffer.alloc(16);
  b.writeUInt32BE(0x18, 0); // arbitrary box size
  b.write('ftyp', 4, 'latin1');
  b.write(brand, 8, 'latin1');
  return b;
}

describe('sniffMimeFromBytes', () => {
  it('detects JPEG', () => {
    expect(sniffMimeFromBytes(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
  });

  it('detects PNG', () => {
    expect(sniffMimeFromBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
  });

  it('detects GIF', () => {
    expect(sniffMimeFromBytes(ascii('GIF89a'))).toBe('image/gif');
  });

  it('detects WEBP (RIFF/WEBP)', () => {
    const b = Buffer.alloc(16);
    b.write('RIFF', 0, 'latin1');
    b.write('WEBP', 8, 'latin1');
    expect(sniffMimeFromBytes(b)).toBe('image/webp');
  });

  it('detects HEIC from the ftyp brand — the exact case extension-guessing misses', () => {
    expect(sniffMimeFromBytes(ftyp('heic'))).toBe('image/heic');
    expect(sniffMimeFromBytes(ftyp('mif1'))).toBe('image/heic');
    expect(sniffMimeFromBytes(ftyp('heix'))).toBe('image/heic');
  });

  it('detects MOV / MP4 video so a video is never mistaken for a photo', () => {
    expect(sniffMimeFromBytes(ftyp('qt  '))).toBe('video/quicktime');
    expect(sniffMimeFromBytes(ftyp('isom'))).toBe('video/mp4');
    expect(sniffMimeFromBytes(ftyp('mp42'))).toBe('video/mp4');
  });

  it('detects M4A audio brand', () => {
    expect(sniffMimeFromBytes(ftyp('M4A '))).toBe('audio/mp4');
  });

  it('detects CAF voice notes (the inverse mislabel that broke vision before)', () => {
    expect(sniffMimeFromBytes(ascii('caff'))).toBe('audio/x-caf');
  });

  it('detects WAV without confusing it for WEBP (both are RIFF)', () => {
    const b = Buffer.alloc(16);
    b.write('RIFF', 0, 'latin1');
    b.write('WAVE', 8, 'latin1');
    expect(sniffMimeFromBytes(b)).toBe('audio/wav');
  });

  it('returns null for unknown bytes (octet-stream blob)', () => {
    expect(sniffMimeFromBytes(Buffer.alloc(16))).toBeNull();
  });

  it('returns null when there are too few bytes to classify', () => {
    expect(sniffMimeFromBytes(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
