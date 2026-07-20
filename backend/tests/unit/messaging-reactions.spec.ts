import axios from 'axios';
import { MessagingService } from '../../src/messaging/messaging.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('twilio', () => jest.fn(() => ({ messages: { create: jest.fn() } })));

function makeService(config: Record<string, string | undefined>): MessagingService {
  const configService = { get: (k: string) => config[k], getOrThrow: (k: string) => config[k] ?? `missing_${k}` };
  const userRepo = { findOne: jest.fn().mockResolvedValue(null) }; // consent intact
  return new MessagingService(configService as any, { add: jest.fn() } as any, userRepo as any);
}

const SB = { SENDBLUE_API_KEY_ID: 'kid', SENDBLUE_API_SECRET_KEY: 'secret', SENDBLUE_FROM_NUMBER: '+15550000000' };

describe('MessagingService.sendReaction (iMessage tapbacks)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { status: 'OK', message: 'Reaction request sent' } } as any);
  });

  it('posts a valid tapback to the SendBlue send-reaction endpoint', async () => {
    const svc = makeService(SB);
    await svc.onModuleInit();

    const res = await svc.sendReaction('+15551234567', 'APPLE-GUID-123', 'laugh');

    expect(res.ok).toBe(true);
    const [url, payload] = mockedAxios.post.mock.calls[0];
    expect(url).toContain('/api/send-reaction');
    expect(payload).toMatchObject({
      from_number: '+15550000000',
      message_handle: 'APPLE-GUID-123',
      reaction: 'laugh',
      part_index: 0,
    });
  });

  it.each(['love', 'like', 'dislike', 'laugh', 'emphasize', 'question'])(
    'accepts the "%s" tapback',
    async (reaction) => {
      const svc = makeService(SB);
      await svc.onModuleInit();
      const res = await svc.sendReaction('+15551234567', 'h', reaction);
      expect(res.ok).toBe(true);
    },
  );

  it('rejects an unknown reaction without calling the API', async () => {
    const svc = makeService(SB);
    await svc.onModuleInit();
    const res = await svc.sendReaction('+15551234567', 'h', 'fire');
    expect(res.ok).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('no-ops with ok:false when SendBlue (iMessage) is not configured — SMS has no tapbacks', async () => {
    const svc = makeService({ TWILIO_PHONE_NUMBER: '+15550000000' }); // no SendBlue creds
    const res = await svc.sendReaction('+15551234567', 'h', 'love');
    expect(res.ok).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('returns ok:false when there is no message_handle to target', async () => {
    const svc = makeService(SB);
    await svc.onModuleInit();
    const res = await svc.sendReaction('+15551234567', null, 'love');
    expect(res.ok).toBe(false);
  });

  it('surfaces a SendBlue ERROR status as a failed reaction', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'ERROR', error_message: 'too old' } } as any);
    const svc = makeService(SB);
    await svc.onModuleInit();
    const res = await svc.sendReaction('+15551234567', 'h', 'love');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('too old');
  });
});
