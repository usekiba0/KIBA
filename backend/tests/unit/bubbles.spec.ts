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
describe('splitBubbles — a marker-less reply is ONE text', () => {
  // Reversed 2026-08-18. A blank line used to become a second bubble, on the
  // grounds that haiku only used one where a person would send a second text. Two
  // separate failures ended that:
  //
  //  1. Two bubbles are two sends ~450-540ms apart, and SendBlue does not preserve
  //     order at that spacing. Server log vs a device screenshot of the same
  //     moment: we sent "hey. i'm KIBA." then the follow-up 537ms later, and the
  //     phone showed them REVERSED. Reversed, each half reads as its own answer.
  //  2. By 08-18 the blank line was on nearly EVERY reply — KIBA's house style is
  //     a short ack, blank line, then the question. That is one turn of speech, so
  //     "split on a beat" had quietly become "split always" for the second time.
  //
  // The beat survives as a single newline inside one bubble.
  it('keeps an ack-then-question reply as one text, beat preserved as a newline', () => {
    expect(splitBubbles("40. born in '84.\n\nwhy, what's the connection?")).toEqual([
      "40. born in '84.\nwhy, what's the connection?",
    ]);
  });

  it('merges a 3-paragraph reply into one text, keeping all of it in order', () => {
    const reply = 'chicken + rice + beans, ~45g protein.\n\nskip the queso if cutting.\n\nbuilding or leaning out?';
    expect(splitBubbles(reply)).toEqual([
      'chicken + rice + beans, ~45g protein.\nskip the queso if cutting.\nbuilding or leaning out?',
    ]);
  });

  it('never sends more than one bubble however many paragraphs the model wrote', () => {
    expect(splitBubbles('one\n\ntwo\n\nthree\n\nfour\n\nfive')).toHaveLength(1);
  });

  it('keeps a short two-beat reply as one text too', () => {
    expect(splitBubbles('yo\n\nyou good?')).toEqual(['yo\nyou good?']);
  });

  // THE ordering regression this change exists to kill — the exact pair from
  // Karibi's 2026-08-18 screenshot, which the phone displayed upside down.
  it('sends the reversed-on-device intake greeting as a single message', () => {
    const reply =
      "hey. i'm KIBA.\n\ni live in your texts. i check in daily, call out your excuses, and i don't let people stay in the same spot they've been in for months. what's your name tho?";
    const out = splitBubbles(reply);
    expect(out).toHaveLength(1);
    expect(out[0].indexOf("hey. i'm KIBA.")).toBeLessThan(out[0].indexOf('i live in your texts'));
  });

  // Still deduped, but now BEFORE the join — otherwise the repeat would ship as one
  // message saying the same thing twice instead of two bubbles we could drop.
  it('drops a paragraph the model emitted twice instead of merging both copies', () => {
    expect(splitBubbles('locked in.\n\nlocked in.')).toEqual(['locked in.']);
  });

  it('still allows 4 bubbles when the MODEL asked for them via [pause]', () => {
    const out = splitBubbles('one [pause] two [pause] three [pause] four [pause] five [pause] six');
    expect(out).toHaveLength(4);
    expect(out[3]).toBe('four five six');
  });

  it('keeps a checkout link whole even when it sits in its own paragraph', () => {
    const reply = "here you go, pay this and we're live.\n\nhttps://checkout.stripe.com/c/pay/abc123";
    expect(splitBubbles(reply)).toHaveLength(1);
  });

  // Reversed 2026-07-31. This used to split at the first sentence, and because
  // almost nothing KIBA says is under 80 chars it fired on nearly every reply —
  // "2 bubbles when there are 2 beats" was really "2 bubbles always". The client
  // reported the result as bubbles that "feel like two different AI responses to
  // the same prompt". One paragraph is one thought; only the model's own blank
  // line marks a beat now.
  it('keeps a one-paragraph reply as one text, however long', () => {
    const reply =
      "damn that's rough, sorry to hear it. you still got the workout in tho, or we pushing it to tomorrow?";
    expect(splitBubbles(reply)).toEqual([reply]);
  });

  it('keeps the same reply as one text even when the model breaks the paragraph', () => {
    const reply =
      "damn that's rough, sorry to hear it.\n\nyou still got the workout in tho, or we pushing it to tomorrow?";
    expect(splitBubbles(reply)).toEqual([
      "damn that's rough, sorry to hear it.\nyou still got the workout in tho, or we pushing it to tomorrow?",
    ]);
  });

  it('still splits when the model asks explicitly with [pause]', () => {
    const reply = "damn that's rough, sorry to hear it. [pause] you still got the workout in tho?";
    expect(splitBubbles(reply)).toEqual([
      "damn that's rough, sorry to hear it.",
      'you still got the workout in tho?',
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

  it('does not split a many-sentence paragraph — sentences are not beats', () => {
    const reply =
      'first thought here for you. second thought here for you. third thought here for you. fourth one too.';
    expect(splitBubbles(reply)).toHaveLength(1);
  });

  // The reply that started this (message row 7e1f8905). Two beats that read as one
  // continued thought: the acknowledgement, then what to do about it. Splitting it
  // was never the problem — delivering it backwards was, which is what made it look
  // like two competing answers. As one message it cannot arrive out of order, and
  // the beat is still visible as a line break.
  it('delivers the two beats in one message, in the order the model wrote them', () => {
    const reply =
      "lol fair - your parents handle it.\n\nshow them the link, they tap it, and you're good.";
    expect(splitBubbles(reply)).toEqual([
      "lol fair - your parents handle it.\nshow them the link, they tap it, and you're good.",
    ]);
  });

  it('lets an explicit [pause] override the automatic rule', () => {
    expect(splitBubbles('short. [pause] also short.')).toEqual(['short.', 'also short.']);
  });

  // Karibi 2026-07-08. This used to be caught for free — the sentence split cut the
  // repeat into two identical bubbles and dedupeBubbles dropped one. With no
  // automatic split there is nothing to dedupe, so collapseSelfRepeat has to find it
  // in the text or it ships as one message saying the same thing twice.
  it('collapses a self-repeated reply with no marker of any kind', () => {
    const reply =
      'you already know exactly what you need to do here. you already know exactly what you need to do here.';
    expect(splitBubbles(reply)).toEqual(['you already know exactly what you need to do here.']);
  });

  it('collapses a multi-sentence block the model emitted twice', () => {
    const reply = 'that gap is real. we close it this week. that gap is real. we close it this week.';
    expect(splitBubbles(reply)).toEqual(['that gap is real. we close it this week.']);
  });

  it('leaves a reply whose halves merely rhyme structurally alone', () => {
    const reply = 'you good? we moving today.';
    expect(splitBubbles(reply)).toEqual([reply]);
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
