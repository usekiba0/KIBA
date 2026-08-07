import { CoachingProcessor } from '../../src/messaging/coaching.processor';
import { User } from '../../src/data/entities/user.entity';

/**
 * The send-path half of the tapback marker (Karibi 2026-08-07 — "thumbs up ...
 * and then talk"). The parser is covered in outbound-reaction.spec.ts; this
 * covers what the processor does with what it parses:
 *
 *   - the tapback goes out, and the words still go out after it
 *   - the marker never reaches the phone or the stored row
 *   - SMS gets no reaction attempt (there is no tapback off iMessage)
 *   - two markers in one turn are still ONE reaction
 */

const user = { id: 'u-1', phone_number: '+15551230000' } as unknown as User;

function makeProcessor() {
  const processor = Object.create(CoachingProcessor.prototype) as CoachingProcessor;
  const send = jest.fn().mockResolvedValue(undefined);
  const sendReaction = jest.fn().mockResolvedValue({ ok: true });
  const save = jest.fn().mockResolvedValue({ id: 'm-1' });
  const addMessage = jest.fn().mockResolvedValue(undefined);

  Object.assign(processor as unknown as Record<string, unknown>, {
    messagingService: { send, sendReaction },
    messageRepo: { save },
    sessionCache: { addMessage },
    config: { get: (_k: string, def?: unknown) => def },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });

  return { processor, send, sendReaction, save };
}

const imessage = () => ({ channel: 'imessage' as const, messageHandle: 'APPLE-GUID', fired: false });
const sms = () => ({ channel: 'sms' as const, messageHandle: null, fired: false });

const saveAndSend = (processor: CoachingProcessor, reply: string, target?: unknown) =>
  (processor as unknown as { saveAndSend: (...a: unknown[]) => Promise<void> }).saveAndSend(
    user,
    'sess-1',
    reply,
    target,
  );

describe('CoachingProcessor — [react:...] dispatch', () => {
  it('sends the tapback AND the words, with no marker on the phone', async () => {
    const { processor, send, sendReaction } = makeProcessor();

    await saveAndSend(processor, "[react:like]that's one. what's next?", imessage());

    expect(sendReaction).toHaveBeenCalledWith('+15551230000', 'APPLE-GUID', 'like');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toBe("that's one. what's next?");
    expect(send.mock.calls[0][1]).not.toMatch(/\[react/i);
  });

  it('stores the reply without the marker, so it never re-enters model context', async () => {
    const { processor, save } = makeProcessor();

    await saveAndSend(processor, '[react:laugh]nah that pic is old', imessage());

    expect(save.mock.calls[0][0].content).toBe('nah that pic is old');
  });

  // Off iMessage a tapback would degrade to an ugly `Liked "x"` text, so the
  // marker is stripped and nothing is attempted.
  it('never attempts a reaction on SMS, but still sends the words', async () => {
    const { processor, send, sendReaction } = makeProcessor();

    await saveAndSend(processor, '[react:love]proud of you bro', sms());

    expect(sendReaction).not.toHaveBeenCalled();
    expect(send.mock.calls[0][1]).toBe('proud of you bro');
  });

  it('does nothing extra when the caller gives no reaction target', async () => {
    const { processor, send, sendReaction } = makeProcessor();

    await saveAndSend(processor, '[react:like]morning');

    expect(sendReaction).not.toHaveBeenCalled();
    expect(send.mock.calls[0][1]).toBe('morning');
  });

  // The text path calls saveAndSend twice on a tool turn (early bubble, then the
  // final reply). One turn gets one tapback.
  it('fires at most one reaction per turn across multiple sends', async () => {
    const { processor, sendReaction } = makeProcessor();
    const target = imessage();

    await saveAndSend(processor, '[react:like]hold on', target);
    await saveAndSend(processor, '[react:love]locked it in', target);

    expect(sendReaction).toHaveBeenCalledTimes(1);
    expect(sendReaction.mock.calls[0][2]).toBe('like');
  });

  it('still reacts when the model sent a marker and no words', async () => {
    const { processor, send, sendReaction } = makeProcessor();

    await saveAndSend(processor, '[react:like]', imessage());

    expect(sendReaction).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  // A failed tapback must never take down the turn that carries the real reply.
  it('sends the reply even when the reaction fails', async () => {
    const { processor, send, sendReaction } = makeProcessor();
    sendReaction.mockRejectedValue(new Error('sendblue down'));

    await saveAndSend(processor, '[react:like]still here', imessage());

    expect(send.mock.calls[0][1]).toBe('still here');
  });

  it('leaves an ordinary reply alone', async () => {
    const { processor, send, sendReaction } = makeProcessor();

    await saveAndSend(processor, 'what time you hitting the gym?', imessage());

    expect(sendReaction).not.toHaveBeenCalled();
    expect(send.mock.calls[0][1]).toBe('what time you hitting the gym?');
  });
});
