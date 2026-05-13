'use client';
import { useState } from 'react';

type PressurePreference = 'pressure' | 'encouragement';

interface Props {
  data: {
    fears: string;
    avoidance_patterns: string;
    comparison_figure: string;
    public_failure_scenario: string;
    typical_failure_moment: string;
    pressure_preference: PressurePreference | '';
  };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
  onBack: () => void;
}

function err(val: string, min: number): string | null {
  if (!val) return null;
  return val.trim().length < min ? `Be more specific — add a bit more detail` : null;
}

export default function Step2PsychIntake({ data, onChange, onNext, onBack }: Props) {
  const [attempted, setAttempted] = useState(false);

  const canContinue =
    data.fears.trim().length >= 5 &&
    data.avoidance_patterns.trim().length >= 5 &&
    data.comparison_figure.trim().length >= 3 &&
    data.public_failure_scenario.trim().length >= 5 &&
    data.typical_failure_moment.trim().length >= 5 &&
    data.pressure_preference !== '';

  function handleNext() {
    if (!canContinue) { setAttempted(true); return; }
    onNext();
  }

  const missing = attempted && !canContinue ? getMissingFields(data) : null;

  return (
    <div className="step">
      <h2>Let&apos;s get uncomfortable.</h2>
      <p className="step-desc">
        Kiba uses your answers to apply targeted psychological pressure. The more honest you are, the more effective it gets.
      </p>

      <label className="field-label">
        What do you fear most about staying where you are?
        <input
          type="text"
          className="input"
          value={data.fears}
          onChange={e => onChange({ fears: e.target.value })}
          placeholder="e.g. Being mediocre, watching others succeed while I stay stuck"
          maxLength={300}
        />
        {err(data.fears, 5) && <span className="field-error">{err(data.fears, 5)}</span>}
        {attempted && !data.fears.trim() && <span className="field-error">This field is required</span>}
      </label>

      <label className="field-label" style={{ marginTop: 20 }}>
        What do you do instead of working toward your goal?
        <input
          type="text"
          className="input"
          value={data.avoidance_patterns}
          onChange={e => onChange({ avoidance_patterns: e.target.value })}
          placeholder="e.g. Scroll social media, watch TV, say 'I'll start tomorrow'"
          maxLength={300}
        />
        {err(data.avoidance_patterns, 5) && <span className="field-error">{err(data.avoidance_patterns, 5)}</span>}
        {attempted && !data.avoidance_patterns.trim() && <span className="field-error">This field is required</span>}
      </label>

      <label className="field-label" style={{ marginTop: 20 }}>
        Who do you compare yourself to?
        <input
          type="text"
          className="input"
          value={data.comparison_figure}
          onChange={e => onChange({ comparison_figure: e.target.value })}
          placeholder="e.g. My college roommate who started a company, my brother"
          maxLength={200}
        />
        {err(data.comparison_figure, 3) && <span className="field-error">{err(data.comparison_figure, 3)}</span>}
        {attempted && !data.comparison_figure.trim() && <span className="field-error">This field is required</span>}
        {!err(data.comparison_figure, 3) && <span className="field-hint">Kiba will remind you of them. That&apos;s the point.</span>}
      </label>

      <label className="field-label" style={{ marginTop: 20 }}>
        What would public failure look like for you?
        <input
          type="text"
          className="input"
          value={data.public_failure_scenario}
          onChange={e => onChange({ public_failure_scenario: e.target.value })}
          placeholder="e.g. Having to admit to my family I quit again"
          maxLength={300}
        />
        {err(data.public_failure_scenario, 5) && <span className="field-error">{err(data.public_failure_scenario, 5)}</span>}
        {attempted && !data.public_failure_scenario.trim() && <span className="field-error">This field is required</span>}
      </label>

      <label className="field-label" style={{ marginTop: 20 }}>
        When do you usually give up?
        <input
          type="text"
          className="input"
          value={data.typical_failure_moment}
          onChange={e => onChange({ typical_failure_moment: e.target.value })}
          placeholder="e.g. After the first week, when things get hard"
          maxLength={200}
        />
        {err(data.typical_failure_moment, 5) && <span className="field-error">{err(data.typical_failure_moment, 5)}</span>}
        {attempted && !data.typical_failure_moment.trim() && <span className="field-error">This field is required</span>}
      </label>

      <div className="field-label" style={{ marginTop: 24 }}>
        How do you want Kiba to talk to you?
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
          <button
            className={`focus-card ${data.pressure_preference === 'pressure' ? 'selected' : ''}`}
            onClick={() => onChange({ pressure_preference: 'pressure' })}
            type="button"
          >
            <span className="focus-label">⚡ Direct pressure</span>
            <span className="focus-desc">Sharp, no softening. Hold me accountable hard.</span>
          </button>
          <button
            className={`focus-card ${data.pressure_preference === 'encouragement' ? 'selected' : ''}`}
            onClick={() => onChange({ pressure_preference: 'encouragement' })}
            type="button"
          >
            <span className="focus-label">💙 Firm but warm</span>
            <span className="focus-desc">Still hold me accountable — slightly softer tone.</span>
          </button>
        </div>
        {attempted && !data.pressure_preference && (
          <span className="field-error" style={{ marginTop: 8, display: 'block' }}>Choose how you want Kiba to communicate</span>
        )}
      </div>

      {missing && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 10, fontSize: 13, color: '#7dd3fc' }}>
          Still needed: {missing}
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn-secondary" onClick={onBack} type="button">← Back</button>
        <button className="btn-primary" onClick={handleNext} type="button">
          Continue →
        </button>
      </div>
    </div>
  );
}

function getMissingFields(data: Props['data']): string {
  const missing: string[] = [];
  if (!data.fears.trim() || data.fears.trim().length < 5) missing.push('your fear');
  if (!data.avoidance_patterns.trim() || data.avoidance_patterns.trim().length < 5) missing.push('avoidance pattern');
  if (!data.comparison_figure.trim() || data.comparison_figure.trim().length < 3) missing.push('comparison figure');
  if (!data.public_failure_scenario.trim() || data.public_failure_scenario.trim().length < 5) missing.push('public failure scenario');
  if (!data.typical_failure_moment.trim() || data.typical_failure_moment.trim().length < 5) missing.push('when you give up');
  if (!data.pressure_preference) missing.push('communication style');
  return missing.join(', ');
}
