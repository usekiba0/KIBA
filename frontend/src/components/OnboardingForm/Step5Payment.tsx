'use client';
import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '../../lib/stripe';
import { createSetupIntent, submitOnboarding } from '../../lib/api';

// The price shown on the trial summary. Was hardcoded "$20/mo", which silently
// became a lie the moment the Stripe price changed — the page would promise $20
// while the card got charged something else. Env-driven so it moves with the
// backend's STRIPE_PRICE_DISPLAY instead of needing a code change and a deploy.
const PRICE_DISPLAY = process.env.NEXT_PUBLIC_PRICE_DISPLAY ?? '$9.99/mo';

interface PaymentFormProps {
  clientSecret: string;
  formData: Record<string, unknown>;
  onSuccess: () => void;
}

function PaymentForm({ clientSecret, formData, onSuccess }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError('');

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Failed to submit payment details');
      setLoading(false);
      return;
    }

    const result = await stripe.confirmSetup({
      elements,
      clientSecret,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (result.error) {
      setError(result.error.message ?? 'Payment setup failed. Please try a different card.');
      setLoading(false);
      return;
    }

    const paymentMethodId = (result as { setupIntent?: { payment_method?: string } }).setupIntent?.payment_method;
    if (!paymentMethodId) {
      setError('Could not retrieve payment method. Please try again.');
      setLoading(false);
      return;
    }

    try {
      await submitOnboarding({ ...formData, stripe_payment_method_id: paymentMethodId });
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      setError(msg);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p className="field-error" style={{ marginTop: 12 }}>{error}</p>}
      <button className="btn-primary" style={{ marginTop: 24, width: '100%' }}
        type="submit" disabled={loading || !stripe}>
        {loading ? 'Starting your trial...' : 'Start 1-Month Free Trial →'}
      </button>
      <p className="field-hint" style={{ textAlign: 'center', marginTop: 8 }}>
        No charge today. Your card is saved for when your free trial ends.
      </p>
    </form>
  );
}

interface Props {
  formData: Record<string, unknown>;
  onSuccess: () => void;
  onBack: () => void;
}

export default function Step5Payment({ formData, onSuccess, onBack }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const initPayment = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await createSetupIntent(
        formData.name as string,
        formData.phone_number as string,
      );
      setClientSecret(result.client_secret);
      setStripeCustomerId(result.stripe_customer_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConflict = msg.toLowerCase().includes('already registered') || msg.includes('409');
      setError(isConflict
        ? 'This phone number is already registered. Go back and use a different number.'
        : msg);
    }
    setLoading(false);
  };

  const enrichedFormData = stripeCustomerId
    ? { ...formData, stripe_customer_id: stripeCustomerId }
    : formData;

  return (
    <div className="step">
      <h2>Start your free trial</h2>
      <p className="step-desc">No charge today — your 1-month free trial starts immediately after signup.</p>

      {!clientSecret ? (
        <div>
          <div className="trial-summary">
            <div className="trial-row"><span>1-month free trial</span><span className="trial-free">FREE</span></div>
            <div className="trial-row"><span>Then, Individual Plan</span><span>{PRICE_DISPLAY}</span></div>
            <div className="trial-row"><span>Cancel anytime</span><span>✓</span></div>
          </div>
          {error && <p className="field-error">{error}</p>}
          <button className="btn-primary" onClick={initPayment} disabled={loading} type="button" style={{ width: '100%', marginTop: 16 }}>
            {loading ? 'Loading...' : 'Add Payment Method →'}
          </button>
          <button className="btn-secondary" onClick={onBack} type="button" style={{ marginTop: 8 }}>← Back</button>
        </div>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentForm clientSecret={clientSecret} formData={enrichedFormData} onSuccess={onSuccess} />
        </Elements>
      )}
    </div>
  );
}
