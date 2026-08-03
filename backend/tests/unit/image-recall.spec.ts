import {
  referencesRecentPhoto,
  findRecentInboundImage,
  findRecentInboundImages,
  RecallableMessage,
} from '../../src/messaging/image-recall';

describe('referencesRecentPhoto', () => {
  it('matches explicit photo words', () => {
    expect(referencesRecentPhoto('what car is in that pic')).toBe(true);
    expect(referencesRecentPhoto('did you see my photo')).toBe(true);
    expect(referencesRecentPhoto('check the screenshot')).toBe(true);
  });
  it('matches implicit references ("you see ... i sent")', () => {
    expect(referencesRecentPhoto('U see the tho I sent as well?')).toBe(true);
    expect(referencesRecentPhoto('the one i sent')).toBe(true);
    expect(referencesRecentPhoto('whats faster in that shot')).toBe(true);
  });
  it('does not match ordinary text', () => {
    expect(referencesRecentPhoto('i ran 5k this morning')).toBe(false);
    expect(referencesRecentPhoto('do you think i can afford it')).toBe(false);
    expect(referencesRecentPhoto('')).toBe(false);
    expect(referencesRecentPhoto(null)).toBe(false);
  });
});

describe('findRecentInboundImage', () => {
  const NOW = new Date('2026-07-08T15:00:00Z').getTime();
  const msg = (over: Partial<RecallableMessage>): RecallableMessage => ({
    role: 'user', media_url: null, media_content_type: null, created_at: new Date(NOW), ...over,
  });

  it('returns the most recent inbound image within the window', () => {
    const messages = [
      msg({ media_url: 'https://cdn/x/old.jpg', media_content_type: 'image/jpeg', created_at: new Date(NOW - 20 * 60_000) }),
      msg({ media_url: 'https://cdn/x/new.png', media_content_type: 'image/png', created_at: new Date(NOW - 2 * 60_000) }),
      msg({ content: 'text only' } as any),
    ];
    expect(findRecentInboundImage(messages, NOW, 30 * 60_000)).toEqual({
      url: 'https://cdn/x/new.png', contentType: 'image/png',
    });
  });

  it('ignores images older than the window', () => {
    const messages = [msg({ media_url: 'https://cdn/x/old.jpg', media_content_type: 'image/jpeg', created_at: new Date(NOW - 45 * 60_000) })];
    expect(findRecentInboundImage(messages, NOW, 30 * 60_000)).toBeNull();
  });

  it('skips GIFs (reaction media) and AI-sent media', () => {
    const messages = [
      msg({ media_url: 'https://cdn/x/react.gif', media_content_type: 'image/gif', created_at: new Date(NOW - 1 * 60_000) }),
      msg({ role: 'ai', media_url: 'https://cdn/x/kiba.png', media_content_type: 'image/png', created_at: new Date(NOW - 1 * 60_000) }),
    ];
    expect(findRecentInboundImage(messages, NOW, 30 * 60_000)).toBeNull();
  });

  it('returns null when there are no images', () => {
    expect(findRecentInboundImage([msg({ content: 'hi' } as any)], NOW, 30 * 60_000)).toBeNull();
  });
});

