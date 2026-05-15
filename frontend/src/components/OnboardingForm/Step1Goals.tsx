'use client';
import { useState, useEffect } from 'react';

interface Props {
  data: {
    goal_description: string;
    goal_timeline: string;
    current_status: string;
    checkin_time: string;
    utc_offset_minutes: number | null;
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

const TIMEZONE_OPTIONS: { label: string; offset: number }[] = [
  { label: 'UTC−12 (Baker Island)', offset: -720 },
  { label: 'UTC−11 (Samoa)', offset: -660 },
  { label: 'UTC−10 (Hawaii)', offset: -600 },
  { label: 'UTC−9 (Alaska)', offset: -540 },
  { label: 'UTC−8 Pacific (PST)', offset: -480 },
  { label: 'UTC−7 Mountain (MST)', offset: -420 },
  { label: 'UTC−6 Central (CST)', offset: -360 },
  { label: 'UTC−5 Eastern (EST)', offset: -300 },
  { label: 'UTC−4 Atlantic (AST)', offset: -240 },
  { label: 'UTC−3 Brasília (BRT)', offset: -180 },
  { label: 'UTC−1 Azores', offset: -60 },
  { label: 'UTC+0 London (GMT)', offset: 0 },
  { label: 'UTC+1 Paris (CET)', offset: 60 },
  { label: 'UTC+2 Cairo (EET)', offset: 120 },
  { label: 'UTC+3 Moscow (MSK)', offset: 180 },
  { label: 'UTC+3:30 Tehran (IRST)', offset: 210 },
  { label: 'UTC+4 Dubai (GST)', offset: 240 },
  { label: 'UTC+4:30 Kabul (AFT)', offset: 270 },
  { label: 'UTC+5 Pakistan (PKT)', offset: 300 },
  { label: 'UTC+5:30 India (IST)', offset: 330 },
  { label: 'UTC+5:45 Nepal (NPT)', offset: 345 },
  { label: 'UTC+6 Bangladesh (BST)', offset: 360 },
  { label: 'UTC+7 Bangkok (ICT)', offset: 420 },
  { label: 'UTC+8 Singapore / China', offset: 480 },
  { label: 'UTC+9 Japan / Korea (JST)', offset: 540 },
  { label: 'UTC+9:30 Adelaide (ACST)', offset: 570 },
  { label: 'UTC+10 Sydney (AEST)', offset: 600 },
  { label: 'UTC+11 Solomon Islands', offset: 660 },
  { label: 'UTC+12 New Zealand (NZST)', offset: 720 },
  { label: 'UTC+13 Samoa (WST)', offset: 780 },
  { label: 'UTC+14 Line Islands', offset: 840 },
];

function timeLabel(t: string): string {
  const [h] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${suffix}`;
}

function closestTzOption(offset: number) {
  return TIMEZONE_OPTIONS.reduce((best, opt) =>
    Math.abs(opt.offset - offset) < Math.abs(best.offset - offset) ? opt : best
  );
}

export default function Step1Goals({ data, onChange, onNext }: Props) {
  const [attempted, setAttempted] = useState(false);

  // Auto-detect timezone from browser on first render
  useEffect(() => {
    if (data.utc_offset_minutes === null) {
      const detected = -new Date().getTimezoneOffset();
      onChange({ utc_offset_minutes: closestTzOption(detected).offset });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canContinue =
    data.goal_description.trim().length >= 10 &&
    data.goal_timeline.length > 0 &&
    data.current_status.trim().length >= 5 &&
    data.checkin_time.length > 0 &&
    data.utc_offset_minutes !== null;

  function handleNext() {
    if (!canContinue) { setAttempted(true); return; }
    onNext();
  }

  const selectedTz = data.utc_offset_minutes !== null
    ? closestTzOption(data.utc_offset_minutes)
    : null;

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
          <span className="field-error">Be more specific — describe what success actually looks like</span>
        )}
        {attempted && !data.goal_description.trim() && (
          <span className="field-error">This field is required</span>
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
        {attempted && !data.goal_timeline && (
          <span className="field-error">Choose a timeline for your goal</span>
        )}
      </div>

      <label className="field-label" style={{ marginTop: 24 }}>
        Where are you right now?
        <textarea
          className="textarea"
          value={data.current_status}
          onChange={e => onChange({ current_status: e.target.value })}
          placeholder="e.g. I have the idea but haven't started. I run occasionally but never consistently."
          rows={2}
        />
        {data.current_status && data.current_status.trim().length < 5 && (
          <span className="field-error">Add a bit more detail about where you are now</span>
        )}
        {attempted && !data.current_status.trim() && (
          <span className="field-error">This field is required</span>
        )}
      </label>

      <div className="field-label" style={{ marginTop: 24 }}>
        Daily check-in time
        <p style={{ fontSize: 13, color: '#3a6080', marginTop: 4, marginBottom: 10 }}>
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
        {attempted && !data.checkin_time && (
          <span className="field-error" style={{ marginTop: 8, display: 'block' }}>Choose your daily check-in time</span>
        )}
      </div>

      <div className="field-label" style={{ marginTop: 24 }}>
        Your timezone
        <p style={{ fontSize: 13, color: '#3a6080', marginTop: 4, marginBottom: 10 }}>
          So Kiba texts you at the right local time — not 3am.
        </p>
        <select
          className="input"
          value={selectedTz?.offset ?? ''}
          onChange={e => onChange({ utc_offset_minutes: Number(e.target.value) })}
          style={{ cursor: 'pointer' }}
        >
          <option value="" disabled>Select your timezone</option>
          {TIMEZONE_OPTIONS.map(tz => (
            <option key={tz.offset} value={tz.offset}>{tz.label}</option>
          ))}
        </select>
        {attempted && data.utc_offset_minutes === null && (
          <span className="field-error" style={{ marginTop: 8, display: 'block' }}>Choose your timezone</span>
        )}
      </div>

      <button
        className="btn-primary"
        onClick={handleNext}
        type="button"
        style={{ marginTop: 32 }}
      >
        Continue →
      </button>
    </div>
  );
}
