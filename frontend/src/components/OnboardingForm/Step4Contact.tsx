'use client';

interface Props {
  data: { name: string; phone_number: string };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
  onBack: () => void;
}

function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{7,14}$/.test(phone.replace(/\s|-/g, ''));
}

export default function Step4Contact({ data, onChange, onNext, onBack }: Props) {
  const phoneValid = isValidPhone(data.phone_number);

  return (
    <div className="step">
      <h2>Where should your coach reach you?</h2>
      <p className="step-desc">Your welcome message arrives here within 30 seconds of signing up.</p>

      <label className="field-label">
        Your name
        <input type="text" className="input" value={data.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="Alex Johnson" maxLength={100} />
      </label>

      <label className="field-label">
        Mobile phone number
        <input type="tel" className="input" value={data.phone_number}
          onChange={e => onChange({ phone_number: e.target.value })}
          placeholder="+1 555 000 1234" />
        {data.phone_number && !phoneValid && (
          <span className="field-error">Please enter a valid mobile number with country code (e.g. +1)</span>
        )}
        <span className="field-hint">iPhone users get iMessages (blue bubbles) — everyone else gets SMS.</span>
      </label>

      <div className="btn-row">
        <button className="btn-secondary" onClick={onBack} type="button">← Back</button>
        <button className="btn-primary" onClick={onNext}
          disabled={!data.name.trim() || !phoneValid} type="button">
          Continue →
        </button>
      </div>
    </div>
  );
}
