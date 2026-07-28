'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Palette mirrors src/app/plan/page.tsx so checkout → success reads as one flow
// rather than two different products.
const BG = '#050d1a';
const S1 = '#0c1829';
const S2 = '#081422';
const TX = '#f0f9ff';
const MT = '#7eb4cc';
const DIM = '#3a6080';
const R = '#0ea5e9';
const V = '#10b981';
const GRAD = `linear-gradient(135deg,${R},${V})`;
const GLOW = (a: number) => `rgba(14,165,233,${a})`;

/**
 * KIBA's outbound number, in E.164. Configurable because it differs between the
 * SendBlue (iMessage) line and any Twilio fallback — hardcoding it would send
 * paying users into a thread with a number that never replies.
 */
const KIBA_NUMBER = process.env.NEXT_PUBLIC_KIBA_SMS_NUMBER ?? '+14695634418';

/** What we drop into their composer. Short on purpose — the goal is that the
 * only thing left to do is hit send. */
const PREFILL = 'hey';

/** Pretty-print E.164 for the desktop fallback line: +14695634418 → (469) 563-4418. */
function displayNumber(e164: string): string {
  const d = e164.replace(/\D/g, '');
  const local = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (local.length !== 10) return e164;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

export default function OnboardingSuccessPage() {
  // iOS wants `sms:+1555…&body=`, Android wants `?body=`. Start on the Android
  // form (it's what the server renders, so hydration matches) and correct it on
  // mount once navigator is actually available.
  const [smsHref, setSmsHref] = useState(
    `sms:${KIBA_NUMBER}?body=${encodeURIComponent(PREFILL)}`,
  );

  useEffect(() => {
    const ua = navigator.userAgent;
    const isApple = /iPad|iPhone|iPod|Macintosh/.test(ua);
    if (isApple) {
      setSmsHref(`sms:${KIBA_NUMBER}&body=${encodeURIComponent(PREFILL)}`);
    }
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `radial-gradient(ellipse at 50% 0%, ${GLOW(0.12)} 0%, ${BG} 60%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px 40px',
        color: TX,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '-0.5px',
            textAlign: 'center',
            marginBottom: 28,
          }}
        >
          KIBA
        </div>

        <div
          style={{
            background: `linear-gradient(160deg, ${S1}, ${S2})`,
            border: `1px solid ${GLOW(0.22)}`,
            borderRadius: 20,
            padding: '38px 26px 30px',
            textAlign: 'center',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: GRAD,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 22px',
              boxShadow: `0 8px 28px ${GLOW(0.4)}`,
              fontSize: 26,
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            ✓
          </div>

          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 'clamp(30px,8vw,38px)',
              fontWeight: 700,
              letterSpacing: '-1px',
              lineHeight: 1.1,
              marginBottom: 14,
            }}
          >
            You&apos;re in.
          </h1>

          <p style={{ fontSize: 15, color: MT, lineHeight: 1.7, marginBottom: 30 }}>
            KIBA just texted you. Everything happens right there in your messages — no app to
            download, no login, nothing else to set up.
          </p>

          <a
            href={smsHref}
            style={{
              display: 'block',
              width: '100%',
              padding: '18px 24px',
              borderRadius: 14,
              background: GRAD,
              color: '#fff',
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '0.3px',
              textDecoration: 'none',
              boxShadow: `0 10px 34px ${GLOW(0.42)}`,
            }}
          >
            Open KIBA in Messages
          </a>

          <p style={{ fontSize: 13, color: DIM, marginTop: 14, lineHeight: 1.6 }}>
            Tap it and say hey. That&apos;s the whole setup.
          </p>

          <div
            style={{
              marginTop: 26,
              paddingTop: 22,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: 13,
              color: MT,
              lineHeight: 1.65,
            }}
          >
            No text yet? Give it a minute, then check you&apos;re texting from the same number you
            paid with.
            <div style={{ color: DIM, marginTop: 8 }}>
              KIBA texts from {displayNumber(KIBA_NUMBER)}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <Link
            href="/"
            style={{
              color: DIM,
              fontSize: 13,
              textDecoration: 'none',
              borderBottom: `1px solid ${GLOW(0.18)}`,
              paddingBottom: 2,
            }}
          >
            ← Back to KIBA
          </Link>
        </div>
      </div>
    </div>
  );
}
