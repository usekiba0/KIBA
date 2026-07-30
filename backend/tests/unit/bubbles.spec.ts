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

// Prod 2026-07-30: the [pause] marker fired on 1 of 151 replies — 99.3% of
// replies shipped as a single block while the coaching prompt said "2 bubbles is
// the norm, 3 is the ceiling". A prompt-only rule that haiku-4-5 ignores, same as
// the reply-length carve-out. These lock the code fallback that replaces it.
describe('splitBubbles — deterministic split when the model omits [pause]', () => {
  // Measured 2026-07-30: asked haiku four unrelated questions through the real
  // coaching prompt and it separated its beats with a blank line every time. That
  // is the model's own intent — prefer it over our sentence heuristic.
  it('splits on the blank line the model uses to mark its own beats', () => {
    expect(splitBubbles("40. born in '84.\n\nwhy, what's the connection?")).toEqual([
      "40. born in '84.",
      "why, what's the connection?",
    ]);
  });

  it('honours every beat, not just the first, on a multi-beat reply', () => {
    const reply = 'chicken + rice + beans, ~45g protein.\n\nskip the queso if cutting.\n\nbuilding or leaning out?';
    expect(splitBubbles(reply)).toEqual([
      'chicken + rice + beans, ~45g protein.',
      'skip the queso if cutting.',
      'building or leaning out?',
    ]);
  });

  it('splits a short two-beat reply — a blank line beats the length floor', () => {
    expect(splitBubbles('yo\n\nyou good?')).toEqual(['yo', 'you good?']);
  });

  it('still caps at 4 bubbles when the model writes many paragraphs', () => {
    const out = splitBubbles('one\n\ntwo\n\nthree\n\nfour\n\nfive\n\nsix');
    expect(out).toHaveLength(4);
    expect(out[3]).toBe('four five six');
  });

  it('keeps a checkout link whole even when it sits in its own paragraph', () => {
    const reply = "here you go, pay this and we're live.\n\nhttps://checkout.stripe.com/c/pay/abc123";
    expect(splitBubbles(reply)).toHaveLength(1);
  });

  it('splits a long reply into first beat + the rest', () => {
    const reply =
      "damn that's rough, sorry to hear it. you still got the workout in tho, or we pushing it to tomorrow?";
    expect(splitBubbles(reply)).toEqual([
      "damn that's rough, sorry to hear it.",
      'you still got the workout in tho, or we pushing it to tomorrow?',
    ]);
  });

  it('leaves a short reply as one bubble — one beat is one text', () => {
    expect(splitBubbles('nah you got this. go.')).toEqual(['nah you got this. go.']);
  });

  it('never splits a plan/list away from its intro', () => {
    const reply = "here's the plan. keep it simple and just show up:\n- squats 3x8\n- rdl 3x10\n- walk 20 min after";
    expect(splitBubbles(reply)).toHaveLength(1);
  });

  it('never separates a checkout link from the sentence explaining it', () => {
    const reply =
      "here you go, pay this and we're live. link's good for 24 hours: https://checkout.stripe.com/c/pay/abc123";
    expect(splitBubbles(reply)).toHaveLength(1);
  });

  it('treats trailing off (...) as one beat, not two', () => {
    const reply =
      "i mean... you said the same thing last week and we both know how that went, so what's different";
    expect(splitBubbles(reply)).toHaveLength(1);
  });

  it('does not mistake an abbreviation for a sentence end', () => {
    const reply =
      "gym at 6 a.m. then work, that's the plan you gave me on sunday and i'm holding you to it";
    expect(splitBubbles(reply)).toHaveLength(1);
  });

  it('does not orphan a two-word fragment', () => {
    const reply =
      "yo. i was thinking about what you said yesterday and honestly it's been sitting with me all day";
    expect(splitBubbles(reply)).toHaveLength(1);
  });

  it('caps the automatic split at 2 bubbles even with many sentences', () => {
    const reply =
      'first thought here for you. second thought here for you. third thought here for you. fourth one too.';
    expect(splitBubbles(reply)).toHaveLength(2);
  });

  it('lets an explicit [pause] override the automatic rule', () => {
    expect(splitBubbles('short. [pause] also short.')).toEqual(['short.', 'also short.']);
  });

  it('collapses a self-repeated reply that the split would have duplicated', () => {
    const reply =
      'you already know exactly what you need to do here. you already know exactly what you need to do here.';
    expect(splitBubbles(reply)).toEqual(['you already know exactly what you need to do here.']);
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
