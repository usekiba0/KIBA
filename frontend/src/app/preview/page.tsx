'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const FaqAccordion = dynamic(() => import('../../components/FaqAccordion'), { ssr: false });

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
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(24px)', transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

// ── Colour tokens — light, warm, no gradients ────────────────
const AC  = '#c9372b';          // rose/terracotta accent
const ACL = '#e05444';          // accent lighter (hover)
const BG  = '#faf9f7';          // warm off-white background
const S1  = '#f0ece7';          // card surface
const S2  = '#e8e3dd';          // alternate section surface
const TX  = '#1a1714';          // near-black text
const MT  = '#78716c';          // muted warm grey
const BD  = 'rgba(0,0,0,0.09)'; // border

export default function Preview() {
  const [typingDone, setTypingDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTypingDone(true), 3200); return () => clearTimeout(t); }, []);

  const MSGS = [
    { who: 'user', text: `“I’ve been skipping workouts. Help.”`, delay: 0.6 },
    { who: 'ryke', text: `“You’re not lazy — you’re overwhelmed. Let’s fix that. What does your week look like?”`, delay: 1.1 },
    { who: 'user', text: `“Busy every morning but free at 6pm”`, delay: 1.9 },
    { who: 'ryke', text: `“Perfect. 20-min 6PM routine starting tomorrow. No gym needed. You in? 💪”`, delay: 2.5 },
  ];

  return (
    <>
      {/* ══ PREVIEW BANNER ══ */}
      <div style={{ background: '#1a1714', color: '#faf9f7', textAlign: 'center', padding: '10px 24px', fontSize: 13, fontWeight: 500, letterSpacing: '0.5px' }}>
        Design preview — <span style={{ color: AC }}>not live</span> &middot; Share this link with the client for feedback
      </div>

      {/* ══ NAV ══ */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 48px', background: `rgba(250,249,247,0.95)`, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${BD}` }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: TX, letterSpacing: '-0.5px' }}>
          Ryke<span style={{ color: AC }}>.ai</span>
        </div>
        <ul style={{ display: 'flex', alignItems: 'center', gap: 40, listStyle: 'none', margin: 0, padding: 0 }}>
          {[['#how', 'How it works'], ['#coaches', 'For Coaches'], ['#pricing', 'Pricing']].map(([h, l]) => (
            <li key={l}><a href={h} style={{ textDecoration: 'none', color: MT, fontSize: 14, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = TX)} onMouseLeave={e => (e.currentTarget.style.color = MT)}>{l}</a></li>
          ))}
          <li>
            <Link href="/onboarding" style={{ background: AC, color: 'white', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-block', transition: 'background 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = ACL)}
              onMouseLeave={e => (e.currentTarget.style.background = AC)}
            >Start Free Trial</Link>
          </li>
        </ul>
      </nav>

      {/* ══ HERO ══ */}
      <div style={{ minHeight: '92vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 48px 80px', background: BG }}>
        <div style={{ maxWidth: 1200, width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', gap: 80, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `rgba(201,55,43,0.08)`, border: `1px solid rgba(201,55,43,0.2)`, padding: '8px 18px', borderRadius: 30, fontSize: 12, fontWeight: 500, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: AC, marginBottom: 36, animation: 'fadeUp 0.8s ease both' }}>
              <span className="pulse-dot-p" /> Available 24/7 &middot; Works on any phone
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(48px,6vw,88px)', fontWeight: 300, lineHeight: 1.05, letterSpacing: '-2.5px', marginBottom: 28, color: TX, animation: 'fadeUp 0.8s ease 0.1s both' }}>
              The mentor<br />
              you <em style={{ fontStyle: 'italic', color: AC, fontWeight: 400 }}>never</em> had.<br />
              <strong style={{ fontWeight: 700 }}>The results you</strong><br />
              <strong style={{ fontWeight: 700 }}>always wanted.</strong>
            </h1>
            <p style={{ fontSize: 18, color: MT, maxWidth: 480, lineHeight: 1.75, marginBottom: 48, fontWeight: 300, animation: 'fadeUp 0.8s ease 0.2s both' }}>
              Personal coaching for fitness, nutrition, and wellness — delivered straight to your messages. No app. No login. Just results.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const, marginBottom: 48, animation: 'fadeUp 0.8s ease 0.3s both' }}>
              <Link href="/onboarding" style={{ background: AC, color: 'white', padding: '17px 40px', borderRadius: 12, fontSize: 16, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                Start Free Trial &rarr;
              </Link>
              <a href="#how" style={{ background: 'transparent', color: TX, padding: '17px 32px', borderRadius: 12, fontSize: 16, fontWeight: 400, textDecoration: 'none', border: `1px solid ${BD}`, display: 'inline-block' }}>
                See how it works
              </a>
            </div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' as const, animation: 'fadeUp 0.8s ease 0.4s both' }}>
              {['&#10003;&nbsp; 1-month free trial', '&#10003;&nbsp; No app download', '&#10003;&nbsp; Cancel anytime', '&#10003;&nbsp; Works on any phone'].map(t => (
                <span key={t} style={{ fontSize: 13, color: MT }} dangerouslySetInnerHTML={{ __html: t }} />
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div className="float-card-p" style={{ position: 'absolute', top: -24, right: -60, background: 'white', border: `1px solid ${BD}`, borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', animation: 'floatBadgeP 3s ease-in-out infinite', zIndex: 10, whiteSpace: 'nowrap' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: AC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔥</div>
              <div><div style={{ fontSize: 12, fontWeight: 600, color: TX }}>7-day streak!</div><div style={{ fontSize: 11, color: AC }}>Alex &middot; Fitness plan</div></div>
            </div>
            <div className="float-card-p" style={{ position: 'absolute', bottom: -20, left: -56, background: 'white', border: `1px solid ${BD}`, borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', animation: 'floatBadgeP 3s ease-in-out 1.5s infinite', zIndex: 10, whiteSpace: 'nowrap' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#065f46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🥗</div>
              <div><div style={{ fontSize: 12, fontWeight: 600, color: TX }}>Meal logged ✓</div><div style={{ fontSize: 11, color: '#059669' }}>142 kcal &middot; 18g protein</div></div>
            </div>
            <div style={{ width: 290, background: 'white', borderRadius: 42, border: `6px solid ${S1}`, padding: '22px 16px 30px', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', position: 'relative' }}>
              <div style={{ width: 80, height: 7, background: S1, borderRadius: 4, margin: '0 auto 18px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px 12px', borderBottom: `1px solid ${BD}`, marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: AC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}>R</div>
                <div><div style={{ fontSize: 13, fontWeight: 500, color: TX }}>Ryke</div><div style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Online now</div></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, minHeight: 200 }}>
                {MSGS.map((m, i) => (
                  <div key={i} style={{ padding: '9px 13px', borderRadius: m.who === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: 12, lineHeight: 1.5, maxWidth: '88%', alignSelf: m.who === 'user' ? 'flex-end' : 'flex-start', background: m.who === 'user' ? AC : S1, color: m.who === 'user' ? 'white' : TX, animation: `msgIn 0.4s ease ${m.delay}s both` }}>{m.text}</div>
                ))}
                {!typingDone && (
                  <div style={{ padding: '9px 14px', borderRadius: '16px 16px 16px 4px', background: S1, alignSelf: 'flex-start', display: 'inline-flex', gap: 4, animation: 'msgIn 0.3s ease 3s both' }}>
                    {[0, 1, 2].map(i => <span key={i} className="typing-dot-p" style={{ animationDelay: `${i * 0.2}s` }} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      <div id="how" style={{ background: S2, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 72 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: AC, marginBottom: 14, fontWeight: 500 }}>Simple by design</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,60px)', fontWeight: 300, letterSpacing: '-1.5px', color: TX, lineHeight: 1.1 }}>Up and running in <em style={{ fontStyle: 'italic', color: AC }}>minutes.</em></h2>
          </div></FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 32, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 56, left: '18%', right: '18%', height: 1, background: `linear-gradient(90deg,transparent,${BD},transparent)` }} />
            {[['01', '📋', 'Tell Ryke your goals', 'Fill in a 2-minute form — your focus, body metrics, health context, and dietary needs. Ryke remembers everything.'],
              ['02', '💬', 'Ryke texts you first', 'Your welcome message arrives within 30 seconds. Ryke already knows your goals and leads with a first coaching question.'],
              ['03', '🚀', 'Make progress, daily', 'Text whenever you want — morning, night, mid-workout. Ryke responds, tracks, and adapts to keep you moving forward.']
            ].map(([n, icon, title, desc], i) => (
              <FadeIn key={n} delay={i * 150}>
                <div style={{ background: BG, border: `1px solid ${BD}`, borderRadius: 20, padding: 36 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: `rgba(201,55,43,0.08)`, border: `1px solid rgba(201,55,43,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 24 }}>{icon}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: MT, marginBottom: 6, letterSpacing: 1 }}>{n}</div>
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
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: AC, marginBottom: 14, fontWeight: 500 }}>What Ryke does</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,64px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-1px', color: TX }}>
            Guidance for <em style={{ fontStyle: 'italic', color: AC }}>every</em> part<br /><strong style={{ fontWeight: 700 }}>of your life.</strong>
          </h2>
        </div></FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[['💪', 'Fitness & Training', 'Custom workout plans built around your schedule, goals, and equipment. Photo workouts, form tips, progression tracking.'],
            ['🥗', 'Nutrition & Food Photos', 'Snap a meal and Ryke analyses it instantly — calories, macros, health flags, and coaching tips.'],
            ['🧠', 'Mental Wellness', 'Daily check-ins, stress management, motivation — with a built-in safety system that keeps you supported.'],
            ['📅', 'Smart Scheduling', 'Text your availability and Ryke builds your plan, sends reminders, and keeps you accountable every day.'],
            ['🛡️', 'Safety First', 'Ryke detects distress signals instantly. A human coach is alerted within 5 minutes. Your safety always comes first.'],
            ['🔒', 'Private & Secure', 'No data sharing. No ads. Conversations are yours — encrypted and never sold or shared.']
          ].map(([icon, title, desc], i) => (
            <FadeIn key={title as string} delay={i * 80}>
              <div className="feat-card-p">
                <div style={{ width: 48, height: 48, background: `rgba(201,55,43,0.08)`, border: `1px solid rgba(201,55,43,0.15)`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 20 }}>{icon}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, marginBottom: 10, letterSpacing: '-0.3px', color: TX }}>{title}</div>
                <p style={{ fontSize: 14, color: MT, lineHeight: 1.7, fontWeight: 300 }}>{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={200}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: BD, borderRadius: 20, overflow: 'hidden', marginTop: 60, border: `1px solid ${BD}` }}>
            {[{ n: 24, s: '/7', l: 'Always available' }, { n: 0, s: '', l: 'Apps to download' }, { n: 20, s: '+', l: '$ per month only' }].map(stat => (
              <div key={stat.l} style={{ background: S1, padding: '36px 32px', textAlign: 'center' as const }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 700, color: AC, lineHeight: 1, marginBottom: 8 }}><Counter to={stat.n} suffix={stat.s} /></div>
                <div style={{ fontSize: 13, color: MT, fontWeight: 300 }}>{stat.l}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ══ TESTIMONIALS ══ */}
      <div style={{ background: S2, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: AC, marginBottom: 14, fontWeight: 500 }}>Real results</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,4vw,56px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              People who text <em style={{ fontStyle: 'italic', color: AC }}>Ryke</em> every day.
            </h2>
          </div></FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
            {[['Alex M.', 'Software engineer, 32', 'I tried every fitness app. None stuck. Ryke is just a text — I don't even think about it. I'm 18 lbs down in 3 months.'],
              ['Maya R.', 'Mom of 3, 38', 'I sent Ryke a photo of my dinner and got a full macro breakdown in 10 seconds. It's like having a nutritionist in my pocket.'],
              ['Jordan T.', 'Personal trainer, 27', 'I use Ryke Coach Pro for all my clients. It answers their questions at 11pm so I don't have to. Best investment I've made.']
            ].map(([name, role, quote], i) => (
              <FadeIn key={name as string} delay={i * 120}>
                <div style={{ background: BG, border: `1px solid ${BD}`, borderRadius: 20, padding: 36 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                    {Array.from({ length: 5 }).map((_, i) => <span key={i} style={{ color: '#d97706', fontSize: 16 }}>&#9733;</span>)}
                  </div>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, fontStyle: 'italic', color: TX, lineHeight: 1.65, marginBottom: 24 }}>&ldquo;{quote}&rdquo;</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: AC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: 'white', fontSize: 15 }}>{(name as string)[0]}</div>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: TX }}>{name}</div><div style={{ fontSize: 12, color: MT }}>{role}</div></div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>

      {/* ══ PROBLEM VS SOLUTION ══ */}
      <div style={{ padding: '100px 48px', background: BG }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: AC, marginBottom: 14, fontWeight: 500 }}>Why Ryke</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,60px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              It&apos;s time to <em style={{ fontStyle: 'italic', color: AC }}>actually</em><br /><strong style={{ fontWeight: 700 }}>get healthy.</strong>
            </h2>
          </div></FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <FadeIn>
              <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 20, padding: 40 }}>
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: MT, marginBottom: 28, fontWeight: 600 }}>The Old Way</div>
                {['Real coaching costs $200–$500/month — out of reach for most', 'Health apps are confusing — 90% of people quit within a week', 'Coaches waste hours answering the same questions every day', 'You set goals with no one to hold you accountable', 'Mental health support is siloed from your fitness goals'].map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, marginTop: 2, color: '#dc2626' }}>✕</div>
                    <p style={{ fontSize: 14, color: MT, lineHeight: 1.6 }}>{p}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div style={{ background: S1, border: `1px solid rgba(201,55,43,0.3)`, borderRadius: 20, padding: 40 }}>
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: AC, marginBottom: 28, fontWeight: 600 }}>The Ryke Way</div>
                {['$20/month — 1/10th of a real coach, same personalisation', 'Just text — no apps, no logins, no learning curve ever', 'AI handles 24/7 client questions in the coach's own voice', 'Daily check-ins, progress tracking, and accountability built in', 'Fitness + nutrition + mental wellness in one conversation'].map(s => (
                  <div key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(201,55,43,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, marginTop: 2, color: AC }}>✓</div>
                    <p style={{ fontSize: 14, color: TX, lineHeight: 1.6 }}>{s}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      {/* ══ FOR COACHES ══ */}
      <div id="coaches" style={{ background: S2, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: AC, marginBottom: 16, fontWeight: 500 }}>For fitness coaches</div></FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
            <FadeIn>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,4vw,56px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-1px', marginBottom: 24, color: TX }}>
                Your clients get answers.<br /><em style={{ fontStyle: 'italic', color: AC }}>You get your</em><br /><strong style={{ fontWeight: 700 }}>life back.</strong>
              </h2>
              <p style={{ fontSize: 16, color: MT, lineHeight: 1.7, fontWeight: 300, marginBottom: 36 }}>Stop answering the same questions at 11pm. Ryke handles your clients 24/7 &mdash; in your voice, your tone, your style. Step in only when it truly matters.</p>
              <a href="#pricing" style={{ display: 'inline-block', background: AC, color: 'white', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>See Coach Plans &rarr;</a>
            </FadeIn>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              {[['01', 'Your style, your voice', `Ryke learns your coaching tone and energy — every text sounds exactly like you.`],
                ['02', 'Smart scheduling', `Clients text to book. Ryke negotiates, confirms, and sends reminders — you never touch a calendar.`],
                ['03', 'Human handoff', `Get alerted the moment a client needs real support. Jump in instantly — they always feel taken care of.`]
              ].map(([n, t, d], i) => (
                <FadeIn key={n} delay={i * 100}>
                  <div style={{ background: BG, border: `1px solid ${BD}`, borderRadius: 16, padding: 28 }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, fontWeight: 700, color: AC, opacity: 0.3, lineHeight: 1, marginBottom: 10 }}>{n}</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: TX }}>{t}</div>
                    <p style={{ fontSize: 14, color: MT, lineHeight: 1.7, fontWeight: 300 }}>{d}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ PRICING ══ */}
      <section id="pricing" style={{ padding: '100px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 64 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: AC, marginBottom: 14, fontWeight: 500 }}>Simple pricing</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,64px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
            Start free. <em style={{ fontStyle: 'italic', color: AC }}>Scale when</em> <strong style={{ fontWeight: 700 }}>you&apos;re ready.</strong>
          </h2>
        </div></FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'start' }}>
          {[
            { label: 'Individual', price: 20, period: 'per month · cancel anytime', features: ['Unlimited texts with Ryke', 'Fitness, nutrition & wellness', 'Food photo analysis', 'Daily check-ins & reminders', 'Mental health support', 'Crisis detection & safety net'], cta: 'Start Free Trial', href: '/onboarding', featured: false },
            { label: 'Coach Pro', price: 99, period: 'per month · up to 30 clients', features: ['Your own branded SMS number', 'Ryke trained in your voice & style', 'Smart scheduling for all clients', 'Coach dashboard & analytics', 'Human handoff alerts', 'Client progress tracking', 'Response delay settings'], cta: 'Start Free Trial', href: '/onboarding', featured: true, badge: 'Most Popular' },
            { label: 'Coach Elite', price: 149, period: 'per month · unlimited clients', features: ['Everything in Coach Pro', 'Unlimited client seats', 'Multiple personas', 'Priority support', 'Custom branding', 'Early access to new features'], cta: 'Contact Us', href: 'mailto:hello@ryke.ai', featured: false },
          ].map((p, i) => (
            <FadeIn key={p.label} delay={i * 100}>
              <div style={{ background: p.featured ? S1 : BG, border: p.featured ? `1px solid ${AC}` : `1px solid ${BD}`, borderRadius: 22, padding: '44px 34px', position: 'relative', transform: p.featured ? 'scale(1.04)' : 'none', boxShadow: p.featured ? '0 8px 32px rgba(0,0,0,0.1)' : 'none' }}>
                {p.badge && <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: AC, color: 'white', fontSize: 11, fontWeight: 600, padding: '4px 18px', borderRadius: 20, letterSpacing: 1, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>{p.badge}</div>}
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: MT, marginBottom: 16 }}>{p.label}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 56, fontWeight: 700, lineHeight: 1, marginBottom: 4, letterSpacing: '-2px', color: TX }}><sup style={{ fontSize: 24, verticalAlign: 'top', marginTop: 12, display: 'inline-block' }}>$</sup>{p.price}</div>
                <div style={{ fontSize: 13, color: MT, marginBottom: 32 }}>{p.period}</div>
                <ul style={{ listStyle: 'none', marginBottom: 36, padding: 0, display: 'flex', flexDirection: 'column' as const, gap: 11 }}>
                  {p.features.map(f => <li key={f} style={{ fontSize: 14, color: MT, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 300 }}><span style={{ color: AC, fontSize: 10, flexShrink: 0 }}>&#10086;</span>{f}</li>)}
                </ul>
                <Link href={p.href as string} style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' as const, background: p.featured ? AC : 'transparent', color: p.featured ? 'white' : TX, border: p.featured ? 'none' : `1px solid ${BD}`, boxSizing: 'border-box' as const }}>
                  {p.cta} &rarr;
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <div style={{ background: S2, borderTop: `1px solid ${BD}`, borderBottom: `1px solid ${BD}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: AC, marginBottom: 14, fontWeight: 500 }}>Questions</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,4vw,56px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              Everything you <em style={{ fontStyle: 'italic', color: AC }}>want to know.</em>
            </h2>
          </div></FadeIn>
          <FadeIn delay={100}><FaqAccordion /></FadeIn>
        </div>
      </div>

      {/* ══ MISSION ══ */}
      <FadeIn>
        <div style={{ padding: '100px 48px', maxWidth: 860, margin: '0 auto', textAlign: 'center' as const }}>
          <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 24, padding: '60px 64px' }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(20px,2.5vw,30px)', fontWeight: 300, fontStyle: 'italic', lineHeight: 1.6, color: TX, marginBottom: 28 }}>
              &ldquo;Real coaching should be accessible to everyone &mdash; not just people who can afford $300 an hour. Guidance changes lives. That&apos;s why Ryke exists.&rdquo;
            </div>
            <div style={{ fontSize: 14, color: AC, fontWeight: 500, letterSpacing: 1 }}>&mdash; The Ryke.ai Team</div>
          </div>
        </div>
      </FadeIn>

      {/* ══ CTA ══ */}
      <div style={{ textAlign: 'center' as const, padding: '120px 48px', background: S2, borderTop: `1px solid ${BD}` }}>
        <FadeIn>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(42px,6vw,80px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-2px', marginBottom: 24, color: TX }}>
            One text changes <em style={{ fontStyle: 'italic', color: AC }}>everything.</em>
          </h2>
          <p style={{ fontSize: 17, color: MT, marginBottom: 48, fontWeight: 300 }}>Start your free 1-month trial today. No app download. No credit card to begin.</p>
          <Link href="/onboarding" style={{ display: 'inline-block', background: AC, color: 'white', padding: '20px 56px', borderRadius: 14, fontSize: 18, fontWeight: 700, textDecoration: 'none', letterSpacing: '0.3px' }}>
            Start Free Trial &mdash; 1 Month Free &rarr;
          </Link>
          <p style={{ fontSize: 13, color: MT, marginTop: 20 }}>No credit card required &middot; Cancel anytime &middot; Works on any phone</p>
        </FadeIn>
      </div>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: `1px solid ${BD}`, padding: '40px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: BG }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: TX }}>Ryke<span style={{ color: AC }}>.ai</span></div>
        <div style={{ fontSize: 13, color: MT }}>&#169; 2026 Ryke.ai. All rights reserved.</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy', 'Terms', 'Coaches', 'Contact'].map(l => <a key={l} href="#" style={{ fontSize: 13, color: MT, textDecoration: 'none' }}>{l}</a>)}
        </div>
      </footer>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes floatBadgeP{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        .pulse-dot-p{width:6px;height:6px;border-radius:50%;background:${AC};display:inline-block;animation:pulseDotP 2s infinite;}
        @keyframes pulseDotP{0%,100%{opacity:0.5;transform:scale(0.9)}50%{opacity:1;transform:scale(1)}}
        .typing-dot-p{width:6px;height:6px;border-radius:50%;background:${MT};display:inline-block;animation:typingPulseP 1.2s infinite;}
        @keyframes typingPulseP{0%,80%,100%{opacity:.25;transform:scale(.85)}40%{opacity:1;transform:scale(1)}}
        .feat-card-p{background:${S1};border:1px solid ${BD};border-radius:18px;padding:32px;transition:all 0.25s;position:relative;}
        .feat-card-p:hover{border-color:rgba(201,55,43,0.3);transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,0.08);}
        @media(max-width:900px){nav ul li:not(:last-child){display:none;}}
      `}</style>
    </>
  );
}
