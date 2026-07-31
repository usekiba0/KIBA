/**
 * Deterministic guard against quoting a price at the checkout link
 * (thread audit 2026-07-31).
 *
 * Observed on the test phone, 2026-07-30T21:07:40Z — to a self-declared
 * 9-year-old, one message after the link went out:
 *
 *   "tell them it's $9.99 a month and i'm checking in on you every morning at
 *    9am to make sure you hit that shooting progression at lifetime."
 *
 * That sentence never reached the user, but only by accident: the reminder guard
 * happened to strip the whole sentence for an unrelated reason (the "every
 * morning at 9am" promise). Remove that coincidence and the price ships. So the
 * rule was unguarded in practice.
 *
 * `intake.prompt.ts` step 8 is explicit — "at the link, do NOT mention price, do
 * NOT say 'free trial', do NOT say 'cancel anytime', do NOT quote ..." — and it
 * explains why: naming a number at the moment of commitment makes people think
 * about cancelling. Prod runs claude-haiku-4-5 where prompt rules are soft, so
 * this is the hard backstop.
 *
 * CRITICAL EXCEPTION. The same prompt (step "price / how much is it") makes
 * answering a DIRECT price question mandatory: "this is the ONE time you name it
 * — answer honestly and lightly". Dodging a direct question is its own
 * well-documented bug in this product. So the guard stands down completely when
 * the user asked. It exists to stop KIBA VOLUNTEERING a number, never to make it
 * evasive.
 */

/**
 * Phrasings that put a price in front of the user. Deliberately anchored on
 * currency or an explicit rate — a bare number is not a price, and the close is
 * full of bare numbers ("3 days", "5 days a week", "every morning at 9am").
 */
const PRICE_PATTERNS: RegExp[] = [
  // "$9.99", "$20"
  /\$\s?\d/,
  // "20 dollars", "9.99 bucks", "20 usd"
  /\b\d+(?:\.\d{1,2})?\s*(?:dollars?|bucks|usd)\b/i,
  // "9.99 a month", "20/mo", "10 per week"
  /\b\d+(?:\.\d{1,2})?\s*(?:\/|per\s+|a\s+)(?:mo\b|month|wk\b|week|yr\b|year)/i,
  // Framings the prompt bans outright at the link, price or not.
  /\bfree\s+trial\b/i,
  /\bcancel\s+any\s?time\b/i,
];

/** True if the text puts a price (or a banned billing framing) in front of the user. */
export function mentionsPrice(text: string): boolean {
  const body = text ?? '';
  return PRICE_PATTERNS.some((re) => re.test(body));
}

/**
 * Did the user actually ask what it costs? If so the number is REQUIRED and this
 * guard must not touch the reply.
 *
 * Broad on purpose. A false positive here means KIBA answers a price question at
 * the close — mildly off-spec. A false negative means KIBA dodges a direct
 * question about money, which reads as evasive and is the worse failure.
 */
export function userAskedAboutPrice(text: string): boolean {
  const body = text ?? '';
  return (
    /\bhow\s+much\b/i.test(body) ||
    /\bprice|pricing|costs?|charges?|fees?|expensive|afford|billing|subscription\b/i.test(body) ||
    /\bis\s+(?:it|this)\s+free\b/i.test(body) ||
    /\bdo\s+i\s+(?:have\s+to\s+)?pay\b/i.test(body) ||
    /\$/.test(body)
  );
}

export interface PriceGuardResult {
  text: string;
  corrected: boolean;
  dropped: string[];
}

/**
 * Split into sentences keeping terminators, so one offending clause can be
 * removed and the rest of the close survives. Newlines are boundaries — KIBA
 * writes in short stacked bubbles.
 *
 * A COLON counts as a boundary here, unlike in reminder-claim-guard. The close's
 * call to action ends in one — "tap this and we start tonight:" — and without
 * this the price clause that follows it belongs to the same "sentence", so
 * stripping the price also deletes the CTA. Caught by the first test run, which
 * returned "bet. three days you run the progression." with the tap-line gone.
 *
 * Only a colon followed by whitespace splits, so "8:30" and "9:15am" stay whole.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?:])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * The close line the prompt itself proposes. Used only if stripping would leave
 * nothing at all — shipping an empty message next to a payment link is worse
 * than shipping a plain one.
 */
const FALLBACK = "bet. tap this and we're locked in:";

/**
 * Remove volunteered price talk from a reply that carries a checkout link.
 *
 * Only call this when a link actually went out this turn AND the user did not
 * ask about price. Outside the close the price conversation is legitimate — it
 * is scheduled for the reveal day — so a blanket strip would delete real copy.
 */
export function stripPriceAtCheckout(text: string): PriceGuardResult {
  const original = text ?? '';
  if (!mentionsPrice(original)) {
    return { text: original, corrected: false, dropped: [] };
  }

  const kept: string[] = [];
  const dropped: string[] = [];
  for (const sentence of splitSentences(original)) {
    if (mentionsPrice(sentence)) dropped.push(sentence);
    else kept.push(sentence);
  }

  if (kept.length === 0) {
    return { text: FALLBACK, corrected: true, dropped };
  }
  return { text: kept.join(' '), corrected: true, dropped };
}
