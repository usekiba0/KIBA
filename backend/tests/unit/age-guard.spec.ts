import {
  detectDeclaredMinorAge,
  declaredMinorAgeInThread,
  ageBlockedNote,
} from '../../src/ai/age-guard';

const ai = (content: string) => ({ role: 'ai', content });
const user = (content: string) => ({ role: 'user', content });

describe('detectDeclaredMinorAge', () => {
  it('catches the messages from the audited thread', () => {
    // 2026-07-30, the turn that preceded a Stripe link being sent.
    expect(detectDeclaredMinorAge('I’m 5”6 and 9 years old I play PG')).toBe(9);
    expect(detectDeclaredMinorAge('I’m only nine I don’t have money 😭')).toBe(9);
  });

  it.each([
    ['9 years old', 9],
    ['im 12 years old', 12],
    ['I am a 15-year-old', 15],
    ['15 yrs old', 15],
    ['9yo', 9],
    ['12 y/o', 12],
    ['15 y.o.', 15],
    ['nine years old', 9],
    ['seventeen years old', 17],
    ["i'm only 13", 13],
    ['im only sixteen', 16],
    ['just turned 14', 14],
    ['turning 17 next month', 17],
  ])('reads %j as age %i', (text, age) => {
    expect(detectDeclaredMinorAge(text)).toBe(age);
  });

  it('takes the youngest claim when several appear', () => {
    expect(detectDeclaredMinorAge('i was 15 years old then, im 12 years old now')).toBe(12);
  });

  describe('does not fire on adults', () => {
    it.each(['18 years old', '25 years old', 'im 34 years old', 'just turned 21'])('%j', (text) => {
      expect(detectDeclaredMinorAge(text)).toBeNull();
    });
  });

  describe('does not fire on numbers that merely look like ages', () => {
    // Every one of these appeared, or plausibly appears, in a real thread. A
    // false positive here silently blocks a paying adult's checkout.
    it.each([
      'I’m 5”6 and I play PG',
      "i'm 5'9",
      'im 9 lbs down',
      'i want to be up at 9',
      'remind me at 830',
      '560k mrr',
      '5 days a week after work or before',
      'lose 30 lbs',
      'been lifting 9 years',
      'i’m 9 months into this business',
      "i'm 15 minutes away",
      'my split is 6 days',
      '',
    ])('%j', (text) => {
      expect(detectDeclaredMinorAge(text)).toBeNull();
    });
  });

  describe("does not fire on someone else's age", () => {
    // A parent describing their kid must still be able to check out.
    it.each([
      'my son is 9 years old',
      'my daughter just turned 12',
      'my kid is 15 years old',
      "he's 10 years old",
      'their nephew is only 8',
    ])('%j', (text) => {
      expect(detectDeclaredMinorAge(text)).toBeNull();
    });
  });

  it('is safe on non-string input', () => {
    expect(detectDeclaredMinorAge(undefined as unknown as string)).toBeNull();
    expect(detectDeclaredMinorAge(null as unknown as string)).toBeNull();
  });
});

describe('declaredMinorAgeInThread', () => {
  it('finds an age declared many turns earlier', () => {
    // The real gap was 15:47Z -> 21:03Z: declared at intake, link sent at close.
    const history = [
      user('ohh my basketball skills'),
      ai('what position you play?'),
      user('I’m 5”6 and 9 years old I play PG'),
      ai('aight so you’re a PG.'),
      user('Just do form shots I need better stuff'),
    ];
    expect(declaredMinorAgeInThread('Ok', history)).toBe(9);
  });

  it('ignores ages that appear only in KIBA’s own messages', () => {
    // KIBA repeating "you're 9" back must not be the source of truth, and an
    // assistant turn quoting an age should never gate on its own echo.
    const history = [ai('you’re 9, 5\'6", already in AAU')];
    expect(declaredMinorAgeInThread('ok', history)).toBeNull();
  });

  it('returns null for an ordinary adult thread', () => {
    const history = [
      user('I run a info product bro'),
      user('560k mrr'),
      user('I’d say around 9am I’m up'),
    ];
    expect(declaredMinorAgeInThread('5 days a week', history)).toBeNull();
  });
});

describe('ageBlockedNote', () => {
  it('names the age and forbids the parent-tap workaround', () => {
    const note = ageBlockedNote(9);
    expect(note).toContain('9');
    expect(note).toMatch(/do NOT send a checkout link/);
    expect(note).toMatch(/parent/i);
    // The observed failure was "show them the link, they tap it" — the note has
    // to close that door explicitly, not just decline once.
    expect(note).toMatch(/KEEP HELPING/);
  });
});
