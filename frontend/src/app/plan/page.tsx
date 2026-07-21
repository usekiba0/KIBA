'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

// Palette mirrors the marketing site / admin (src/app/page.tsx).
const BG = '#050d1a';
const S1 = '#0c1829';
const S2 = '#081422';
const TX = '#f0f9ff';
const MT = '#7eb4cc';
const DIM = '#3a6080';
const R = '#0ea5e9';
const RL = '#38bdf8';
const V = '#10b981';
const GRAD = `linear-gradient(135deg,${R},${V})`;
const GLOW = (a: number) => `rgba(14,165,233,${a})`;

type PlanId = 'monthly' | 'yearly';

interface PlanOption {
  id: PlanId;
  amount: number;       // minor units, total per billing period
  currency: string;
  interval: 'month' | 'year';
  per_month: number;    // minor units per month
  savings_pct: number | null;
}

type PlansResponse =
  | { ok: true; name: string | null; trial_days: number; plans: PlanOption[] }
  | { ok: false; error: string };

type SessionResponse = { ok: true; url: string } | { ok: false; error: string };

// Stripe amounts are minor units. Intl already knows how many decimals each
// currency uses, so derive the divisor instead of assuming /100.
function money(minor: number, currency: string) {
  const cur = (currency || 'usd').toUpperCase();
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur });
  } catch {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
  }
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(minor / Math.pow(10, digits));
}

function intervalShort(interval: 'month' | 'year') {
  return interval === 'year' ? 'yr' : 'mo';
}

