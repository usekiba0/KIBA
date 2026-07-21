import {
  claimsReminderScheduled,
  stripFalseReminderClaims,
} from '../../src/ai/reminder-claim-guard';

/**
 * The guard against KIBA promising a reminder it never created.
 *
 * Both failure directions matter, and they are NOT symmetric:
 *
 * - A MISSED false promise is the product's worst bug: the user believes the
 *   system is holding something, stops holding it themselves, and gets nothing.
 * - An OVER-EAGER strip deletes a TRUE statement, which is its own lie and also
 *   mangles a reply that was fine.
 *
 * The call site only runs this when the turn created no reminder and read none
 * back, so these tests cover the text layer: what counts as a claim at all.
 */
describe('claimsReminderScheduled', () => {
  it.each([
    // Verbatim from the production transcript.
    'locked. every day at 8am. Bible reminder.',
    'got it. 8am daily Bible reminder with proof demanded.',
    'locked. 9am every morning starting tomorrow. fires in 12h 51m.',
    'just set your pre-push ping at 6:30 and proof check at 7:15.',
    "i'll hit you at 5:30pm to lock you in before you leave.",
    "i'll ping you at 2 to make sure you're locked in",
    'your reminder is set',
    "reminder's locked in",
  ])('flags %j', (text) => {
    expect(claimsReminderScheduled(text)).toBe(true);
  });

  it.each([
    // Relationship talk, not a scheduling claim. Rewriting these would gut the
    // voice for no correctness gain.
    "i'm on you about this one",
    "i'll be checking in on you",
    'you should set a reminder for yourself',
    'what time do you want it?',
    'aight. gym at 6. go.',
    "tomorrow morning we start for real.",
  ])('leaves %j alone', (text) => {
    expect(claimsReminderScheduled(text)).toBe(false);
  });
});

describe('stripFalseReminderClaims', () => {
  it('passes a reply with no claim through untouched', () => {
    const text = 'aight. eat that food and get to the gym.';
    const res = stripFalseReminderClaims(text);
    expect(res.corrected).toBe(false);
    expect(res.text).toBe(text);
  });

  it('drops only the offending sentence and keeps the rest', () => {
    const res = stripFalseReminderClaims(
      "that's the energy. just set your pre-push ping at 6:30. now go handle it.",
    );
    expect(res.corrected).toBe(true);
    expect(res.text).toContain("that's the energy");
    expect(res.text).toContain('now go handle it');
    expect(res.text).not.toMatch(/6:30/);
  });

  it('replaces the whole reply when the claim IS the whole reply', () => {
    // "locked. every day at 8am. Bible reminder." — every sentence is part of
    // the false claim, so there is nothing honest left to keep.
    const res = stripFalseReminderClaims('locked. every day at 8am. Bible reminder.');
    expect(res.corrected).toBe(true);
    expect(res.text).toMatch(/what time/i);
    expect(res.text).not.toMatch(/8am/);
  });

  it('always ends by asking for the time, since asking is the only honest move', () => {
    // We know the claim is false; we do NOT know the true replacement, because
    // nothing was scheduled and no time is available to schedule it with.
    const res = stripFalseReminderClaims('got it. 8am daily Bible reminder with proof demanded.');
    expect(res.text).toMatch(/i'll set it/i);
  });

  it('reports what it dropped so the log shows the model misbehaving', () => {
    const res = stripFalseReminderClaims("solid. i'll hit you at 5:30 to lock it in.");
    expect(res.dropped.length).toBeGreaterThan(0);
    expect(res.dropped.join(' ')).toMatch(/5:30/);
  });

  it('never leaves a dangling half sentence', () => {
    const res = stripFalseReminderClaims(
      "locked. 9am every morning starting tomorrow. fires in 12h 51m. now get some sleep.",
    );
    expect(res.text).toContain('now get some sleep');
    expect(res.text).not.toMatch(/fires in/);
    expect(res.text).not.toMatch(/9am/);
  });
});
