'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const SmsDemo = dynamic(() => import('../../components/SmsDemoLight'), { ssr: false });
const FaqAccordion = dynamic(() => import('../../components/FaqAccordion'), { ssr: false });

// ── Animated counter ────────────────────────────────────────
function Counter({ to, suffix = '', duration = 1800 }: { to: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start: number | null = null;
      const step = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / duration, 1);
        setVal(Math.floor(p * to));
        if (p < 1) requestAnimationFrame(step); else setVal(to);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

// ── Fade-in on scroll ───────────────────────────────────────
function FadeIn({ children, delay = 0, style = {} }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(28px)', transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

// ── Colour tokens ────────────────────────────────────────────
const R  = '#B45309';      // amber accent
const RL = '#D97706';      // amber light
const V  = '#B45309';      // same accent (no violet)
const BG = '#FAFAF8';      // warm parchment
const S1 = '#F5F0E8';      // card surface
const S2 = '#EDE7DC';      // alt section
const TX = '#1C1917';      // near-black
const MT = '#78716C';      // muted warm

const GRAD = R;
const GLOW = (_a: number) => 'rgba(180,83,9,0.10)';
const VGLOW = (_a: number) => 'rgba(180,83,9,0.05)';

export default function Preview() {
  const [typingDone, setTypingDone] = useState(false);

  useEffect(() => { const t = setTimeout(() => setTypingDone(true), 3200); return () => clearTimeout(t); }, []);

  const MSGS = [
    { who: 'user', text: '“I’ve been skipping workouts. Help.”', delay: 0.6 },
    { who: 'ryke', text: '“You’re not lazy — you’re overwhelmed. Let’s fix that. What does your week look like?”', delay: 1.1 },
    { who: 'user', text: '“Busy every morning but free at 6pm”', delay: 1.9 },
    { who: 'ryke', text: '“Perfect. 20-min 6PM routine starting tomorrow. No gym needed. You in? 💪”', delay: 2.5 },
  ];

  return (
    <div style={{ background: BG, color: TX }}>
      {/* preview bar */}
      <div style={{ background: R, color: '#FAFAF8', textAlign: 'center', padding: '10px 24px', fontSize: 13, fontWeight: 500, letterSpacing: '0.3px' }}>
        Design preview &mdash; share this link with your client for feedback
      </div>



      {/* ══ NAV ══ */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 48px', background: 'rgba(250,250,248,0.96)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: TX, letterSpacing: '-0.5px' }}>
          Ryke<span style={{ color: RL }}>.ai</span>
        </div>
        <ul style={{ display: 'flex', alignItems: 'center', gap: 40, listStyle: 'none' }}>
          {[['#how', 'How it works'], ['#coaches', 'For Coaches'], ['#pricing', 'Pricing']].map(([h, l]) => (
            <li key={l}><a href={h} style={{ textDecoration: 'none', color: MT, fontSize: 14, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = TX)} onMouseLeave={e => (e.currentTarget.style.color = MT)}>{l}</a></li>
          ))}
          <li><Link href="/onboarding" style={{ background: GRAD, color: 'white', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', boxShadow: `0 4px 14px ${GLOW(0.4)}`, display: 'inline-block' }}>Start Free Trial</Link></li>
        </ul>
      </nav>

      {/* ══ HERO ══ */}
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '140px 48px 80px', position: 'relative', overflow: 'hidden', background: BG }}>
        <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '140%', height: '70%', background: `radial-gradient(ellipse at 50% 0%,${GLOW(0.18)} 0%,${VGLOW(0.08)} 40%,transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${GLOW(0.06)} 1px,transparent 1px),linear-gradient(90deg,${GLOW(0.06)} 1px,transparent 1px)`, backgroundSize: '60px 60px', maskImage: 'radial-gradient(ellipse 90% 90% at 50% 0%,black 0%,transparent 100%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1200, width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', gap: 80, alignItems: 'center', position: 'relative' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: GLOW(0.1), border: `1px solid ${GLOW(0.35)}`, padding: '8px 18px', borderRadius: 30, fontSize: 12, fontWeight: 500, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: RL, marginBottom: 36, animation: 'fadeUp 0.8s ease both' }}>
              <span className="pulse-dot" /> Available 24/7
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(48px,6vw,88px)', fontWeight: 300, lineHeight: 1.05, letterSpacing: '-2.5px', marginBottom: 28, color: TX, animation: 'fadeUp 0.8s ease 0.1s both' }}>
              The mentor<br />
              you <em style={{ fontStyle: 'italic', color: V, fontWeight: 400 }}>never</em> had.<br />
              <strong style={{ fontWeight: 700 }}>The results you</strong><br />
              <strong style={{ fontWeight: 700 }}>always wanted.</strong>
            </h1>
            <p style={{ fontSize: 18, color: MT, maxWidth: 480, lineHeight: 1.75, marginBottom: 48, fontWeight: 300, animation: 'fadeUp 0.8s ease 0.2s both' }}>
              AI coaching for fitness, nutrition, and mental wellness &mdash; delivered straight to your messages. No app. No login. Just results.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const, marginBottom: 48, animation: 'fadeUp 0.8s ease 0.3s both' }}>
              <Link href="/onboarding" style={{ background: GRAD, color: 'white', padding: '17px 40px', borderRadius: 12, fontSize: 16, fontWeight: 600, textDecoration: 'none', boxShadow: `0 8px 32px ${GLOW(0.45)}`, display: 'inline-block' }}>
                Start Free Trial &rarr;
              </Link>
              <a href="#how" style={{ background: 'transparent', color: TX, border: '1px solid rgba(0,0,0,0.12)', display: 'inline-block' }}>
                See how it works
              </a>
            </div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' as const, animation: 'fadeUp 0.8s ease 0.4s both' }}>
              {['&#10003;&nbsp; 1-month free trial', '&#10003;&nbsp; No app download', '&#10003;&nbsp; Cancel anytime', '&#10003;&nbsp; Works on any phone'].map(t => (
                <span key={t} style={{ fontSize: 13, color: MT }} dangerouslySetInnerHTML={{ __html: t }} />
              ))}
            </div>
          </div>

          {/* Phone + floating cards */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', inset: -40, background: `radial-gradient(ellipse at 50% 50%,${GLOW(0.18)} 0%,transparent 70%)`, borderRadius: '50%', animation: 'slowpulse 4s ease-in-out infinite', pointerEvents: 'none' }} />
            <div className="float-card" style={{ position: 'absolute', top: -24, right: -60, background: 'white', backdropFilter: 'blur(16px)', border: `1px solid ${GLOW(0.3)}`, borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.09)', animation: 'floatBadge 3s ease-in-out infinite', zIndex: 10, whiteSpace: 'nowrap' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔥</div>
              <div><div style={{ fontSize: 12, fontWeight: 600, color: TX }}>7-day streak!</div><div style={{ fontSize: 11, color: RL }}>Alex &middot; Fitness plan</div></div>
            </div>
            <div className="float-card" style={{ position: 'absolute', bottom: -20, left: -56, background: 'white', backdropFilter: 'blur(16px)', border: `1px solid ${GLOW(0.3)}`, borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.09)', animation: 'floatBadge 3s ease-in-out 1.5s infinite', zIndex: 10, whiteSpace: 'nowrap' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#065f46,#34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🥗</div>
              <div><div style={{ fontSize: 12, fontWeight: 600, color: TX }}>Meal logged ✓</div><div style={{ fontSize: 11, color: '#34d399' }}>142 kcal &middot; 18g protein</div></div>
            </div>
            <div style={{ width: 290, background: 'white', borderRadius: 42, border: '6px solid #EDE7DC', padding: '22px 16px 30px', boxShadow: `0 0 0 1px ${GLOW(0.25)},0 40px 80px rgba(0,0,0,0.7),0 0 80px ${GLOW(0.1)}`, position: 'relative' }}>
              <div style={{ width: 80, height: 7, background: '#EDE7DC', borderRadius: 4, margin: '0 auto 18px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px 12px', borderBottom: '1px solid rgba(0,0,0,0.07)', marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}>R</div>
                <div><div style={{ fontSize: 13, fontWeight: 500, color: TX }}>Ryke</div><div style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Online now</div></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, minHeight: 200 }}>
                {MSGS.map((m, i) => (
                  <div key={i} style={{ padding: '9px 13px', borderRadius: m.who === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: 12, lineHeight: 1.5, maxWidth: '88%', alignSelf: m.who === 'user' ? 'flex-end' : 'flex-start', background: m.who === 'user' ? GRAD : S1, color: m.who === 'user' ? 'white' : TX, animation: `msgIn 0.4s ease ${m.delay}s both` }}>{m.text}</div>
                ))}
                {!typingDone && (
                  <div style={{ padding: '9px 14px', borderRadius: '16px 16px 16px 4px', background: '#F5F0E8', border: `1px solid ${GLOW(0.18)}`, alignSelf: 'flex-start', display: 'inline-flex', gap: 4, animation: 'msgIn 0.3s ease 3s both' }}>
                    {[0, 1, 2].map(i => <span key={i} className="typing-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ PRESS BAR ══ */}
      <div style={{ background: S2, borderTop: `1px solid ${GLOW(0.1)}`, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '28px 48px', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase' as const, color: MT, textAlign: 'center' as const, marginBottom: 20, fontWeight: 500 }}>As featured in</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap' as const }}>
            {['TechCrunch', 'Forbes', 'Healthline', "Men's Health", 'Well+Good', 'Business Insider'].map(name => (
              <div key={name} style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 600, color: MT, letterSpacing: '-0.3px', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = MT)}
                onMouseLeave={e => (e.currentTarget.style.color = '#3f3f46')}
              >{name}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      <div id="how" style={{ background: S2, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 72 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Simple by design</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,60px)', fontWeight: 300, letterSpacing: '-1.5px', color: TX, lineHeight: 1.1 }}>Up and running in <em style={{ fontStyle: 'italic', color: V }}>minutes.</em></h2>
          </div></FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 32, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 56, left: '18%', right: '18%', height: 1, background: `linear-gradient(90deg,transparent,${GLOW(0.4)},transparent)` }} />
            {[['01', '📋', 'Tell Ryke your goals', 'Fill in a 2-minute form — your focus, body metrics, health context, and dietary needs. Ryke remembers everything.'],
              ['02', '💬', 'Ryke texts you first', 'Your welcome message arrives within 30 seconds. Ryke already knows your goals and leads with a first coaching question.'],
              ['03', '🚀', 'Make progress, daily', 'Text whenever you want — morning, night, mid-workout. Ryke responds, tracks, and adapts to keep you moving forward.']
            ].map(([n, icon, title, desc], i) => (
              <FadeIn key={n} delay={i * 150}>
                <div style={{ background: S1, border: `1px solid ${GLOW(0.15)}`, borderRadius: 20, padding: 36 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: GLOW(0.12), border: `1px solid ${GLOW(0.3)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 24 }}>{icon}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: GLOW(0.4), marginBottom: 6, letterSpacing: 1 }}>{n}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: TX, marginBottom: 12 }}>{title}</div>
                  <p style={{ fontSize: 14, color: MT, lineHeight: 1.7, fontWeight: 300 }}>{desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>

      {/* ══ FEATURES ══ */}
      <section style={{ padding: '100px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <FadeIn><div style={{ marginBottom: 60 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>What Ryke does</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,64px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-1px', color: TX }}>
            Guidance for <em style={{ fontStyle: 'italic', color: V }}>every</em> part<br /><strong style={{ fontWeight: 700 }}>of your life.</strong>
          </h2>
        </div></FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[['💪', 'Fitness & Training', 'Custom workout plans built around your schedule, goals, and equipment. Photo workouts, form tips, progression tracking.'],
            ['🥗', 'Nutrition & Food Photos', 'Snap a meal and Ryke analyses it instantly — calories, macros, health flags, and coaching tips. All over MMS.'],
            ['🧠', 'Mental Wellness', 'Daily check-ins, stress management, motivation — with a built-in crisis detection system that keeps you safe.'],
            ['📅', 'Smart Scheduling', 'Text your availability and Ryke builds your plan, sends reminders, and keeps you accountable every day.'],
            ['🛡️', 'Safety Net', 'Ryke detects distress signals instantly. A human coach is alerted within 5 minutes. Your safety always comes first.'],
            ['🔒', 'Private & Secure', 'End-to-end privacy. No data sharing. No ads. Conversations are yours — encrypted and never used to train AI.']
          ].map(([icon, title, desc], i) => (
            <FadeIn key={title as string} delay={i * 80}>
              <div className="feat-card">
                <div style={{ width: 48, height: 48, background: GLOW(0.1), border: `1px solid ${GLOW(0.2)}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 20 }}>{icon}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, marginBottom: 10, letterSpacing: '-0.3px', color: TX }}>{title}</div>
                <p style={{ fontSize: 14, color: MT, lineHeight: 1.7, fontWeight: 300 }}>{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={200}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: GLOW(0.15), borderRadius: 20, overflow: 'hidden', marginTop: 60, border: `1px solid ${GLOW(0.2)}` }}>
            {[{ n: 24, s: '/7', l: 'Always available' }, { n: 0, s: '', l: 'Apps to download' }, { n: 20, s: '+', l: '$ per month only' }].map(stat => (
              <div key={stat.l} style={{ background: S1, padding: '36px 32px', textAlign: 'center' as const }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 700, color: RL, lineHeight: 1, marginBottom: 8 }}><Counter to={stat.n} suffix={stat.s} /></div>
                <div style={{ fontSize: 13, color: MT, fontWeight: 300 }}>{stat.l}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ══ INTERACTIVE SMS DEMO ══ */}
      <div style={{ background: S2, borderTop: `1px solid ${GLOW(0.1)}`, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '100px 48px' }}>
        <FadeIn><SmsDemo /></FadeIn>
      </div>

      {/* ══ TESTIMONIALS ══ */}
      <div style={{ padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Real results</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,4vw,56px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              People who text <em style={{ fontStyle: 'italic', color: V }}>Ryke</em> every day.
            </h2>
          </div></FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
            {[['Alex M.', 'Software engineer, 32', 'I tried every fitness app. None stuck. Ryke is just a text — I don’t even think about it. I’m 18 lbs down in 3 months.'],
              ['Maya R.', 'Mom of 3, 38', 'I sent Ryke a photo of my dinner and got a full macro breakdown in 10 seconds. It’s like having a nutritionist in my pocket.'],
              ['Jordan T.', 'Personal trainer, 27', 'I use Ryke Coach Pro for all my clients. It answers their questions at 11pm so I don’t have to. Best investment I’ve made.']
            ].map(([name, role, quote], i) => (
              <FadeIn key={name as string} delay={i * 120}>
                <div style={{ background: S1, border: `1px solid ${GLOW(0.2)}`, borderRadius: 20, padding: 36 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                    {Array.from({ length: 5 }).map((_, i) => <span key={i} style={{ color: '#fbbf24', fontSize: 16 }}>&#9733;</span>)}
                  </div>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, fontStyle: 'italic', color: TX, lineHeight: 1.65, marginBottom: 24 }}>&ldquo;{quote}&rdquo;</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: 'white', fontSize: 15 }}>{(name as string)[0]}</div>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{name}</div><div style={{ fontSize: 12, color: MT }}>{role}</div></div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>

      {/* ══ PROBLEM VS SOLUTION ══ */}
      <div style={{ background: S2, borderTop: `1px solid ${GLOW(0.1)}`, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Why Ryke</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,60px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              It&apos;s time to <em style={{ fontStyle: 'italic', color: V }}>actually</em><br /><strong style={{ fontWeight: 700 }}>get healthy.</strong>
            </h2>
          </div></FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <FadeIn>
              <div style={{ background: S1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 20, padding: 40 }}>
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: MT, marginBottom: 28, fontWeight: 600 }}>The Old Way</div>
                {['Real coaching costs $200–$500/month — out of reach for most', 'Health apps are confusing — 90% of people quit within a week', 'Coaches waste hours answering the same questions every day', 'You set goals with no one to hold you accountable', 'Mental health support is siloed from your fitness goals'].map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(239,68,68,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, marginTop: 2, color: '#dc2626' }}>&#10005;</div>
                    <p style={{ fontSize: 14, color: MT, lineHeight: 1.6 }}>{p}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div style={{ background: `linear-gradient(135deg,${GLOW(0.12)},${VGLOW(0.06)})`, border: `1px solid ${GLOW(0.35)}`, borderRadius: 20, padding: 40, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: `radial-gradient(circle,${GLOW(0.2)},transparent 70%)`, pointerEvents: 'none' }} />
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: RL, marginBottom: 28, fontWeight: 600 }}>The Ryke Way</div>
                {['$20/month — 1/10th of a real coach, same personalisation', 'Just text — no apps, no logins, no learning curve ever', 'AI handles 24/7 client questions in the coach’s own voice', 'Daily check-ins, progress tracking, and accountability built in', 'Fitness + nutrition + mental wellness in one conversation'].map(s => (
                  <div key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: GLOW(0.2), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, marginTop: 2, color: RL }}>&#10003;</div>
                    <p style={{ fontSize: 14, color: TX, lineHeight: 1.6 }}>{s}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      {/* ══ COMPARISON TABLE ══ */}
      <div style={{ padding: '100px 48px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>How we compare</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,4vw,56px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              Ryke wins <em style={{ fontStyle: 'italic', color: V }}>every</em> column.
            </h2>
          </div></FadeIn>
          <FadeIn delay={100}>
            <div style={{ borderRadius: 20, overflow: 'hidden', border: `1px solid ${GLOW(0.25)}` }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: `linear-gradient(135deg,${GLOW(0.2)},${VGLOW(0.1)})` }}>
                <div style={{ padding: '18px 24px', fontSize: 13, fontWeight: 600, color: MT }}>Feature</div>
                {['Ryke.ai', 'MyFitnessPal', 'Noom', 'Personal Trainer'].map(h => (
                  <div key={h} style={{ padding: '18px 16px', fontSize: 13, fontWeight: 600, color: h === 'Ryke.ai' ? TX : MT, textAlign: 'center' as const }}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              {[
                ['Monthly price', '$20', 'Free / $19.99', '$70', '$200–500'],
                ['24/7 availability', '✦', '✦', '✕', '✕'],
                ['AI-personalised', '✦', '✕', 'Partial', '✕'],
                ['No app required', '✦', '✕', '✕', '✓'],
                ['Mental wellness', '✦', '✕', '✕', 'Partial'],
                ['Food photo analysis', '✦', '✕', '✕', '✕'],
                ['Crisis safety net', '✦', '✕', '✕', '✕'],
                ['SMS-native', '✦', '✕', '✕', '✕'],
              ].map(([feature, ...vals], ri) => (
                <div key={feature} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: ri % 2 === 0 ? S1 : BG, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ padding: '14px 24px', fontSize: 14, color: TX, fontWeight: 400 }}>{feature}</div>
                  {vals.map((v, vi) => (
                    <div key={vi} style={{ padding: '14px 16px', textAlign: 'center' as const, fontSize: vi === 0 ? 16 : 14, color: vi === 0 ? (v === '✦' ? RL : TX) : v === '✦' ? RL : v === '✕' ? '#3f3f46' : MT, fontWeight: vi === 0 ? 600 : 400 }}>{v}</div>
                  ))}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>

      {/* ══ FOR COACHES ══ */}
      <div id="coaches" style={{ background: S2, borderTop: `1px solid ${GLOW(0.1)}`, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 16, fontWeight: 500 }}>For fitness coaches</div></FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
            <FadeIn>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,4vw,56px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-1px', marginBottom: 24, color: TX }}>
                Your clients get answers.<br /><em style={{ fontStyle: 'italic', color: V }}>You get your</em><br /><strong style={{ fontWeight: 700 }}>life back.</strong>
              </h2>
              <p style={{ fontSize: 16, color: MT, lineHeight: 1.7, fontWeight: 300, marginBottom: 36 }}>Stop answering the same questions at 11pm. Ryke handles your clients 24/7 &mdash; in your voice, your tone, your style. Step in only when it truly matters.</p>
              <a href="#pricing" style={{ display: 'inline-block', background: GRAD, color: 'white', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: 'none', boxShadow: `0 6px 20px ${GLOW(0.4)}` }}>See Coach Plans &rarr;</a>
            </FadeIn>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              {[['01', 'Your AI, your voice', 'Ryke learns your coaching style, phrases, and energy — every text sounds exactly like you.'],
                ['02', 'Smart scheduling', 'Clients text to book. Ryke negotiates, confirms, and sends reminders — you never touch a calendar.'],
                ['03', 'Human handoff', 'Get alerted the moment a client needs real support. Jump in instantly — they never know the difference.']
              ].map(([n, t, d], i) => (
                <FadeIn key={n} delay={i * 100}>
                  <div style={{ background: S1, border: `1px solid ${GLOW(0.15)}`, borderRadius: 16, padding: 28 }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, fontWeight: 700, color: RL, opacity: 0.25, lineHeight: 1, marginBottom: 10 }}>{n}</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: TX }}>{t}</div>
                    <p style={{ fontSize: 14, color: MT, lineHeight: 1.7, fontWeight: 300 }}>{d}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ INTEGRATIONS ══ */}
      <div style={{ padding: '80px 48px', borderBottom: `1px solid ${GLOW(0.1)}` }}>
        <FadeIn><div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' as const }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Integrations</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(28px,4vw,48px)', fontWeight: 300, letterSpacing: '-1px', marginBottom: 12, color: TX }}>Works with the apps you <em style={{ fontStyle: 'italic', color: V }}>already use</em></h2>
          <p style={{ fontSize: 15, color: MT, marginBottom: 40, fontWeight: 300 }}>Ryke pulls data from the tools you already use &mdash; so your mentor always has the full picture.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'center', gap: 12 }}>
            {['&#8987; Apple Watch', '&#10084;&#65039; Apple Health', '&#127939; Strava', '&#128154; WHOOP', '&#128692; Peloton', '&#8987; Garmin', '&#128141; Oura Ring', '&#128197; Google Calendar', '&#128564; 8 Sleep', '&#129503; Calm', '&#127911; Headspace', '&#8987; Fitbit'].map(app => (
              <div key={app} style={{ background: S1, border: `1px solid ${GLOW(0.15)}`, borderRadius: 40, padding: '10px 20px', fontSize: 13, color: TX }} dangerouslySetInnerHTML={{ __html: app }} />
            ))}
          </div>
        </div></FadeIn>
      </div>

      {/* ══ PRICING ══ */}
      <section id="pricing" style={{ padding: '100px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 64 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Simple pricing</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,64px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
            Start free. <em style={{ fontStyle: 'italic', color: V }}>Scale when</em> <strong style={{ fontWeight: 700 }}>you&apos;re ready.</strong>
          </h2>
        </div></FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'start' }}>
          {[
            { label: 'Individual', price: 20, period: 'per month · cancel anytime', features: ['Unlimited texts with Ryke AI', 'Fitness, nutrition & wellness', 'Food photo analysis (MMS)', 'Daily check-ins & reminders', 'Mental health support', 'Crisis detection & safety net'], cta: 'Start Free Trial', href: '/onboarding', featured: false },
            { label: 'Coach Pro', price: 99, period: 'per month · up to 30 clients', features: ['Your own branded SMS number', 'AI trained in your voice & style', 'Smart scheduling for all clients', 'Coach dashboard & analytics', 'Human handoff alerts', 'Client progress tracking', 'Response delay settings'], cta: 'Start Free Trial', href: '/onboarding', featured: true, badge: 'Most Popular' },
            { label: 'Coach Elite', price: 149, period: 'per month · unlimited clients', features: ['Everything in Coach Pro', 'Unlimited client seats', 'Multiple AI personas', 'Priority support', 'Custom branding', 'Early access to new features'], cta: 'Contact Us', href: 'mailto:hello@ryke.ai', featured: false },
          ].map((p, i) => (
            <FadeIn key={p.label} delay={i * 100}>
              <div style={{ background: p.featured ? `linear-gradient(135deg,${GLOW(0.18)},${VGLOW(0.08)})` : S1, border: p.featured ? `1px solid ${R}` : `1px solid ${GLOW(0.2)}`, borderRadius: 22, padding: '44px 34px', position: 'relative', transform: p.featured ? 'scale(1.04)' : 'none', boxShadow: p.featured ? `0 0 50px ${GLOW(0.2)}` : 'none' }}>
                {p.badge && <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: GRAD, color: 'white', fontSize: 11, fontWeight: 600, padding: '4px 18px', borderRadius: 20, letterSpacing: 1, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>{p.badge}</div>}
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: MT, marginBottom: 16 }}>{p.label}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 56, fontWeight: 700, lineHeight: 1, marginBottom: 4, letterSpacing: '-2px', color: TX }}><sup style={{ fontSize: 24, verticalAlign: 'top', marginTop: 12, display: 'inline-block' }}>$</sup>{p.price}</div>
                <div style={{ fontSize: 13, color: MT, marginBottom: 32 }}>{p.period}</div>
                <ul style={{ listStyle: 'none', marginBottom: 36, display: 'flex', flexDirection: 'column' as const, gap: 11 }}>
                  {p.features.map(f => <li key={f} style={{ fontSize: 14, color: MT, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 300 }}><span style={{ color: RL, fontSize: 10, flexShrink: 0 }}>&#10086;</span>{f}</li>)}
                </ul>
                <Link href={p.href as string} style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' as const, background: p.featured ? GRAD : 'transparent', color: p.featured ? 'white' : TX, border: p.featured ? 'none' : '1px solid rgba(0,0,0,0.15)', boxSizing: 'border-box' as const, boxShadow: p.featured ? `0 4px 16px ${GLOW(0.4)}` : 'none' }}>
                  {p.cta} &rarr;
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <div style={{ background: S2, borderTop: `1px solid ${GLOW(0.1)}`, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Questions</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,4vw,56px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              Everything you <em style={{ fontStyle: 'italic', color: V }}>want to know.</em>
            </h2>
          </div></FadeIn>
          <FadeIn delay={100}><FaqAccordion /></FadeIn>
        </div>
      </div>

      {/* ══ MISSION (replaces founder — no name) ══ */}
      <FadeIn>
        <div style={{ padding: '100px 48px', maxWidth: 860, margin: '0 auto', textAlign: 'center' as const }}>
          <div style={{ background: `linear-gradient(135deg,${GLOW(0.1)},${VGLOW(0.05)})`, border: `1px solid ${GLOW(0.25)}`, borderRadius: 24, padding: '60px 64px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, background: `radial-gradient(circle,${GLOW(0.15)},transparent 70%)`, pointerEvents: 'none' }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(20px,2.5vw,30px)', fontWeight: 300, fontStyle: 'italic', lineHeight: 1.6, color: TX, marginBottom: 28 }}>
              &ldquo;Real coaching should be accessible to everyone &mdash; not just people who can afford $300 an hour. Guidance changes lives. That&apos;s why Ryke exists.&rdquo;
            </div>
            <div style={{ fontSize: 14, color: RL, fontWeight: 500, letterSpacing: 1 }}>&mdash; The Ryke.ai Team</div>
          </div>
        </div>
      </FadeIn>

      {/* ══ CTA ══ */}
      <div style={{ textAlign: 'center' as const, padding: '120px 48px', position: 'relative', overflow: 'hidden', background: S2, borderTop: `1px solid ${GLOW(0.1)}` }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 70% at 50% 50%,${GLOW(0.1)},transparent 70%)`, pointerEvents: 'none' }} />
        <FadeIn>
          <h2 style={{ position: 'relative', fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(42px,6vw,80px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-2px', marginBottom: 24, color: TX }}>
            One text changes <em style={{ fontStyle: 'italic', color: V }}>everything.</em>
          </h2>
          <p style={{ position: 'relative', fontSize: 17, color: MT, marginBottom: 48, fontWeight: 300 }}>Start your free 1-month trial today. No app download. No credit card to begin.</p>
          <Link href="/onboarding" style={{ position: 'relative', display: 'inline-block', background: GRAD, color: 'white', padding: '20px 56px', borderRadius: 14, fontSize: 18, fontWeight: 700, textDecoration: 'none', boxShadow: `0 10px 40px ${GLOW(0.5)}`, letterSpacing: '0.3px' }}>
            Start Free Trial &mdash; 1 Month Free &rarr;
          </Link>
          <p style={{ position: 'relative', fontSize: 13, color: MT, marginTop: 20 }}>No credit card required &middot; Cancel anytime &middot; Works on any phone</p>
        </FadeIn>
      </div>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: `1px solid ${GLOW(0.12)}`, padding: '40px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: TX }}>Ryke<span style={{ color: RL }}>.ai</span></div>
        <div style={{ fontSize: 13, color: MT }}>&#169; 2026 Ryke.ai. All rights reserved.</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy', 'Terms', 'Coaches', 'Contact'].map(l => <a key={l} href="#" style={{ fontSize: 13, color: MT, textDecoration: 'none' }}>{l}</a>)}
        </div>
      </footer>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slowpulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}
        @keyframes floatBadge{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        .pulse-dot{width:6px;height:6px;border-radius:50%;background:${RL};display:inline-block;animation:slowpulse 2s infinite;}
        .typing-dot{width:6px;height:6px;border-radius:50%;background:${V};display:inline-block;animation:typingPulse 1.2s infinite;}
        @keyframes typingPulse{0%,80%,100%{opacity:.25;transform:scale(.85)}40%{opacity:1;transform:scale(1)}}
        .feat-card{background:${S1};border:1px solid ${GLOW(0.15)};border-radius:18px;padding:32px;transition:all 0.3s;position:relative;overflow:hidden;}
        .feat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:${GRAD};opacity:0;transition:opacity 0.3s;}
        .feat-card:hover{border-color:rgba(180,83,9,0.3);transform:translateY(-5px);box-shadow:0 12px 32px rgba(0,0,0,0.10);}
        .feat-card:hover::before{opacity:1;}
        .float-card{transition:all 0.3s;}
        @media(max-width:900px){nav ul li:not(:last-child){display:none;}}
      `}</style>
    </div>
  );
}
