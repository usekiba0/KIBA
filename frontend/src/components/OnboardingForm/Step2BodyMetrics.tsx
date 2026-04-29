'use client';

interface Props {
  data: { height_cm?: number; weight_kg?: number; age?: number };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step2BodyMetrics({ data, onChange, onNext, onBack }: Props) {
  return (
    <div className="step">
      <h2>Your body metrics</h2>
      <p className="step-desc">Optional — helps your coach give you accurate, personalised guidance.</p>
      <div className="field-row">
        <label className="field-label">
          Height (cm)
          <input type="number" className="input" value={data.height_cm ?? ''} min={50} max={280}
            onChange={e => onChange({ height_cm: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="178" />
        </label>
        <label className="field-label">
          Weight (kg)
          <input type="number" className="input" value={data.weight_kg ?? ''} min={20} max={500}
            onChange={e => onChange({ weight_kg: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="75.5" />
        </label>
        <label className="field-label">
          Age
          <input type="number" className="input" value={data.age ?? ''} min={13} max={120}
            onChange={e => onChange({ age: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="28" />
        </label>
      </div>
      <div className="btn-row">
        <button className="btn-secondary" onClick={onBack} type="button">← Back</button>
        <button className="btn-primary" onClick={onNext} type="button">Continue →</button>
      </div>
    </div>
  );
}
