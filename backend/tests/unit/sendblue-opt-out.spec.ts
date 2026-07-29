/**
 * SendBlue-side opt-out: the OTHER half of the dual-channel hole.
 *
 * `carrier-opt-out.spec.ts` pins the Twilio direction (21610 → reconcile). This
 * pins SendBlue's, which was live and unhandled until 2026-07-29.
 *
 * The real STOP test that found it: a user texted "Stop" over iMessage, our
 * keyword handler flagged them, and the unsubscribe confirmation was then sent
 * — and SendBlue declined it:
 *
 *   {"status":"ERROR","error_code":402,"error_message":"OPTED_OUT",
 *    "error_reason":"SpamRule",
 *    "error_detail":"...the user has opted out of your messages"}
 *
 * `send()` treated that like any transport failure and retried over Twilio, so
 * the message was delivered from a DIFFERENT number moments after the user
 * asked us to stop. Fine for the confirmation (carriers require it); a
 * violation for anything else.
 */
import {
  MessagingService,
  SendBlueOptedOutError,
  isSendBlueOptOut,
} from '../../src/messaging/messaging.service';

/** The exact body prod returned on 2026-07-29. */
const REAL_DECLINE = {
  accountEmail: 'kiba',
  status: 'ERROR',
  error_code: 402,
  error_message: 'OPTED_OUT',
  error_reason: 'SpamRule',
  error_detail: 'Your message has been declined because the user has opted out of your messages',
  from_number: '+14695634418',
  number: '+923323043863',
};

function setup(sendBlueError: Error) {
  const twilioSends: Array<{ to: string; body: string }> = [];
  const updates: any[] = [];
  const userRepo: any = {
    findOne: jest.fn(async () => ({ id: 'u-1', opted_out_at: null })),
    update: jest.fn(async (id: string, patch: any) => {
      updates.push({ id, patch });
      return {};
    }),
  };

  const service = Object.create(MessagingService.prototype) as MessagingService;
  Object.assign(service, {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    userRepo,
    // The DB gate is a separate concern with its own tests — and it can't be the
    // thing under test here, since the whole point is the window where SendBlue
    // knows about an opt-out that our DB does not.
    hasOptedOut: jest.fn(async () => false),
    sendBlueReady: true,
    recentSends: new Map(),
    config: { get: (k: string) => (k.startsWith('SENDBLUE') ? 'set' : undefined), getOrThrow: () => '+1' },
    sendViaSendBlue: jest.fn(async () => {
      throw sendBlueError;
    }),
    sendViaTwilio: jest.fn(async (to: string, body: string) => {
      twilioSends.push({ to, body });
    }),
  });

  return { service, twilioSends, updates, userRepo };
}

describe('isSendBlueOptOut', () => {
  it('recognises the real decline body', () => {
    expect(isSendBlueOptOut(REAL_DECLINE)).toBe(true);
  });

  it('does not fire on other SendBlue failures', () => {
    expect(isSendBlueOptOut({ status: 'ERROR', error_code: 500, error_message: 'SERVER_ERROR' })).toBe(false);
    // SpamRule alone is NOT consent revocation — SendBlue uses it more broadly.
    expect(isSendBlueOptOut({ error_reason: 'SpamRule' })).toBe(false);
    expect(isSendBlueOptOut(null)).toBe(false);
    expect(isSendBlueOptOut('nope')).toBe(false);
  });
});

describe('send() when SendBlue says the user opted out', () => {
  it('does NOT route an ordinary message around the opt-out via Twilio', async () => {
    const { service, twilioSends, updates } = setup(new SendBlueOptedOutError('+923323043863'));

    await service.send('+923323043863', 'morning. what are you locking in today?');

    expect(twilioSends).toHaveLength(0);
    // ...and the opt-out is reconciled into our own DB, not just dropped.
    expect(updates[0].patch).toMatchObject({ opt_out_keyword: 'carrier' });
    expect(updates[0].patch.opted_out_at).toBeInstanceOf(Date);
  });

  it('still delivers the compliance message carriers require', async () => {
    const { service, twilioSends } = setup(new SendBlueOptedOutError('+923323043863'));

    // allowOptedOut = the unsubscribe confirmation / HELP / opt-in confirmation.
    await service.send('+923323043863', "You're unsubscribed from KIBA.", undefined, true);

    expect(twilioSends).toHaveLength(1);
  });

  it('keeps falling back to Twilio for a genuine transport failure', async () => {
    const { service, twilioSends, userRepo } = setup(new Error('ECONNRESET'));

    await service.send('+923323043863', 'morning. what are you locking in today?');

    expect(twilioSends).toHaveLength(1);
    // An outage must never be recorded as consent revocation.
    expect(userRepo.update).not.toHaveBeenCalled();
  });
});
