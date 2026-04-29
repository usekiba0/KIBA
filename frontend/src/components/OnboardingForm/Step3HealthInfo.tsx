'use client';
import { useState } from 'react';

interface Props {
  data: { health_conditions: string[]; dietary_restrictions: string[]; injuries?: string };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step3HealthInfo({ data, onChange, onNext, onBack }: Props) {
  const [condInput, setCondInput] = useState('');
  const [restInput, setRestInput] = useState('');

  const addTag = (field: 'health_conditions' | 'dietary_restrictions', value: string, setter: (v: string) => void) => {
    const trimmed = value.trim();
    if (trimmed && !data[field].includes(trimmed)) {
      onChange({ [field]: [...data[field], trimmed] });
    }
    setter('');
  };

  const removeTag = (field: 'health_conditions' | 'dietary_restrictions', tag: string) => {
    onChange({ [field]: data[field].filter(t => t !== tag) });
  };

  return (
    <div className="step">
      <h2>Health information</h2>
      <p className="step-desc">Your coach uses this to keep your guidance safe and relevant. All optional.</p>

      <label className="field-label">
        Health conditions <span className="optional">(press Enter to add)</span>
        <div className="tags-input">
          {data.health_conditions.map(tag => (
            <span key={tag} className="tag">{tag}<button onClick={() => removeTag('health_conditions', tag)} type="button">×</button></span>
          ))}
          <input value={condInput} onChange={e => setCondInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('health_conditions', condInput, setCondInput))}
            placeholder="e.g. Type 2 diabetes" className="tag-input" />
        </div>
      </label>

      <label className="field-label">
        Dietary restrictions <span className="optional">(press Enter to add)</span>
        <div className="tags-input">
          {data.dietary_restrictions.map(tag => (
            <span key={tag} className="tag">{tag}<button onClick={() => removeTag('dietary_restrictions', tag)} type="button">×</button></span>
          ))}
          <input value={restInput} onChange={e => setRestInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('dietary_restrictions', restInput, setRestInput))}
            placeholder="e.g. Vegetarian, Gluten-free" className="tag-input" />
        </div>
      </label>

      <label className="field-label">
        Injuries or physical limitations <span className="optional">(optional)</span>
        <textarea value={data.injuries ?? ''} onChange={e => onChange({ injuries: e.target.value || undefined })}
          placeholder="e.g. Lower back pain — avoid heavy deadlifts and deep squats" rows={2} className="textarea" />
      </label>

      <div className="btn-row">
        <button className="btn-secondary" onClick={onBack} type="button">← Back</button>
        <button className="btn-primary" onClick={onNext} type="button">Continue →</button>
      </div>
    </div>
  );
}
