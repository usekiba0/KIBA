import { buildPaymentNotActivePrompt, PaymentClaimContext } from '../../src/ai/prompts/payment-claim.prompt';

function ctx(overrides: Partial<PaymentClaimContext> = {}): PaymentClaimContext {
  return { name: null, goal: null, trialDays: 7, priceDisplay: '$20/month', cussingOk: false, ...overrides };
}

describe('buildPaymentNotActivePrompt', () => {
  it('forbids confirming/congratulating the payment', () => {
    const p = buildPaymentNotActivePrompt(ctx());
    expect(p).toMatch(/NEVER confirm the payment/i);
    expect(p).toMatch(/has not cleared|not cleared|NOT active/i);
  });

  it('tells it to point at the existing link and never include a URL', () => {
    const p = buildPaymentNotActivePrompt(ctx());
    expect(p).toMatch(/do NOT include a URL/i);
    expect(p).toMatch(/the link i sent|already have the link|checkout link/i);
  });

  it('asks for varied wording, not a canned line', () => {
    const p = buildPaymentNotActivePrompt(ctx());
    expect(p).toMatch(/vary the wording/i);
  });

  it('surfaces known name + goal and quotes configured trial/price', () => {
    const p = buildPaymentNotActivePrompt(ctx({ name: 'Ali', goal: 'gym', trialDays: 14, priceDisplay: '$29/month' }));
    expect(p).toContain('name: Ali');
    expect(p).toContain('goal: gym');
    expect(p).toContain('14 days free');
    expect(p).toContain('$29/month');
  });

  it('keeps it clean unless cussing was opted into', () => {
    expect(buildPaymentNotActivePrompt(ctx({ cussingOk: false }))).toMatch(/keep it clean/i);
    expect(buildPaymentNotActivePrompt(ctx({ cussingOk: true }))).toMatch(/opted into cussing/i);
  });
});
