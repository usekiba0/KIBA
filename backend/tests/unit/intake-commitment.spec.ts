import { isIntakeCommitment } from '../../src/messaging/coaching.processor';

// The intake checkout link now only force-sends after a real YES to the close
// (Karibi 2026-06-25: it fired mid-diagnostic at "5k a month LMAO"). This guards
// what counts as that yes.
describe('isIntakeCommitment', () => {
  it('matches strong commitment phrases', () => {
    for (const t of [
      "i'm in", 'im in', "let's do it", 'lets do it', 'lock me in', "i'm serious",
      'im down', 'count me in', 'sign me up', "let's go", 'locked in',
    ]) {
      expect(isIntakeCommitment(t)).toBe(true);
    }
  });

  it('matches a bare affirmative that is the WHOLE message', () => {
    for (const t of ['yeah', 'yes', 'yep', 'bet', 'aight', 'ok', 'okay', 'sure', 'do it', 'for sure', 'YEAH!', 'word']) {
      expect(isIntakeCommitment(t)).toBe(true);
    }
  });

  it('does NOT match a revenue number, a partial yes, or casual chatter', () => {
    for (const t of [
      'Bro, 5K a month LMAO ???',
      '100k a month',
      'yeah but my retention is solid',
      'around 50k a month',
      'mainly not getting new subs',
      'yeah that makes sense but how does this help',
    ]) {
      expect(isIntakeCommitment(t)).toBe(false);
    }
  });
});
