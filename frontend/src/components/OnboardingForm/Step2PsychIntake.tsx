'use client';

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

export default function Step2PsychIntake({ data, onChange, onNext, onBack }: Props) {
  const canContinue =
    data.fears.trim().length >= 5 &&
    data.avoidance_patterns.trim().length >= 5 &&
    data.comparison_figure.trim().length >= 3 &&
    data.public_failure_scenario.trim().length >= 5 &&
    data.typical_failure_moment.trim().length >= 5 &&
    data.pressure_preference !== '';

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
          placeholder="e.g. Being mediocre, watching others succeed while I stay stuck, looking back with regret"
          maxLength={300}
        />
      </label>

      <label className="field-label" style={{ marginTop: 20 }}>
        What do you do instead of working toward your goal?
        <input
          type="text"
          className="input"
          value={data.avoidance_patterns}
          onChange={e => onChange({ avoidance_patterns: e.target.value })}
          placeholder="e.g. Scroll social media, watch TV, say 'I'll start tomorrow', keep planning instead of doing"
          maxLength={300}
        />
      </label>

      <label className="field-label" style={{ marginTop: 20 }}>
        Who do you compare yourself to?
        <input
          type="text"
          className="input"
          value={data.comparison_figure}
          onChange={e => onChange({ comparison_figure: e.target.value })}
          placeholder="e.g. My college roommate who started a company, my brother, a colleague who got promoted"
          maxLength={200}
        />
        <span className="field-hint">Kiba will remind you of them. That&apos;s the point.</span>
      </label>

      <label className="field-label" style={{ marginTop: 20 }}>
        What would public failure look like for you?
        <input
          type="text"
          className="input"
          value={data.public_failure_scenario}
          onChange={e => onChange({ public_failure_scenario: e.target.value })}
          placeholder="e.g. Having to admit to my family I quit again, my friends finding out I didn't follow through"
          maxLength={300}
        />
      </label>

      <label className="field-label" style={{ marginTop: 20 }}>
        When do you usually give up?
        <input
          type="text"
          className="input"
          value={data.typical_failure_moment}
          onChange={e => onChange({ typical_failure_moment: e.target.value })}
          placeholder="e.g. After the first week, when things get hard, on Sunday evenings, when I hit a setback"
          maxLength={200}
        />
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
      </div>

      <div className="btn-row" style={{ marginTop: 32 }}>
        <button className="btn-secondary" onClick={onBack} type="button">← Back</button>
        <button className="btn-primary" onClick={onNext} disabled={!canContinue} type="button">
          Continue →
        </button>
      </div>
    </div>
  );
}
