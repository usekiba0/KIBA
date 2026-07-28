'use client';
import { useState, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

// The legal pages live on the marketing site, not this app, so they're env-set
// rather than hardcoded — the exact paths are the marketing site's to decide and
// a carrier reviewer WILL follow both links. If either 404s at submission time
// the campaign is rejected, so these must be confirmed live before submitting.
// Relative by default so the links resolve on whatever host is serving the app
// — the vercel.app URL today, join.usekiba.ai once the CNAME lands — without a
// rebuild in between. A carrier reviewer follows both during A2P review, and a
// 404 at that moment fails the campaign. Override with an absolute URL only if
// these pages ever move to the marketing site.
const SMS_TERMS_URL = process.env.NEXT_PUBLIC_SMS_TERMS_URL ?? '/sms-terms';
const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL ?? '/privacy';

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
  // A2P 10DLC: consent is an EXPLICIT, un-pre-checked checkbox. Twilio's campaign
  // form lists "Checkbox for consent (must NOT be pre-selected)" as a web-form
  // requirement and repeats it under Important notes. We previously relied on
  // "by tapping Continue you agree" — a defensible reading of CTIA guidance, but
  // not what the reviewer is looking for, and a rejection costs 1-3 business days
  // plus a resubmission. Starts false, and Continue stays disabled until ticked.
  const [smsConsent, setSmsConsent] = useState(false);
  const checkingRef = useRef(false);

  const phoneValid = isValidPhone(data.phone_number);
  const nameValid = data.name.trim().length >= 2;
  const canContinue = nameValid && phoneValid && !phoneError && smsConsent;

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

      {/*
        A2P 10DLC consent disclosure. Carriers require the consent language to
        sit on the screen where the number is submitted, and a campaign reviewer
        asks for a screenshot of exactly this view — a missing or vague
        disclosure is the most common cause of campaign rejection. It must state
        who is messaging, that messages are recurring and automated, that
        frequency varies, that rates may apply, and how to stop or get help.

        It is a CHECKBOX, unchecked by default, and Continue is disabled until it
        is ticked — that is the exact pattern Twilio's campaign form asks for
        ("Checkbox for consent (must NOT be pre-selected)"). The earlier
        "by tapping Continue you agree" wording was a defensible reading of CTIA
        guidance but not what a reviewer looks for.
      */}
      <label className="consent-notice">
        <input
          type="checkbox"
          checked={smsConsent}
          onChange={(e) => setSmsConsent(e.target.checked)}
          aria-describedby="sms-consent-text"
        />
        <span id="sms-consent-text">
          I agree to receive recurring automated text messages from KIBA at the number above,
          including daily check-ins and reminders. Message frequency varies.
          Message &amp; data rates may apply. Consent is not a condition of purchase.
          Reply STOP to cancel or HELP for help. See our{' '}
          <a href={SMS_TERMS_URL} target="_blank" rel="noopener noreferrer">SMS Terms</a>{' '}
          and{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </span>
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
