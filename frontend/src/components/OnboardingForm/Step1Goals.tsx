'use client';

type CoachingFocus = 'fitness' | 'nutrition' | 'wellness' | 'combined';

interface Props {
  data: { coaching_focus: CoachingFocus; goals: string };
  onChange: (data: Partial<Props['data']>) => void;
  onNext: () => void;
}

const FOCUS_OPTIONS: { value: CoachingFocus; label: string; desc: string }[] = [
  { value: 'fitness', label: '💪 Fitness', desc: 'Workouts, strength, consistency' },
  { value: 'nutrition', label: '🥗 Nutrition', desc: 'Eating habits, macros, meal planning' },
  { value: 'wellness', label: '🧘 Wellness', desc: 'Stress, sleep, mental health' },
  { value: 'combined', label: '⚡ All of the above', desc: 'Holistic health coaching' },
];

export default function Step1Goals({ data, onChange, onNext }: Props) {
  return (
    <div className="step">
      <h2>What do you want to work on?</h2>
      <p className="step-desc">Pick your primary coaching focus. You can always expand later.</p>
      <div className="focus-grid">
        {FOCUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`focus-card ${data.coaching_focus === opt.value ? 'selected' : ''}`}
            onClick={() => onChange({ coaching_focus: opt.value })}
            type="button"
          >
            <span className="focus-label">{opt.label}</span>
            <span className="focus-desc">{opt.desc}</span>
          </button>
        ))}
      </div>
      <label className="field-label">
        Tell me your #1 goal
        <textarea
          value={data.goals}
          onChange={e => onChange({ goals: e.target.value })}
          placeholder="e.g. I want to build a consistent workout habit and lose 10 lbs without giving up after a week"
          rows={3}
          className="textarea"
        />
      </label>
      <button
        className="btn-primary"
        onClick={onNext}
        disabled={!data.coaching_focus || !data.goals.trim()}
        type="button"
      >
        Continue →
      </button>
    </div>
  );
}
