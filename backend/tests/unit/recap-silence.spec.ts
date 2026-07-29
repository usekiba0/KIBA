/**
 * The recap/weekly-review silence (2026-07-29 thread audit).
 *
 * Bianca — 843 messages, texting KIBA daily — got NO night recap between
 * 2026-07-14 and 2026-07-29, and no weekly review after 07-19. The jobs fired:
 * `last_weekly_review_date` was stamped 2026-07-26. Only the copy was missing.
 *
 * Her week 07-20..07-26 in prod:
 *   todos 87 | committed 0 | done 0 | proofs flagged 0
 *
 * All three counters are structurally zero for how she uses the product — she
 * never commits a to-do (9 of 414 all-time) and logs meals as TEXT, so
 * is_proof_submission is never set. The gate `done && missed && proof === 0`
 * therefore trips every single day, forever.
 *
 * These tests pin the rule that an ENGAGED user always gets a recap, and that
 * the copy claims nothing about a ledger we know is empty.
 */
import {
  buildNightRecapMessage,
  buildWeeklyReviewMessage,
} from '../../src/ai/prompts/recap.prompt';

describe('night recap — engaged user with an empty ledger', () => {
  const base = { userName: 'Bianca', done: [], missed: [], proofCount: 0, score: null };

  it('still sends when the user talked to KIBA today', () => {
    const msg = buildNightRecapMessage({ ...base, wasActive: true });
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/nothing made it onto the board/i);
    expect(msg).toContain('Bianca');
  });

  it('claims neither success nor failure, and asks for tomorrow', () => {
    const msg = buildNightRecapMessage({ ...base, wasActive: true }) as string;
    // No verdict in either direction — this is the whole point.
    expect(msg).not.toMatch(/missed|folded|didn't show up|nothing got done/i);
    expect(msg).not.toMatch(/clean day|locked-in day|strong/i);
    // And it converts the gap into a commitment.
    expect(msg).toMatch(/tomorrow/i);
  });

  it('does NOT render an empty "day recap:" dashboard', () => {
    const msg = buildNightRecapMessage({ ...base, wasActive: true }) as string;
    expect(msg).not.toMatch(/^day recap:/);
  });

  it('stays silent for someone who never showed up', () => {
    expect(buildNightRecapMessage({ ...base, wasActive: false })).toBeNull();
    expect(buildNightRecapMessage(base)).toBeNull();
  });

  it('is unchanged when the ledger does have entries', () => {
    const msg = buildNightRecapMessage({
      ...base,
      done: ['walk 20 min'],
      wasActive: true,
    }) as string;
    expect(msg).toMatch(/^day recap:/);
    expect(msg).toContain('walk 20 min');
  });
});

describe('weekly review — engaged week with an empty ledger', () => {
  const base = {
    userName: 'Bianca',
    doneCount: 0,
    missedCount: 0,
    proofCount: 0,
    score: null,
  };

  it('sends, and states the one fact we can actually verify', () => {
    const msg = buildWeeklyReviewMessage({ ...base, activeDays: 7 }) as string;
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/showed up every day/i);
    expect(msg).toMatch(/week in review/i);
  });

  it('counts partial weeks honestly', () => {
    expect(buildWeeklyReviewMessage({ ...base, activeDays: 3 })).toMatch(/showed up 3 days/i);
    expect(buildWeeklyReviewMessage({ ...base, activeDays: 1 })).toMatch(/showed up 1 day\b/i);
  });

  it('never prints a fabricated miss count', () => {
    const msg = buildWeeklyReviewMessage({ ...base, activeDays: 7 }) as string;
    // The old copy shamed users with "❌ 86 missed" over rows they never agreed to.
    expect(msg).not.toMatch(/❌/);
    expect(msg).not.toMatch(/\bmissed\b/i);
    expect(msg).not.toMatch(/didn't really show up/i);
  });

  it('stays silent for a week with no activity at all', () => {
    expect(buildWeeklyReviewMessage({ ...base, activeDays: 0 })).toBeNull();
    expect(buildWeeklyReviewMessage(base)).toBeNull();
  });

  it('is unchanged when there were real commitments', () => {
    const msg = buildWeeklyReviewMessage({
      ...base,
      doneCount: 4,
      missedCount: 1,
      activeDays: 7,
    }) as string;
    expect(msg).toMatch(/✅ 4 done/);
    expect(msg).toMatch(/❌ 1 missed/);
  });
});
