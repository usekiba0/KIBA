import {
  MessageDebouncerService,
  DebouncedMessage,
  debounceDelayFor,
  providerLagMs,
} from '../../src/messaging/message-debouncer.service';

// Text bursts flush immediately (window turned off 2026-07-21 — it never merged
// real bubbles and was pure latency); image bursts still batch at 3000ms.
// Use fake timers so tests are deterministic and fast.
describe('MessageDebouncerService', () => {
  let processCalls: Array<unknown>;
  let service: MessageDebouncerService;

  const mockProcessor = {
    process: jest.fn(async (data: unknown) => {
      processCalls.push(data);
    }),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    processCalls = [];
    mockProcessor.process.mockClear();
    service = new MessageDebouncerService(mockProcessor as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function msg(overrides: Partial<DebouncedMessage> = {}): DebouncedMessage {
    return {
      from: '+18325604035',
      text: 'hello',
      twilioSid: null,
      mediaUrls: [],
      mediaContentTypes: [],
      channel: 'imessage',
      dateSent: 1_000_000,
      uniqueId: 'handle-1',
      providerUpdatedAt: null,
      ...overrides,
    };
  }

  it('flushes a text message with no added delay', async () => {
    service.push(msg());

    jest.advanceTimersByTime(0);
    await Promise.resolve();
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { body: string }).body).toBe('hello');
  });

  it('still merges texts that land in the SAME tick, before the flush runs', async () => {
    // With the window off this is the only text case that still batches: two
    // webhooks handled before the event loop reaches the timer phase. Kept so
    // the merge path itself stays covered.
    service.push(msg({ text: 'Bett', uniqueId: 'h1', dateSent: 1_000_000 }));
    service.push(msg({ text: 'Karibi', uniqueId: 'h2', dateSent: 1_000_001 }));

    jest.advanceTimersByTime(0);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { body: string }).body).toBe('Bett Karibi');
  });

  it('does NOT hold a second text back waiting for a burst — each is its own turn', async () => {
    service.push(msg({ text: 'Bett', uniqueId: 'h1', dateSent: 1_000_000 }));
    jest.advanceTimersByTime(0);
    await Promise.resolve();

    service.push(msg({ text: 'Karibi', uniqueId: 'h2', dateSent: 1_000_001 }));
    jest.advanceTimersByTime(0);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(2);
  });

  it('flushes a single image at the 4s image window', async () => {
    service.push(msg({
      text: 'check this', uniqueId: 'img1', dateSent: 1_000,
      mediaUrls: ['https://example.com/p.heic'], mediaContentTypes: ['image/heic'],
    }));
    jest.advanceTimersByTime(3999);
    await Promise.resolve();
    expect(mockProcessor.process).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { numMedia: number }).numMedia).toBe(1);
  });

  it('batches multiple images arriving within the window into ONE reply (no per-image spam)', async () => {
    service.push(msg({ uniqueId: 'i1', text: '', dateSent: 1, mediaUrls: ['a.jpg'], mediaContentTypes: ['image/jpeg'] }));
    jest.advanceTimersByTime(2500); // second photo lands 2.5s later (within window)
    service.push(msg({ uniqueId: 'i2', text: '', dateSent: 2, mediaUrls: ['b.jpg'], mediaContentTypes: ['image/jpeg'] }));
    jest.advanceTimersByTime(8000); // two photos buffered -> burst window
    await Promise.resolve();
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { numMedia: number; mediaUrls: string[] }).numMedia).toBe(2);
  });

  // Karibi 2026-08-03. Replay of the REAL prod sequence (user +92, 6 photos)
  // whose arrival gaps were 3349 / 5306 / 3057 / 2764 / 5899 ms. Under the flat
  // 4000ms window two gaps overflowed and this split into THREE turns, so KIBA
  // sent three replies and the first two described the same photos.
  it('holds a real-world 6-photo dump together in ONE turn (prod gap replay)', async () => {
    const GAPS = [3349, 5306, 3057, 2764, 5899];
    service.push(msg({ uniqueId: 'p0', text: '', dateSent: 0, mediaUrls: ['p0.jpg'], mediaContentTypes: ['image/jpeg'] }));
    GAPS.forEach((gap, i) => {
      jest.advanceTimersByTime(gap);
      service.push(msg({
        uniqueId: `p${i + 1}`, text: '', dateSent: i + 1,
        mediaUrls: [`p${i + 1}.jpg`], mediaContentTypes: ['image/jpeg'],
      }));
    });
    // Nothing may have flushed yet — a split here is the bug.
    expect(mockProcessor.process).not.toHaveBeenCalled();

    jest.advanceTimersByTime(8000);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    const call = processCalls[0] as { numMedia: number; mediaUrls: string[] };
    expect(call.numMedia).toBe(6);
    expect(call.mediaUrls).toHaveLength(6);
  });

  it('does NOT charge the burst wait to a lone photo sent with a text bubble', async () => {
    service.push(msg({ uniqueId: 't1', text: 'which one', dateSent: 1, mediaUrls: [] }));
    service.push(msg({ uniqueId: 'i1', text: '', dateSent: 2, mediaUrls: ['a.jpg'], mediaContentTypes: ['image/jpeg'] }));

    // One photo + one text = still a single-photo turn: flushes at 4s, not 8s.
    jest.advanceTimersByTime(4000);
    await Promise.resolve();
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { numMedia: number }).numMedia).toBe(1);
  });

  it('sorts merged messages by dateSent so the image arriving late lands in order', async () => {
    service.push(msg({
      text: 'Can you see this picture?', uniqueId: 'text-handle', dateSent: 2_000, mediaUrls: [],
    }));
    service.push(msg({
      text: '', uniqueId: 'image-handle', dateSent: 1_000,
      mediaUrls: ['https://example.com/photo.heic'], mediaContentTypes: ['image/heic'],
    }));

    // One photo (plus a text bubble) -> the single-photo window, not the burst one.
    jest.advanceTimersByTime(4000);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    const call = processCalls[0] as { body: string; numMedia: number; mediaUrls: string[] };
    expect(call.numMedia).toBe(1);
    expect(call.mediaUrls).toEqual(['https://example.com/photo.heic']);
    expect(call.body).toBe('Can you see this picture?');
  });

  it('drops duplicate webhooks with the same uniqueId (Twilio/SendBlue retries)', async () => {
    service.push(msg({ text: 'hello', uniqueId: 'same-handle' }));
    service.push(msg({ text: 'hello', uniqueId: 'same-handle' }));
    service.push(msg({ text: 'hello', uniqueId: 'same-handle' }));

    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { body: string }).body).toBe('hello');
  });

  it('passes the provider lag of the FIRST webhook through to the processor', async () => {
    const now = Date.now();
    service.push(msg({ uniqueId: 'a', providerUpdatedAt: now - 2_600 }));
    jest.advanceTimersByTime(0);
    await Promise.resolve();

    const call = processCalls[0] as { providerLagMs: number | null };
    expect(call.providerLagMs).toBeGreaterThanOrEqual(2_600);
    expect(call.providerLagMs).toBeLessThan(4_000);
  });

  it('reports a null lag when the channel exposes no provider timestamp (SMS)', async () => {
    service.push(msg({ uniqueId: 'a', channel: 'sms', providerUpdatedAt: null }));
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    expect((processCalls[0] as { providerLagMs: number | null }).providerLagMs).toBeNull();
  });

  it('starts a fresh batch after a flush has completed', async () => {
    service.push(msg({ text: 'first', uniqueId: 'a' }));
    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    service.push(msg({ text: 'second', uniqueId: 'b' }));
    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(2);
    expect((processCalls[0] as { body: string }).body).toBe('first');
    expect((processCalls[1] as { body: string }).body).toBe('second');
  });
});

