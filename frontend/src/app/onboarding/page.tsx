'use client';
import { useState } from 'react';
import Step1Goals from '../../components/OnboardingForm/Step1Goals';
import Step2PsychIntake from '../../components/OnboardingForm/Step2PsychIntake';
import Step4Contact from '../../components/OnboardingForm/Step4Contact';
import Step5Payment from '../../components/OnboardingForm/Step5Payment';

type PressurePreference = 'pressure' | 'encouragement';

type FormState = {
  // Step 1
  goal_description: string;
  goal_timeline: string;
  current_status: string;
  checkin_time: string;
  // Step 2
  fears: string;
  avoidance_patterns: string;
  comparison_figure: string;
  public_failure_scenario: string;
  typical_failure_moment: string;
  pressure_preference: PressurePreference | '';
  // Step 3
  name: string;
  phone_number: string;
};

const STEPS = ['Goal', 'Psychology', 'Contact', 'Trial'];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<FormState>({
    goal_description: '',
    goal_timeline: '',
    current_status: '',
    checkin_time: '',
    fears: '',
    avoidance_patterns: '',
    comparison_figure: '',
    public_failure_scenario: '',
    typical_failure_moment: '',
    pressure_preference: '',
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
          <h2>You&apos;re in.</h2>
          <p>Kiba will text you at <strong style={{ color: '#fafafa' }}>{form.checkin_time}</strong> every day starting tomorrow. Be ready to prove you did the work.</p>
          <div style={{ margin: '24px 0', padding: '20px', background: '#18181b', borderRadius: 12, border: '1px solid #3f3f46', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#71717a', marginBottom: 8 }}>Kiba will reach you at</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fafafa', letterSpacing: 1 }}>{form.phone_number}</div>
          </div>
          <p className="success-hint">No app needed. No login. Just respond to Kiba&apos;s texts with proof of your work.</p>
        </div>
      </div>
    );
  }

  // Build the payload for Step5Payment
  const paymentPayload: Record<string, unknown> = {
    ...form,
    goals: form.goal_description,
    coaching_focus: 'combined',
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        <div className="logo-small">KIBA <span>AI</span></div>
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
        {step === 1 && <Step2PsychIntake data={form} onChange={update} onNext={next} onBack={back} />}
        {step === 2 && <Step4Contact data={form} onChange={update} onNext={next} onBack={back} />}
        {step === 3 && <Step5Payment formData={paymentPayload} onSuccess={() => setDone(true)} onBack={back} />}
      </div>

      <style jsx>{`
        .onboarding-container {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 24px; background: radial-gradient(ellipse at 50% 0%, rgba(225,29,72,0.08) 0%, #09090b 60%);
        }
        .onboarding-card {
          background: linear-gradient(160deg, #141414 0%, #0f0f0f 100%);
          border: 1px solid rgba(225,29,72,0.22); border-radius: 24px;
          padding: 40px; width: 100%; max-width: 560px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
        }
        .logo-small {
          font-family: 'Cormorant Garamond', serif; font-size: 13px; font-weight: 700; letter-spacing: 3px;
          text-transform: uppercase; color: rgba(248,246,242,0.35); margin-bottom: 28px;
          display: flex; align-items: center; gap: 6px;
        }
        .logo-small span { color: #fb7185; }
        .progress-bar {
          display: flex; justify-content: space-between; margin-bottom: 36px; position: relative;
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
        .success-card {
          text-align: center; background: linear-gradient(160deg,#141414,#0f0f0f);
          border: 1px solid rgba(225,29,72,0.22); border-radius: 24px; padding: 52px;
          max-width: 420px; box-shadow: 0 24px 60px rgba(0,0,0,0.5);
          animation: stepIn 0.4s ease both;
        }
        .success-icon { font-size: 52px; margin-bottom: 20px; }
        .success-card h2 { font-family: 'Cormorant Garamond', serif; font-size: 30px; color: #fafafa; margin-bottom: 14px; }
        .success-card p { font-size: 15px; color: #a1a1aa; line-height: 1.65; }
        .success-hint { font-size: 13px; margin-top: 14px; color: #6b7280; }
        @keyframes stepIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @media(max-width:600px){
          .onboarding-card { padding: 28px 18px !important; border-radius: 16px !important; }
          .success-card { padding: 36px 20px !important; border-radius: 16px !important; }
        }
        @media(max-width:400px){
          .onboarding-card { padding: 22px 14px !important; }
        }
      `}</style>

      <style jsx global>{`
        .step { animation: stepIn 0.3s ease both; }
        @keyframes stepIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .step h2 { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; color: #fafafa; margin-bottom: 6px; line-height: 1.3; }
        .step-desc { font-size: 14px; color: #a1a1aa; margin-bottom: 28px; line-height: 1.6; }
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
        .field-label { display: flex; flex-direction: column; gap: 7px; font-size: 13px; font-weight: 500; color: #d1d5db; margin-bottom: 18px; }
        .input, .textarea {
          background: #181818; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
          padding: 11px 14px; color: #fafafa; font-size: 14px; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s; width: 100%;
        }
        .input:focus, .textarea:focus {
          border-color: rgba(225,29,72,0.6); box-shadow: 0 0 0 3px rgba(225,29,72,0.12);
        }
        .textarea { resize: vertical; font-family: inherit; line-height: 1.5; }
        .field-error { font-size: 12px; color: #fca5a5; margin-top: 4px; }
        .field-hint { font-size: 12px; color: #6b7280; margin-top: 5px; line-height: 1.4; }
        .btn-primary {
          background: linear-gradient(135deg, #e11d48, #8b5cf6); color: white;
          border: none; border-radius: 12px; padding: 13px 26px; font-size: 14px;
          font-weight: 600; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
          box-shadow: 0 4px 14px rgba(225,29,72,0.35);
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(139,92,246,0.4); }
        .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
        .btn-secondary {
          background: transparent; color: #a1a1aa;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          padding: 13px 20px; font-size: 14px; cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .btn-secondary:hover { border-color: rgba(255,255,255,0.2); color: #d1d5db; }
        .btn-row { display: flex; justify-content: space-between; margin-top: 10px; gap: 10px; }
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
        @media(max-width:480px){
          .focus-grid { grid-template-columns: 1fr !important; }
          .step h2 { font-size: 22px; }
          .btn-row { flex-direction: column-reverse; }
          .btn-secondary { text-align: center; }
        }
      `}</style>
    </div>
  );
}
