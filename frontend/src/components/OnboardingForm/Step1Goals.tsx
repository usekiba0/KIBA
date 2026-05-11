'use client';

interface Props {
  data: {
    goal_description: string;
    goal_timeline: string;
    current_status: string;
    checkin_time: string;
  };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
}

const TIMELINE_OPTIONS = [
  { value: '30 days', label: '30 days', desc: 'Sprint — intense and short' },
  { value: '90 days', label: '90 days', desc: 'Quarter — meaningful change' },
  { value: '6 months', label: '6 months', desc: 'Transformation — deep results' },
  { value: '1 year', label: '1 year', desc: 'Life change — full commitment' },
];

const CHECKIN_TIMES = [
  '06:00', '07:00', '08:00', '09:00', '10:00',
  '12:00', '17:00', '18:00', '19:00', '20:00', '21:00',
];

function timeLabel(t: string): string {
  const [h] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${suffix}`;
}

export default function Step1Goals({ data, onChange, onNext }: Props) {
  const canContinue =
    data.goal_description.trim().length >= 10 &&
    data.goal_timeline.length > 0 &&
    data.current_status.trim().length >= 5 &&
    data.checkin_time.length > 0;

  return (
    <div className="step">
      <h2>What are you building toward?</h2>
      <p className="step-desc">Be specific. Vague goals get vague results.</p>

      <label className="field-label">
        Your goal
        <textarea
          className="textarea"
          value={data.goal_description}
          onChange={e => onChange({ goal_description: e.target.value })}
          placeholder="e.g. Launch my SaaS product, run a half marathon, write my thesis — be specific about what success looks like"
          rows={3}
        />
        {data.goal_description && data.goal_description.trim().length < 10 && (
          <span className="field-error">Be more specific — at least 10 characters</span>
        )}
      </label>

      <div className="field-label" style={{ marginTop: 24 }}>
        Timeline
        <div className="focus-grid" style={{ marginTop: 10 }}>
          {TIMELINE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`focus-card ${data.goal_timeline === opt.value ? 'selected' : ''}`}
              onClick={() => onChange({ goal_timeline: opt.value })}
              type="button"
            >
              <span className="focus-label">{opt.label}</span>
              <span className="focus-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="field-label" style={{ marginTop: 24 }}>
        Where are you right now?
        <textarea
          className="textarea"
          value={data.current_status}
          onChange={e => onChange({ current_status: e.target.value })}
          placeholder="e.g. I have the idea but haven't started. I run occasionally but never consistently. I've been meaning to start for months."
          rows={2}
        />
      </label>

      <div className="field-label" style={{ marginTop: 24 }}>
        Daily check-in time
        <p style={{ fontSize: 13, color: '#71717a', marginTop: 4, marginBottom: 10 }}>
          Kiba texts you at this time every day. Pick when you want to be held accountable.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CHECKIN_TIMES.map(t => (
            <button
              key={t}
              className={`focus-card ${data.checkin_time === t ? 'selected' : ''}`}
              style={{ padding: '10px 16px', minWidth: 80, textAlign: 'center' }}
              onClick={() => onChange({ checkin_time: t })}
              type="button"
            >
              <span className="focus-label" style={{ fontSize: 13 }}>{timeLabel(t)}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn-primary"
        onClick={onNext}
        disabled={!canContinue}
        type="button"
        style={{ marginTop: 32 }}
      >
        Continue →
      </button>
    </div>
  );
}