function intervalLabel(interval: 'month' | 'year') {
  return interval === 'year' ? 'Yearly' : 'Monthly';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: `radial-gradient(ellipse at 50% 0%, ${GLOW(0.12)} 0%, ${BG} 60%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px 40px', color: TX, fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>{children}</div>
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{
      fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 700,
      color: TX, letterSpacing: '-0.5px', textAlign: 'center', marginBottom: 28,
    }}>
      KIBA
    </div>
  );
}

function FullPageMessage({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <Wordmark />
      <div style={{
        background: `linear-gradient(160deg, ${S1}, ${S2})`,
        border: `1px solid ${GLOW(0.22)}`, borderRadius: 20,
        padding: '40px 28px', textAlign: 'center',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: TX, marginBottom: 12, lineHeight: 1.25 }}>
          {title}
        </h1>
        <p style={{ fontSize: 15, color: MT, lineHeight: 1.7 }}>{body}</p>
      </div>
    </Shell>
  );
}

function PlanPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t') ?? '';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ name: string | null; trial_days: number; plans: PlanOption[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlanId>('monthly');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!token) { setLoadError('invalid_token'); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API}/checkout/plans?t=${encodeURIComponent(token)}`);
        const json: PlansResponse = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setLoadError(json.error);
        } else if (!json.plans || json.plans.length === 0) {
          setLoadError('stripe_error');
        } else {
          setData({ name: json.name, trial_days: json.trial_days, plans: json.plans });
          // Monthly is the default pick when it exists; otherwise the only plan on offer.
          const monthly = json.plans.find(p => p.id === 'monthly');
          setSelected(monthly ? monthly.id : json.plans[0].id);
        }
      } catch {
        if (!cancelled) setLoadError('network');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const startCheckout = useCallback(async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API}/checkout/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, plan: selected }),
      });
      const json: SessionResponse = await res.json();
      if (json.ok) {
        window.location.href = json.url;
        return; // keep the button disabled while the browser navigates away
      }
      setSubmitError("We couldn't open checkout. Try again — if it keeps failing, text KIBA and we'll sort it.");
      setSubmitting(false);
    } catch {
      setSubmitError('Connection problem. Check your signal and try again.');
      setSubmitting(false);
    }
  }, [token, selected]);

  if (loading) {
    return (
      <Shell>
        <Wordmark />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0' }}>
          <div style={{ width: 22, height: 22, border: `2px solid ${GLOW(0.2)}`, borderTopColor: R, borderRadius: '50%', animation: 'planspin 0.9s linear infinite' }} />
          <div style={{ fontSize: 14, color: DIM }}>Loading your plan…</div>
        </div>
        <style>{'@keyframes planspin{to{transform:rotate(360deg)}}'}</style>
      </Shell>
    );
  }

  if (loadError || !data) {
    if (loadError === 'expired' || loadError === 'invalid_token') {
      return (
        <FullPageMessage
          title="This link expired."
          body="Checkout links only stay live for a short window. Text KIBA and ask for a fresh one — it takes a second."
        />
      );
    }
    return (
      <FullPageMessage
        title="Something went wrong on our end."
        body="That's on us, not you. Text KIBA and we'll sort it out right away."
      />
    );
  }

  const { name, trial_days: trialDays, plans } = data;
  const headline = name ? `${name}, lock it in.` : 'Lock it in.';
  const dayWord = trialDays === 1 ? 'day' : 'days';

  return (
    <Shell>
      <Wordmark />

      <h1 style={{
        fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,9vw,44px)',
        fontWeight: 700, lineHeight: 1.1, letterSpacing: '-1px',
        color: TX, textAlign: 'center', marginBottom: 14,
      }}>
        {headline}
      </h1>

      <p style={{ fontSize: 15, color: MT, lineHeight: 1.65, textAlign: 'center', marginBottom: 32 }}>
        {trialDays > 0
          ? `${trialDays} ${dayWord} free, then pick the plan that keeps you honest. Cancel anytime.`
          : 'Pick the plan that keeps you honest. Cancel anytime.'}
      </p>

      <div role="radiogroup" aria-label="Choose a plan" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {plans.map(plan => {
          const active = plan.id === selected;
          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(plan.id)}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                background: active ? `linear-gradient(135deg, ${GLOW(0.16)}, rgba(16,185,129,0.07))` : S1,
                border: `2px solid ${active ? R : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 16, padding: '18px 18px',
                display: 'flex', alignItems: 'center', gap: 14,
                boxShadow: active ? `0 0 0 4px ${GLOW(0.1)}` : 'none',
                transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
                color: TX, fontFamily: 'inherit',
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${active ? R : 'rgba(255,255,255,0.22)'}`,
                background: active ? R : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {active && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'block' }} />}
              </span>

              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 19, fontWeight: 700, color: TX }}>
                    {money(plan.per_month, plan.currency)}/mo
                  </span>
                  <span style={{ fontSize: 13, color: MT }}>· {intervalLabel(plan.interval)}</span>
                  {plan.savings_pct != null && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 1,
                      background: 'rgba(16,185,129,0.16)', color: '#34d399',
                      border: '1px solid rgba(16,185,129,0.4)',
                      borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap',
                    }}>
                      SAVE {plan.savings_pct}%
                    </span>
                  )}
                </span>
              </span>

              <span style={{ fontSize: 14, color: active ? MT : DIM, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {money(plan.amount, plan.currency)}/{intervalShort(plan.interval)}
              </span>
            </button>
          );
        })}
      </div>

      {submitError && (
        <div style={{
          fontSize: 13, color: '#fca5a5', background: 'rgba(127,29,29,0.25)',
          border: '1px solid rgba(127,29,29,0.6)', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14, lineHeight: 1.5,
        }}>
          {submitError}
        </div>
      )}

      <button
        type="button"
        onClick={startCheckout}
        disabled={submitting}
        style={{
          width: '100%', padding: '18px 24px', borderRadius: 14, border: 'none',
          background: GRAD, color: '#fff', fontSize: 17, fontWeight: 700,
          fontFamily: 'inherit', letterSpacing: '0.3px',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.6 : 1,
          boxShadow: `0 10px 34px ${GLOW(0.42)}`,
        }}
      >
        {submitting ? 'Opening checkout…' : trialDays > 0 ? `Start my ${trialDays} ${dayWord} free` : 'Continue to checkout'}
      </button>

      <p style={{ fontSize: 12, color: DIM, textAlign: 'center', marginTop: 18, lineHeight: 1.6 }}>
        Secure checkout by Stripe. Cancel anytime.
      </p>
      <p style={{ fontSize: 11, color: '#2a4a6b', textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
        By continuing you agree to the KIBA Terms of Service and Privacy Policy.
      </p>
    </Shell>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={
      <Shell>
        <Wordmark />
        <div style={{ fontSize: 14, color: DIM, textAlign: 'center' }}>Loading your plan…</div>
      </Shell>
    }>
      <PlanPageInner />
    </Suspense>
  );
}
