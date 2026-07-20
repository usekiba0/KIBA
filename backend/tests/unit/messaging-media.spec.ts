import axios from 'axios';
import { MessagingService } from '../../src/messaging/messaging.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// twilio() is called in the constructor; stub it to a client whose
// messages.create we can inspect.
const twilioCreate = jest.fn().mockResolvedValue({ sid: 'SM1', status: 'queued' });
jest.mock('twilio', () => jest.fn(() => ({ messages: { create: twilioCreate } })));

function makeService(config: Record<string, string | undefined>): MessagingService {
  const configService = {
    get: (k: string) => config[k],
    getOrThrow: (k: string) => config[k] ?? `missing_${k}`,
  };
  // findOne → null means "no opted-out user with this number", i.e. consent
  // intact, which is the precondition these media tests care about.
  const userRepo = { findOne: jest.fn().mockResolvedValue(null) };
  return new MessagingService(configService as any, { add: jest.fn() } as any, userRepo as any);
}

describe('MessagingService media passthrough', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { status: 'QUEUED', message_handle: 'h1' } } as any);
  });

  it('sends media_url to SendBlue (iMessage) when a mediaUrl is given', async () => {
    const svc = makeService({
      SENDBLUE_API_KEY_ID: 'kid',
      SENDBLUE_API_SECRET_KEY: 'secret',
      SENDBLUE_FROM_NUMBER: '+15550000000',
    });
    await svc.onModuleInit();

    await svc.send('+15551234567', 'pin our chat 📌', 'https://cdn.example.com/pin.png');

    const [, payload] = mockedAxios.post.mock.calls[0];
    expect(payload).toMatchObject({ media_url: 'https://cdn.example.com/pin.png', content: 'pin our chat 📌' });
  });

  it('sanitizes the body at the send chokepoint (em-dashes + bullets) — covers deterministic generators', () => {
    return (async () => {
      const svc = makeService({ SENDBLUE_API_KEY_ID: 'kid', SENDBLUE_API_SECRET_KEY: 'secret' });
      await svc.onModuleInit();
      // A deterministic generator (e.g. night recap) shipping an em-dash + bullet.
      await svc.send('+15551234567', 'two days left — today:\n• audit data—calculate CAC');
      const [, payload] = mockedAxios.post.mock.calls[0] as [string, { content: string }];
      expect(payload.content).not.toMatch(/[•—–]/);
      expect(payload.content).toContain('two days left. today:');
      expect(payload.content).toContain('- audit data. calculate CAC');
    })();
  });

  it('omits media_url for a plain text send', async () => {
    const svc = makeService({ SENDBLUE_API_KEY_ID: 'kid', SENDBLUE_API_SECRET_KEY: 'secret' });
    await svc.onModuleInit();

    await svc.send('+15551234567', 'just text');

    const [, payload] = mockedAxios.post.mock.calls[0];
    expect(payload).not.toHaveProperty('media_url');
  });

  it('passes mediaUrl to Twilio as MMS when SendBlue is not configured', async () => {
    const svc = makeService({ TWILIO_PHONE_NUMBER: '+15550000000' });

    await svc.send('+15551234567', 'pin our chat', 'https://cdn.example.com/pin.png');

    expect(twilioCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+15551234567', mediaUrl: ['https://cdn.example.com/pin.png'] }),
    );
  });
});

describe('MessagingService duplicate-send guard (Karibi 2026-07-08)', () => {
  const LONG = "aight locked. may 29th is the window. finish the game and lock in the link when you're done.";
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { status: 'QUEUED', message_handle: 'h1' } } as any);
  });

  it('suppresses an identical long message to the same number within the window', async () => {
    const svc = makeService({ SENDBLUE_API_KEY_ID: 'kid', SENDBLUE_API_SECRET_KEY: 'secret' });
    await svc.onModuleInit();

    await svc.send('+15551234567', LONG);
    await svc.send('+15551234567', LONG); // duplicate

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('still sends the same text to a DIFFERENT number', async () => {
    const svc = makeService({ SENDBLUE_API_KEY_ID: 'kid', SENDBLUE_API_SECRET_KEY: 'secret' });
    await svc.onModuleInit();

    await svc.send('+15551111111', LONG);
    await svc.send('+15552222222', LONG);

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('does not suppress distinct bubbles in one burst', async () => {
    const svc = makeService({ SENDBLUE_API_KEY_ID: 'kid', SENDBLUE_API_SECRET_KEY: 'secret' });
    await svc.onModuleInit();

    await svc.send('+15551234567', 'first distinct bubble that is plenty long here');
    await svc.send('+15551234567', 'second distinct bubble that is also plenty long');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('never suppresses short confirmations (below the length gate)', async () => {
    const svc = makeService({ SENDBLUE_API_KEY_ID: 'kid', SENDBLUE_API_SECRET_KEY: 'secret' });
    await svc.onModuleInit();

    await svc.send('+15551234567', 'ok');
    await svc.send('+15551234567', 'ok');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
