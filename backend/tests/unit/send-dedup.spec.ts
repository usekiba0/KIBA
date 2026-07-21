import { dedupKey, normalizeBody } from '../../src/messaging/send-dedup';

/**
 * The duplicate-send guard's key. It was a raw exact match and it failed in
 * production on one quotation mark (Karibi 2026-07-21) — two daily chains
 * carrying the same verse, one quoted and one not, both delivered.
 */
describe('dedupKey', () => {
  const VERSE =
    'Therefore do not worry about tomorrow, for tomorrow will worry about itself. Matthew 6:34 (NIV)';

  it('collapses the quoted and unquoted verse to ONE key', () => {
    expect(dedupKey('+18325604035', `"${VERSE}"`)).toBe(dedupKey('+18325604035', VERSE));
  });

  it('collapses trivial punctuation, case and spacing differences', () => {
    const a = dedupKey('+18325604035', 'gym time was 15 min ago. proof?');
    expect(dedupKey('+18325604035', 'Gym time was 15 min ago — proof!')).toBe(a);
    expect(dedupKey('+18325604035', 'gym  time was 15 min ago, proof')).toBe(a);
  });

  it('treats the same person written two ways as one recipient', () => {
    // Different generators pass +1832… and 1832…; an unnormalized key let the
    // same message through twice.
    expect(dedupKey('+18325604035', VERSE)).toBe(dedupKey('18325604035', VERSE));
  });

  it('still separates genuinely different messages', () => {
    expect(dedupKey('+18325604035', '30 min till push. ready?'))
      .not.toBe(dedupKey('+18325604035', '30 min till pull. ready?'));
  });

  it('still separates different recipients', () => {
    expect(dedupKey('+18325604035', VERSE)).not.toBe(dedupKey('+12816903334', VERSE));
  });
});

describe('normalizeBody', () => {
  it('keeps letters, numbers and single spaces only', () => {
    expect(normalizeBody('  "Hello,   World!"  ')).toBe('hello world');
  });

  it('survives emoji and empty input without throwing', () => {
    expect(normalizeBody('locked in 🔒')).toBe('locked in');
    expect(normalizeBody('')).toBe('');
    expect(normalizeBody(undefined as unknown as string)).toBe('');
  });
});
