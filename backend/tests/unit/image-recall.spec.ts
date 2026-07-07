import { referencesRecentPhoto, findRecentInboundImage, RecallableMessage } from '../../src/messaging/image-recall';

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
