import { MessageDebouncerService, DebouncedMessage } from '../../src/messaging/message-debouncer.service';

// The debouncer waits 1500ms before flushing — use fake timers so tests don't
// take 6+ seconds and we can deterministically assert timing behavior.
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

  it('flushes a single message after the debounce window', async () => {
    service.push(msg());
    expect(mockProcessor.process).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1500);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { body: string }).body).toBe('hello');
  });

  it('merges multiple texts that arrive within the window into one process call', async () => {
    service.push(msg({ text: 'Look where I', uniqueId: 'h1', dateSent: 1_000_000 }));
    jest.advanceTimersByTime(300);
    service.push(msg({ text: 'At', uniqueId: 'h2', dateSent: 1_000_001 }));
    jest.advanceTimersByTime(300);
    service.push(msg({ text: 'the gym', uniqueId: 'h3', dateSent: 1_000_002 }));

    jest.advanceTimersByTime(1500);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { body: string }).body).toBe('Look where I At the gym');
  });

  it('sorts merged messages by dateSent so the image arriving late lands in order', async () => {
    // Reproduces the 2026-05-23 production log: image webhook with earlier
    // date_sent arrived AFTER the text webhook.
    service.push(msg({
      text: 'Can you see this picture?',
      uniqueId: 'text-handle',
      dateSent: 2_000,
      mediaUrls: [],
    }));
    service.push(msg({
      text: '',
      uniqueId: 'image-handle',
      dateSent: 1_000,
      mediaUrls: ['https://example.com/photo.heic'],
      mediaContentTypes: ['image/heic'],
    }));

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

    jest.advanceTimersByTime(1500);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(1);
    expect((processCalls[0] as { body: string }).body).toBe('hello');
  });

  it('starts a fresh batch after a flush has completed', async () => {
    service.push(msg({ text: 'first', uniqueId: 'a' }));
    jest.advanceTimersByTime(1500);
    await Promise.resolve();

    service.push(msg({ text: 'second', uniqueId: 'b' }));
    jest.advanceTimersByTime(1500);
    await Promise.resolve();

    expect(mockProcessor.process).toHaveBeenCalledTimes(2);
    expect((processCalls[0] as { body: string }).body).toBe('first');
    expect((processCalls[1] as { body: string }).body).toBe('second');
  });
});
