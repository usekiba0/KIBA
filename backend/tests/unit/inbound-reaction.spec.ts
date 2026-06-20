import { isInboundReaction } from '../../src/messaging/inbound-reaction';

describe('isInboundReaction (iMessage tapback detection)', () => {
  it.each([
    'Liked "let\'s do this"',
    'Loved "you got this"',
    'Disliked "send me a photo"',
    'Laughed at "name the workout"',
    'Emphasized "go do it now"',
    'Questioned "did you finish"',
  ])('detects the tapback: %s', (text) => {
    expect(isInboundReaction(text)).toBe(true);
  });

  it('detects curly-quote tapbacks (real iOS rendering)', () => {
    expect(isInboundReaction('Liked “let’s do this”')).toBe(true);
  });

  it('detects the "Removed a ... from" undo form', () => {
    expect(isInboundReaction('Removed a heart from "let\'s do this"')).toBe(true);
    expect(isInboundReaction('Removed an exclamation from "go now"')).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isInboundReaction('  Loved "ok"  ')).toBe(true);
  });

  it.each([
    'Loved it!',
    'i liked that workout',
    'Liked the gym today',
    'can you make me a plan',
    'Done',
    '"just a quoted message"',
  ])('does NOT flag a real message: %s', (text) => {
    expect(isInboundReaction(text)).toBe(false);
  });

  it('handles null / empty input', () => {
    expect(isInboundReaction(null)).toBe(false);
    expect(isInboundReaction(undefined)).toBe(false);
    expect(isInboundReaction('')).toBe(false);
    expect(isInboundReaction('   ')).toBe(false);
  });
});
