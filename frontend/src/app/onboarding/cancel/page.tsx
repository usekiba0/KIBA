'use client';
import Link from 'next/link';

export default function OnboardingCancelPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, rgba(14,165,233,0.1) 0%, #050d1a 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'linear-gradient(160deg, #0c1829, #081422)', border: '1px solid rgba(14,165,233,0.22)', borderRadius: 24, padding: 52, maxWidth: 460, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 44, marginBottom: 20 }}>👋</div>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: '#f0f9ff', marginBottom: 14 }}>No worries — payment cancelled.</h2>
        <p style={{ fontSize: 15, color: '#7eb4cc', lineHeight: 1.65 }}>
          Your chat with Kiba is still there. The link stays valid — text Kiba whenever you&apos;re ready and we&apos;ll resend it.
        </p>
        <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{ background: 'linear-gradient(135deg,#0ea5e9,#10b981)', color: '#fff', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 14px rgba(14,165,233,0.35)' }}>
            Back to usekiba.ai
          </Link>
          <Link href="/onboarding" style={{ background: 'transparent', color: '#7eb4cc', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 500, textDecoration: 'none', border: '1px solid rgba(14,165,233,0.2)' }}>
            Try the web form instead
          </Link>
        </div>
      </div>
    </div>
  );
}
