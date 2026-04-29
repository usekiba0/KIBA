'use client';

interface Props {
  data: { name: string; phone_number: string };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
  onBack: () => void;
}

function isValidPhone(phone: string): boolean {
  // Accept 10+ digits with optional country code prefix — normalised before sending
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
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
          <span className="field-error">Enter at least 10 digits — e.g. (415) 555-0100 or +44 7911 123456</span>
        )}
        <span className="field-hint">US numbers work with or without +1. iPhone users get iMessages (blue bubbles).</span>
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
