import { statesTemporaryReturn } from '../../src/accountability/ghost-context';

describe('statesTemporaryReturn (Rule 13 ghost context-suppression)', () => {
  it('matches clear "back later / away now" signals', () => {
    const away = [
      "alr i'll lock in after the game bro watching Colombia rn",
      'going to sleep, catch you tomorrow',
      'gn',
      'goodnight',
      'brb',
      'ttyl',
      'at the gym rn',
      'in a meeting, talk later',
      'driving, hit you back later',
      'finna sleep',
      "i'll get to it after work",
      'busy rn',
      'watching the game',
      "lock in after the whistle",
      "once i'm done i'll text you",
    ];
    for (const m of away) {
      expect(statesTemporaryReturn(m)).toBe(true);
    }
  });

  it('does NOT match normal replies or plain silence', () => {
    const normal = [
      'yeah that plan works for me',
      'morning',
      'i need to sign the lease today', // "gn" inside "sign" must not match \bgn\b
      'i went to the gym earlier and it was great', // past-tense, not "away now"
      "let's get it",
      'idk maybe',
      '',
      null,
      undefined,
    ];
    for (const m of normal) {
      expect(statesTemporaryReturn(m as any)).toBe(false);
    }
  });
});
