import { splitBubbles, dedupeBubbles } from '../../src/messaging/bubbles';

describe('splitBubbles', () => {
  it('returns a single bubble when there is no [pause] marker', () => {
    expect(splitBubbles('just one thought')).toEqual(['just one thought']);
  });

  it('splits on [pause] and trims each bubble', () => {
    expect(splitBubbles('first. [pause] second. [pause] third.')).toEqual([
      'first.', 'second.', 'third.',
    ]);
  });

  it('is case-insensitive and tolerant of surrounding whitespace', () => {
    expect(splitBubbles('a\n[PAUSE]\nb')).toEqual(['a', 'b']);
  });

  it('drops empty segments from stray/leading/trailing markers', () => {
    expect(splitBubbles('[pause] hey [pause][pause] there [pause]')).toEqual(['hey', 'there']);
  });

  it('returns [] for empty or whitespace-only input', () => {
    expect(splitBubbles('')).toEqual([]);
    expect(splitBubbles('   ')).toEqual([]);
  });

  it('caps at 4 bubbles, folding overflow into the last', () => {
    const out = splitBubbles('1 [pause] 2 [pause] 3 [pause] 4 [pause] 5 [pause] 6');
    expect(out).toHaveLength(4);
    expect(out[3]).toBe('4 5 6');
  });

  it('collapses a self-repeated reply into one bubble (Karibi 2026-07-08 dup)', () => {
    const repeated = "i don't see a photo bro. send it. [pause] i don't see a photo bro. send it.";
    expect(splitBubbles(repeated)).toEqual(["i don't see a photo bro. send it."]);
  });
});

describe('dedupeBubbles', () => {
  it('drops exact and case/whitespace-variant duplicates, keeping first order', () => {
    expect(dedupeBubbles(['A B', 'a  b', 'C', 'A B'])).toEqual(['A B', 'C']);
  });
  it('leaves genuinely distinct bubbles alone', () => {
    expect(dedupeBubbles(['first', 'second', 'third'])).toEqual(['first', 'second', 'third']);
  });
});
