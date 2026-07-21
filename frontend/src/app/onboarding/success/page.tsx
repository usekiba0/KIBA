'use client';
import Link from 'next/link';

export default function OnboardingSuccessPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, rgba(14,165,233,0.1) 0%, #050d1a 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'linear-gradient(160deg, #0c1829, #081422)', border: '1px solid rgba(14,165,233,0.22)', borderRadius: 24, padding: 52, maxWidth: 460, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>🎉</div>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: '#f0f9ff', marginBottom: 14 }}>You&apos;re in.</h2>
        <p style={{ fontSize: 15, color: '#7eb4cc', lineHeight: 1.65 }}>
          Payment confirmed. Kiba just texted you to say coaching mode is unlocked.
        </p>
        <p style={{ fontSize: 14, color: '#3a6080', marginTop: 18, lineHeight: 1.6 }}>
          Reply to that text whenever you&apos;re ready to get started — no app, no login, no logging into a dashboard. Kiba lives in your messages.
        </p>
        <div style={{ marginTop: 28, padding: '14px 18px', background: 'rgba(14,165,233,0.06)', borderRadius: 12, border: '1px solid rgba(14,165,233,0.15)', fontSize: 13, color: '#93c5fd', lineHeight: 1.6 }}>
          If you didn&apos;t get a text in the next minute, check that you texted from the same number you paid with.
        </div>
        <div style={{ marginTop: 32 }}>
          <Link href="/" style={{ color: '#7eb4cc', fontSize: 13, textDecoration: 'none', borderBottom: '1px solid rgba(126,180,204,0.3)', paddingBottom: 2 }}>← Back to KIBA</Link>
        </div>
      </div>
    </div>
  );
}
