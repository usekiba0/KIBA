import { humanizeVoice } from '../../src/messaging/voice';

describe('humanizeVoice', () => {
  it('turns a spaced em-dash into a clean sentence break', () => {
    expect(humanizeVoice('that’s real — money, god, family'))
      .toBe('that’s real. money, god, family');
  });

  it('handles multiple em-dashes in one message (real KIBA example)', () => {
    const input = 'you’re not lazy, karibi — you’re tired. it’s not about willpower — it’s about the phone being easier';
    expect(humanizeVoice(input))
      .toBe('you’re not lazy, karibi. you’re tired. it’s not about willpower. it’s about the phone being easier');
  });

  it('does not produce a double period when the dash follows a sentence', () => {
    expect(humanizeVoice('let’s go. — say done when it’s live'))
      .toBe('let’s go. say done when it’s live');
  });

  it('does not leave a stray period after a question mark', () => {
    expect(humanizeVoice('you ready? — let’s lock in')).toBe('you ready? let’s lock in');
  });

  it('leaves regular hyphens alone (tough-love, lock-in, 9-5, check-in)', () => {
    const s = 'tough-love at 9-5, lock-in your check-in';
    expect(humanizeVoice(s)).toBe(s);
  });

  it('handles en-dashes too', () => {
    expect(humanizeVoice('30 days free – zero risk')).toBe('30 days free. zero risk');
  });

  it('is a no-op for empty input', () => {
    expect(humanizeVoice('')).toBe('');
  });
});
