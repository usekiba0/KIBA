import axios from 'axios';
import { MessagingService } from '../../src/messaging/messaging.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('twilio', () => jest.fn(() => ({ messages: { create: jest.fn() } })));

function makeService(config: Record<string, string | undefined>): MessagingService {
  const configService = {
    get: (k: string) => config[k],
    getOrThrow: (k: string) => config[k] ?? `missing_${k}`,
  };
  const userRepo = { findOne: jest.fn().mockResolvedValue(null) }; // consent intact
  return new MessagingService(configService as any, { add: jest.fn() } as any, userRepo as any);
}

const SB = {
  SENDBLUE_API_KEY_ID: 'kid',
  SENDBLUE_API_SECRET_KEY: 'secret',
  SENDBLUE_FROM_NUMBER: '+15550000000',
};

describe('MessagingService.sendTypingIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { status: 'OK' } } as any);
  });

  it('posts to the send-typing-indicator endpoint with the documented fields', async () => {
    const svc = makeService(SB);
    await svc.onModuleInit();

    await svc.sendTypingIndicator('+15551234567');

    const [url, payload, opts] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/api/send-typing-indicator');
    expect(payload).toMatchObject({
      number: '+15551234567',
      from_number: '+15550000000',
      state: 'start',
    });
    expect((opts as any).headers['sb-api-key-id']).toBe('kid');
    expect((opts as any).headers['sb-api-secret-key']).toBe('secret');
  });

  it('keeps max_duration_ms inside the 1-300000 range SendBlue accepts', async () => {
    const svc = makeService(SB);
    await svc.onModuleInit();

    await svc.sendTypingIndicator('+15551234567');

    const payload = mockedAxios.post.mock.calls[0][1] as { max_duration_ms: number };
    expect(payload.max_duration_ms).toBeGreaterThanOrEqual(1);
    expect(payload.max_duration_ms).toBeLessThanOrEqual(300_000);
  });

  it('no-ops when SendBlue is not configured — SMS has no typing concept', async () => {
    const svc = makeService({ TWILIO_PHONE_NUMBER: '+15550000000' });

    await svc.sendTypingIndicator('+15551234567');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('no-ops without a from number rather than sending a malformed request', async () => {
    const svc = makeService({
      SENDBLUE_API_KEY_ID: 'kid',
      SENDBLUE_API_SECRET_KEY: 'secret',
    });
    await svc.onModuleInit();

    await svc.sendTypingIndicator('+15551234567');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  // The whole point of the indicator is that it is decoration on a turn that has
  // to happen anyway. If Sendblue is down, or the account has no existing
  // conversation with this number (the documented precondition), the user must
  // still get their reply — so this can never throw at its fire-and-forget
  // call site in the webhook handler.
  it('swallows API failures — a missing typing bubble must never break a turn', async () => {
    const svc = makeService(SB);
    await svc.onModuleInit();
    mockedAxios.post.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        response: { status: 400, data: { error_message: 'no existing conversation' } },
      }),
    );

    await expect(svc.sendTypingIndicator('+15551234567')).resolves.toBeUndefined();
  });
});
