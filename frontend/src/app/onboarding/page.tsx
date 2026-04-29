'use client';
import { useState } from 'react';
import Step1Goals from '../../components/OnboardingForm/Step1Goals';
import Step2BodyMetrics from '../../components/OnboardingForm/Step2BodyMetrics';
import Step3HealthInfo from '../../components/OnboardingForm/Step3HealthInfo';
import Step4Contact from '../../components/OnboardingForm/Step4Contact';
import Step5Payment from '../../components/OnboardingForm/Step5Payment';

type FormState = {
  coaching_focus: 'fitness' | 'nutrition' | 'wellness' | 'combined';
  goals: string;
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  health_conditions: string[];
  dietary_restrictions: string[];
  injuries?: string;
  name: string;
  phone_number: string;
};

const STEPS = ['Goals', 'Body', 'Health', 'Contact', 'Payment'];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<FormState>({
    coaching_focus: 'fitness',
    goals: '',
    health_conditions: [],
    dietary_restrictions: [],
    name: '',
    phone_number: '',
  });

  const update = (data: Partial<FormState>) => setForm(prev => ({ ...prev, ...data }));
  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  if (done) {
    return (
      <div className="onboarding-container">
        <div className="success-card">
          <div className="success-icon">📱</div>
          <h2>Check your phone!</h2>
          <p>Your coach just texted you. Reply to start your first coaching session.</p>
          <p className="success-hint">Can't see it? Check that {form.phone_number} is correct and try texting us first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        <div className="logo-small">RYKE <span>AI</span></div>
        <div className="progress-bar">
          <div className="progress-track">
            <div className="progress-track-fill" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
          </div>
          {STEPS.map((label, i) => (
            <div key={label} className={`progress-step ${i <= step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="progress-dot">{i < step ? '✓' : i + 1}</div>
              <span className="progress-label">{label}</span>
            </div>
          ))}
        </div>

        {step === 0 && <Step1Goals data={form} onChange={update} onNext={next} />}
        {step === 1 && <Step2BodyMetrics data={form} onChange={update} onNext={next} onBack={back} />}
        {step === 2 && <Step3HealthInfo data={form} onChange={update} onNext={next} onBack={back} />}
        {step === 3 && <Step4Contact data={form} onChange={update} onNext={next} onBack={back} />}
        {step === 4 && <Step5Payment formData={form as Record<string, unknown>} onSuccess={() => setDone(true)} onBack={back} />}
      </div>

      <style jsx>{`
        /* ── Layout ───────────────────────────────────────── */
        .onboarding-container {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 24px; background: radial-gradient(ellipse at 50% 0%, rgba(225,29,72,0.08) 0%, #09090b 60%);
        }
        .onboarding-card {
          background: linear-gradient(160deg, #141414 0%, #0f0f0f 100%);
          border: 1px solid rgba(225,29,72,0.22); border-radius: 24px;
          padding: 40px; width: 100%; max-width: 540px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
        }

        /* ── Logo ─────────────────────────────────────────── */
        .logo-small {
          font-family: serif; font-size: 13px; font-weight: 700; letter-spacing: 3px;
          text-transform: uppercase; color: rgba(248,246,242,0.35); margin-bottom: 28px;
          display: flex; align-items: center; gap: 6px;
        }
        .logo-small span { color: #fb7185; }

        /* ── Progress bar ─────────────────────────────────── */
        .progress-bar {
          display: flex; justify-content: space-between; margin-bottom: 36px;
          position: relative;
        }
        .progress-track {
          position: absolute; top: 13px; left: 14px; right: 14px; height: 2px;
          background: rgba(255,255,255,0.06); border-radius: 2px;
        }
        .progress-track-fill {
          height: 100%; background: linear-gradient(90deg, #e11d48, #8b5cf6);
          border-radius: 2px; transition: width 0.4s ease;
        }
        .progress-step { display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative; z-index: 1; }
        .progress-dot {
          width: 28px; height: 28px; border-radius: 50%; background: #181818;
          border: 2px solid rgba(255,255,255,0.1); display: flex; align-items: center;
          justify-content: center; font-size: 11px; font-weight: 600; color: #555;
          transition: all 0.3s ease;
        }
        .progress-step.active .progress-dot {
          border-color: #e11d48; background: rgba(225,29,72,0.18); color: #8b5cf6;
          box-shadow: 0 0 0 4px rgba(225,29,72,0.12);
        }
        .progress-step.done .progress-dot { background: #e11d48; border-color: #e11d48; color: white; }
        .progress-label { font-size: 10px; color: #555; letter-spacing: 0.5px; text-transform: uppercase; }
        .progress-step.active .progress-label { color: #8b5cf6; }
        .progress-step.done .progress-label { color: #e11d48; }

        /* ── Step entry animation ─────────────────────────── */
        @keyframes stepIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Success screen ───────────────────────────────── */
        .success-card {
          text-align: center; background: linear-gradient(160deg,#141414,#0f0f0f);
          border: 1px solid rgba(225,29,72,0.22); border-radius: 24px; padding: 52px;
          max-width: 420px; box-shadow: 0 24px 60px rgba(0,0,0,0.5);
          animation: stepIn 0.4s ease both;
        }
        .success-icon { font-size: 52px; margin-bottom: 20px; }
        .success-card h2 { font-family: serif; font-size: 30px; color: #fafafa; margin-bottom: 14px; }
        .success-card p { font-size: 15px; color: #a1a1aa; line-height: 1.65; }
        .success-hint { font-size: 13px; margin-top: 14px; color: #6b7280; }
      `}</style>

      <style jsx global>{`
        /* ── Step animation ───────────────────────────────── */
        .step { animation: stepIn 0.3s ease both; }
        @keyframes stepIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Step typography ──────────────────────────────── */
        .step h2 { font-family: serif; font-size: 26px; font-weight: 600; color: #fafafa; margin-bottom: 6px; line-height: 1.3; }
        .step-desc { font-size: 14px; color: #a1a1aa; margin-bottom: 28px; line-height: 1.6; }

        /* ── Coaching focus cards ─────────────────────────── */
        .focus-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 22px; }
        .focus-card {
          background: #181818; border: 2px solid rgba(255,255,255,0.07); border-radius: 14px;
          padding: 16px; text-align: left; cursor: pointer;
          transition: border-color 0.2s, background 0.2s, transform 0.15s;
          display: flex; flex-direction: column; gap: 5px;
        }
        .focus-card:hover { border-color: rgba(225,29,72,0.4); background: rgba(225,29,72,0.06); transform: translateY(-1px); }
        .focus-card.selected { border-color: #e11d48; background: rgba(225,29,72,0.12); }
        .focus-label { font-size: 14px; font-weight: 600; color: #fafafa; }
        .focus-desc { font-size: 12px; color: #a1a1aa; line-height: 1.4; }

        /* ── Form fields ──────────────────────────────────── */
        .field-label { display: flex; flex-direction: column; gap: 7px; font-size: 13px; font-weight: 500; color: #d1d5db; margin-bottom: 18px; }
        .optional { font-weight: 400; color: #6b7280; font-size: 12px; }
        .input, .textarea {
          background: #181818; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
          padding: 11px 14px; color: #fafafa; font-size: 14px; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s; width: 100%;
        }
        .input:focus, .textarea:focus {
          border-color: rgba(225,29,72,0.6);
          box-shadow: 0 0 0 3px rgba(225,29,72,0.12);
        }
        .textarea { resize: vertical; font-family: inherit; line-height: 1.5; }
        .field-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .field-error { font-size: 12px; color: #fca5a5; margin-top: 4px; }
        .field-hint { font-size: 12px; color: #6b7280; margin-top: 5px; line-height: 1.4; }

        /* ── Buttons ──────────────────────────────────────── */
        .btn-primary {
          background: linear-gradient(135deg, #e11d48, #be123c); color: white;
          border: none; border-radius: 12px; padding: 13px 26px; font-size: 14px;
          font-weight: 600; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
          box-shadow: 0 4px 14px rgba(225,29,72,0.35);
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(225,29,72,0.45);
        }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
        .btn-secondary {
          background: transparent; color: #a1a1aa;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          padding: 13px 20px; font-size: 14px; cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .btn-secondary:hover { border-color: rgba(255,255,255,0.2); color: #d1d5db; }
        .btn-row { display: flex; justify-content: space-between; margin-top: 10px; gap: 10px; }

        /* ── Tag input ────────────────────────────────────── */
        .tags-input {
          display: flex; flex-wrap: wrap; gap: 6px;
          background: #181818; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; padding: 8px 10px; min-height: 46px;
          cursor: text; transition: border-color 0.2s, box-shadow 0.2s;
          align-items: center;
        }
        .tags-input:focus-within, .tags-input--open {
          border-color: rgba(225,29,72,0.5);
          box-shadow: 0 0 0 3px rgba(225,29,72,0.1);
        }
        .tag {
          background: rgba(225,29,72,0.18); color: #fda4af;
          border: 1px solid rgba(225,29,72,0.35); border-radius: 99px;
          padding: 3px 10px 3px 12px; font-size: 12px; font-weight: 500;
          display: flex; align-items: center; gap: 5px; line-height: 1.4;
          transition: background 0.15s;
        }
        .tag:hover { background: rgba(225,29,72,0.25); }
        .tag button {
          background: none; border: none; color: rgba(196,181,253,0.6);
          cursor: pointer; font-size: 15px; line-height: 1; padding: 0;
          display: flex; align-items: center; transition: color 0.15s;
        }
        .tag button:hover { color: #fca5a5; }
        .tag-input {
          background: none; border: none; outline: none;
          color: #fafafa; font-size: 13px; min-width: 120px;
          padding: 2px 0; line-height: 1.5;
        }
        .tag-input::placeholder { color: #555; }

        /* ── Autocomplete dropdown ────────────────────────── */
        .ac-dropdown {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0;
          background: #1c1c1e; border: 1px solid rgba(225,29,72,0.3);
          border-radius: 12px; overflow: hidden; z-index: 200;
          box-shadow: 0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
          max-height: 280px; overflow-y: auto;
        }
        .ac-dropdown::-webkit-scrollbar { width: 4px; }
        .ac-dropdown::-webkit-scrollbar-track { background: transparent; }
        .ac-dropdown::-webkit-scrollbar-thumb { background: rgba(225,29,72,0.3); border-radius: 2px; }
        .ac-option {
          padding: 10px 14px; font-size: 13px; color: #c9cdd5; cursor: pointer;
          transition: background 0.1s, color 0.1s; border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .ac-option:last-child { border-bottom: none; }
        .ac-option--hl, .ac-option:hover { background: rgba(225,29,72,0.14); color: #e5e7eb; }
        .ac-option mark {
          background: none; color: #8b5cf6; font-weight: 600;
        }
        .ac-option--add {
          color: #8b5cf6; border-top: 1px solid rgba(225,29,72,0.15) !important;
          display: flex; align-items: center; gap: 8px; font-weight: 500;
        }
        .ac-add-icon {
          width: 18px; height: 18px; background: rgba(225,29,72,0.25);
          border-radius: 50%; display: inline-flex; align-items: center;
          justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0;
        }

        /* ── Health section sub-layout ────────────────────── */
        .health-section { margin-bottom: 24px; }
        .health-section-header {
          display: flex; align-items: center; gap: 8px; margin-bottom: 5px;
        }
        .health-section-icon { font-size: 16px; }
        .health-section-label {
          font-size: 13px; font-weight: 600; color: #d1d5db;
        }
        .health-section-hint {
          font-size: 12px; color: #6b7280; margin-bottom: 10px; line-height: 1.45;
        }

        /* ── Trial summary ────────────────────────────────── */
        .trial-summary {
          background: #181818; border-radius: 14px; padding: 18px;
          margin-bottom: 18px; border: 1px solid rgba(255,255,255,0.06);
        }
        .trial-row {
          display: flex; justify-content: space-between; font-size: 13px;
          color: #d1d5db; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .trial-row:last-child { border-bottom: none; }
        .trial-free { color: #86efac; font-weight: 600; }
      `}</style>
    </div>
  );
}
