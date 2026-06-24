import { MessageDebouncerService, DebouncedMessage, debounceDelayFor } from '../../src/messaging/message-debouncer.service';

// Text bursts flush at 2000ms (V4 Rule 2), image bursts at 1500ms. Use fake
// timers so tests are deterministic and fast.
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
      ...overrides,
    };
  }

  it('flushes a single text message after the 2s text window', async () => {
    service.push(msg());
    // Still buffered at the old 1.5s mark — text now waits the full 2s.
    jest.advanceTimersByTime(1500);
    await Promise.resolve();
    expect(mockProcessor.process).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    await Promise.resolve();
    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { body: string }).body).toBe('hello');
  });

  it('merges multiple texts that arrive within the window into one process call (V4 Rule 2)', async () => {
    // The "Bett / Karibi" case — name then correction across two bubbles.
    service.push(msg({ text: 'Bett', uniqueId: 'h1', dateSent: 1_000_000 }));
    jest.advanceTimersByTime(800);
    service.push(msg({ text: 'Karibi', uniqueId: 'h2', dateSent: 1_000_001 }));

    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { body: string }).body).toBe('Bett Karibi');
  });

  it('flushes an image burst at the faster 1.5s window', async () => {
    service.push(msg({
      text: 'check this', uniqueId: 'img1', dateSent: 1_000,
      mediaUrls: ['https://example.com/p.heic'], mediaContentTypes: ['image/heic'],
    }));
    jest.advanceTimersByTime(1500);
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

    // Buffer has media -> flushes at the 1.5s image window.
    jest.advanceTimersByTime(1500);
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

describe('debounceDelayFor', () => {
  it('uses the 2s text window for a text-only burst', () => {
    expect(debounceDelayFor([{ mediaUrls: [] }, { mediaUrls: [] }])).toBe(2000);
  });
  it('uses the faster 1.5s window when any message has media', () => {
    expect(debounceDelayFor([{ mediaUrls: [] }, { mediaUrls: ['x'] }])).toBe(1500);
  });
});
