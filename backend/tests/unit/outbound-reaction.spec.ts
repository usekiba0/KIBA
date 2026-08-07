import { extractReaction } from '../../src/messaging/outbound-reaction';

describe('extractReaction — inline [react:...] marker', () => {
  it('pulls the reaction and leaves the words clean', () => {
    const { reaction, text } = extractReaction('[react:like]that\'s one. what\'s next?');
    expect(reaction).toBe('like');
    expect(text).toBe("that's one. what's next?");
  });

  it('accepts each of the six iMessage tapbacks', () => {
    for (const r of ['love', 'like', 'dislike', 'laugh', 'emphasize', 'question']) {
      expect(extractReaction(`[react:${r}] yo`).reaction).toBe(r);
    }
  });

  it('is case- and whitespace-tolerant (model formatting drift)', () => {
    expect(extractReaction('[React: LAUGH] nah that pic is old').reaction).toBe('laugh');
    expect(extractReaction('[ react:love ]proud of you').reaction).toBe('love');
  });

  // A marker that reaches the phone renders as literal junk, so an invented or
  // misspelled reaction must still be removed — it just doesn't send anything.
  it('strips an invalid reaction without sending one', () => {
    const { reaction, text } = extractReaction('[react:fire] lets go');
    expect(reaction).toBeNull();
    expect(text).toBe('lets go');
  });

  it('never leaks a marker into the text, wherever it sits', () => {
    const { text } = extractReaction('nice work [react:like] keep going');
    expect(text).not.toMatch(/\[react/i);
    expect(text).toBe('nice work keep going');
  });

  // One tapback per reply: the first valid marker wins so the model can't spray
  // reactions across a burst.
  it('takes only the first valid reaction and strips the rest', () => {
    const { reaction, text } = extractReaction('[react:laugh]nah[pause][react:love]but real talk');
    expect(reaction).toBe('laugh');
    expect(text).toBe('nah[pause]but real talk');
  });

  it('preserves [pause] burst markers', () => {
    const { text } = extractReaction('[react:like]locked in[pause]what time you hitting it?');
    expect(text).toBe('locked in[pause]what time you hitting it?');
  });

  it('handles a marker on its own line without leaving a blank first bubble', () => {
    const { reaction, text } = extractReaction('[react:emphasize]\nproof or it didn\'t happen');
    expect(reaction).toBe('emphasize');
    expect(text).toBe("proof or it didn't happen");
  });

  it('returns a reaction even when the model sent no words with it', () => {
    const { reaction, text } = extractReaction('[react:like]');
    expect(reaction).toBe('like');
    expect(text).toBe('');
  });

  it('leaves an ordinary reply untouched', () => {
    const { reaction, text } = extractReaction('what time you hitting the gym?');
    expect(reaction).toBeNull();
    expect(text).toBe('what time you hitting the gym?');
  });

  it('handles null/empty input', () => {
    expect(extractReaction(null)).toEqual({ reaction: null, text: '' });
    expect(extractReaction('')).toEqual({ reaction: null, text: '' });
  });
});
