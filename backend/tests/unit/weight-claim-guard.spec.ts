import { extractWeighIns, correctWeightClaims, WeighIn } from '../../src/ai/weight-claim-guard';

/**
 * Bianca 2026-07-23 (live, post-deploy):
 *
 *   "you started at 205.2 lbs last friday. that's 5.6 lbs down in one week."
 *
 * 205.2 was her 07-03 weigh-in — THREE weeks earlier. Last Friday (07-17) she
 * was 202.4, so the true one-week loss was 2.8 lbs. KIBA reported exactly
 * double, to a weight-loss client, off a frozen anchor it had already misused
 * on 07-14 ("2.6 lbs in one week") and 07-17 ("2.8 lbs in one week") — the
 * error grows every week the anchor stays stuck.
 *
 * Same family as time-claim-guard / math-claim-guard: pure, deterministic, no
 * model call. The model may not pick the anchor; the anchor is a dated fact.
 */
const H = (d: string) => new Date(`${d}T14:00:00.000Z`);

// Her real ledger.
const LEDGER: WeighIn[] = [
  { at: H('2026-07-03'), lbs: 205.2 },
  { at: H('2026-07-10'), lbs: 203.6 },
  { at: H('2026-07-14'), lbs: 202.6 },
  { at: H('2026-07-17'), lbs: 202.4 },
  { at: H('2026-07-23'), lbs: 199.6 },
];

describe('extractWeighIns', () => {
  it('pulls dated weigh-ins out of user messages', () => {
    const msgs = [
      { role: 'user', content: 'Weight 199.6', created_at: '2026-07-23T19:10:00Z' },
      { role: 'ai', content: 'weight check in ✓ 199.6 lbs', created_at: '2026-07-23T19:10:05Z' },
      { role: 'user', content: '202.4', created_at: '2026-07-17T14:01:00Z' },
    ];
    const out = extractWeighIns(msgs);

    // AI echoes must never become ledger entries — only what the USER reported.
    expect(out.map((w) => w.lbs)).toEqual([202.4, 199.6]);
    expect(out[1].at.toISOString()).toBe('2026-07-23T19:10:00.000Z');
  });

  it('ignores numbers that are not weigh-ins', () => {
    const msgs = [
      { role: 'user', content: 'lunch was 800 cal', created_at: '2026-07-23T19:00:00Z' },
      { role: 'user', content: 'i did 3 sets of 12', created_at: '2026-07-23T19:00:00Z' },
      { role: 'user', content: 'be there at 7:30', created_at: '2026-07-23T19:00:00Z' },
    ];
    expect(extractWeighIns(msgs)).toEqual([]);
  });
});

describe('correctWeightClaims', () => {
  it('fixes the production claim — wrong anchor AND doubled delta', () => {
    const out = correctWeightClaims(
      "weight check in ✓\n\n199.6 lbs thursday afternoon.\n\nyou started at 205.2 lbs last friday. that's 5.6 lbs down in one week. locked.",
      LEDGER,
    );

    expect(out.corrections.length).toBeGreaterThan(0);
    expect(out.text).toContain('202.4');
    expect(out.text).toContain('2.8');
    expect(out.text).not.toContain('5.6 lbs down in one week');
    expect(out.text).not.toContain('205.2 lbs last friday');
  });

  it('corrects the delta even when phrased "you\'re down N lbs in one week"', () => {
    const out = correctWeightClaims("you're down 5.6 lbs in one week. real progress.", LEDGER);

    expect(out.corrections.length).toBe(1);
    expect(out.text).toContain("you're down 2.8 lbs in one week");
  });

  it('leaves a CORRECT one-week claim alone', () => {
    const out = correctWeightClaims(
      "you were 202.4 last friday. that's 2.8 lbs down in one week.",
      LEDGER,
    );

    expect(out.corrections).toEqual([]);
  });

  it('tolerates rounding', () => {
    const out = correctWeightClaims("that's 2.9 lbs down in one week.", LEDGER);
    expect(out.corrections).toEqual([]);
  });

  it('does nothing when there is no week-ago weigh-in to compare against', () => {
    const sparse: WeighIn[] = [{ at: H('2026-07-23'), lbs: 199.6 }];
    const out = correctWeightClaims("that's 5.6 lbs down in one week.", sparse);

    // No anchor = no provable error. Silence beats a guess.
    expect(out.corrections).toEqual([]);
    expect(out.text).toContain('5.6');
  });

  it('ignores total-progress claims that are not framed as one week', () => {
    const out = correctWeightClaims("you're down 5.6 lbs since you started. that's real.", LEDGER);

    // 205.2 → 199.6 IS 5.6 since the start. Correct, and out of scope.
    expect(out.corrections).toEqual([]);
  });

  it('is safe with an empty ledger or empty text', () => {
    expect(correctWeightClaims('', LEDGER).corrections).toEqual([]);
    expect(correctWeightClaims("that's 3 lbs down in one week.", []).corrections).toEqual([]);
  });
});
