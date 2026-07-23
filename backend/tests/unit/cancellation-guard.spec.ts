import {
  detectCancellationIntent,
  enforceCancellationPath,
  CANCELLATION_PATH_LINE,
} from '../../src/ai/cancellation-guard';

/**
 * Karibi 2026-07-23, live on a PAID subscription:
 *
 *   user:  "Busy bro I wanna cancel"
 *   KIBA:  "nah. hold up. you're at 0/100 score right now. you just said you
 *           don't need me. now you want to cancel. that's not busy. that's
 *           running."
 *
 * Three consecutive retention pushes and the real cancellation path was never
 * stated once. The coaching prompt was explicitly asking for this ("never
 * accept 'i quit' / 'i'm cancelling' without a real conversation first ...
 * frame leaving as LOSING that"). Obstructing a cancellation request is a
 * compliance problem, not a tone problem.
 *
 * The bare keyword "cancel" is already an opt-out (see opt-out.ts). This guard
 * covers the case that path deliberately misses: cancellation intent expressed
 * as a SENTENCE, which reaches the model — the one component prompted to keep
 * the user engaged, i.e. the worst possible judge of the request.
 *
 * Asymmetry note: for the other deterministic guards a false positive (wrongly
 * rewriting a true sentence) is the worse error. Here it inverts — a false
 * positive appends one honest line; a false negative leaves a paying user
 * unable to find the exit. So detection leans inclusive.
 */
describe('detectCancellationIntent', () => {
  it('fires on the literal production message', () => {
    expect(detectCancellationIntent('Busy bro I wanna cancel')).toBe(true);
  });

  it.each([
    'i want to cancel',
    'I wanna cancel',
    'cancel my subscription',
    'how do i cancel this',
    "i'm cancelling",
    'i quit',
    'i want out',
    'unsubscribe me',
    'stop charging me',
    'cancel my account',
    'take me off this',
    'i want to stop paying',
  ])('fires on %j', (msg) => {
    expect(detectCancellationIntent(msg)).toBe(true);
  });

  // The exact carve-out opt-out.ts documents: "cancel my 8pm reminder" is a
  // coaching request and must reach the model as ordinary conversation.
  it.each([
    'cancel my 8pm reminder',
    'cancel that reminder',
    'cancel the morning ping',
    'cancel tomorrow’s alarm',
    'can you cancel the 7am text',
    'cancel leg day',
    'my meeting got cancelled',
    'i cancelled my gym session',
    'cancel that ping please',
  ])('does NOT fire on the reminder/ordinary usage %j', (msg) => {
    expect(detectCancellationIntent(msg)).toBe(false);
  });

  it('is safe on empty input', () => {
    expect(detectCancellationIntent('')).toBe(false);
    expect(detectCancellationIntent('   ')).toBe(false);
  });
});

describe('enforceCancellationPath', () => {
  const refusal =
    "nah. hold up. you're at 0/100 score right now. you just said you don't need me. now you want to cancel. that's not busy. that's running.";

  it('appends the real path when the reply obstructs without stating it', () => {
    const out = enforceCancellationPath(refusal, true);

    expect(out.corrected).toBe(true);
    expect(out.text).toContain(CANCELLATION_PATH_LINE);
    // The coaching voice is preserved — this guard adds, it does not censor.
    expect(out.text).toContain('nah. hold up.');
  });

  it('leaves a reply that already states the path untouched', () => {
    const honest =
      'got it. no pressure — text STOP to stop messages, or email support@usekiba.ai to cancel billing. want me to pause instead?';
    const out = enforceCancellationPath(honest, true);

    expect(out.corrected).toBe(false);
    expect(out.text).toBe(honest);
  });

  it.each(['text STOP to stop the messages', 'email support@usekiba.ai and it’s done'])(
    'recognizes the path stated as %j',
    (variant) => {
      const out = enforceCancellationPath(`sure thing. ${variant}`, true);
      expect(out.corrected).toBe(false);
    },
  );

  it('does nothing at all when no cancellation intent was detected', () => {
    const ordinary = 'nah. hold up. you said 7am and it’s 7:15. where’s the proof?';
    const out = enforceCancellationPath(ordinary, false);

    expect(out.corrected).toBe(false);
    expect(out.text).toBe(ordinary);
  });

  it('is safe on an empty reply', () => {
    const out = enforceCancellationPath('', true);
    expect(out.text).toContain(CANCELLATION_PATH_LINE);
  });

  it('never promises a self-serve cancel flow that does not exist', () => {
    // There is no billing portal and no in-app cancel endpoint. The line may
    // only reference the two real paths.
    expect(CANCELLATION_PATH_LINE).toMatch(/STOP/);
    expect(CANCELLATION_PATH_LINE).toMatch(/support@usekiba\.ai/);
    expect(CANCELLATION_PATH_LINE).not.toMatch(/https?:\/\//);
  });
});
