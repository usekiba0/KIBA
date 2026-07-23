import {
  validateRecurringMessage,
  reminderSignature,
  isSchedulingTask,
  sameIntentOneShot,
} from '../../src/accountability/reminder-content';

/**
 * All three of these guards exist because of one production account
 * (Karibi 2026-07-21). The literal strings from that account are used as the
 * test cases wherever possible — a regression here is a regression to a bug a
 * real user reported, not a hypothetical.
 */
describe('validateRecurringMessage', () => {
  const VERSE_QUOTED =
    '"Therefore do not worry about tomorrow, for tomorrow will worry about itself. ' +
    'Each day has enough trouble of its own." Matthew 6:34 (NIV)';
  const VERSE_UNQUOTED = VERSE_QUOTED.replace(/"/g, '');

  it('rejects a scripture quotation in both the quoted and unquoted form', () => {
    // These two were live daily chains firing the same verse every morning,
    // and differed ONLY by the quote marks.
    for (const msg of [VERSE_QUOTED, VERSE_UNQUOTED]) {
      const v = validateRecurringMessage(msg);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error).toMatch(/scripture/i);
    }
  });

  it.each(['1 Corinthians 15:58', 'Ps 23:1 is the one', 'read Philippians 4:13 today'])(
    'catches the citation shape in %j',
    (msg) => {
      expect(validateRecurringMessage(msg).ok).toBe(false);
    },
  );

  it('rejects a training-day name — it would be wrong 6 days out of 7', () => {
    const v = validateRecurringMessage(
      "yo. leg day starts now. you got your reasons written down? let's go.",
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/training day/i);
  });

  it.each(['push day', 'pull day', 'upper day', 'rest day', 'cardio day'])(
    'rejects %j',
    (phrase) => {
      expect(validateRecurringMessage(`time for ${phrase}`).ok).toBe(false);
    },
  );

  it('rejects a weekday name', () => {
    const v = validateRecurringMessage('gym time. remember Thursday is PT.');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/weekday/i);
  });

  it.each([
    'time to read your bible. send proof when you are done.',
    'gym time. what are you hitting today?',
    'morning. weigh in and send it.',
    'drink water and take your creatine.',
  ])('allows the day-agnostic phrasing %j', (msg) => {
    expect(validateRecurringMessage(msg).ok).toBe(true);
  });

  it('does not mistake a plain clock time for a scripture citation', () => {
    // "8:30" must not look like "chapter:verse" — this would block almost every
    // legitimate reminder if the pattern were loose.
    expect(validateRecurringMessage('gym at 8:30. no excuses.').ok).toBe(true);
  });
});

describe('reminderSignature', () => {
  it('gives the three re-worded pre-push pings one signature', () => {
    // All three of these were pending at the same minute on one account.
    const variants = [
      '30 min till push. lock in. you got this.',
      '30 min til push. you locked in?',
      '30 min till push day. get your gym bag ready and move out. no excuses today.',
    ];
    const sigs = variants.map(reminderSignature);
    expect(sigs.every((s) => s === 'pre:push')).toBe(true);
  });

  it('gives the proof checks one signature', () => {
    expect(reminderSignature('push time was 15 min ago. proof?')).toBe('proof:push');
    expect(reminderSignature('gym time was 15 min ago. breakfast + workout proof. send it.')).toBe(
      'proof:gym',
    );
  });

  it('keeps pre and proof for the same activity DISTINCT', () => {
    // They are two different reminders 45 minutes apart. Collapsing them would
    // delete the proof check every time a ping was rescheduled.
    expect(reminderSignature('30 min till gym. you ready to move?')).not.toBe(
      reminderSignature('gym time was 15 min ago. proof?'),
    );
  });

  it('treats leg and legs as the same session', () => {
    expect(reminderSignature('30 min till legs. ready?')).toBe(
      reminderSignature('30 min till leg. ready?'),
    );
  });

  it('returns null for anything it does not recognize', () => {
    // The safety property: an unrecognized reminder is NEVER superseded, so a
    // reminder the user actually wanted can't silently vanish.
    for (const msg of ['time to read your bible.', 'drink water', 'call your mom back', '']) {
      expect(reminderSignature(msg)).toBeNull();
    }
  });

  it('does not match a different activity', () => {
    expect(reminderSignature('30 min till push. go.')).not.toBe(
      reminderSignature('30 min till pull. go.'),
    );
  });
});

describe('isSchedulingTask', () => {
  it.each([
    'Pick your PPL days and times',
    'pick your PPL split days and times for the next 2 weeks',
    'set your workout schedule',
    'lock in your gym days',
    'figure out your training days',
  ])('flags %j as a decide-the-schedule item', (task) => {
    expect(isSchedulingTask(task)).toBe(true);
  });

  it.each([
    'pick up groceries',
    'choose a leg day exercise you actually like',
    'gym at 8am, send proof',
    'tell one person about your commitment',
    'make leg day non-negotiable',
  ])('leaves the real task %j alone', (task) => {
    // Needs BOTH a decide-verb and a schedule-noun, so "pick up groceries" and
    // "choose a leg day exercise" can't be swallowed.
    expect(isSchedulingTask(task)).toBe(false);
  });

  it('handles null and empty without throwing', () => {
    expect(isSchedulingTask(null)).toBe(false);
    expect(isSchedulingTask(undefined)).toBe(false);
    expect(isSchedulingTask('   ')).toBe(false);
  });
});

// Karibi 2026-07-23: a typo re-confirm ("Tmr* yes") made the model schedule the
// tailor pickup twice for the same minute, worded differently. The pre/proof
// signature can't catch free-form one-shots, so this overlap check decides
// whether two same-minute one-shots are the same intent. The literal prod
// strings are the fixture.
describe('sameIntentOneShot', () => {
  const tailorA = 'tailor pickup time. go grab those clothes and send me proof when you got em.';
  const tailorB =
    'yo. tailor time. go pick up those clothes and send proof when you got em. pic of the clothes or receipt, something that shows you went.';

  it('matches the real tailor duplicate pair', () => {
    expect(sameIntentOneShot(tailorA, tailorB)).toBe(true);
  });

  it('matches identical wording', () => {
    expect(sameIntentOneShot(tailorA, tailorA)).toBe(true);
  });

  it('does not merge distinct intents that share a time slot', () => {
    expect(
      sameIntentOneShot(
        'evening meds. take them and confirm.',
        'call your mom about the dinner plans.',
      ),
    ).toBe(false);
  });

  it('does not merge two different errands with generic filler in common', () => {
    expect(
      sameIntentOneShot(
        'time to send that invoice. get it done and confirm.',
        'time to book the dentist. get it done and confirm.',
      ),
    ).toBe(false);
  });

  it('is safe on empty/null-ish input', () => {
    expect(sameIntentOneShot('', tailorA)).toBe(false);
    expect(sameIntentOneShot('   ', '   ')).toBe(false);
  });
});
