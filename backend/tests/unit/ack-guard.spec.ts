import {
  isBareAcknowledgment,
  lastAssistantAskedQuestion,
  isInertAcknowledgmentTurn,
} from '../../src/ai/ack-guard';

const ai = (content: string) => ({ role: 'ai', content });
const user = (content: string) => ({ role: 'user', content });

describe('isBareAcknowledgment', () => {
  it('catches the message that caused the incident', () => {
    // Karibi 2026-07-31: "Bettt" re-scheduled an already-fired reminder.
    expect(isBareAcknowledgment('Bettt')).toBe(true);
  });

  it.each([
    'bet',
    'Bet.',
    'bet!!',
    'ok',
    'Okay',
    'k',
    'kk',
    'aight',
    'iight',
    'alright',
    'cool',
    'word',
    'facts',
    'nice',
    'perfect',
    'gotchu',
    'coool',
    'ok bet',
    'aight bet',
    'ok cool',
    'got it',
    'sounds good',
    'say less',
    'copy that',
    'thank you',
    'appreciate it',
    'all good',
    'will do',
  ])('treats %j as a bare acknowledgment', (text) => {
    expect(isBareAcknowledgment(text)).toBe(true);
  });

  it('treats emoji-only replies as acknowledgment', () => {
    expect(isBareAcknowledgment('👍')).toBe(true);
    expect(isBareAcknowledgment('🙏🏾')).toBe(true);
    expect(isBareAcknowledgment('💯')).toBe(true);
  });

  it.each([
    // Carries a real instruction alongside the ack.
    'bet, make it 9 instead',
    'ok but move it to tomorrow',
    'cool remind me at 8',
    'aight i just finished the gym',
    // Questions are never inert.
    'bet?',
    'ok what time',
    // Consent words stay OUT — they answer questions and must keep tool access.
    'yes',
    'yeah',
    'yep',
    'sure',
    'ya',
    // "done" reports task completion in this product; it is content.
    'done',
    'done with it',
    // Content that merely starts with an ack word.
    'fine i will do it later',
    'true but i cant make 8',
  ])('does NOT treat %j as a bare acknowledgment', (text) => {
    expect(isBareAcknowledgment(text)).toBe(false);
  });

  it('rejects anything longer than four words', () => {
    expect(isBareAcknowledgment('ok cool bet nice word')).toBe(false);
  });

  it('is safe on empty and non-string input', () => {
    expect(isBareAcknowledgment('')).toBe(false);
    expect(isBareAcknowledgment('   ')).toBe(false);
    expect(isBareAcknowledgment(undefined as unknown as string)).toBe(false);
  });
});

describe('lastAssistantAskedQuestion', () => {
  it('is true when KIBA last asked something', () => {
    expect(
      lastAssistantAskedQuestion([user('hey'), ai('want me building your plan tonight?')]),
    ).toBe(true);
  });

  it('ignores user messages after the last assistant turn', () => {
    expect(lastAssistantAskedQuestion([ai('cool, i hit you 9am daily?'), user('bet')])).toBe(true);
  });

  it('is false when KIBA last made a statement', () => {
    expect(
      lastAssistantAskedQuestion([
        user('remind me at 830'),
        ai('locked - fires in 52 min.'),
        user('bet'),
      ]),
    ).toBe(false);
  });

  it('only reads the LAST assistant turn, not older questions', () => {
    // The user has already moved past the earlier question; re-arming it is the
    // behaviour the guard exists to stop.
    expect(
      lastAssistantAskedQuestion([
        ai('what time works for you?'),
        user('830'),
        ai('locked - fires in 52 min.'),
      ]),
    ).toBe(false);
  });

  it('is false with no assistant turns at all', () => {
    expect(lastAssistantAskedQuestion([])).toBe(false);
    expect(lastAssistantAskedQuestion([user('yo')])).toBe(false);
  });
});

describe('isInertAcknowledgmentTurn', () => {
  it('suppresses the production case', () => {
    // The reminder had already fired; "Bettt" acknowledged it.
    const history = [
      user('Yea so remind me in an hour at 830'),
      ai('locked - fires in 52 min. send those numbers when you get back.'),
      ai('yo send those business numbers - we figure out what capped you at 560k'),
    ];
    expect(isInertAcknowledgmentTurn('Bettt', history)).toBe(true);
  });

  it('does NOT suppress an ack that answers a question — consent must still write', () => {
    const history = [ai('cool. want me locking your check-in at 9am daily?')];
    expect(isInertAcknowledgmentTurn('bet', history)).toBe(false);
  });

  it('does NOT suppress a message carrying a real request', () => {
    const history = [ai('locked - fires in 52 min.')];
    expect(isInertAcknowledgmentTurn('bet actually make it 9', history)).toBe(false);
  });
});
