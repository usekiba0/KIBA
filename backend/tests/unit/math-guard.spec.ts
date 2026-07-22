import { evaluate } from '../../src/ai/calc';
import { correctArithmeticClaims, parseQuantity } from '../../src/ai/math-claim-guard';

/**
 * Retraining B5 — founder priority: "all arithmetic runs through real
 * calculation, never estimated in prose." Six math misses in the 133-message
 * live test. The evaluator is the front door (the `calculate` tool); the
 * claim guard is the backstop for equations the model writes in prose anyway.
 *
 * The guard's tests are weighted toward NOT firing: a missed correction costs
 * one wrong number, a false correction rewrites a true sentence — worse.
 */
describe('evaluate (the calculate tool)', () => {
  it.each([
    ['500*6', 3000],
    ['350+450+120', 920],
    ['(350+450+120)*7', 6440],
    ['0.1+0.2', 0.3],       // float noise killed
    ['100-30*2', 40],       // precedence
    ['(100-30)*2', 140],    // parens
    ['10/4', 2.5],
    ['10%3', 1],
    ['-5+10', 5],
  ])('%s = %d', (expr, expected) => {
    expect(evaluate(expr)).toEqual({ ok: true, result: expected });
  });

  it('rejects anything outside the arithmetic grammar — this is the injection surface', () => {
    for (const bad of [
      'process.exit(1)',
      '5k*6',                // units must be stripped by the model
      '$500*6',
      '1,000+2',
      '2**10',               // ok:false — ** parses as 2 * (unary?) → reject
      'Math.max(1,2)',
      '',
      '5+',
    ]) {
      expect(evaluate(bad).ok).toBe(false);
    }
  });

  it('reports division by zero instead of shipping Infinity', () => {
    const r = evaluate('5/0');
    expect(r.ok).toBe(false);
  });
});

describe('parseQuantity', () => {
  it.each([
    ['$2,000', 2000],
    ['1.5k', 1500],
    ['5k', 5000],
    ['450', 450],
    ['$1.1k', 1100],
  ])('%s -> %d', (raw, expected) => {
    expect(parseQuantity(raw)).toBe(expected);
  });
  it('returns null for non-quantities', () => {
    expect(parseQuantity('6:15')).toBeNull();
    expect(parseQuantity('4x8')).toBeNull();
  });
});

describe('correctArithmeticClaims', () => {
  it('fixes the live "gets you to 5k" class — rate × periods stated wrong', () => {
    // The doc's B5 flagship: a savings plan whose own components computed to
    // far less than the number KIBA promised.
    const r = correctArithmeticClaims('put away $500 a week for 6 weeks gets you to 5k no problem.');
    expect(r.corrections).toHaveLength(1);
    // The claim was written "5k" (no $), so the correction mirrors that style.
    expect(r.text).toContain('gets you to 3k');
    expect(r.text).not.toContain('5k no problem');
  });

  it('fixes a wrong prose sum', () => {
    const r = correctArithmeticClaims('so 2,000 plus 500 is 3,000 a month total.');
    expect(r.corrections).toHaveLength(1);
    expect(r.text).toContain('is 2,500 a month');
  });

  it('fixes a wrong spaced product', () => {
    const r = correctArithmeticClaims('that is 12 x 30 = 400 for the year so far.');
    expect(r.text).toContain('= 360');
  });

  it('leaves the CORRECT live example alone — interval sum', () => {
    // Karibi 2026-07-19, and it was right: 600 + [400,500] = [1000,1100].
    const text = 'so 600 food plus 400-500 going out is 1k-1.1k a month.';
    const r = correctArithmeticClaims(text);
    expect(r.corrections).toHaveLength(0);
    expect(r.text).toBe(text);
  });

  describe('never fires on…', () => {
    it.each([
      // Workout set notation — "x" without spaces is sets×reps, not math.
      ['bench 4x8, push-ups 25x3, planks 60s', 'set notation'],
      // Clock times — the : guard keeps 6:15 from parsing as 6.
      ['gym at 6:15 is the plan, proof by 7:35', 'times of day'],
      // Rounded claims inside tolerance.
      ['roughly 350 plus 450 is about 800 for the day', 'correct within tolerance'],
      // No result clause — nothing claimed, nothing to verify.
      ['add 500 to your savings this week', 'no equation'],
      // Approximation with ~ that is right.
      ['coffee plus the sandwich, 120 plus 380 is ~500', 'tilde but correct'],
    ])('%s (%s)', (text) => {
      const r = correctArithmeticClaims(text);
      expect(r.corrections).toHaveLength(0);
      expect(r.text).toBe(text);
    });
  });

  it('formats the correction in the style the reply used ($ and k preserved)', () => {
    const r = correctArithmeticClaims('$1k plus $1.5k is $3k total');
    expect(r.corrections).toHaveLength(1);
    expect(r.text).toContain('$2.5k total');
  });

  it('reports what it changed for the logs', () => {
    const r = correctArithmeticClaims('200 plus 300 is 600.');
    expect(r.corrections[0]).toMatchObject({ from: '600', to: '500' });
  });
});
