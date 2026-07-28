/**
 * Carrier-level opt-out reconciliation.
 *
 * KIBA is dual-channel and only ONE channel routes STOP through our code:
 *   - iMessage (SendBlue): nothing intercepts, so opt-out.ts sees the keyword.
 *   - SMS (Twilio): Twilio's default opt-out management answers STOP itself and
 *     blocks the number. Our webhook may never see it.
 *
 * Without reconciliation the SMS case leaves the user `opted_out_at: null`:
 * active in the admin dashboard, check-ins still scheduled, every send failing
 * with a 21610 that reads like a generic error. This pins the catch-up.
 */
import { MessagingService, TWILIO_UNSUBSCRIBED_RECIPIENT } from '../../src/messaging/messaging.service';

function twilioError(code: number): Error & { code: number } {
  const e = new Error(`Twilio error ${code}`) as Error & { code: number };
  e.code = code;
  return e;
}

function setup(opts: { user?: any; createThrows?: Error } = {}) {
  const updates: any[] = [];
  const userRepo: any = {
    findOne: jest.fn(async () => opts.user ?? null),
    update: jest.fn(async (id: string, patch: any) => {
      updates.push({ id, patch });
      return {};
    }),
  };
  const messagesCreate = jest.fn(async () => {
    if (opts.createThrows) throw opts.createThrows;
    return { sid: 'SM1', status: 'queued' };
  });

  const service = Object.create(MessagingService.prototype) as MessagingService;
  Object.assign(service, {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    userRepo,
    config: { getOrThrow: () => '+18327355182' },
    twilioClient: { messages: { create: messagesCreate } },
  });

  return { service, userRepo, updates, messagesCreate };
}

describe('carrier opt-out reconciliation (Twilio 21610)', () => {
  it('flags a user who unsubscribed at the carrier', async () => {
    const { service, updates } = setup({
      user: { id: 'u1', opted_out_at: null },
      createThrows: twilioError(TWILIO_UNSUBSCRIBED_RECIPIENT),
    });

    await service.sendViaTwilio('+15550001111', 'morning. gym at 8?');

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('u1');
    expect(updates[0].patch.opted_out_at).toBeInstanceOf(Date);
    // Distinguishes a carrier-side opt-out from one our keyword handler caught.
    expect(updates[0].patch.opt_out_keyword).toBe('carrier');
  });

  it('swallows the error instead of rethrowing, so the job does not retry forever', async () => {
    const { service } = setup({
      user: { id: 'u1', opted_out_at: null },
      createThrows: twilioError(TWILIO_UNSUBSCRIBED_RECIPIENT),
    });
    // A message to an unsubscribed recipient can never be delivered — retrying
    // it just burns attempts and fails identically each time.
    await expect(service.sendViaTwilio('+15550001111', 'hi')).resolves.toBeUndefined();
  });

  it('does not re-stamp a user who is already flagged', async () => {
    const { service, updates } = setup({
      user: { id: 'u1', opted_out_at: new Date('2026-07-01') },
      createThrows: twilioError(TWILIO_UNSUBSCRIBED_RECIPIENT),
    });

    await service.sendViaTwilio('+15550001111', 'hi');

    expect(updates).toHaveLength(0);
  });

  it('handles a 21610 for a number with no matching user', async () => {
    const { service, updates } = setup({
      user: null,
      createThrows: twilioError(TWILIO_UNSUBSCRIBED_RECIPIENT),
    });

    await expect(service.sendViaTwilio('+15559999999', 'hi')).resolves.toBeUndefined();
    expect(updates).toHaveLength(0);
  });

  it('never throws out of reconciliation when the DB read fails', async () => {
    const { service } = setup({ createThrows: twilioError(TWILIO_UNSUBSCRIBED_RECIPIENT) });
    (service as any).userRepo.findOne = jest.fn(async () => {
      throw new Error('db down');
    });
    // The send is already correctly abandoned; the next attempt retries the
    // reconciliation. A DB blip must not turn into an unhandled rejection.
    await expect(service.sendViaTwilio('+15550001111', 'hi')).resolves.toBeUndefined();
  });

  describe('does NOT treat other failures as consent revocation', () => {
    // Falsely flagging someone silences them permanently — a worse and much
    // quieter failure than a bounced message. Only 21610 means "unsubscribed".
    const OTHER_CODES = [
      30007, // carrier filtered — content/spam heuristics, not consent
      21211, // invalid To number
      21614, // not a valid mobile number
      20003, // auth failure
    ];

    it.each(OTHER_CODES)('rethrows Twilio %i without flagging', async (code) => {
      const { service, updates } = setup({
        user: { id: 'u1', opted_out_at: null },
        createThrows: twilioError(code),
      });

      await expect(service.sendViaTwilio('+15550001111', 'hi')).rejects.toThrow();
      expect(updates).toHaveLength(0);
    });

    it('rethrows a plain error with no code', async () => {
      const { service, updates } = setup({
        user: { id: 'u1', opted_out_at: null },
        createThrows: new Error('socket hang up'),
      });

      await expect(service.sendViaTwilio('+15550001111', 'hi')).rejects.toThrow('socket hang up');
      expect(updates).toHaveLength(0);
    });
  });

  it('leaves the happy path untouched', async () => {
    const { service, updates, messagesCreate } = setup({ user: { id: 'u1', opted_out_at: null } });

    await service.sendViaTwilio('+15550001111', 'morning.');

    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(0);
  });
});
