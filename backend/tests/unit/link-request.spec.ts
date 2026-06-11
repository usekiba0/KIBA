import { LINK_REQUEST_RE } from '../../src/messaging/coaching.processor';

describe('LINK_REQUEST_RE — explicit "send me the link" detection', () => {
  it.each([
    'send the link',
    'send me the link',
    'Send me the link again',
    "Let's do it bro send the link",
    'Then send me the link let’s Lock In',
    'send it',
    'send link',
    "I don't have the link",
    'where is the link',
    "where's the link",
    'link again',
    'resend the link please',
  ])('matches an explicit link request: "%s"', (msg) => {
    expect(LINK_REQUEST_RE.test(msg)).toBe(true);
  });

  it.each([
    'yes cussing',
    'Yes it’s cool bro',
    'Houston',
    'lose weight',
    'are you gonna actually take me to the next level',
    'i think a blink happened', // "link" inside another word must not trip it
  ])('does NOT match a normal message: "%s"', (msg) => {
    expect(LINK_REQUEST_RE.test(msg)).toBe(false);
  });
});
