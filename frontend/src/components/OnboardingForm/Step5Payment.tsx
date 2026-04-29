'use client';
import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '../../lib/stripe';
import { createSetupIntent, submitOnboarding } from '../../lib/api';

const BETA_MODE = process.env.NEXT_PUBLIC_BETA_MODE === 'true';

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

    const result = await stripe.confirmSetup({
      elements,
      clientSecret,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (result.error) {
      setError(result.error.message ?? 'Payment failed');
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentMethodId = (result as any).setupIntent?.payment_method as string | undefined;
    try {
      await submitOnboarding({ ...formData, stripe_payment_method_id: paymentMethodId });
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const initPayment = async () => {
    setLoading(true);
    setError('');
    try {
      const { client_secret } = await createSetupIntent(
        formData.name as string,
        formData.phone_number as string,
      );
      setClientSecret(client_secret);
    } catch {
      setError('Could not initialise payment. Please try again.');
    }
    setLoading(false);
  };

  const betaBypass = async () => {
    setLoading(true);
    setError('');
    try {
      await submitOnboarding({ ...formData, stripe_payment_method_id: 'pm_beta_bypass' });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
    setLoading(false);
  };

  return (
    <div className="step">
      <h2>Start your free trial</h2>
      <p className="step-desc">No charge today — your 1-month free trial starts immediately after signup.</p>

      {!clientSecret ? (
        <div>
          <div className="trial-summary">
            <div className="trial-row"><span>1-month free trial</span><span className="trial-free">FREE</span></div>
            <div className="trial-row"><span>Then, Individual Plan</span><span>$20/mo</span></div>
            <div className="trial-row"><span>Cancel anytime</span><span>✓</span></div>
          </div>
          {error && <p className="field-error">{error}</p>}
          {BETA_MODE ? (
            <button className="btn-primary" onClick={betaBypass} disabled={loading} type="button"
              style={{ width: '100%', marginTop: 16, background: '#059669' }}>
              {loading ? 'Creating account...' : 'Skip Payment (Beta Mode) →'}
            </button>
          ) : (
            <button className="btn-primary" onClick={initPayment} disabled={loading} type="button" style={{ width: '100%', marginTop: 16 }}>
              {loading ? 'Loading...' : 'Add Payment Method →'}
            </button>
          )}
          <button className="btn-secondary" onClick={onBack} type="button" style={{ marginTop: 8 }}>← Back</button>
        </div>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentForm clientSecret={clientSecret} formData={formData} onSuccess={onSuccess} />
        </Elements>
      )}
    </div>
  );
}
