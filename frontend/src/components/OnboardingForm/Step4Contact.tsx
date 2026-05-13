'use client';
import { useState, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

interface Props {
  data: { name: string; phone_number: string };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
  onBack: () => void;
}

function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[\s\-().]/g, '');
  if (stripped.startsWith('+')) return stripped;
  const digits = stripped.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export default function Step4Contact({ data, onChange, onNext, onBack }: Props) {
  const [phoneError, setPhoneError] = useState('');
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const checkingRef = useRef(false);

  const phoneValid = isValidPhone(data.phone_number);
  const nameValid = data.name.trim().length >= 2;
  const canContinue = nameValid && phoneValid && !phoneError;

  async function checkPhone() {
    if (!phoneValid) return;
    setChecking(true);
    checkingRef.current = true;
    setPhoneError('');
    try {
      const normalized = normalizePhone(data.phone_number);
      const res = await fetch(`${API}/onboarding/check-phone?phone=${encodeURIComponent(normalized)}`);
      const json = await res.json() as { exists: boolean };
      if (json.exists) {
        setPhoneError('This phone number is already registered. Please use a different number.');
      }
    } catch {
      // ignore — backend will catch duplicates on submit
    }
    setChecking(false);
    checkingRef.current = false;
  }

  async function handleNext() {
    if (!nameValid || !phoneValid) return;
    // If still checking, wait for it to finish before advancing
    if (checkingRef.current) {
      setSubmitting(true);
      await new Promise<void>(resolve => {
        const poll = setInterval(() => {
          if (!checkingRef.current) { clearInterval(poll); resolve(); }
        }, 60);
      });
      setSubmitting(false);
    }
    if (phoneError) return;
    onNext();
  }

  return (
    <div className="step">
      <h2>Where should your coach reach you?</h2>
      <p className="step-desc">Your welcome message arrives here within 30 seconds of signing up.</p>

      <label className="field-label">
        Your name
        <input
          type="text"
          className="input"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="Alex Johnson"
          maxLength={100}
        />
        {data.name && !nameValid && (
          <span className="field-error">Name must be at least 2 characters</span>
        )}
      </label>

      <label className="field-label">
        Mobile phone number
        <input
          type="tel"
          className="input"
          value={data.phone_number}
          onChange={e => { onChange({ phone_number: e.target.value }); setPhoneError(''); }}
          onBlur={checkPhone}
          placeholder="+1 555 000 1234"
        />
        {data.phone_number && !phoneValid && (
          <span className="field-error">Enter at least 10 digits — e.g. (415) 555-0100 or +44 7911 123456</span>
        )}
        {phoneError && <span className="field-error">{phoneError}</span>}
        {checking && <span className="field-hint">Checking availability...</span>}
        {!phoneError && !checking && <span className="field-hint">US numbers work with or without +1. iPhone users get iMessages (blue bubbles).</span>}
      </label>

      <div className="btn-row">
        <button className="btn-secondary" onClick={onBack} type="button">← Back</button>
        <button
          className="btn-primary"
          onClick={handleNext}
          disabled={!canContinue || submitting}
          type="button"
        >
          {submitting ? 'Checking...' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
