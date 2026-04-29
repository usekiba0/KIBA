'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/* ── Animated stat counter ─────────────────────────────── */
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
        if (p < 1) requestAnimationFrame(step);
        else setVal(to);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ── Fade-in on scroll ─────────────────────────────────── */
function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); obs.disconnect(); }
    }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(28px)', transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms` }}>
      {children}
    </div>
  );
}

export default function Home() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const followerRef = useRef<HTMLDivElement>(null);
  const [typingDone, setTypingDone] = useState(false);

  /* Custom cursor */
  useEffect(() => {
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

  /* Typing indicator timing */
  useEffect(() => { const t = setTimeout(() => setTypingDone(true), 3200); return () => clearTimeout(t); }, []);

  const MESSAGES = [
    { who: 'user', text: '“I’ve been skipping workouts. Help.”', delay: 0.6 },
    { who: 'ryke', text: '“You’re not lazy — you’re overwhelmed. Let’s fix that. What does your week look like?”', delay: 1.1 },
    { who: 'user', text: '“Busy every morning but free at 6pm”', delay: 1.9 },
    { who: 'ryke', text: '“Perfect. 20-min 6PM routine starting tomorrow. No gym needed. You in? 💪”', delay: 2.5 },
  ];

  return (
    <>
      {/* Cursor */}
      <div ref={cursorRef} style={{ width:10,height:10,background:'#7c3aed',borderRadius:'50%',position:'fixed',pointerEvents:'none',zIndex:9999,mixBlendMode:'screen',transition:'transform 0.1s' }} />
      <div ref={followerRef} style={{ width:32,height:32,border:'1px solid rgba(124,58,237,0.6)',borderRadius:'50%',position:'fixed',pointerEvents:'none',zIndex:9998 }} />

      {/* NAV */}
      <nav style={{ position:'fixed',top:0,left:0,right:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 48px',background:'rgba(8,8,8,0.9)',backdropFilter:'blur(24px)',borderBottom:'1px solid rgba(124,58,237,0.15)' }}>
        <div style={{ fontFamily:'serif',fontSize:26,fontWeight:700,color:'#f8f6f2',letterSpacing:'-0.5px' }}>Ryke<span style={{ color:'#a78bfa' }}>.ai</span></div>
        <ul style={{ display:'flex',alignItems:'center',gap:40,listStyle:'none' }}>
          {[['#how','How it works'],['#coaches','For Coaches'],['#pricing','Pricing']].map(([h,l]) => (
            <li key={l}><a href={h} style={{ textDecoration:'none',color:'#9ca3af',fontSize:14,transition:'color 0.2s' }} onMouseEnter={e=>(e.currentTarget.style.color='#f8f6f2')} onMouseLeave={e=>(e.currentTarget.style.color='#9ca3af')}>{l}</a></li>
          ))}
          <li><Link href="/onboarding" style={{ background:'linear-gradient(135deg,#7c3aed,#6d28d9)',color:'white',padding:'10px 24px',borderRadius:8,fontSize:14,fontWeight:600,textDecoration:'none',boxShadow:'0 4px 14px rgba(124,58,237,0.4)',display:'inline-block' }}>Start Free Trial</Link></li>
        </ul>
      </nav>

      {/* ══ HERO ══ */}
      <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'140px 48px 80px',position:'relative',overflow:'hidden',background:'#080808' }}>
        {/* Aurora glow */}
        <div style={{ position:'absolute',top:'-20%',left:'50%',transform:'translateX(-50%)',width:'140%',height:'70%',background:'radial-gradient(ellipse at 50% 0%,rgba(124,58,237,0.22) 0%,rgba(109,40,217,0.1) 40%,transparent 70%)',pointerEvents:'none' }} />
        {/* Grid */}
        <div style={{ position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(124,58,237,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.07) 1px,transparent 1px)',backgroundSize:'60px 60px',maskImage:'radial-gradient(ellipse 90% 90% at 50% 0%,black 0%,transparent 100%)',pointerEvents:'none' }} />

        <div style={{ maxWidth:1200,width:'100%',display:'grid',gridTemplateColumns:'1fr auto',gap:80,alignItems:'center',position:'relative' }}>
          {/* Left */}
          <div>
            <div style={{ display:'inline-flex',alignItems:'center',gap:8,background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.35)',padding:'8px 18px',borderRadius:30,fontSize:12,fontWeight:500,letterSpacing:'1.5px',textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:36,animation:'fadeUp 0.8s ease both' }}>
              <span className="pulse-dot" /> Powered by Claude AI · Available 24/7
            </div>

            <h1 style={{ fontFamily:'serif',fontSize:'clamp(48px,6vw,88px)',fontWeight:300,lineHeight:1.05,letterSpacing:'-2.5px',marginBottom:28,color:'#f8f6f2',animation:'fadeUp 0.8s ease 0.1s both' }}>
              The mentor<br />
              you <em style={{ fontStyle:'italic',color:'#a78bfa',fontWeight:400 }}>never</em> had.<br />
              <strong style={{ fontWeight:700 }}>The results you</strong><br />
              <strong style={{ fontWeight:700 }}>always wanted.</strong>
            </h1>

            <p style={{ fontSize:18,color:'#9ca3af',maxWidth:480,lineHeight:1.75,marginBottom:48,fontWeight:300,animation:'fadeUp 0.8s ease 0.2s both' }}>
              AI coaching for fitness, nutrition, and mental wellness — delivered straight to your messages. No app. No login. Just results.
            </p>

            <div style={{ display:'flex',gap:16,flexWrap:'wrap' as const,marginBottom:48,animation:'fadeUp 0.8s ease 0.3s both' }}>
              <Link href="/onboarding" style={{ background:'linear-gradient(135deg,#7c3aed,#5b21b6)',color:'white',padding:'17px 40px',borderRadius:12,fontSize:16,fontWeight:600,textDecoration:'none',boxShadow:'0 8px 32px rgba(124,58,237,0.45)',letterSpacing:'0.2px',display:'inline-block' }}>
                Start Free Trial →
              </Link>
              <a href="#how" style={{ background:'rgba(255,255,255,0.05)',color:'#d1d5db',padding:'17px 32px',borderRadius:12,fontSize:16,fontWeight:400,textDecoration:'none',border:'1px solid rgba(255,255,255,0.1)',display:'inline-block' }}>
                See how it works
              </a>
            </div>

            {/* Trust strip */}
            <div style={{ display:'flex',gap:28,flexWrap:'wrap' as const,animation:'fadeUp 0.8s ease 0.4s both' }}>
              {['✓  1-month free trial','✓  No app download','✓  Cancel anytime','✓  Works on any phone'].map(t => (
                <span key={t} style={{ fontSize:13,color:'#6b7280',fontWeight:400 }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Right — phone + floating cards */}
          <div style={{ position:'relative',flexShrink:0 }}>
            {/* Glow ring */}
            <div style={{ position:'absolute',inset:-40,background:'radial-gradient(ellipse at 50% 50%,rgba(124,58,237,0.2) 0%,transparent 70%)',borderRadius:'50%',animation:'slowpulse 4s ease-in-out infinite',pointerEvents:'none' }} />

            {/* Floating achievement card */}
            <div className="float-card" style={{ position:'absolute',top:-24,right:-60,background:'rgba(17,17,17,0.95)',backdropFilter:'blur(16px)',border:'1px solid rgba(124,58,237,0.3)',borderRadius:16,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,boxShadow:'0 8px 32px rgba(0,0,0,0.4)',animation:'floatBadge 3s ease-in-out infinite',zIndex:10,whiteSpace:'nowrap' as const }}>
              <div style={{ width:38,height:38,borderRadius:'50%',background:'linear-gradient(135deg,#4c1d95,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>🔥</div>
              <div>
                <div style={{ fontSize:12,fontWeight:600,color:'#f8f6f2' }}>7-day streak!</div>
                <div style={{ fontSize:11,color:'#a78bfa' }}>Alex · Fitness plan</div>
              </div>
            </div>

            {/* Floating macro card */}
            <div className="float-card" style={{ position:'absolute',bottom:-20,left:-56,background:'rgba(17,17,17,0.95)',backdropFilter:'blur(16px)',border:'1px solid rgba(124,58,237,0.3)',borderRadius:16,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,boxShadow:'0 8px 32px rgba(0,0,0,0.4)',animation:'floatBadge 3s ease-in-out 1.5s infinite',zIndex:10,whiteSpace:'nowrap' as const }}>
              <div style={{ width:38,height:38,borderRadius:'50%',background:'linear-gradient(135deg,#065f46,#34d399)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>🥗</div>
              <div>
                <div style={{ fontSize:12,fontWeight:600,color:'#f8f6f2' }}>Meal logged ✓</div>
                <div style={{ fontSize:11,color:'#6ee7b7' }}>142 kcal · 18g protein</div>
              </div>
            </div>

            {/* Phone */}
            <div style={{ width:290,background:'#141414',borderRadius:42,border:'6px solid #252525',padding:'22px 16px 30px',boxShadow:'0 0 0 1px rgba(124,58,237,0.25),0 40px 80px rgba(0,0,0,0.7),0 0 80px rgba(124,58,237,0.12)',position:'relative' }}>
              <div style={{ width:80,height:7,background:'#1f1f1f',borderRadius:4,margin:'0 auto 18px' }} />
              <div style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 4px 12px',borderBottom:'1px solid rgba(255,255,255,0.05)',marginBottom:14 }}>
                <div style={{ width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#4c1d95,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'serif',fontWeight:700,fontSize:13,color:'white',flexShrink:0 }}>R</div>
                <div>
                  <div style={{ fontSize:13,fontWeight:500,color:'#f8f6f2' }}>Ryke</div>
                  <div style={{ fontSize:11,color:'#22c55e',display:'flex',alignItems:'center',gap:4 }}>
                    <span style={{ width:5,height:5,borderRadius:'50%',background:'#22c55e',display:'inline-block' }} /> Online now
                  </div>
                </div>
              </div>
              <div style={{ display:'flex',flexDirection:'column' as const,gap:8,minHeight:200 }}>
                {MESSAGES.map((m,i) => (
                  <div key={i} style={{ padding:'9px 13px',borderRadius:m.who==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',fontSize:12,lineHeight:1.5,maxWidth:'88%',alignSelf:m.who==='user'?'flex-end':'flex-start',background:m.who==='user'?'#7c3aed':'#222',color:m.who==='user'?'white':'#f8f6f2',border:m.who==='ryke'?'1px solid rgba(124,58,237,0.18)':'none',animation:`msgIn 0.4s ease ${m.delay}s both` }}>
                    {m.text}
                  </div>
                ))}
                {!typingDone && (
                  <div style={{ padding:'9px 14px',borderRadius:'16px 16px 16px 4px',background:'#222',border:'1px solid rgba(124,58,237,0.18)',alignSelf:'flex-start',display:'inline-flex',gap:4,animation:'msgIn 0.3s ease 3s both' }}>
                    {[0,1,2].map(i => <span key={i} className="typing-dot" style={{ animationDelay:`${i*0.2}s` }} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      <div id="how" style={{ background:'#0c0c0c',borderTop:'1px solid rgba(124,58,237,0.12)',padding:'100px 48px' }}>
        <div style={{ maxWidth:1100,margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center' as const,marginBottom:72 }}>
              <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:14,fontWeight:500 }}>Simple by design</div>
              <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,5vw,60px)',fontWeight:300,letterSpacing:'-1.5px',color:'#f8f6f2',lineHeight:1.1 }}>
                Up and running in <em style={{ fontStyle:'italic',color:'#a78bfa' }}>minutes.</em>
              </h2>
            </div>
          </FadeIn>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:32,position:'relative' }}>
            {/* Connecting line */}
            <div style={{ position:'absolute',top:56,left:'18%',right:'18%',height:1,background:'linear-gradient(90deg,transparent,rgba(124,58,237,0.4),transparent)' }} />
            {[
              { n:'01', icon:'📋', title:'Tell Ryke your goals', desc:'Fill in a 2-minute form — your focus, body metrics, health context, and dietary needs. Ryke remembers everything.' },
              { n:'02', icon:'💬', title:'Ryke texts you first', desc:'Your welcome message arrives within 30 seconds. Ryke already knows your goals and starts with a first coaching question.' },
              { n:'03', icon:'🚀', title:'Make progress, daily', desc:'Text whenever you want — morning, night, mid-workout. Ryke responds, tracks, and adapts to keep you moving forward.' },
            ].map((s,i) => (
              <FadeIn key={s.n} delay={i*150}>
                <div style={{ background:'#111',border:'1px solid rgba(124,58,237,0.18)',borderRadius:20,padding:36,position:'relative' }}>
                  <div style={{ width:48,height:48,borderRadius:'50%',background:'rgba(124,58,237,0.15)',border:'1px solid rgba(124,58,237,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:24 }}>{s.icon}</div>
                  <div style={{ fontFamily:'serif',fontSize:13,color:'rgba(167,139,250,0.4)',marginBottom:6,letterSpacing:1 }}>{s.n}</div>
                  <div style={{ fontFamily:'serif',fontSize:22,fontWeight:600,color:'#f8f6f2',marginBottom:12 }}>{s.title}</div>
                  <p style={{ fontSize:14,color:'#9ca3af',lineHeight:1.7,fontWeight:300 }}>{s.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>

      {/* ══ FEATURES ══ */}
      <section style={{ padding:'100px 48px',maxWidth:1200,margin:'0 auto' }}>
        <FadeIn>
          <div style={{ marginBottom:60 }}>
            <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:14,fontWeight:500 }}>What Ryke does</div>
            <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,5vw,64px)',fontWeight:300,lineHeight:1.1,letterSpacing:'-1px',color:'#f8f6f2' }}>
              Guidance for <em style={{ fontStyle:'italic',color:'#a78bfa' }}>every</em> part<br /><strong style={{ fontWeight:700 }}>of your life.</strong>
            </h2>
          </div>
        </FadeIn>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20 }}>
          {[
            { icon:'💪', title:'Fitness & Training', desc:'Custom workout plans built around your schedule, goals, and equipment. Photo workouts, form tips, progression tracking.' },
            { icon:'🥗', title:'Nutrition & Food Photos', desc:'Snap a meal and Ryke analyses it instantly — calories, macros, health flags, and coaching tips. All over MMS.' },
            { icon:'🧠', title:'Mental Wellness', desc:'Daily check-ins, stress management, motivation — with a built-in crisis detection system that keeps you safe.' },
            { icon:'📅', title:'Smart Scheduling', desc:'Text your availability and Ryke builds your plan, sends reminders, and keeps you accountable every day.' },
            { icon:'🛡️', title:'Safety Net', desc:'Ryke detects distress signals instantly. A human coach is alerted within 5 minutes. Your safety always comes first.' },
            { icon:'🔒', title:'Private & Secure', desc:'End-to-end privacy. No data sharing. No ads. Conversations are yours — encrypted and never used to train AI.' },
          ].map((f,i) => (
            <FadeIn key={f.title} delay={i*80}>
              <div className="feat-card">
                <div style={{ width:48,height:48,background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.2)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:20 }}>{f.icon}</div>
                <div style={{ fontFamily:'serif',fontSize:22,fontWeight:600,marginBottom:10,letterSpacing:'-0.3px',color:'#f8f6f2' }}>{f.title}</div>
                <p style={{ fontSize:14,color:'#9ca3af',lineHeight:1.7,fontWeight:300 }}>{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Animated stats */}
        <FadeIn delay={200}>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:1,background:'rgba(124,58,237,0.15)',borderRadius:20,overflow:'hidden',marginTop:60,border:'1px solid rgba(124,58,237,0.2)' }}>
            {[{ n:24, suffix:'/7', label:'Always available' },{ n:0, suffix:'', label:'Apps to download' },{ n:20, suffix:'+', label:'$ per month only' }].map(s => (
              <div key={s.label} style={{ background:'#0f0f0f',padding:'36px 32px',textAlign:'center' as const }}>
                <div style={{ fontFamily:'serif',fontSize:52,fontWeight:700,color:'#a78bfa',lineHeight:1,marginBottom:8 }}>
                  <Counter to={s.n} suffix={s.suffix} />
                </div>
                <div style={{ fontSize:13,color:'#9ca3af',fontWeight:300 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ══ TESTIMONIALS ══ */}
      <div style={{ background:'#0c0c0c',borderTop:'1px solid rgba(124,58,237,0.12)',borderBottom:'1px solid rgba(124,58,237,0.12)',padding:'100px 48px' }}>
        <div style={{ maxWidth:1100,margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center' as const,marginBottom:60 }}>
              <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:14,fontWeight:500 }}>Real results</div>
              <h2 style={{ fontFamily:'serif',fontSize:'clamp(32px,4vw,56px)',fontWeight:300,letterSpacing:'-1px',color:'#f8f6f2' }}>
                People who text <em style={{ fontStyle:'italic',color:'#a78bfa' }}>Ryke</em> every day.
              </h2>
            </div>
          </FadeIn>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24 }}>
            {[
              { name:'Alex M.', role:'Software engineer, 32', stars:5, quote:'"I tried every fitness app. None of them stuck. Ryke is just a text — I don\'t even think about it. I\'m 18 lbs down in 3 months."' },
              { name:'Maya R.', role:'Mom of 3, 38', stars:5, quote:'"I sent Ryke a photo of my dinner and it gave me a full macro breakdown in 10 seconds. It\'s like having a nutritionist in my pocket."' },
              { name:'Jordan T.', role:'Personal trainer, 27', stars:5, quote:'"I use Ryke Coach Pro for all my clients. It answers their questions at 11pm so I don\'t have to. Best investment I\'ve made."' },
            ].map((t,i) => (
              <FadeIn key={t.name} delay={i*120}>
                <div style={{ background:'#111',border:'1px solid rgba(124,58,237,0.2)',borderRadius:20,padding:36 }}>
                  <div style={{ display:'flex',gap:3,marginBottom:20 }}>
                    {Array.from({length:t.stars}).map((_,i) => <span key={i} style={{ color:'#fbbf24',fontSize:16 }}>★</span>)}
                  </div>
                  <p style={{ fontFamily:'serif',fontSize:18,fontWeight:300,fontStyle:'italic',color:'#e5e7eb',lineHeight:1.65,marginBottom:24 }}>{t.quote}</p>
                  <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                    <div style={{ width:40,height:40,borderRadius:'50%',background:'linear-gradient(135deg,#4c1d95,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'serif',fontWeight:700,color:'white',fontSize:15 }}>{t.name[0]}</div>
                    <div>
                      <div style={{ fontSize:14,fontWeight:600,color:'#f8f6f2' }}>{t.name}</div>
                      <div style={{ fontSize:12,color:'#9ca3af' }}>{t.role}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>

      {/* ══ PROBLEM VS SOLUTION ══ */}
      <div style={{ padding:'100px 48px' }}>
        <div style={{ maxWidth:1100,margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center' as const,marginBottom:60 }}>
              <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:14,fontWeight:500 }}>Why Ryke</div>
              <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,5vw,60px)',fontWeight:300,letterSpacing:'-1px',color:'#f8f6f2' }}>
                It&apos;s time to <em style={{ fontStyle:'italic',color:'#a78bfa' }}>actually</em><br /><strong style={{ fontWeight:700 }}>get healthy.</strong>
              </h2>
            </div>
          </FadeIn>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:24 }}>
            <FadeIn>
              <div style={{ background:'#111',border:'1px solid rgba(255,255,255,0.07)',borderRadius:20,padding:40 }}>
                <div style={{ fontSize:12,letterSpacing:2,textTransform:'uppercase' as const,color:'#6b7280',marginBottom:28,fontWeight:600 }}>The Old Way</div>
                {['Real coaching costs $200–$500/month — out of reach for most','Health apps are confusing — 90% of people quit within a week','Coaches waste hours answering the same questions every day','You set goals with no one to hold you accountable','Mental health support is siloed from your fitness goals'].map(p => (
                  <div key={p} style={{ display:'flex',alignItems:'flex-start',gap:12,marginBottom:16 }}>
                    <div style={{ width:22,height:22,borderRadius:'50%',background:'rgba(239,68,68,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,flexShrink:0,marginTop:2,color:'#fca5a5' }}>✕</div>
                    <p style={{ fontSize:14,color:'#9ca3af',lineHeight:1.6 }}>{p}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(109,40,217,0.06))',border:'1px solid rgba(124,58,237,0.35)',borderRadius:20,padding:40,position:'relative' as const,overflow:'hidden' }}>
                <div style={{ position:'absolute' as const,top:-60,right:-60,width:200,height:200,background:'radial-gradient(circle,rgba(124,58,237,0.2),transparent 70%)',pointerEvents:'none' }} />
                <div style={{ fontSize:12,letterSpacing:2,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:28,fontWeight:600 }}>The Ryke Way</div>
                {['$20/month — 1/10th of a real coach, same personalisation','Just text — no apps, no logins, no learning curve ever','AI handles 24/7 client questions in the coach\'s own voice','Daily check-ins, progress tracking, and accountability built in','Fitness + nutrition + mental wellness in one conversation'].map(s => (
                  <div key={s} style={{ display:'flex',alignItems:'flex-start',gap:12,marginBottom:16 }}>
                    <div style={{ width:22,height:22,borderRadius:'50%',background:'rgba(124,58,237,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,flexShrink:0,marginTop:2,color:'#a78bfa' }}>✓</div>
                    <p style={{ fontSize:14,color:'#e5e7eb',lineHeight:1.6 }}>{s}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      {/* ══ FOR COACHES ══ */}
      <div id="coaches" style={{ background:'#0c0c0c',borderTop:'1px solid rgba(124,58,237,0.12)',borderBottom:'1px solid rgba(124,58,237,0.12)',padding:'100px 48px' }}>
        <div style={{ maxWidth:1100,margin:'0 auto' }}>
          <FadeIn><div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:16,fontWeight:500 }}>For fitness coaches</div></FadeIn>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:80,alignItems:'center' }}>
            <FadeIn>
              <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,4vw,56px)',fontWeight:300,lineHeight:1.1,letterSpacing:'-1px',marginBottom:24,color:'#f8f6f2' }}>
                Your clients get answers.<br /><em style={{ fontStyle:'italic',color:'#a78bfa' }}>You get your</em><br /><strong style={{ fontWeight:700 }}>life back.</strong>
              </h2>
              <p style={{ fontSize:16,color:'#9ca3af',lineHeight:1.7,fontWeight:300,marginBottom:36 }}>Stop answering the same questions at 11pm. Ryke handles your clients 24/7 — in your voice, your tone, your style. Step in only when it truly matters.</p>
              <a href="#pricing" style={{ display:'inline-block',background:'linear-gradient(135deg,#7c3aed,#5b21b6)',color:'white',padding:'14px 32px',borderRadius:10,fontSize:15,fontWeight:600,textDecoration:'none',boxShadow:'0 6px 20px rgba(124,58,237,0.4)' }}>See Coach Plans →</a>
            </FadeIn>
            <div style={{ display:'flex',flexDirection:'column' as const,gap:16 }}>
              {[['01','Your AI, your voice','Ryke learns your coaching style, phrases, and energy — every text sounds exactly like you.'],['02','Smart scheduling','Clients text to book. Ryke negotiates, confirms, and sends reminders — you never touch a calendar.'],['03','Human handoff','Get alerted the moment a client needs real support. Jump in instantly — they never know the difference.']].map(([n,t,d],i) => (
                <FadeIn key={n} delay={i*100}>
                  <div style={{ background:'#111',border:'1px solid rgba(124,58,237,0.18)',borderRadius:16,padding:28 }}>
                    <div style={{ fontFamily:'serif',fontSize:38,fontWeight:700,color:'#a78bfa',opacity:0.25,lineHeight:1,marginBottom:10 }}>{n}</div>
                    <div style={{ fontSize:16,fontWeight:600,marginBottom:8,color:'#f8f6f2' }}>{t}</div>
                    <p style={{ fontSize:14,color:'#9ca3af',lineHeight:1.7,fontWeight:300 }}>{d}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ INTEGRATIONS ══ */}
      <div style={{ padding:'80px 48px',borderBottom:'1px solid rgba(124,58,237,0.12)' }}>
        <FadeIn><div style={{ maxWidth:1100,margin:'0 auto',textAlign:'center' as const }}>
          <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:14,fontWeight:500 }}>Integrations</div>
          <h2 style={{ fontFamily:'serif',fontSize:'clamp(28px,4vw,48px)',fontWeight:300,letterSpacing:'-1px',marginBottom:12,color:'#f8f6f2' }}>Works with the apps you <em style={{ fontStyle:'italic',color:'#a78bfa' }}>already use</em></h2>
          <p style={{ fontSize:15,color:'#9ca3af',marginBottom:40,fontWeight:300 }}>Ryke pulls data from the tools you already use — so your mentor always has the full picture.</p>
          <div style={{ display:'flex',flexWrap:'wrap' as const,justifyContent:'center',gap:12 }}>
            {['⌚ Apple Watch','❤️ Apple Health','🏃 Strava','💚 WHOOP','🚴 Peloton','⌚ Garmin','💍 Oura Ring','📅 Google Calendar','😴 8 Sleep','🧘 Calm','🎧 Headspace','⌚ Fitbit'].map(app => (
              <div key={app} style={{ background:'#111',border:'1px solid rgba(124,58,237,0.18)',borderRadius:40,padding:'10px 20px',fontSize:13,color:'#d1d5db' }}>{app}</div>
            ))}
          </div>
        </div></FadeIn>
      </div>

      {/* ══ PRICING ══ */}
      <section id="pricing" style={{ padding:'100px 48px',maxWidth:1200,margin:'0 auto' }}>
        <FadeIn>
          <div style={{ textAlign:'center' as const,marginBottom:64 }}>
            <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:14,fontWeight:500 }}>Simple pricing</div>
            <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,5vw,64px)',fontWeight:300,letterSpacing:'-1px',color:'#f8f6f2' }}>
              Start free. <em style={{ fontStyle:'italic',color:'#a78bfa' }}>Scale when</em> <strong style={{ fontWeight:700 }}>you&apos;re ready.</strong>
            </h2>
          </div>
        </FadeIn>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20,alignItems:'start' }}>
          {[
            { label:'Individual', price:20, period:'per month · cancel anytime', features:['Unlimited texts with Ryke AI','Fitness, nutrition & wellness','Food photo analysis (MMS)','Daily check-ins & reminders','Mental health support','Crisis detection & safety net'], cta:'Start Free Trial', href:'/onboarding', featured:false },
            { label:'Coach Pro', price:99, period:'per month · up to 30 clients', features:['Your own branded SMS number','AI trained in your voice & style','Smart scheduling for all clients','Coach dashboard & analytics','Human handoff alerts','Client progress tracking','Response delay settings'], cta:'Start Free Trial', href:'/onboarding', featured:true, badge:'Most Popular' },
            { label:'Coach Elite', price:149, period:'per month · unlimited clients', features:['Everything in Coach Pro','Unlimited client seats','Multiple AI personas','Priority support','Custom branding','Early access to new features'], cta:'Contact Us', href:'mailto:hello@ryke.ai', featured:false },
          ].map((p,i) => (
            <FadeIn key={p.label} delay={i*100}>
              <div style={{ background:p.featured?'linear-gradient(135deg,rgba(124,58,237,0.18),rgba(109,40,217,0.08))':'#111',border:p.featured?'1px solid #7c3aed':'1px solid rgba(124,58,237,0.2)',borderRadius:22,padding:'44px 34px',position:'relative' as const,transform:p.featured?'scale(1.04)':'none',boxShadow:p.featured?'0 0 50px rgba(124,58,237,0.2)':'none' }}>
                {p.badge && <div style={{ position:'absolute' as const,top:-14,left:'50%',transform:'translateX(-50%)',background:'#7c3aed',color:'white',fontSize:11,fontWeight:600,padding:'4px 18px',borderRadius:20,letterSpacing:1,textTransform:'uppercase' as const,whiteSpace:'nowrap' as const }}>{p.badge}</div>}
                <div style={{ fontSize:12,letterSpacing:2,textTransform:'uppercase' as const,color:'#9ca3af',marginBottom:16 }}>{p.label}</div>
                <div style={{ fontFamily:'serif',fontSize:56,fontWeight:700,lineHeight:1,marginBottom:4,letterSpacing:'-2px',color:'#f8f6f2' }}><sup style={{ fontSize:24,verticalAlign:'top',marginTop:12,display:'inline-block' }}>$</sup>{p.price}</div>
                <div style={{ fontSize:13,color:'#9ca3af',marginBottom:32 }}>{p.period}</div>
                <ul style={{ listStyle:'none',marginBottom:36,display:'flex',flexDirection:'column' as const,gap:11 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ fontSize:14,color:'#9ca3af',display:'flex',alignItems:'center',gap:10,fontWeight:300 }}>
                      <span style={{ color:'#a78bfa',fontSize:10,flexShrink:0 }}>✦</span>{f}
                    </li>
                  ))}
                </ul>
                <Link href={p.href as string} style={{ display:'block',width:'100%',padding:'14px',borderRadius:10,fontSize:14,fontWeight:600,textDecoration:'none',textAlign:'center' as const,background:p.featured?'#7c3aed':'transparent',color:p.featured?'white':'#d1d5db',border:p.featured?'none':'1px solid rgba(124,58,237,0.3)',boxSizing:'border-box' as const,boxShadow:p.featured?'0 4px 16px rgba(124,58,237,0.4)':'none' }}>
                  {p.cta} →
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ══ FOUNDER ══ */}
      <FadeIn>
        <div style={{ padding:'0 48px 100px',maxWidth:1100,margin:'0 auto' }}>
          <div style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.1),rgba(109,40,217,0.05))',border:'1px solid rgba(124,58,237,0.25)',borderRadius:24,padding:60,display:'grid',gridTemplateColumns:'auto 1fr',gap:48,alignItems:'center',position:'relative' as const,overflow:'hidden' }}>
            <div style={{ position:'absolute' as const,top:-100,right:-100,width:300,height:300,background:'radial-gradient(circle,rgba(124,58,237,0.15),transparent 70%)',pointerEvents:'none' }} />
            <div style={{ width:110,height:110,borderRadius:'50%',background:'linear-gradient(135deg,#4c1d95,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'serif',fontSize:38,fontWeight:700,color:'white',flexShrink:0,border:'3px solid rgba(124,58,237,0.4)' }}>SR</div>
            <div>
              <div style={{ fontFamily:'serif',fontSize:26,fontWeight:300,fontStyle:'italic',lineHeight:1.55,marginBottom:20,color:'#f8f6f2' }}>
                &ldquo;I built Ryke because real coaching should be accessible to everyone — not just people who can afford $300 an hour. Guidance changes lives. That&apos;s why Ryke exists.&rdquo;
              </div>
              <div style={{ fontSize:15,fontWeight:600,color:'#a78bfa' }}>Sumair Roudani</div>
              <div style={{ fontSize:13,color:'#9ca3af',marginTop:3 }}>Founder & CEO, Ryke AI</div>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* ══ CTA ══ */}
      <div style={{ textAlign:'center' as const,padding:'120px 48px',position:'relative' as const,overflow:'hidden',background:'#0c0c0c',borderTop:'1px solid rgba(124,58,237,0.12)' }}>
        <div style={{ position:'absolute' as const,inset:0,background:'radial-gradient(ellipse 70% 70% at 50% 50%,rgba(124,58,237,0.1),transparent 70%)',pointerEvents:'none' }} />
        <FadeIn>
          <h2 style={{ position:'relative',fontFamily:'serif',fontSize:'clamp(42px,6vw,80px)',fontWeight:300,lineHeight:1.1,letterSpacing:'-2px',marginBottom:24,color:'#f8f6f2' }}>
            One text changes <em style={{ fontStyle:'italic',color:'#a78bfa' }}>everything.</em>
          </h2>
          <p style={{ position:'relative',fontSize:17,color:'#9ca3af',marginBottom:48,fontWeight:300 }}>
            Start your free 1-month trial today. No app download. No credit card to begin.
          </p>
          <Link href="/onboarding" style={{ position:'relative',display:'inline-block',background:'linear-gradient(135deg,#7c3aed,#5b21b6)',color:'white',padding:'20px 56px',borderRadius:14,fontSize:18,fontWeight:700,textDecoration:'none',boxShadow:'0 10px 40px rgba(124,58,237,0.5)',letterSpacing:'0.3px' }}>
            Start Free Trial — 1 Month Free →
          </Link>
          <p style={{ position:'relative',fontSize:13,color:'#6b7280',marginTop:20 }}>
            No credit card required · Cancel anytime · Works on any phone
          </p>
        </FadeIn>
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop:'1px solid rgba(124,58,237,0.15)',padding:'40px 48px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontFamily:'serif',fontSize:22,fontWeight:700,color:'#f8f6f2' }}>Ryke<span style={{ color:'#a78bfa' }}>.ai</span></div>
        <div style={{ fontSize:13,color:'#6b7280' }}>© 2026 Ryke AI. All rights reserved.</div>
        <div style={{ display:'flex',gap:24 }}>
          {['Privacy','Terms','Coaches','Contact'].map(l => <a key={l} href="#" style={{ fontSize:13,color:'#9ca3af',textDecoration:'none' }}>{l}</a>)}
        </div>
      </footer>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes msgIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slowpulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
        @keyframes floatBadge { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes typingPulse { 0%,80%,100%{opacity:0.2;transform:scale(0.85)} 40%{opacity:1;transform:scale(1)} }
        .pulse-dot { width:6px;height:6px;border-radius:50%;background:#a78bfa;display:inline-block;animation:slowpulse 2s infinite; }
        .typing-dot { width:6px;height:6px;border-radius:50%;background:#a78bfa;display:inline-block;animation:typingPulse 1.2s infinite; }
        .feat-card { background:#111;border:1px solid rgba(124,58,237,0.18);border-radius:18px;padding:32px;transition:all 0.3s;position:relative;overflow:hidden; }
        .feat-card::before { content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#4c1d95,#a78bfa);opacity:0;transition:opacity 0.3s; }
        .feat-card:hover { border-color:rgba(124,58,237,0.45);transform:translateY(-5px);box-shadow:0 20px 48px rgba(0,0,0,0.5); }
        .feat-card:hover::before { opacity:1; }
        .float-card { transition:all 0.3s; }
        @media(max-width:900px) {
          nav ul li:not(:last-child) { display:none; }
        }
        @media(max-width:768px) {
          nav { padding:16px 20px; }
        }
      `}</style>
    </>
  );
}
