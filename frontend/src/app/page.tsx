'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const FaqAccordion = dynamic(() => import('../components/FaqAccordion'), { ssr: false });

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
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(28px)', transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

const R = '#e11d48';
const RL = '#fb7185';
const V = '#8b5cf6';
const BG = '#09090b';
const S1 = '#111113';
const S2 = '#0d0d10';
const TX = '#fafafa';
const MT = '#a1a1aa';

const GRAD = `linear-gradient(135deg,${R},${V})`;
const GLOW = (a: number) => `rgba(225,29,72,${a})`;
const VGLOW = (a: number) => `rgba(139,92,246,${a})`;

export default function Home() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const followerRef = useRef<HTMLDivElement>(null);
  const [typingDone, setTypingDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return;
    let mx = 0, my = 0, fx = 0, fy = 0;
    const move = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (cursorRef.current) { cursorRef.current.style.left = mx - 5 + 'px'; cursorRef.current.style.top = my - 5 + 'px'; }
    };
    const anim = () => { fx += (mx - fx) * 0.12; fy += (my - fy) * 0.12; if (followerRef.current) { followerRef.current.style.left = fx - 16 + 'px'; followerRef.current.style.top = fy - 16 + 'px'; } requestAnimationFrame(anim); };
    document.addEventListener('mousemove', move);
    document.body.style.cursor = 'none';
    requestAnimationFrame(anim);
    return () => { document.removeEventListener('mousemove', move); document.body.style.cursor = ''; };
  }, []);

  useEffect(() => { const t = setTimeout(() => setTypingDone(true), 3800); return () => clearTimeout(t); }, []);

  const MSGS = [
    { who: 'kiba', text: 'Alex — did you complete "Run 5km before work"? Send proof now.', delay: 0.5 },
    { who: 'kiba', text: 'You said you fear staying stuck. Your college roommate isn\'t waiting around.', delay: 1.2 },
    { who: 'user', text: '[photo attached]', delay: 2.0 },
    { who: 'kiba', text: 'Execution score: 78/100. Streak alive. Keep the pressure on.', delay: 2.8 },
  ];

  return (
    <>
      <div ref={cursorRef} style={{ width: 10, height: 10, background: R, borderRadius: '50%', position: 'fixed', pointerEvents: 'none', zIndex: 9999, mixBlendMode: 'screen' }} />
      <div ref={followerRef} style={{ width: 32, height: 32, border: `1px solid ${GLOW(0.6)}`, borderRadius: '50%', position: 'fixed', pointerEvents: 'none', zIndex: 9998 }} />

      {/* NAV */}
      <nav className="main-nav" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 48px', background: `rgba(9,9,11,0.92)`, backdropFilter: 'blur(24px)', borderBottom: `1px solid ${GLOW(0.15)}` }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: TX, letterSpacing: '-0.5px' }}>
          Kiba<span style={{ color: RL }}>.ai</span>
        </div>
        <ul style={{ display: 'flex', alignItems: 'center', gap: 40, listStyle: 'none' }}>
          {[['#how', 'How it works'], ['#proof', 'The System'], ['#pricing', 'Pricing']].map(([h, l]) => (
            <li key={l}><a href={h} style={{ textDecoration: 'none', color: MT, fontSize: 14, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = TX)} onMouseLeave={e => (e.currentTarget.style.color = MT)}>{l}</a></li>
          ))}
          <li><Link href="/onboarding" style={{ background: GRAD, color: 'white', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', boxShadow: `0 4px 14px ${GLOW(0.4)}`, display: 'inline-block' }}>Start Free Trial</Link></li>
        </ul>
      </nav>

      {/* HERO */}
      <div className="hero-section" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '140px 48px 80px', position: 'relative', overflow: 'hidden', background: BG }}>
        <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '140%', height: '70%', background: `radial-gradient(ellipse at 50% 0%,${GLOW(0.18)} 0%,${VGLOW(0.08)} 40%,transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${GLOW(0.06)} 1px,transparent 1px),linear-gradient(90deg,${GLOW(0.06)} 1px,transparent 1px)`, backgroundSize: '60px 60px', maskImage: 'radial-gradient(ellipse 90% 90% at 50% 0%,black 0%,transparent 100%)', pointerEvents: 'none' }} />

        <div className="hero-grid" style={{ maxWidth: 1200, width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', gap: 80, alignItems: 'center', position: 'relative' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: GLOW(0.1), border: `1px solid ${GLOW(0.35)}`, padding: '8px 18px', borderRadius: 30, fontSize: 12, fontWeight: 500, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: RL, marginBottom: 36, animation: 'fadeUp 0.8s ease both' }}>
              <span className="pulse-dot" /> Psychological Accountability &middot; Via SMS
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(48px,6vw,88px)', fontWeight: 300, lineHeight: 1.05, letterSpacing: '-2.5px', marginBottom: 28, color: TX, animation: 'fadeUp 0.8s ease 0.1s both' }}>
              Motivation<br />
              <em style={{ fontStyle: 'italic', color: V, fontWeight: 400 }}>fails.</em><br />
              <strong style={{ fontWeight: 700 }}>Pressure</strong><br />
              <strong style={{ fontWeight: 700 }}>doesn&apos;t.</strong>
            </h1>
            <p style={{ fontSize: 18, color: MT, maxWidth: 480, lineHeight: 1.75, marginBottom: 48, fontWeight: 300, animation: 'fadeUp 0.8s ease 0.2s both' }}>
              Kiba is a psychological accountability system that texts you daily check-ins, demands proof of your work, and scores your execution. No sympathy. No excuses. Just results.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const, marginBottom: 48, animation: 'fadeUp 0.8s ease 0.3s both' }}>
              <Link href="/onboarding" style={{ background: GRAD, color: 'white', padding: '17px 40px', borderRadius: 12, fontSize: 16, fontWeight: 600, textDecoration: 'none', boxShadow: `0 8px 32px ${GLOW(0.45)}`, display: 'inline-block' }}>
                Start Free Trial &rarr;
              </Link>
              <a href="#how" style={{ background: 'rgba(255,255,255,0.05)', color: '#d4d4d8', padding: '17px 32px', borderRadius: 12, fontSize: 16, fontWeight: 400, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)', display: 'inline-block' }}>
                See how it works
              </a>
            </div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' as const, animation: 'fadeUp 0.8s ease 0.4s both' }}>
              {['&#10003;&nbsp; 1-month free trial', '&#10003;&nbsp; No app download', '&#10003;&nbsp; Cancel anytime', '&#10003;&nbsp; Works on any phone'].map(t => (
                <span key={t} style={{ fontSize: 13, color: '#52525b' }} dangerouslySetInnerHTML={{ __html: t }} />
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div className="hero-phone" style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', inset: -40, background: `radial-gradient(ellipse at 50% 50%,${GLOW(0.18)} 0%,transparent 70%)`, borderRadius: '50%', animation: 'slowpulse 4s ease-in-out infinite', pointerEvents: 'none' }} />
            <div className="float-card" style={{ position: 'absolute', top: -24, right: -60, background: 'rgba(17,17,19,0.96)', backdropFilter: 'blur(16px)', border: `1px solid ${GLOW(0.3)}`, borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'floatBadge 3s ease-in-out infinite', zIndex: 10, whiteSpace: 'nowrap' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔥</div>
              <div><div style={{ fontSize: 12, fontWeight: 600, color: TX }}>14-day streak!</div><div style={{ fontSize: 11, color: RL }}>Alex &middot; Score: 81/100</div></div>
            </div>
            <div className="float-card" style={{ position: 'absolute', bottom: -20, left: -56, background: 'rgba(17,17,19,0.96)', backdropFilter: 'blur(16px)', border: `1px solid ${GLOW(0.3)}`, borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'floatBadge 3s ease-in-out 1.5s infinite', zIndex: 10, whiteSpace: 'nowrap' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#065f46,#34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✓</div>
              <div><div style={{ fontSize: 12, fontWeight: 600, color: TX }}>Proof accepted</div><div style={{ fontSize: 11, color: '#34d399' }}>Task complete</div></div>
            </div>
            <div style={{ width: 290, background: '#141414', borderRadius: 42, border: '6px solid #222', padding: '22px 16px 30px', boxShadow: `0 0 0 1px ${GLOW(0.25)},0 40px 80px rgba(0,0,0,0.7),0 0 80px ${GLOW(0.1)}`, position: 'relative' }}>
              <div style={{ width: 80, height: 7, background: '#1f1f1f', borderRadius: 4, margin: '0 auto 18px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}>K</div>
                <div><div style={{ fontSize: 13, fontWeight: 500, color: TX }}>Kiba</div><div style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Watching</div></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, minHeight: 200 }}>
                {MSGS.map((m, i) => (
                  <div key={i} style={{ padding: '9px 13px', borderRadius: m.who === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: 11, lineHeight: 1.5, maxWidth: '90%', alignSelf: m.who === 'user' ? 'flex-end' : 'flex-start', background: m.who === 'user' ? GRAD : '#222', color: TX, border: m.who === 'kiba' ? `1px solid ${GLOW(0.18)}` : 'none', animation: `msgIn 0.4s ease ${m.delay}s both` }}>{m.text}</div>
                ))}
                {!typingDone && (
                  <div style={{ padding: '9px 14px', borderRadius: '16px 16px 16px 4px', background: '#222', border: `1px solid ${GLOW(0.18)}`, alignSelf: 'flex-start', display: 'inline-flex', gap: 4, animation: 'msgIn 0.3s ease 3.6s both' }}>
                    {[0, 1, 2].map(i => <span key={i} className="typing-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how" className="section-pad" style={{ background: S2, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 72 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>The system</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,60px)', fontWeight: 300, letterSpacing: '-1.5px', color: TX, lineHeight: 1.1 }}>Built on <em style={{ fontStyle: 'italic', color: V }}>pressure,</em> not promises.</h2>
          </div></FadeIn>
          <div className="how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 32, position: 'relative' }}>
            <div className="how-line" style={{ position: 'absolute', top: 56, left: '18%', right: '18%', height: 1, background: `linear-gradient(90deg,transparent,${GLOW(0.4)},transparent)` }} />
            {[['01', '🧠', 'Psych intake', 'You answer questions about your fears, your avoidance patterns, and who you compare yourself to. Kiba uses this against you — constructively.'],
              ['02', '📲', 'Daily check-ins', 'Every day at your chosen time, Kiba texts you. Did you do the work? Send proof. No reply means you\'re ghosting — and Kiba escalates.'],
              ['03', '📊', 'Execution score', 'Every action builds your score — completion rate, proof rate, response time, streak. Your accountability in a number. No hiding from it.']
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

      {/* FEATURES */}
      <section id="proof" className="section-pad features-section" style={{ padding: '100px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <FadeIn><div style={{ marginBottom: 60 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>What Kiba does</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,64px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-1px', color: TX }}>
            Every tool built to<br /><em style={{ fontStyle: 'italic', color: V }}>eliminate</em> <strong style={{ fontWeight: 700 }}>excuses.</strong>
          </h2>
        </div></FadeIn>
        <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[['⚡', 'Proof-based accountability', 'No check-box. Send a photo or text proof of your completed task. Kiba validates it. Fake it and you\'re only cheating yourself.'],
            ['👻', 'Anti-ghost system', 'Miss a check-in? Kiba follows up in 2 hours. Then 24 hours. Then 48. Three strikes and your score reflects exactly who you\'ve been.'],
            ['📈', 'Execution score', 'A real-time score (0–100) based on completion rate, proof rate, response speed, and streak. Your record. Your mirror.'],
            ['🧠', 'Psychological pressure', 'Kiba knows your fears, your avoidance patterns, your comparison figure. Every message is calibrated to cut through your specific resistance.'],
            ['📋', 'Adaptive plan', 'Your daily tasks adjust automatically. Score too low? Plan gets easier. Crushing it for 7 days? Kiba makes it harder. No coasting.'],
            ['🛡️', 'Crisis safety', 'Kiba detects distress. A real human is alerted immediately. Accountability never comes at the cost of your safety.']
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
          <div className="stats-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: GLOW(0.15), borderRadius: 20, overflow: 'hidden', marginTop: 60, border: `1px solid ${GLOW(0.2)}` }}>
            {[{ n: 24, s: '/7', l: 'Kiba is watching' }, { n: 0, s: '', l: 'Apps to download' }, { n: 20, s: '+', l: '$ per month only' }].map(stat => (
              <div key={stat.l} style={{ background: '#0f0f12', padding: '36px 32px', textAlign: 'center' as const }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 700, color: RL, lineHeight: 1, marginBottom: 8 }}><Counter to={stat.n} suffix={stat.s} /></div>
                <div style={{ fontSize: 13, color: MT, fontWeight: 300 }}>{stat.l}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* PROBLEM vs SOLUTION */}
      <div className="section-pad" style={{ background: S2, borderTop: `1px solid ${GLOW(0.1)}`, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Why motivation fails</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,60px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              You know what to do.<br /><em style={{ fontStyle: 'italic', color: V }}>You just don&apos;t</em><br /><strong style={{ fontWeight: 700 }}>do it.</strong>
            </h2>
          </div></FadeIn>
          <div className="ps-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <FadeIn>
              <div style={{ background: S1, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 40 }}>
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: '#52525b', marginBottom: 28, fontWeight: 600 }}>The motivation trap</div>
                {['You set the goal. You feel good. You do nothing.',
                  'Apps send push notifications you swipe away',
                  'Accountability partners are too polite to actually push you',
                  'You ghost your own goals — no consequences, no change',
                  'Months pass. You\'re exactly where you were.'].map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, marginTop: 2, color: '#fca5a5' }}>✕</div>
                    <p style={{ fontSize: 14, color: MT, lineHeight: 1.6 }}>{p}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div style={{ background: `linear-gradient(135deg,${GLOW(0.12)},${VGLOW(0.06)})`, border: `1px solid ${GLOW(0.35)}`, borderRadius: 20, padding: 40, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: `radial-gradient(circle,${GLOW(0.2)},transparent 70%)`, pointerEvents: 'none' }} />
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: RL, marginBottom: 28, fontWeight: 600 }}>The Kiba system</div>
                {['Kiba knows your psychology — and uses it to cut through resistance',
                  'Daily check-ins via SMS — no app, no excuse not to respond',
                  'Proof required. Words mean nothing. Show the work.',
                  'Ghost Kiba and escalating pressure follows — strikes, score drops',
                  'Execution score tracks who you actually are, not who you want to be'].map(s => (
                  <div key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: GLOW(0.2), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, marginTop: 2, color: RL }}>✓</div>
                    <p style={{ fontSize: 14, color: '#e4e4e7', lineHeight: 1.6 }}>{s}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div className="section-pad" style={{ padding: '100px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Real results</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,4vw,56px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              People who stopped <em style={{ fontStyle: 'italic', color: V }}>making excuses.</em>
            </h2>
          </div></FadeIn>
          <div className="test-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
            {[['Marcus D.', 'Entrepreneur, 34', 'Kiba knew I was scared of staying mediocre. Every text referenced that. I shipped my product in 6 weeks. I had been "planning" it for 2 years.'],
              ['Priya S.', 'Graduate student, 28', 'I told Kiba I feared falling behind my peers. It brought that up every single day. Uncomfortable. Effective. I submitted my thesis early.'],
              ['Jordan T.', 'Freelancer, 31', 'I ghosted Kiba for 3 days once. The escalating messages were relentless. I haven\'t ghosted since. My execution score is 84. I am a different person.']
            ].map(([name, role, quote], i) => (
              <FadeIn key={name as string} delay={i * 120}>
                <div style={{ background: S1, border: `1px solid ${GLOW(0.2)}`, borderRadius: 20, padding: 36 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                    {Array.from({ length: 5 }).map((_, j) => <span key={j} style={{ color: '#fbbf24', fontSize: 16 }}>★</span>)}
                  </div>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, fontStyle: 'italic', color: '#e4e4e7', lineHeight: 1.65, marginBottom: 24 }}>&ldquo;{quote}&rdquo;</p>
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

      {/* PRICING */}
      <section id="pricing" className="section-pad" style={{ padding: '100px 48px', background: S2, borderTop: `1px solid ${GLOW(0.1)}` }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <FadeIn><div style={{ textAlign: 'center' as const, marginBottom: 64 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: RL, marginBottom: 14, fontWeight: 500 }}>Simple pricing</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px,5vw,64px)', fontWeight: 300, letterSpacing: '-1px', color: TX }}>
              One plan. <em style={{ fontStyle: 'italic', color: V }}>No excuses</em> <strong style={{ fontWeight: 700 }}>about cost.</strong>
            </h2>
          </div></FadeIn>
          <FadeIn delay={100}>
            <div className="pricing-card-inner" style={{ background: `linear-gradient(135deg,${GLOW(0.18)},${VGLOW(0.08)})`, border: `1px solid ${R}`, borderRadius: 22, padding: '52px 48px', position: 'relative', boxShadow: `0 0 60px ${GLOW(0.2)}`, textAlign: 'center' as const }}>
              <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, color: MT, marginBottom: 16 }}>Individual</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 72, fontWeight: 700, lineHeight: 1, marginBottom: 4, letterSpacing: '-3px', color: TX }}>
                <sup style={{ fontSize: 28, verticalAlign: 'top', marginTop: 16, display: 'inline-block' }}>$</sup>20
              </div>
              <div style={{ fontSize: 14, color: MT, marginBottom: 40 }}>per month &middot; 1-month free trial &middot; cancel anytime</div>
              <ul style={{ listStyle: 'none', marginBottom: 44, display: 'flex', flexDirection: 'column' as const, gap: 13, textAlign: 'left' as const, maxWidth: 360, margin: '0 auto 44px' }}>
                {['Daily SMS check-ins at your chosen time',
                  'Proof submission (photo or text)',
                  'Execution score tracking (0–100)',
                  'Psychological pressure calibrated to you',
                  'Anti-ghost escalation system (strikes)',
                  'Adaptive difficulty plan',
                  'Crisis detection & human safety net',
                  'Works on any phone — no app needed'].map(f => (
                  <li key={f} style={{ fontSize: 15, color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 300 }}>
                    <span style={{ color: RL, fontSize: 12, flexShrink: 0 }}>◆</span>{f}
                  </li>
                ))}
              </ul>
              <Link href="/onboarding" style={{ display: 'inline-block', background: GRAD, color: 'white', padding: '18px 56px', borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: 'none', boxShadow: `0 6px 24px ${GLOW(0.5)}`, letterSpacing: '0.3px' }}>
                Start 1-Month Free Trial &rarr;
              </Link>
              <p style={{ fontSize: 13, color: '#3f3f46', marginTop: 16 }}>No credit card required during trial</p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FAQ */}
      <div className="section-pad" style={{ borderTop: `1px solid ${GLOW(0.1)}`, borderBottom: `1px solid ${GLOW(0.1)}`, padding: '100px 48px' }}>
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

      {/* MISSION */}
      <FadeIn>
        <div className="section-pad" style={{ padding: '100px 48px', maxWidth: 860, margin: '0 auto', textAlign: 'center' as const }}>
          <div className="mission-card" style={{ background: `linear-gradient(135deg,${GLOW(0.1)},${VGLOW(0.05)})`, border: `1px solid ${GLOW(0.25)}`, borderRadius: 24, padding: '60px 64px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, background: `radial-gradient(circle,${GLOW(0.15)},transparent 70%)`, pointerEvents: 'none' }} />
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(20px,2.5vw,30px)', fontWeight: 300, fontStyle: 'italic', lineHeight: 1.6, color: TX, marginBottom: 28 }}>
              &ldquo;Motivation is a feeling. It comes and goes. Accountability is a system. It doesn&apos;t care how you feel. Kiba exists to be that system &mdash; relentless, precise, and calibrated to you.&rdquo;
            </div>
            <div style={{ fontSize: 14, color: RL, fontWeight: 500, letterSpacing: 1 }}>&mdash; The Kiba Team</div>
          </div>
        </div>
      </FadeIn>

      {/* CTA */}
      <div className="section-pad cta-section" style={{ textAlign: 'center' as const, padding: '120px 48px', position: 'relative', overflow: 'hidden', background: S2, borderTop: `1px solid ${GLOW(0.1)}` }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 70% at 50% 50%,${GLOW(0.1)},transparent 70%)`, pointerEvents: 'none' }} />
        <FadeIn>
          <h2 style={{ position: 'relative', fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(42px,6vw,80px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-2px', marginBottom: 24, color: TX }}>
            No more <em style={{ fontStyle: 'italic', color: V }}>excuses.</em>
          </h2>
          <p style={{ position: 'relative', fontSize: 17, color: MT, marginBottom: 48, fontWeight: 300 }}>Start your free 1-month trial. Your goals deserve more than motivation — they deserve a system.</p>
          <Link href="/onboarding" style={{ position: 'relative', display: 'inline-block', background: GRAD, color: 'white', padding: '20px 56px', borderRadius: 14, fontSize: 18, fontWeight: 700, textDecoration: 'none', boxShadow: `0 10px 40px ${GLOW(0.5)}`, letterSpacing: '0.3px' }}>
            Start Free Trial &mdash; 1 Month Free &rarr;
          </Link>
          <p style={{ position: 'relative', fontSize: 13, color: '#3f3f46', marginTop: 20 }}>No credit card required &middot; Cancel anytime &middot; Works on any phone</p>
        </FadeIn>
      </div>

      {/* FOOTER */}
      <footer className="footer-inner" style={{ borderTop: `1px solid ${GLOW(0.12)}`, padding: '40px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: TX }}>Kiba<span style={{ color: RL }}>.ai</span></div>
        <div style={{ fontSize: 13, color: '#3f3f46' }}>&#169; 2026 Kiba.ai. All rights reserved.</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy', 'Terms', 'Contact'].map(l => <a key={l} href="#" style={{ fontSize: 13, color: MT, textDecoration: 'none' }}>{l}</a>)}
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
        .feat-card:hover{border-color:${GLOW(0.4)};transform:translateY(-5px);box-shadow:0 20px 48px rgba(0,0,0,0.5);}
        .feat-card:hover::before{opacity:1;}
        .float-card{transition:all 0.3s;}
        @media(max-width:900px){
          .main-nav ul li:not(:last-child){display:none;}
        }
        @media(max-width:768px){
          .main-nav{padding:14px 20px!important;}
          .hero-section{padding:110px 20px 64px!important;}
          .hero-grid{grid-template-columns:1fr!important;gap:40px!important;}
          .hero-phone{display:none!important;}
          .section-pad{padding:72px 20px!important;}
          .how-grid{grid-template-columns:1fr!important;gap:20px!important;}
          .how-line{display:none!important;}
          .features-section{padding:72px 20px!important;max-width:100%!important;}
          .feat-grid{grid-template-columns:1fr 1fr!important;gap:14px!important;}
          .stats-bar{grid-template-columns:1fr!important;}
          .ps-grid{grid-template-columns:1fr!important;}
          .test-grid{grid-template-columns:1fr!important;}
          .pricing-card-inner{padding:36px 24px!important;}
          .mission-card{padding:40px 24px!important;}
          .cta-section{padding:80px 20px!important;}
          .footer-inner{flex-direction:column!important;gap:18px!important;padding:28px 20px!important;align-items:flex-start!important;}
        }
        @media(max-width:480px){
          .section-pad{padding:56px 16px!important;}
          .features-section{padding:56px 16px!important;}
          .hero-section{padding:96px 16px 48px!important;}
          .feat-grid{grid-template-columns:1fr!important;}
          .pricing-card-inner{padding:28px 16px!important;}
          .mission-card{padding:32px 16px!important;}
        }
      `}</style>
    </>
  );
}
