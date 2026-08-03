import {
  classifyInboundMedia,
  resolveMediaContentTypes,
  isUnidentified,
  MAX_TURN_IMAGES,
} from '../../src/messaging/inbound-media';

// Karibi 2026-08-03: "when u send KIBA multiple pics it only reads one".
// Multi-photo sends arrive as one webhook per photo; the debouncer merges them
// into a batch. Everything downstream used to classify that batch off entry [0].

describe('resolveMediaContentTypes', () => {
  it('sniffs EVERY unidentified attachment, not just the first', async () => {
    const sniff = jest.fn().mockResolvedValue('image/jpeg');
    const urls = ['https://cdn/a', 'https://cdn/b', 'https://cdn/c'];

    const cts = await resolveMediaContentTypes(
      urls,
      ['application/octet-stream', 'application/octet-stream', ''],
      sniff,
    );

    expect(cts).toEqual(['image/jpeg', 'image/jpeg', 'image/jpeg']);
    expect(sniff).toHaveBeenCalledTimes(3);
  });

  it('trusts a declared type and skips the network sniff for it', async () => {
    const sniff = jest.fn().mockResolvedValue('image/png');

    const cts = await resolveMediaContentTypes(
      ['https://cdn/a.heic', 'https://cdn/b'],
      ['image/heic', 'application/octet-stream'],
      sniff,
    );

    expect(cts).toEqual(['image/heic', 'image/png']);
    expect(sniff).toHaveBeenCalledTimes(1);
    expect(sniff).toHaveBeenCalledWith('https://cdn/b');
  });

  it('keeps the declared value when the sniff fails — never invents a type', async () => {
    const cts = await resolveMediaContentTypes(
      ['https://cdn/a'],
      ['application/octet-stream'],
      async () => null,
    );
    expect(cts).toEqual(['application/octet-stream']);
  });

  it('strips charset parameters and lowercases', async () => {
    const cts = await resolveMediaContentTypes(
      ['https://cdn/a.jpg'],
      ['Image/JPEG; charset=binary'],
      async () => null,
    );
    expect(cts).toEqual(['image/jpeg']);
  });
});

describe('classifyInboundMedia', () => {
  it('keeps ALL photos in a multi-photo batch (the reported bug)', () => {
    const c = classifyInboundMedia(
      ['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'],
      ['image/jpeg', 'image/jpeg', 'image/jpeg'],
    );

    expect(c.imageUrls).toHaveLength(3);
    expect(c.imageContentTypes).toHaveLength(3);
    expect(c.hasImage).toBe(true);
    expect(c.droppedOverCap).toBe(0);
  });

  it('keeps photos whose type was only recoverable by sniffing', () => {
    // Pre-fix these arrived as application/octet-stream and the format check
    // dropped them, leaving exactly one readable photo.
    const c = classifyInboundMedia(
      ['https://cdn/1', 'https://cdn/2'],
      ['image/heic', 'image/heic'],
    );
    expect(c.imageUrls).toEqual(['https://cdn/1', 'https://cdn/2']);
  });

  it('treats a mixed batch as a photo turn instead of rejecting on the sibling', () => {
    const c = classifyInboundMedia(
      ['https://cdn/voice.caf', 'https://cdn/gym.jpg'],
      ['audio/x-caf', 'image/jpeg'],
    );

    expect(c.hasImage).toBe(true);
    expect(c.imageUrls).toEqual(['https://cdn/gym.jpg']);
    // primary must be the IMAGE — otherwise the audio branch fires "i can't play
    // voice notes yet" and the photo is never looked at.
    expect(c.primaryUrl).toBe('https://cdn/gym.jpg');
    expect(c.primaryContentType).toBe('image/jpeg');
  });

  it('still reports a pure voice note as non-image so the audio reply fires', () => {
    const c = classifyInboundMedia(['https://cdn/voice.caf'], ['audio/x-caf']);

    expect(c.hasImage).toBe(false);
    expect(c.primaryUrl).toBe('https://cdn/voice.caf');
    expect(c.primaryContentType).toBe('audio/x-caf');
    expect(c.allUnidentified).toBe(false);
  });

  it('flags an all-unidentified batch so a shared link demotes to text', () => {
    const c = classifyInboundMedia(
      ['https://cdn/preview'],
      ['application/octet-stream'],
    );
    expect(c.allUnidentified).toBe(true);
    expect(c.hasImage).toBe(false);
  });

  it('does not flag allUnidentified when one sibling WAS identified', () => {
    const c = classifyInboundMedia(
      ['https://cdn/preview', 'https://cdn/2.jpg'],
      ['application/octet-stream', 'image/jpeg'],
    );
    expect(c.allUnidentified).toBe(false);
    expect(c.imageUrls).toEqual(['https://cdn/2.jpg']);
  });

  it('caps the batch and REPORTS what it dropped — no silent truncation', () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://cdn/${i}.jpg`);
    const c = classifyInboundMedia(urls, urls.map(() => 'image/jpeg'));

    expect(c.imageUrls).toHaveLength(MAX_TURN_IMAGES);
    expect(c.droppedOverCap).toBe(6 - MAX_TURN_IMAGES);
  });

  it('returns an empty, safe result for a media-free turn', () => {
    const c = classifyInboundMedia([], []);
    expect(c).toMatchObject({
      imageUrls: [],
      hasImage: false,
      primaryUrl: null,
      primaryContentType: '',
      allUnidentified: false,
      droppedOverCap: 0,
    });
  });
});

describe('isUnidentified', () => {
  it.each(['', '   ', 'application/octet-stream', 'APPLICATION/OCTET-STREAM'])(
    'treats %p as unidentified',
    (ct) => expect(isUnidentified(ct)).toBe(true),
  );

  it.each(['image/jpeg', 'audio/x-caf', 'video/mp4'])('treats %p as identified', (ct) =>
    expect(isUnidentified(ct)).toBe(false),
  );
});