// Karibi 2026-08-03: a multi-photo send is ONE row carrying several images.
// Recall used to hand back only media_url, so "what about the other one" was
// answered about the wrong picture.
describe('findRecentInboundImages (batch recall)', () => {
  const NOW = new Date('2026-08-03T15:00:00Z').getTime();
  const msg = (over: Partial<RecallableMessage>): RecallableMessage => ({
    role: 'user', media_url: null, media_content_type: null, created_at: new Date(NOW), ...over,
  });

  it('returns EVERY photo of a multi-photo turn', () => {
    const messages = [
      msg({
        media_url: 'https://cdn/1.jpg',
        media_content_type: 'image/jpeg',
        media_urls: ['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'],
        media_content_types: ['image/jpeg', 'image/jpeg', 'image/heic'],
        created_at: new Date(NOW - 2 * 60_000),
      }),
    ];
    expect(findRecentInboundImages(messages, NOW, 30 * 60_000)).toEqual([
      { url: 'https://cdn/1.jpg', contentType: 'image/jpeg' },
      { url: 'https://cdn/2.jpg', contentType: 'image/jpeg' },
      { url: 'https://cdn/3.jpg', contentType: 'image/heic' },
    ]);
  });

  it('falls back to the singular columns for pre-migration rows', () => {
    const messages = [
      msg({ media_url: 'https://cdn/legacy.jpg', media_content_type: 'image/jpeg' }),
    ];
    expect(findRecentInboundImages(messages, NOW, 30 * 60_000)).toEqual([
      { url: 'https://cdn/legacy.jpg', contentType: 'image/jpeg' },
    ]);
  });

  it('drops GIFs from a mixed batch but keeps the real photos', () => {
    const messages = [
      msg({
        media_urls: ['https://cdn/react.gif', 'https://cdn/gym.jpg'],
        media_content_types: ['image/gif', 'image/jpeg'],
      }),
    ];
    expect(findRecentInboundImages(messages, NOW, 30 * 60_000)).toEqual([
      { url: 'https://cdn/gym.jpg', contentType: 'image/jpeg' },
    ]);
  });

  it('picks the most recent qualifying TURN, not a mix across turns', () => {
    const messages = [
      msg({
        media_urls: ['https://cdn/old-a.jpg', 'https://cdn/old-b.jpg'],
        media_content_types: ['image/jpeg', 'image/jpeg'],
        created_at: new Date(NOW - 20 * 60_000),
      }),
      msg({
        media_urls: ['https://cdn/new.jpg'],
        media_content_types: ['image/jpeg'],
        created_at: new Date(NOW - 60_000),
      }),
    ];
    expect(findRecentInboundImages(messages, NOW, 30 * 60_000)).toEqual([
      { url: 'https://cdn/new.jpg', contentType: 'image/jpeg' },
    ]);
  });

  it('does not let a newer text/GIF-only turn shadow the last real photo turn', () => {
    const messages = [
      msg({
        media_urls: ['https://cdn/photo.jpg'],
        media_content_types: ['image/jpeg'],
        created_at: new Date(NOW - 5 * 60_000),
      }),
      msg({ content: 'lol' } as any),
      msg({ media_urls: ['https://cdn/r.gif'], media_content_types: ['image/gif'] }),
    ];
    expect(findRecentInboundImages(messages, NOW, 30 * 60_000)).toEqual([
      { url: 'https://cdn/photo.jpg', contentType: 'image/jpeg' },
    ]);
  });

  it('caps the recalled batch', () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://cdn/${i}.jpg`);
    const messages = [msg({ media_urls: urls, media_content_types: urls.map(() => 'image/jpeg') })];
    expect(findRecentInboundImages(messages, NOW, 30 * 60_000)).toHaveLength(4);
  });

  it('respects the window and ignores AI-sent media', () => {
    expect(
      findRecentInboundImages(
        [msg({ media_urls: ['https://cdn/a.jpg'], media_content_types: ['image/jpeg'], created_at: new Date(NOW - 45 * 60_000) })],
        NOW, 30 * 60_000,
      ),
    ).toEqual([]);
    expect(
      findRecentInboundImages(
        [msg({ role: 'ai', media_urls: ['https://cdn/k.png'], media_content_types: ['image/png'] })],
        NOW, 30 * 60_000,
      ),
    ).toEqual([]);
  });

  it('findRecentInboundImage stays the first-photo view of the same result', () => {
    const messages = [
      msg({
        media_urls: ['https://cdn/1.jpg', 'https://cdn/2.jpg'],
        media_content_types: ['image/jpeg', 'image/jpeg'],
      }),
    ];
    expect(findRecentInboundImage(messages, NOW, 30 * 60_000)).toEqual({
      url: 'https://cdn/1.jpg', contentType: 'image/jpeg',
    });
  });
});
