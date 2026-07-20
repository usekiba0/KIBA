import {
  detectKeyword,
  normalizeKeyword,
  OPT_OUT_CONFIRMATION,
  OPT_IN_CONFIRMATION,
} from '../../src/messaging/opt-out';

/**
 * Opt-out keyword detection — 2026-07-21.
 *
 * Two failure directions, both bad, neither symmetric:
 *
 * - MISSING an opt-out means we keep texting someone who revoked consent. Legal
 *   exposure, and the thing this whole feature exists to prevent.
 * - FALSE-POSITIVE means we silently unsubscribe someone mid-conversation. They
 *   never find out why KIBA went quiet, so it can run for weeks undetected.
 *
 * The false-positive cases are therefore the ones with the most tests here.
 */
describe('compliance keyword detection', () => {
  describe('opt-out', () => {
    it.each([
      'STOP',
      'stop',
      'Stop',
      'STOP.',
      'stop!',
      '  stop  ',
      'STOPALL',
      'stop all',
      'UNSUBSCRIBE',
      'unsubscribe.',
      'cancel',
      'END',
      'quit',
      'optout',
      'opt out',
    ])('treats %j as an opt-out', (msg) => {
      expect(detectKeyword(msg)).toBe('opt_out');
    });
  });

  describe('does NOT opt out ordinary conversation', () => {
    it.each([
      // The single most dangerous false positive: a real coaching request that
      // happens to start with an opt-out word.
      ['cancel my 8pm reminder', 'cancel + object'],
      ['can you cancel that', 'cancel mid-sentence'],
      ['stop asking me that', 'stop + object'],
      ['i want to stop eating so late', 'stop inside a goal'],
      ['stop, i mean it', 'inner punctuation is a sentence, not a keyword'],
      ['end of the week im done', 'end mid-sentence'],
      ['quit my job today', 'quit + object'],
      ['im gonna quit smoking', 'quit inside a goal'],
      ['no', 'unrelated short reply'],
      ['done', 'unrelated short reply'],
      ['stopped', 'inflected form is not the keyword'],
      ['stopping', 'inflected form is not the keyword'],
      ['cancelled', 'inflected form is not the keyword'],
    ])('leaves %j alone (%s)', (msg) => {
      expect(detectKeyword(msg)).toBeNull();
    });
  });

  describe('opt-in', () => {
    it.each(['START', 'start', 'unstop', 'YES', 'resume', 'opt in'])(
      'treats %j as a resume keyword',
      (msg) => {
        expect(detectKeyword(msg)).toBe('opt_in');
      },
    );

    it('classifies a bare "yes" as opt_in at this layer', () => {
      // Detection is context-free on purpose. The processor is what decides a
      // resume only counts when the user is actually opted out — otherwise every
      // "yes" in normal coaching would be hijacked. Pinned here so nobody
      // "fixes" this by removing yes from the keyword set and quietly breaks
      // carrier compliance.
      expect(detectKeyword('yes')).toBe('opt_in');
      expect(detectKeyword('yes please')).toBeNull();
    });
  });

  describe('help', () => {
    it.each(['HELP', 'help', 'info'])('treats %j as help', (msg) => {
      expect(detectKeyword(msg)).toBe('help');
    });

    it('does not treat a plea for help as a keyword', () => {
      // Crisis detection has to see these.
      expect(detectKeyword('i need help')).toBeNull();
      expect(detectKeyword('help me')).toBeNull();
      expect(detectKeyword('please help im struggling')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for empty and whitespace input without throwing', () => {
      expect(detectKeyword('')).toBeNull();
      expect(detectKeyword('   ')).toBeNull();
      expect(detectKeyword(undefined as unknown as string)).toBeNull();
      expect(detectKeyword(null as unknown as string)).toBeNull();
    });

    it('ignores anything longer than the longest keyword', () => {
      expect(detectKeyword('stop'.repeat(10))).toBeNull();
    });

    it('strips surrounding punctuation and emoji but not inner characters', () => {
      expect(normalizeKeyword('  STOP!!  ')).toBe('stop');
      expect(normalizeKeyword('"stop"')).toBe('stop');
      expect(normalizeKeyword('stop 🛑')).toBe('stop');
      expect(normalizeKeyword('stop it')).toBe('stop it');
    });

    it('collapses inner whitespace so "stop  all" still matches', () => {
      expect(detectKeyword('stop  all')).toBe('opt_out');
    });
  });

  describe('confirmation copy', () => {
    it('tells an unsubscribed user how to come back', () => {
      // Without this the opt-out is a one-way door and the only route back is
      // support. START is the carrier-standard resume word.
      expect(OPT_OUT_CONFIRMATION).toMatch(/START/);
    });

    it('tells a resumed user how to leave again', () => {
      expect(OPT_IN_CONFIRMATION).toMatch(/STOP/);
    });

    it('keeps both confirmations inside a single SMS segment', () => {
      // These go out over Twilio when iMessage is unavailable; a compliance
      // confirmation that splits into two billed parts looks broken.
      expect(OPT_OUT_CONFIRMATION.length).toBeLessThanOrEqual(160);
      expect(OPT_IN_CONFIRMATION.length).toBeLessThanOrEqual(160);
    });
  });
});
