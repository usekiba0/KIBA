import { mentionsPrice, userAskedAboutPrice, stripPriceAtCheckout } from '../../src/ai/price-guard';

describe('mentionsPrice', () => {
  it('catches the production sentence', () => {
    // 2026-07-30T21:07:40Z, to a self-declared 9-year-old, right at the link.
    expect(
      mentionsPrice(
        "tell them it's $9.99 a month and i'm checking in on you every morning at 9am.",
      ),
    ).toBe(true);
  });

  it.each([
    "it's $9.99 a month",
    'it’s $20/mo after',
    '20 dollars a month',
    '9.99 bucks',
    '20 usd',
    '9.99 a month after the trial',
    '10 per week',
    "it's a free trial",
    'you can cancel anytime',
    'cancel any time',
  ])('flags %j', (text) => {
    expect(mentionsPrice(text)).toBe(true);
  });

  describe('does not flag the ordinary close, which is full of bare numbers', () => {
    // A false positive here silently deletes real close copy.
    it.each([
      'three days you run the progression',
      '5 days a week to the gym - that’s locked',
      "every morning at 9am i'm on you",
      'tap this and we’re locked in:',
      "come back with 'done' the second you're in",
      '25 minutes. every day. that’s it.',
      'you’re 9, 5\'6", already in AAU',
      '3 days.',
      '',
    ])('%j', (text) => {
      expect(mentionsPrice(text)).toBe(false);
    });
  });
});

describe('userAskedAboutPrice', () => {
  // Answering a direct price question is MANDATORY per intake.prompt.ts — this
  // detector is what keeps the guard from making KIBA evasive.
  it.each([
    'how much is it',
    'how much?',
    "what's the price",
    'whats the cost bro',
    'is it free',
    'do i pay for this',
    'how much do you charge',
    'is this expensive',
    'i can’t afford much',
    'what about billing',
    'is there a subscription',
    'is it $20',
  ])('treats %j as a price question', (text) => {
    expect(userAskedAboutPrice(text)).toBe(true);
  });

  it.each(['bet', 'I definitely have a gym', 'ok remind me at 830', 'Both and 830pm'])(
    'does not treat %j as a price question',
    (text) => {
      expect(userAskedAboutPrice(text)).toBe(false);
    },
  );
});

describe('stripPriceAtCheckout', () => {
  const CLOSE =
    'bet. tap this and we start tonight: ' +
    "tell them it's $9.99 a month and i'm checking in on you every morning at 9am. " +
    'three days you run the progression.';

  it('passes a clean close through untouched', () => {
    const text = "bet. tap this and we're locked in: three days you run the progression.";
    const res = stripPriceAtCheckout(text);
    expect(res.corrected).toBe(false);
    expect(res.text).toBe(text);
  });

  it('drops only the sentence carrying the price', () => {
    const res = stripPriceAtCheckout(CLOSE);
    expect(res.corrected).toBe(true);
    expect(res.text).not.toMatch(/9\.99/);
    expect(res.text).toContain('tap this and we start tonight');
    expect(res.text).toContain('three days you run the progression');
  });

  it('reports what it dropped so the log shows it', () => {
    const res = stripPriceAtCheckout(CLOSE);
    expect(res.dropped.join(' ')).toMatch(/9\.99/);
  });

  it('keeps the call to action, which ends in a colon not a period', () => {
    // Regression: with only .!? as boundaries, "tap this and we start tonight:"
    // and the price clause after it were ONE sentence, so stripping the price
    // deleted the tap-line too and the close lost its instruction.
    const res = stripPriceAtCheckout(CLOSE);
    expect(res.text).toContain('tap this and we start tonight');
  });

  it('does not split a clock time on its colon', () => {
    const res = stripPriceAtCheckout("i'm on you at 8:30 every day. it's $9.99 a month.");
    expect(res.text).toContain('8:30');
    expect(res.text).not.toMatch(/9\.99/);
  });

  it('never ships an empty message when the price was the whole reply', () => {
    const res = stripPriceAtCheckout("it's $9.99 a month. cancel anytime.");
    expect(res.corrected).toBe(true);
    expect(res.text.length).toBeGreaterThan(0);
    expect(res.text).not.toMatch(/9\.99/);
    expect(res.text).not.toMatch(/cancel/i);
  });

  it('strips the banned framings even with no number attached', () => {
    const res = stripPriceAtCheckout(
      "bet, tap this and we're locked in. it's a free trial so no risk.",
    );
    expect(res.text).not.toMatch(/free trial/i);
    expect(res.text).toContain("tap this and we're locked in");
  });
});
