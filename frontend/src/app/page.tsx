import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px' }}>
      <p style={{ fontFamily: 'serif', fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(248,246,242,0.4)', marginBottom: 24 }}>
        RYKE <span style={{ color: '#a78bfa' }}>AI</span>
      </p>
      <h1 style={{ fontFamily: 'serif', fontSize: 'clamp(2.4rem,5vw,4rem)', color: '#f8f6f2', marginBottom: 20, lineHeight: 1.15 }}>
        The mentor you never had.<br />
        <em style={{ color: '#a78bfa', fontStyle: 'italic' }}>The results you always wanted.</em>
      </h1>
      <p style={{ fontSize: 17, color: '#9ca3af', maxWidth: 480, marginBottom: 40, lineHeight: 1.7 }}>
        SMS-first AI coaching for fitness, nutrition, and mental wellness. No app. No login. Just results — straight to your messages.
      </p>
      <Link href="/onboarding" style={{ background: '#7c3aed', color: 'white', textDecoration: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 16, fontWeight: 600 }}>
        Start Free Trial →
      </Link>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 16 }}>1-month free • No app download • Works on any phone</p>
    </main>
  );
}