// Provider forwarding lag — the ~2.6s p50 that turn_latency never counted,
// because our clock only starts at the webhook (Karibi 2026-08-03).
describe('providerLagMs', () => {
  it('measures receipt minus the provider server timestamp', () => {
    expect(providerLagMs(10_000, 7_400)).toBe(2_600);
  });
  it('returns null when the provider gave us no timestamp', () => {
    expect(providerLagMs(10_000, null)).toBeNull();
  });
  it('rejects a NEGATIVE lag rather than logging a nonsense number', () => {
    // Provider clock ahead of ours: the value is skew, not latency.
    expect(providerLagMs(10_000, 12_000)).toBeNull();
  });
  it('rejects an absurdly large lag (clock disagreement or a replay)', () => {
    expect(providerLagMs(200_000, 1_000)).toBeNull();
  });
  it('accepts a zero lag and keeps the boundary usable', () => {
    expect(providerLagMs(10_000, 10_000)).toBe(0);
    expect(providerLagMs(130_000, 10_000)).toBe(120_000);
    expect(providerLagMs(130_001, 10_000)).toBeNull();
  });
  it('ignores a non-finite timestamp', () => {
    expect(providerLagMs(10_000, NaN)).toBeNull();
  });
});

describe('debounceDelayFor', () => {
  it('adds no delay for a text-only burst', () => {
    expect(debounceDelayFor([{ mediaUrls: [] }, { mediaUrls: [] }])).toBe(0);
  });
  it('uses the 4s image window for a single photo', () => {
    expect(debounceDelayFor([{ mediaUrls: [] }, { mediaUrls: ['x'] }])).toBe(4000);
  });
  it('escalates to the 8s burst window once a SECOND photo lands', () => {
    expect(debounceDelayFor([{ mediaUrls: ['x'] }, { mediaUrls: ['y'] }])).toBe(8000);
  });
  it('counts media, not messages — one webhook carrying two photos is a burst', () => {
    expect(debounceDelayFor([{ mediaUrls: ['x', 'y'] }])).toBe(8000);
  });
  it('keeps a lone photo on the fast window no matter how many text bubbles ride along', () => {
    expect(
      debounceDelayFor([{ mediaUrls: [] }, { mediaUrls: ['x'] }, { mediaUrls: [] }]),
    ).toBe(4000);
  });
});
