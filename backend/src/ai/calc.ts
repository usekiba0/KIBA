/**
 * Deterministic arithmetic for the coaching model (KIBA_Retraining_Doc B5 —
 * founder priority: "all arithmetic runs through real calculation, never
 * estimated in prose").
 *
 * The live test logged six math misses in 133 messages: a savings plan that
 * "gets you to 5k" when its own components summed to 3,350, a "before 5"
 * window that ended at 5:15, an undersold savings total. The model estimates
 * arithmetic the way it estimates everything — plausibly — and a coach whose
 * numbers are plausibly wrong is worse than one with no numbers at all.
 *
 * This is the calculation half: a strict recursive-descent evaluator exposed
 * to the model as the `calculate` tool. No eval(), no Function(), no
 * identifiers — the grammar admits digits, + - * / % and parentheses, and
 * nothing else, so tool input can never become code execution.
 */

export type CalcResult = { ok: true; result: number } | { ok: false; error: string };

const MAX_EXPR_LENGTH = 200;

export function evaluate(expression: string): CalcResult {
  const expr = (expression ?? '').trim();
  if (!expr) return { ok: false, error: 'empty expression' };
  if (expr.length > MAX_EXPR_LENGTH) return { ok: false, error: 'expression too long' };
  // Whole-input allow-list up front — anything outside the grammar's alphabet
  // (letters, $, commas…) is rejected before parsing, with a hint the model
  // can act on.
  if (!/^[\d\s+\-*/%().]+$/.test(expr)) {
    return { ok: false, error: 'only numbers and + - * / % ( ) are allowed — strip units, $ signs and commas first' };
  }

  try {
    const parser = new Parser(expr);
    const value = parser.parseExpression();
    parser.expectEnd();
    if (!Number.isFinite(value)) return { ok: false, error: 'result is not a finite number (division by zero?)' };
    return { ok: true, result: roundSane(value) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Kill float noise (0.1+0.2) without distorting real precision. */
function roundSane(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

class Parser {
  private pos = 0;
  constructor(private readonly src: string) {}

  parseExpression(): number {
    let left = this.parseTerm();
    for (;;) {
      this.skipWs();
      const op = this.src[this.pos];
      if (op === '+' || op === '-') {
        this.pos++;
        const right = this.parseTerm();
        left = op === '+' ? left + right : left - right;
      } else return left;
    }
  }

  private parseTerm(): number {
    let left = this.parseFactor();
    for (;;) {
      this.skipWs();
      const op = this.src[this.pos];
      if (op === '*' || op === '/' || op === '%') {
        this.pos++;
        const right = this.parseFactor();
        if (op === '*') left = left * right;
        else if (op === '/') left = left / right;
        else left = left % right;
      } else return left;
    }
  }

  private parseFactor(): number {
    this.skipWs();
    const ch = this.src[this.pos];
    if (ch === '(') {
      this.pos++;
      const value = this.parseExpression();
      this.skipWs();
      if (this.src[this.pos] !== ')') throw new Error('missing closing parenthesis');
      this.pos++;
      return value;
    }
    if (ch === '-') {
      this.pos++;
      return -this.parseFactor();
    }
    return this.parseNumber();
  }

  private parseNumber(): number {
    this.skipWs();
    const m = /^\d+(?:\.\d+)?/.exec(this.src.slice(this.pos));
    if (!m) throw new Error(`expected a number at position ${this.pos}`);
    this.pos += m[0].length;
    return parseFloat(m[0]);
  }

  expectEnd(): void {
    this.skipWs();
    if (this.pos < this.src.length) {
      throw new Error(`unexpected "${this.src[this.pos]}" at position ${this.pos}`);
    }
  }

  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }
}
