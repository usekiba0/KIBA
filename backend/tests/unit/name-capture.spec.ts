import {
  captureNameFromReply,
  isNameAsk,
  parseNameAnswer,
} from '../../src/messaging/name-capture';

const ASK = "i'm KIBA. i live in your texts.\n\nwhat's your name tho?";

describe('isNameAsk', () => {
  it('recognises the ways KIBA asks for a name', () => {
    expect(isNameAsk(ASK)).toBe(true);
    expect(isNameAsk('aight. what do i call you?')).toBe(true);
    expect(isNameAsk('you got a name for me?')).toBe(true);
    expect(isNameAsk('who am i talking to')).toBe(true);
  });

  it('does not fire on any other question', () => {
    // The turn that actually followed Karibi's name on 2026-07-29 — if this
    // counted as an ask, "Chilling bro" would have become his name.
    expect(isNameAsk("aight aight. so nothing's actually nagging at you?")).toBe(false);
    expect(isNameAsk('what are you trying to lock in rn?')).toBe(false);
    expect(isNameAsk('what city are you in?')).toBe(false);
    expect(isNameAsk(null)).toBe(false);
  });
});

describe('parseNameAnswer', () => {
  it('takes a bare name, as typed', () => {
    expect(parseNameAnswer('Karibi')).toBe('Karibi');
    expect(parseNameAnswer('karibi')).toBe('karibi');
    expect(parseNameAnswer('Mary-Jane')).toBe('Mary-Jane');
    expect(parseNameAnswer("O'Sullivan")).toBe("O'Sullivan");
    expect(parseNameAnswer('  Sam  ')).toBe('Sam');
    expect(parseNameAnswer('Sam.')).toBe('Sam');
  });

  it('strips the lead-in people put in front of it', () => {
    expect(parseNameAnswer('my name is Karibi')).toBe('Karibi');
    expect(parseNameAnswer("i'm Sam")).toBe('Sam');
    expect(parseNameAnswer('im sam')).toBe('sam');
    expect(parseNameAnswer('call me Ray')).toBe('Ray');
    expect(parseNameAnswer("it's Najee")).toBe('Najee');
    expect(parseNameAnswer('yo, my name is Bianca')).toBe('Bianca');
  });

  it('takes a first and last name', () => {
    expect(parseNameAnswer('Karibi Amakiri')).toBe('Karibi Amakiri');
  });

  it('refuses anything that is not confidently a name', () => {
    // Refusals and filler.
    expect(parseNameAnswer('why')).toBeNull();
    expect(parseNameAnswer('nah')).toBeNull();
    expect(parseNameAnswer('nothing')).toBeNull();
    expect(parseNameAnswer('Chilling bro')).toBeNull();
    expect(parseNameAnswer('lol')).toBeNull();
    // A sentence, not an answer.
    expect(parseNameAnswer('why do you need to know that')).toBeNull();
    expect(parseNameAnswer('who is asking exactly')).toBeNull();
    // Contact details and times.
    expect(parseNameAnswer('8325604035')).toBeNull();
    expect(parseNameAnswer('sam@example.com')).toBeNull();
    expect(parseNameAnswer('9am')).toBeNull();
    // Single letters are initials or typos.
    expect(parseNameAnswer('k')).toBeNull();
    expect(parseNameAnswer('')).toBeNull();
  });

  it('never writes a carrier keyword as a name', () => {
    // A STOP that landed on the naming turn must stay an opt-out, not a name.
    for (const kw of ['STOP', 'stop', 'Unsubscribe', 'CANCEL', 'HELP', 'quit']) {
      expect(parseNameAnswer(kw)).toBeNull();
    }
  });
});

describe('captureNameFromReply', () => {
  it('captures the name the model forgot to save (Karibi 2026-07-29)', () => {
    expect(captureNameFromReply('Karibi', ASK, null)).toBe('Karibi');
  });

  it('never overwrites a name we already have', () => {
    expect(captureNameFromReply('Karibi', ASK, 'Sam')).toBeNull();
  });

  it('only fires as a reply to the ask', () => {
    expect(captureNameFromReply('Karibi', 'what city are you in?', null)).toBeNull();
    expect(captureNameFromReply('Karibi', null, null)).toBeNull();
  });
});
