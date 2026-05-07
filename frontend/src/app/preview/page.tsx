'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

function FadeIn({ children, delay = 0, style = {} }: {
  children: React.ReactNode; delay?: number; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const AC  = '#B45309';
const BG  = '#FAFAF8';
const S1  = '#F5F0E8';
const S2  = '#EDE7DC';
const TX  = '#1C1917';
const MT  = '#78716C';
const BD  = 'rgba(0,0,0,0.08)';

export default function Preview() {
  const [typingDone, setTypingDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTypingDone(true), 3200);
    return () => clearTimeout(t);
  }, []);

  const MSGS = [
    { who: 'user', text: "I keep starting over. I need accountability.", delay: 0.5 },
    { who: 'ryke', text: "I hear you. What does your week look like?", delay: 1.1 },
    { who: 'user', text: "Evenings are free from 6pm", delay: 1.8 },
    { who: 'ryke', text: "Daily check-in at 6PM starting tomorrow. No gym needed. Ready? 💪", delay: 2.4 },
  ];

  return (
    <>
      {/* preview bar */}
      <div style={{ background: AC, color: '#FAFAF8', textAlign: 'center', padding: '10px 24px', fontSize: 13, fontWeight: 500, letterSpacing: '0.3px' }}>
        Design preview &mdash; share this link with your client for feedback
      </div>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 56px', background: 'rgba(250,250,248,0.96)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${BD}` }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: TX, letterSpacing: '-0.5px' }}>
          Ryke<span style={{ color: AC }}>.ai</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          {([['#how', 'How it works'], ['#coaches', 'For Coaches'], ['#pricing', 'Pricing']] as [string,string][]).map(([href, label]) => (
            <a key={label} href={href} style={{ textDecoration: 'none', color: MT, fontSize: 14 }}>{label}</a>
          ))}
          <Link href="/onboarding" style={{ background: AC, color: 'white', padding: '11px 26px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Start Free Trial
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '92vh', display: 'flex', alignItems: 'center', padding: '80px 56px', background: BG }}>
        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 80, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-block', background: 'rgba(180,83,9,0.08)', color: AC, fontSize: 12, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' as const, padding: '7px 16px', borderRadius: 20, marginBottom: 28 }}>
              Personal coaching &middot; No app needed
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(52px,6vw,84px)', fontWeight: 300, lineHeight: 1.06, letterSpacing: '-2px', color: TX, marginBottom: 24 }}>
              Your goals need<br />
              a coach,<br />
              <em style={{ color: AC, fontStyle: 'italic' }}>not another app.</em>
            </h1>
            <p style={{ fontSize: 18, color: MT, lineHeight: 1.8, maxWidth: 460, marginBottom: 40, fontWeight: 300 }}>
              Ryke is your personal coach over text &mdash; fitness, nutrition, and accountability delivered straight to your messages, 24 hours a day.
            </p>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 32 }}>
              <Link href="/onboarding" style={{ background: AC, color: 'white', padding: '16px 36px', borderRadius: 10, fontSize: 16, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                Start Free Trial &rarr;
              </Link>
              <a href="#how" style={{ color: MT, fontSize: 14, fontWeight: 400, textDecoration: 'none' }}>
                See how it works
              </a>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' as const }}>
              {['1 month free', 'No app download', 'Cancel anytime', 'Any phone'].map(t => (
                <span key={t} style={{ fontSize: 13, color: MT, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: AC }}>&#10003;</span> {t}
                </span>
              ))}
            </div>
          </div>

          {/* phone mockup */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: -20, right: -16, background: 'white', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.09)', zIndex: 10, whiteSpace: 'nowrap' as const, animation: 'floatUp 3s ease-in-out infinite' }}>
              <div style={{ fontSize: 20 }}>&#128293;</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>7-day streak</div>
                <div style={{ fontSize: 11, color: AC }}>Keep it going!</div>
              </div>
            </div>
            <div style={{ position: 'absolute', bottom: -16, left: -20, background: 'white', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.09)', zIndex: 10, whiteSpace: 'nowrap' as const, animation: 'floatUp 3s ease-in-out 1.5s infinite' }}>
              <div style={{ fontSize: 20 }}>&#129367;</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>Meal logged &#10003;</div>
                <div style={{ fontSize: 11, color: '#059669' }}>142 kcal &middot; 18g protein</div>
              </div>
            </div>
            <div style={{ background: 'white', borderRadius: 40, border: '6px solid #EDE7DC', padding: '20px 14px 28px', boxShadow: '0 12px 48px rgba(0,0,0,0.10)' }}>
              <div style={{ width: 60, height: 6, background: S2, borderRadius: 3, margin: '0 auto 16px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: `1px solid ${BD}`, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: AC, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 14 }}>R</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Ryke</div>
                  <div style={{ fontSize: 11, color: '#22c55e' }}>&#9679; Online now</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, minHeight: 210 }}>
                {MSGS.map((m, i) => (
                  <div key={i} style={{
                    padding: '9px 12px',
                    borderRadius: m.who === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                    fontSize: 12, lineHeight: 1.5, maxWidth: '86%',
                    alignSelf: m.who === 'user' ? 'flex-end' : 'flex-start',
                    background: m.who === 'user' ? AC : S1,
                    color: m.who === 'user' ? 'white' : TX,
                    animation: `msgIn 0.35s ease ${m.delay}s both`,
                  }}>{m.text}</div>
                ))}
                {!typingDone && (
                  <div style={{ padding: '9px 12px', borderRadius: '14px 14px 14px 3px', background: S1, alignSelf: 'flex-start', display: 'inline-flex', gap: 4, animation: 'msgIn 0.3s ease 2.9s both' }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: MT, display: 'inline-block', animation: `typingBounce 1.2s ease ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ background: S2, padding: '100px 56px', borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center' as const, marginBottom: 64 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' as const, color: AC, marginBottom: 12 }}>Simple by design</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,4vw,56px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
                Up and running in <em style={{ color: AC, fontStyle: 'italic' }}>minutes.</em>
              </h2>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28 }}>
            {[
              { n: '01', title: 'Tell Ryke your goals', body: 'A 2-minute form &mdash; your focus, health context, and schedule. Ryke remembers everything and tailors every response.' },
              { n: '02', title: 'Get your first text', body: 'Within 30 seconds Ryke texts you first. Already knows your goals and starts with the right question.' },
              { n: '03', title: 'Progress every day', body: 'Text whenever you want &mdash; morning check-ins, post-workout, late-night cravings. Ryke is always on.' },
            ].map((step, i) => (
              <FadeIn key={step.n} delay={i * 120}>
                <div style={{ background: BG, borderRadius: 20, padding: 36, border: `1px solid ${BD}` }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 700, color: AC, opacity: 0.18, lineHeight: 1, marginBottom: 20 }}>{step.n}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: TX, marginBottom: 10, letterSpacing: '-0.3px' }}>{step.title}</div>
                  <p style={{ fontSize: 14, color: MT, lineHeight: 1.75, fontWeight: 300 }} dangerouslySetInnerHTML={{ __html: step.body }} />
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FOR COACHES */}
      <section id="coaches" style={{ background: BG, padding: '100px 56px', borderBottom: `1px solid ${BD}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
          <FadeIn>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' as const, color: AC, marginBottom: 16 }}>For fitness coaches</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,4vw,52px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-1px', color: TX, marginBottom: 20 }}>
              Your clients get answers.<br />
              <em style={{ color: AC, fontStyle: 'italic' }}>You get your</em><br />
              <strong style={{ fontWeight: 700 }}>evenings back.</strong>
            </h2>
            <p style={{ fontSize: 16, color: MT, lineHeight: 1.8, fontWeight: 300, marginBottom: 36 }}>
              Stop answering the same questions at 11pm. Ryke handles your clients 24/7 in your voice and style &mdash; you step in only when it truly matters.
            </p>
            <a href="#pricing" style={{ display: 'inline-block', background: AC, color: 'white', padding: '14px 30px', borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
              See Coach Plans &rarr;
            </a>
          </FadeIn>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            {[
              { n: '01', t: 'Your voice, your style', d: 'Ryke learns how you coach &mdash; your tone, your phrases, your energy. Every text sounds exactly like you.' },
              { n: '02', t: 'Smart scheduling', d: 'Clients text to book. Ryke handles the back and forth, confirms, and sends reminders automatically.' },
              { n: '03', t: 'Instant human handoff', d: 'The moment a client needs real support you get alerted. Jump in within seconds &mdash; they always feel taken care of.' },
            ].map((item, i) => (
              <FadeIn key={item.n} delay={i * 100}>
                <div style={{ background: S1, borderRadius: 16, padding: 26, border: `1px solid ${BD}` }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 700, color: AC, opacity: 0.22, lineHeight: 1, marginBottom: 8 }}>{item.n}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: TX, marginBottom: 6 }}>{item.t}</div>
                  <p style={{ fontSize: 14, color: MT, lineHeight: 1.65, fontWeight: 300 }} dangerouslySetInnerHTML={{ __html: item.d }} />
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ background: S2, padding: '100px 56px', borderBottom: `1px solid ${BD}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center' as const, marginBottom: 64 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' as const, color: AC, marginBottom: 12 }}>Simple pricing</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,4vw,56px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
                Start free. <em style={{ color: AC, fontStyle: 'italic' }}>Scale when ready.</em>
              </h2>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'start' }}>
            {([
              { label: 'Individual', price: 20, sub: 'per month, cancel anytime', features: ['Unlimited coaching texts', 'Fitness, nutrition & wellness', 'Food photo analysis', 'Daily check-ins', 'Crisis safety net'], cta: 'Start Free Trial', href: '/onboarding', featured: false },
              { label: 'Coach Pro', price: 99, sub: 'per month, up to 30 clients', features: ['Your own SMS number', 'Ryke trained in your voice', 'Smart client scheduling', 'Coach dashboard', 'Human handoff alerts', 'Client progress tracking'], cta: 'Start Free Trial', href: '/onboarding', featured: true, badge: 'Most Popular' },
              { label: 'Coach Elite', price: 149, sub: 'per month, unlimited clients', features: ['Everything in Coach Pro', 'Unlimited clients', 'Multiple personas', 'Priority support', 'Custom branding'], cta: 'Contact Us', href: 'mailto:hello@ryke.ai', featured: false },
            ] as { label: string; price: number; sub: string; features: string[]; cta: string; href: string; featured: boolean; badge?: string }[]).map((plan, i) => (
              <FadeIn key={plan.label} delay={i * 80}>
                <div style={{ background: plan.featured ? AC : BG, borderRadius: 20, padding: '40px 32px', border: plan.featured ? 'none' : `1px solid ${BD}`, transform: plan.featured ? 'scale(1.04)' : 'none', boxShadow: plan.featured ? '0 8px 40px rgba(180,83,9,0.2)' : 'none', position: 'relative' }}>
                  {plan.badge && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: TX, color: 'white', fontSize: 11, fontWeight: 600, padding: '4px 16px', borderRadius: 20, whiteSpace: 'nowrap' as const }}>
                      {plan.badge}
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: plan.featured ? 'rgba(250,250,248,0.65)' : MT, marginBottom: 14 }}>{plan.label}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 54, fontWeight: 700, color: plan.featured ? 'white' : TX, lineHeight: 1, marginBottom: 4, letterSpacing: '-2px' }}>
                    <sup style={{ fontSize: 22, verticalAlign: 'top', marginTop: 12, display: 'inline-block' }}>$</sup>{plan.price}
                  </div>
                  <div style={{ fontSize: 13, color: plan.featured ? 'rgba(250,250,248,0.55)' : MT, marginBottom: 28 }}>{plan.sub}</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ fontSize: 14, color: plan.featured ? 'rgba(250,250,248,0.82)' : MT, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 300 }}>
                        <span style={{ color: plan.featured ? 'rgba(250,250,248,0.6)' : AC, fontSize: 12, flexShrink: 0 }}>&#10003;</span> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.href} style={{ display: 'block', textAlign: 'center' as const, padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', boxSizing: 'border-box' as const, background: plan.featured ? 'white' : AC, color: plan.featured ? AC : 'white' }}>
                    {plan.cta}
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: BG, borderTop: `1px solid ${BD}`, padding: '36px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: TX }}>
          Ryke<span style={{ color: AC }}>.ai</span>
        </div>
        <div style={{ fontSize: 13, color: MT }}>&copy; 2026 Ryke.ai. All rights reserved.</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy', 'Terms', 'Contact'].map(l => (
            <a key={l} href="#" style={{ fontSize: 13, color: MT, textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
      </footer>

      <style>{`
        @keyframes msgIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes floatUp { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-7px); } }
        @keyframes typingBounce { 0%,80%,100% { transform:translateY(0); opacity:.3; } 40% { transform:translateY(-4px); opacity:1; } }
        @media(max-width:900px){ nav { padding:16px 24px; } section { padding-left:24px; padding-right:24px; } }
      `}</style>
    </>
  );
}