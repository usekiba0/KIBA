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
        .onboarding-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: #080808; }
        .onboarding-card { background: #111; border: 1px solid rgba(124,58,237,0.2); border-radius: 20px; padding: 40px; width: 100%; max-width: 520px; }
        .logo-small { font-family: serif; font-size: 14px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(248,246,242,0.4); margin-bottom: 24px; }
        .logo-small span { color: #a78bfa; }
        .progress-bar { display: flex; justify-content: space-between; margin-bottom: 36px; position: relative; }
        .progress-bar::before { content: ''; position: absolute; top: 14px; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.08); }
        .progress-step { display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative; z-index: 1; }
        .progress-dot { width: 28px; height: 28px; border-radius: 50%; background: #1a1a1a; border: 2px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #666; }
        .progress-step.active .progress-dot { border-color: #7c3aed; background: rgba(124,58,237,0.2); color: #a78bfa; }
        .progress-step.done .progress-dot { background: #7c3aed; border-color: #7c3aed; color: white; }
        .progress-label { font-size: 10px; color: #666; letter-spacing: 0.5px; }
        .progress-step.active .progress-label { color: #a78bfa; }
        :global(.step h2) { font-family: serif; font-size: 24px; font-weight: 600; color: #f8f6f2; margin-bottom: 8px; }
        :global(.step-desc) { font-size: 14px; color: #9ca3af; margin-bottom: 24px; }
        :global(.focus-grid) { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        :global(.focus-card) { background: #1a1a1a; border: 2px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; text-align: left; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; gap: 4px; }
        :global(.focus-card.selected) { border-color: #7c3aed; background: rgba(124,58,237,0.1); }
        :global(.focus-label) { font-size: 14px; font-weight: 600; color: #f8f6f2; }
        :global(.focus-desc) { font-size: 12px; color: #9ca3af; }
        :global(.field-label) { display: flex; flex-direction: column; gap: 8px; font-size: 13px; font-weight: 500; color: #d1d5db; margin-bottom: 16px; }
        :global(.optional) { font-weight: 400; color: #6b7280; font-size: 12px; }
        :global(.input), :global(.textarea) { background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px 14px; color: #f8f6f2; font-size: 14px; outline: none; transition: border-color 0.2s; width: 100%; }
        :global(.input:focus), :global(.textarea:focus) { border-color: rgba(124,58,237,0.5); }
        :global(.textarea) { resize: vertical; font-family: inherit; }
        :global(.field-row) { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        :global(.field-error) { font-size: 12px; color: #fca5a5; margin-top: 4px; }
        :global(.field-hint) { font-size: 12px; color: #6b7280; margin-top: 4px; }
        :global(.btn-primary) { background: #7c3aed; color: white; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        :global(.btn-primary:hover:not(:disabled)) { background: #6d28d9; }
        :global(.btn-primary:disabled) { opacity: 0.4; cursor: not-allowed; }
        :global(.btn-secondary) { background: transparent; color: #9ca3af; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px 20px; font-size: 14px; cursor: pointer; }
        :global(.btn-row) { display: flex; justify-content: space-between; margin-top: 8px; }
        :global(.tags-input) { display: flex; flex-wrap: wrap; gap: 6px; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px; min-height: 42px; }
        :global(.tag) { background: rgba(124,58,237,0.15); color: #a78bfa; border: 1px solid rgba(124,58,237,0.3); border-radius: 99px; padding: 2px 10px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
        :global(.tag button) { background: none; border: none; color: #a78bfa; cursor: pointer; font-size: 14px; line-height: 1; }
        :global(.tag-input) { background: none; border: none; outline: none; color: #f8f6f2; font-size: 13px; flex: 1; min-width: 120px; }
        :global(.trial-summary) { background: #1a1a1a; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        :global(.trial-row) { display: flex; justify-content: space-between; font-size: 13px; color: #d1d5db; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        :global(.trial-row:last-child) { border-bottom: none; }
        :global(.trial-free) { color: #86efac; font-weight: 600; }
        .success-card { text-align: center; background: #111; border: 1px solid rgba(124,58,237,0.2); border-radius: 20px; padding: 48px; max-width: 400px; }
        .success-icon { font-size: 48px; margin-bottom: 20px; }
        .success-card h2 { font-family: serif; font-size: 28px; color: #f8f6f2; margin-bottom: 12px; }
        .success-card p { font-size: 15px; color: #9ca3af; line-height: 1.6; }
        .success-hint { font-size: 13px; margin-top: 12px; }
      `}</style>
    </div>
  );
}
