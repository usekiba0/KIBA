import { humanizeVoice, scrubIntakeVoice } from '../../src/messaging/voice';

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

  // --- markdown stripping (renders as literal junk on a phone) ---

  it('strips single-asterisk emphasis', () => {
    expect(humanizeVoice('here you go: *lock in*')).toBe('here you go: lock in');
  });

  it('strips double-asterisk bold', () => {
    expect(humanizeVoice('**do this** now')).toBe('do this now');
  });

  it('strips inline code backticks', () => {
    expect(humanizeVoice('run `npm test` first')).toBe('run npm test first');
  });

  it('strips markdown headings at line start', () => {
    expect(humanizeVoice('## Plan\ngo')).toBe('Plan\ngo');
  });

  it('normalises asterisk bullets to dash bullets', () => {
    expect(humanizeVoice('* eggs\n* rice')).toBe('- eggs\n- rice');
  });

  it('leaves real dash bullets untouched', () => {
    expect(humanizeVoice('- eggs\n- rice')).toBe('- eggs\n- rice');
  });

  it('drops a stray unpaired asterisk', () => {
    expect(humanizeVoice('5 stars *')).toBe('5 stars');
  });

  it('preserves the [pause] burst marker while stripping markdown', () => {
    expect(humanizeVoice('nice 🔥[pause]what next *bro*')).toBe('nice 🔥[pause]what next bro');
  });

  it('strips markdown and converts em-dashes together', () => {
    expect(humanizeVoice('**lock in** — proof when done')).toBe('lock in. proof when done');
  });

  it('normalises unicode bullets (•) to dash bullets', () => {
    expect(humanizeVoice('today:\n• run 5k\n• cold call 5')).toBe('today:\n- run 5k\n- cold call 5');
  });

  it('is idempotent — re-cleaning already-clean text changes nothing', () => {
    const clean = humanizeVoice('two days left. today:\n- audit data, calculate CAC\nwhat time?');
    expect(humanizeVoice(clean)).toBe(clean);
  });
});

// Intake-only scrub: kills the two tics Karibi flagged in every sign-up review —
// decorative emoji and the "love it, ..." filler opener (2026-06-26).
describe('scrubIntakeVoice', () => {
  it('strips the decorative emoji from the opener', () => {
    expect(scrubIntakeVoice("yo what's up 😎 i'm KIBA")).toBe("yo what's up i'm KIBA");
  });

  it('strips the fire emoji bolted onto a name', () => {
    expect(scrubIntakeVoice('yo Karibi 🔥 alright')).toBe('yo Karibi alright');
  });

  it('strips ALL emoji anywhere in the reply', () => {
    expect(scrubIntakeVoice('that view 🔥 you locked in 😈💀')).toBe('that view you locked in');
  });

  it('kills the "love it" filler opener', () => {
    expect(scrubIntakeVoice('love it, we lock in on both of these')).toBe('we lock in on both of these');
  });

  it('kills other flagged filler openers (great / perfect / awesome)', () => {
    expect(scrubIntakeVoice('perfect. what city you in')).toBe('what city you in');
    expect(scrubIntakeVoice('awesome, lets go')).toBe('lets go');
  });

  it('leaves a mid-sentence "love" alone (only the opener is filler)', () => {
    expect(scrubIntakeVoice('i love that you said that')).toBe('i love that you said that');
  });

  it('strips filler at the start of each [pause] bubble, keeping the marker', () => {
    expect(scrubIntakeVoice('love it, locked[pause]love that, now what')).toBe('locked[pause]now what');
  });

  it('is a no-op for clean intake text', () => {
    const clean = "aight. what are you trying to lock in right now?";
    expect(scrubIntakeVoice(clean)).toBe(clean);
  });

  it('is a no-op for empty input', () => {
    expect(scrubIntakeVoice('')).toBe('');
  });
});
