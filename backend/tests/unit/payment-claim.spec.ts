import { PAYMENT_CLAIM_RE } from '../../src/messaging/coaching.processor';

describe('PAYMENT_CLAIM_RE — pre-pay lead falsely claiming they paid', () => {
  it.each([
    'i paid',
    'I already paid bro',
    'just paid',
    'payment went through',
    'my payment cleared',
    'i subscribed',
    'i just purchased',
    'i bought the plan',
    'bought the subscription',
    'card went through',
    'the card charged fine',
    'you charged me already',
    "i'm a member now",
    'im a subscriber',
  ])('matches a payment claim: "%s"', (msg) => {
    expect(PAYMENT_CLAIM_RE.test(msg)).toBe(true);
  });

  it.each([
    // The build-phase micro-commitment "yes" — must NOT be read as a payment claim,
    // or it would hijack the close.
    "i'm in",
    'im in',
    "i'm ready",
    'yes',
    'done',
    'lets do it',
    // ordinary build answers
    'lose weight',
    'Houston',
    'be there for my kid',
    'i want to get paid more at work', // "paid" in an unrelated goal context
  ])('does NOT match a non-claim message: "%s"', (msg) => {
    expect(PAYMENT_CLAIM_RE.test(msg)).toBe(false);
  });
});
