'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';

export default function Home() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const followerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mouseX = 0, mouseY = 0, fx = 0, fy = 0;
    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX; mouseY = e.clientY;
      if (cursorRef.current) {
        cursorRef.current.style.left = mouseX - 5 + 'px';
        cursorRef.current.style.top  = mouseY - 5 + 'px';
      }
    };
    const animate = () => {
      fx += (mouseX - fx) * 0.12;
      fy += (mouseY - fy) * 0.12;
      if (followerRef.current) {
        followerRef.current.style.left = fx - 16 + 'px';
        followerRef.current.style.top  = fy - 16 + 'px';
      }
      requestAnimationFrame(animate);
    };
    document.addEventListener('mousemove', onMove);
    const raf = requestAnimationFrame(animate);
    document.body.style.cursor = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      document.body.style.cursor = '';
    };
  }, []);

  return (
    <>
      {/* Custom cursor */}
      <div ref={cursorRef} style={{ width:10,height:10,background:'#7c3aed',borderRadius:'50%',position:'fixed',pointerEvents:'none',zIndex:9999,mixBlendMode:'screen' }} />
      <div ref={followerRef} style={{ width:32,height:32,border:'1px solid rgba(124,58,237,0.5)',borderRadius:'50%',position:'fixed',pointerEvents:'none',zIndex:9998 }} />

      {/* NAV */}
      <nav style={{ position:'fixed',top:0,left:0,right:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'22px 48px',background:'rgba(8,8,8,0.85)',backdropFilter:'blur(20px)',borderBottom:'1px solid rgba(124,58,237,0.2)' }}>
        <div style={{ fontFamily:'serif',fontSize:26,fontWeight:700,color:'#f8f6f2',letterSpacing:'-0.5px' }}>
          Ryke<span style={{ color:'#a78bfa' }}>.ai</span>
        </div>
        <ul style={{ display:'flex',alignItems:'center',gap:40,listStyle:'none' }}>
          <li><a href="#how" style={{ textDecoration:'none',color:'#b0b8c8',fontSize:14 }}>How it works</a></li>
          <li><a href="#coaches" style={{ textDecoration:'none',color:'#b0b8c8',fontSize:14 }}>For Coaches</a></li>
          <li><a href="#pricing" style={{ textDecoration:'none',color:'#b0b8c8',fontSize:14 }}>Pricing</a></li>
          <li>
            <Link href="/onboarding" style={{ textDecoration:'none',background:'#7c3aed',color:'white',padding:'10px 24px',borderRadius:6,fontSize:14,fontWeight:500,letterSpacing:'0.3px' }}>
              Start Free Trial
            </Link>
          </li>
        </ul>
      </nav>

      {/* HERO */}
      <div style={{ minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',padding:'120px 24px 80px',position:'relative',overflow:'hidden',background:'#ffffff' }}>
        <div style={{ position:'absolute',inset:0,background:'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 60%)' }} />
        <div style={{ position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(124,58,237,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.05) 1px,transparent 1px)',backgroundSize:'60px 60px',maskImage:'radial-gradient(ellipse 80% 80% at 50% 50%,black 0%,transparent 100%)' }} />

        <div style={{ position:'relative',display:'inline-flex',alignItems:'center',gap:8,background:'rgba(124,58,237,0.08)',border:'1px solid rgba(124,58,237,0.4)',padding:'8px 16px',borderRadius:30,fontSize:12,fontWeight:500,letterSpacing:'1.5px',textTransform:'uppercase',color:'#7c3aed',marginBottom:32 }}>
          <span style={{ width:6,height:6,borderRadius:'50%',background:'#a78bfa',display:'inline-block',animation:'pulse 2s infinite' }} />
          Powered by AI · Available 24/7
        </div>

        <h1 style={{ position:'relative',fontFamily:'serif',fontSize:'clamp(52px,8vw,96px)',fontWeight:300,lineHeight:1.05,letterSpacing:'-2px',marginBottom:24 }}>
          <span style={{ color:'#080808',fontStyle:'normal',fontWeight:300 }}>The mentor you never had.</span><br />
          <em style={{ color:'#7c3aed',fontStyle:'italic',fontWeight:400 }}>The results</em><br />
          <strong style={{ color:'#080808',fontWeight:700 }}>you always wanted.</strong>
        </h1>

        <p style={{ position:'relative',fontSize:18,color:'#555e6d',maxWidth:520,lineHeight:1.7,marginBottom:48,fontWeight:300 }}>
          Ryke is your AI-powered wellness mentor — available anytime, over text. Health, fitness, mental wellness. One number. Unlimited guidance.
        </p>

        <div style={{ position:'relative',display:'flex',gap:16,flexWrap:'wrap',justifyContent:'center' }}>
          <Link href="/onboarding" style={{ background:'#7c3aed',color:'white',padding:'16px 36px',borderRadius:8,fontSize:15,fontWeight:500,textDecoration:'none',boxShadow:'0 8px 24px rgba(124,58,237,0.35)',transition:'all 0.3s' }}>
            Start Free Trial →
          </Link>
          <a href="#coaches" style={{ background:'transparent',color:'#080808',padding:'16px 36px',borderRadius:8,fontSize:15,fontWeight:400,textDecoration:'none',border:'1px solid rgba(0,0,0,0.2)',transition:'all 0.3s' }}>
            For Coaches
          </a>
        </div>

        {/* Phone mockup */}
        <div style={{ marginTop:72,position:'relative' }}>
          <div style={{ width:300,background:'#1a1a1a',borderRadius:36,border:'6px solid #2a2a2a',padding:'20px 16px 28px',margin:'0 auto',boxShadow:'0 0 0 1px rgba(124,58,237,0.3),0 40px 80px rgba(0,0,0,0.5),0 0 60px rgba(124,58,237,0.1)' }}>
            <div style={{ width:80,height:8,background:'#111',borderRadius:4,margin:'0 auto 16px' }} />
            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 4px 12px',borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:16 }}>
              <div style={{ width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#4c1d95,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'serif',fontWeight:700,fontSize:14,color:'white',flexShrink:0 }}>R</div>
              <div>
                <div style={{ fontSize:13,fontWeight:500,color:'#f8f6f2' }}>Ryke</div>
                <div style={{ fontSize:11,color:'#22c55e',display:'flex',alignItems:'center',gap:4 }}>
                  <span style={{ width:5,height:5,borderRadius:'50%',background:'#22c55e',display:'inline-block' }} /> Online now
                </div>
              </div>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {[
                { who:'user', text:'"I\'ve been skipping workouts. Help."' },
                { who:'ryke', text:'"You\'re not lazy — you\'re overwhelmed. Let\'s fix that. What does your week look like?"' },
                { who:'user', text:'"Busy every morning but free at 6pm"' },
                { who:'ryke', text:'"Perfect. I\'m building you a 20-min 6PM routine starting tomorrow. No gym needed. You in? 💪"' },
              ].map((m, i) => (
                <div key={i} style={{
                  padding:'10px 14px',borderRadius:m.who==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',
                  fontSize:13,lineHeight:1.5,maxWidth:'85%',
                  alignSelf:m.who==='user'?'flex-end':'flex-start',
                  background:m.who==='user'?'#7c3aed':'#222',
                  color:m.who==='user'?'white':'#f8f6f2',
                  border:m.who==='ryke'?'1px solid rgba(124,58,237,0.2)':'none',
                  animation:`msgIn 0.4s ease ${0.8 + i*0.4}s both`,
                }}>
                  {m.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DIVIDER */}
      <div style={{ display:'flex',alignItems:'center',gap:20,padding:'0 48px',margin:'80px 0' }}>
        <div style={{ flex:1,height:1,background:'rgba(124,58,237,0.2)' }} />
        <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#9ca3af' }}>Everything you need</div>
        <div style={{ flex:1,height:1,background:'rgba(124,58,237,0.2)' }} />
      </div>

      {/* FEATURES */}
      <section id="how" style={{ padding:'60px 48px 100px',maxWidth:1200,margin:'0 auto' }}>
        <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:16,fontWeight:500 }}>What Ryke does</div>
        <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,5vw,64px)',fontWeight:300,lineHeight:1.1,letterSpacing:'-1px',marginBottom:20,color:'#f8f6f2' }}>
          Guidance for <em style={{ fontStyle:'italic',color:'#a78bfa' }}>every</em> part<br />
          <strong style={{ fontWeight:700 }}>of your life.</strong>
        </h2>
        <p style={{ fontSize:16,color:'#9ca3af',lineHeight:1.7,maxWidth:560,fontWeight:300,marginBottom:60 }}>
          From fitness to mental health — Ryke handles it all over a simple text message. No app to download. No login. Just text.
        </p>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20 }}>
          {[
            { icon:'💪', title:'Fitness & Training', desc:'Custom workout plans built around your schedule, goals, and equipment. Ryke adapts as you progress.' },
            { icon:'🥗', title:'Nutrition Guidance', desc:'Log meals by text, get macro breakdowns, meal ideas, and nutrition coaching tailored to your goals.' },
            { icon:'🧠', title:'Mental Wellness', desc:'Daily check-ins, stress management, motivation and emotional support — whenever you need it most.' },
            { icon:'📅', title:'Smart Scheduling', desc:'Text your availability and Ryke books your sessions, sends reminders, and keeps you accountable.' },
            { icon:'⏱️', title:'Feels Human', desc:'Delayed responses, personal tone, and real coach handoffs make every interaction feel genuinely personal.' },
            { icon:'🔒', title:'Private & Secure', desc:'Your conversations stay private. No data sharing, no ads. Just you and your AI mentor.' },
          ].map(f => (
            <div key={f.title} className="feat-card">
              <div style={{ width:48,height:48,background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.2)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:20 }}>{f.icon}</div>
              <div style={{ fontFamily:'serif',fontSize:22,fontWeight:600,marginBottom:10,letterSpacing:'-0.3px' }}>{f.title}</div>
              <p style={{ fontSize:14,color:'#9ca3af',lineHeight:1.7,fontWeight:300 }}>{f.desc}</p>
            </div>
          ))}
        </div>
        {/* Stats */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:1,background:'rgba(124,58,237,0.2)',border:'1px solid rgba(124,58,237,0.2)',borderRadius:16,overflow:'hidden',marginTop:60 }}>
          {[['24/7','Always available'],['0','Apps to download'],['∞','Messages included']].map(([n,l]) => (
            <div key={l} style={{ background:'#111',padding:32,textAlign:'center' as const }}>
              <div style={{ fontFamily:'serif',fontSize:48,fontWeight:700,color:'#a78bfa',lineHeight:1,marginBottom:8 }}>{n}</div>
              <div style={{ fontSize:13,color:'#9ca3af',fontWeight:300 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* INTEGRATIONS */}
      <div style={{ background:'#0d0d0d',borderTop:'1px solid rgba(124,58,237,0.15)',borderBottom:'1px solid rgba(124,58,237,0.15)',padding:'80px 48px' }}>
        <div style={{ maxWidth:1200,margin:'0 auto',textAlign:'center' as const }}>
          <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:16,fontWeight:500 }}>Integrations</div>
          <h2 style={{ fontFamily:'serif',fontSize:'clamp(32px,4vw,52px)',fontWeight:300,letterSpacing:'-1px',marginBottom:12,color:'#f8f6f2' }}>
            Connects with your <em style={{ fontStyle:'italic',color:'#a78bfa' }}>favorite</em> health apps
          </h2>
          <p style={{ fontSize:15,color:'#9ca3af',marginBottom:48,fontWeight:300 }}>Ryke pulls data from the tools you already use — so your mentor always knows the full picture.</p>
          <div style={{ display:'flex',flexWrap:'wrap' as const,justifyContent:'center',gap:16 }}>
            {['⌚ Apple Watch','❤️ Apple Health','🏃 Strava','💚 WHOOP','🚴 Peloton','⌚ Garmin','💍 Oura Ring','📅 Google Calendar','😴 8 Sleep','🧘 Calm','🎧 Headspace','⌚ Fitbit'].map(app => (
              <div key={app} style={{ background:'#1a1a1a',border:'1px solid rgba(124,58,237,0.2)',borderRadius:40,padding:'10px 20px',display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#f8f6f2' }}>{app}</div>
            ))}
          </div>
        </div>
      </div>

      {/* PROBLEM VS SOLUTION */}
      <div style={{ background:'#ffffff',padding:'100px 48px' }}>
        <div style={{ maxWidth:1200,margin:'0 auto' }}>
          <div style={{ textAlign:'center' as const,marginBottom:60 }}>
            <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#7c3aed',marginBottom:16,fontWeight:500 }}>Why Ryke</div>
            <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,5vw,64px)',fontWeight:300,letterSpacing:'-1px',color:'#080808' }}>
              It&apos;s time to <em style={{ fontStyle:'italic',color:'#7c3aed' }}>actually</em> <strong style={{ fontWeight:700 }}>get healthy.</strong>
            </h2>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:24 }}>
            {/* Problem */}
            <div style={{ background:'#f8f8f8',border:'1px solid #e5e7eb',borderRadius:20,padding:40 }}>
              <div style={{ fontSize:12,letterSpacing:2,textTransform:'uppercase' as const,color:'#9ca3af',marginBottom:24,fontWeight:600 }}>The Problem</div>
              <div style={{ display:'flex',flexDirection:'column' as const,gap:16 }}>
                {['Real coaching costs $200–$500/month — most people can\'t afford it','Health apps are overwhelming, confusing, and nobody sticks with them','Coaches spend hours answering the same client questions every day','Scheduling client sessions is chaotic, stressful and time-consuming','You set goals but have nobody to keep you accountable'].map(p => (
                  <div key={p} style={{ display:'flex',alignItems:'flex-start',gap:12 }}>
                    <div style={{ width:24,height:24,borderRadius:'50%',background:'#fee2e2',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0,marginTop:1 }}>✕</div>
                    <p style={{ fontSize:15,color:'#374151',lineHeight:1.6 }}>{p}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Solution */}
            <div style={{ background:'#080808',border:'1px solid rgba(124,58,237,0.3)',borderRadius:20,padding:40,position:'relative' as const,overflow:'hidden' }}>
              <div style={{ position:'absolute' as const,top:-60,right:-60,width:200,height:200,background:'radial-gradient(circle,rgba(124,58,237,0.2),transparent 70%)',pointerEvents:'none' }} />
              <div style={{ fontSize:12,letterSpacing:2,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:24,fontWeight:600 }}>The Ryke Solution</div>
              <div style={{ display:'flex',flexDirection:'column' as const,gap:16 }}>
                {['Ryke costs 1/10th of a real coach — guidance for everyone','Just text — no apps, no logins, no learning curve at all','Coaches get an AI that handles clients 24/7 in their voice','Clients text to book — Ryke handles all scheduling automatically','Ryke checks in daily — your personal mentor, always in your corner'].map(s => (
                  <div key={s} style={{ display:'flex',alignItems:'flex-start',gap:12 }}>
                    <div style={{ width:24,height:24,borderRadius:'50%',background:'rgba(124,58,237,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0,marginTop:1,color:'#a78bfa' }}>✓</div>
                    <p style={{ fontSize:15,color:'#e5e7eb',lineHeight:1.6 }}>{s}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOR COACHES */}
      <div id="coaches" style={{ background:'#111',borderTop:'1px solid rgba(124,58,237,0.2)',borderBottom:'1px solid rgba(124,58,237,0.2)',padding:'100px 48px' }}>
        <div style={{ maxWidth:1200,margin:'0 auto' }}>
          <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:16,fontWeight:500 }}>For fitness coaches</div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:80,alignItems:'center' }}>
            <div>
              <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,5vw,60px)',fontWeight:300,lineHeight:1.1,letterSpacing:'-1px',marginBottom:20,color:'#f8f6f2' }}>
                Your clients get answers.<br /><em style={{ fontStyle:'italic',color:'#a78bfa' }}>You get your</em><br /><strong style={{ fontWeight:700 }}>life back.</strong>
              </h2>
              <p style={{ fontSize:16,color:'#9ca3af',lineHeight:1.7,fontWeight:300,marginBottom:32 }}>Stop answering the same questions at 11pm. Ryke handles your clients 24/7 — in your voice, your tone, your style. You step in only when it matters.</p>
              <a href="#pricing" style={{ display:'inline-block',background:'#7c3aed',color:'white',padding:'14px 28px',borderRadius:8,fontSize:15,fontWeight:500,textDecoration:'none' }}>See Coach Plans →</a>
            </div>
            <div style={{ display:'flex',flexDirection:'column' as const,gap:16 }}>
              {[['01','Your AI, your voice','Ryke learns your coaching style, phrases, and energy — so every text sounds exactly like you.'],['02','Smart scheduling','Clients text to book sessions. Ryke negotiates times, confirms bookings, and sends reminders automatically.'],['03','Human handoff','Get alerted for sensitive moments. Jump into any conversation instantly — clients never know the difference.']].map(([n,t,d]) => (
                <div key={n} style={{ background:'#080808',border:'1px solid rgba(124,58,237,0.2)',borderRadius:16,padding:28,transition:'all 0.3s' }}>
                  <div style={{ fontFamily:'serif',fontSize:40,fontWeight:700,color:'#a78bfa',opacity:0.3,lineHeight:1,marginBottom:12 }}>{n}</div>
                  <div style={{ fontSize:16,fontWeight:500,marginBottom:8,color:'#f8f6f2' }}>{t}</div>
                  <p style={{ fontSize:14,color:'#9ca3af',lineHeight:1.7,fontWeight:300 }}>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PRICING */}
      <section id="pricing" style={{ padding:'100px 48px',maxWidth:1200,margin:'0 auto' }}>
        <div style={{ textAlign:'center' as const,marginBottom:60 }}>
          <div style={{ fontSize:11,letterSpacing:3,textTransform:'uppercase' as const,color:'#a78bfa',marginBottom:16,fontWeight:500 }}>Simple pricing</div>
          <h2 style={{ fontFamily:'serif',fontSize:'clamp(36px,5vw,64px)',fontWeight:300,letterSpacing:'-1px',color:'#f8f6f2' }}>
            Start free. <em style={{ fontStyle:'italic',color:'#a78bfa' }}>Scale when</em> <strong style={{ fontWeight:700 }}>you&apos;re ready.</strong>
          </h2>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20 }}>
          {/* Individual */}
          <div style={{ background:'#111',border:'1px solid rgba(124,58,237,0.2)',borderRadius:20,padding:'40px 32px',transition:'all 0.3s' }}>
            <div style={{ fontSize:12,letterSpacing:2,textTransform:'uppercase' as const,color:'#9ca3af',marginBottom:16 }}>Individual</div>
            <div style={{ fontFamily:'serif',fontSize:56,fontWeight:700,lineHeight:1,marginBottom:4,letterSpacing:'-2px',color:'#f8f6f2' }}><sup style={{ fontSize:24,verticalAlign:'top',marginTop:12,display:'inline-block' }}>$</sup>20</div>
            <div style={{ fontSize:13,color:'#9ca3af',marginBottom:28 }}>per month · cancel anytime</div>
            <ul style={{ listStyle:'none',marginBottom:32,display:'flex',flexDirection:'column' as const,gap:12 }}>
              {['Unlimited texts with Ryke AI','Fitness, nutrition & wellness','Smart scheduling','Daily check-ins & reminders','Mental health support'].map(f => (
                <li key={f} style={{ fontSize:14,color:'#9ca3af',display:'flex',alignItems:'center',gap:10,fontWeight:300 }}>
                  <span style={{ color:'#a78bfa',fontSize:10 }}>✦</span>{f}
                </li>
              ))}
            </ul>
            <Link href="/onboarding" style={{ display:'block',width:'100%',padding:14,borderRadius:8,fontSize:14,fontWeight:500,textDecoration:'none',textAlign:'center' as const,border:'1px solid rgba(124,58,237,0.3)',color:'#f8f6f2',background:'transparent',boxSizing:'border-box' as const }}>
              Start Free Trial →
            </Link>
          </div>
          {/* Coach Pro — featured */}
          <div style={{ background:'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(124,58,237,0.05))',border:'1px solid #7c3aed',borderRadius:20,padding:'40px 32px',position:'relative' as const,transform:'scale(1.03)',boxShadow:'0 0 40px rgba(124,58,237,0.2)' }}>
            <div style={{ position:'absolute' as const,top:-14,left:'50%',transform:'translateX(-50%)',background:'#7c3aed',color:'white',fontSize:11,fontWeight:600,padding:'4px 16px',borderRadius:20,letterSpacing:1,textTransform:'uppercase' as const,whiteSpace:'nowrap' as const }}>Most Popular</div>
            <div style={{ fontSize:12,letterSpacing:2,textTransform:'uppercase' as const,color:'#9ca3af',marginBottom:16 }}>Coach Pro</div>
            <div style={{ fontFamily:'serif',fontSize:56,fontWeight:700,lineHeight:1,marginBottom:4,letterSpacing:'-2px',color:'#f8f6f2' }}><sup style={{ fontSize:24,verticalAlign:'top',marginTop:12,display:'inline-block' }}>$</sup>99</div>
            <div style={{ fontSize:13,color:'#9ca3af',marginBottom:28 }}>per month · up to 30 clients</div>
            <ul style={{ listStyle:'none',marginBottom:32,display:'flex',flexDirection:'column' as const,gap:12 }}>
              {['Your own branded SMS number','AI trained in your voice & style','Smart scheduling for all clients','Coach dashboard & analytics','Human handoff alerts','Client progress tracking','Response delay settings'].map(f => (
                <li key={f} style={{ fontSize:14,color:'#9ca3af',display:'flex',alignItems:'center',gap:10,fontWeight:300 }}>
                  <span style={{ color:'#a78bfa',fontSize:10 }}>✦</span>{f}
                </li>
              ))}
            </ul>
            <Link href="/onboarding" style={{ display:'block',width:'100%',padding:14,borderRadius:8,fontSize:14,fontWeight:500,textDecoration:'none',textAlign:'center' as const,background:'#7c3aed',color:'white',boxSizing:'border-box' as const }}>
              Start Free Trial →
            </Link>
          </div>
          {/* Coach Elite */}
          <div style={{ background:'#111',border:'1px solid rgba(124,58,237,0.2)',borderRadius:20,padding:'40px 32px',transition:'all 0.3s' }}>
            <div style={{ fontSize:12,letterSpacing:2,textTransform:'uppercase' as const,color:'#9ca3af',marginBottom:16 }}>Coach Elite</div>
            <div style={{ fontFamily:'serif',fontSize:56,fontWeight:700,lineHeight:1,marginBottom:4,letterSpacing:'-2px',color:'#f8f6f2' }}><sup style={{ fontSize:24,verticalAlign:'top',marginTop:12,display:'inline-block' }}>$</sup>149</div>
            <div style={{ fontSize:13,color:'#9ca3af',marginBottom:28 }}>per month · unlimited clients</div>
            <ul style={{ listStyle:'none',marginBottom:32,display:'flex',flexDirection:'column' as const,gap:12 }}>
              {['Everything in Coach Pro','Unlimited client seats','Multiple AI personas','Priority support','Custom branding','Early access to new features'].map(f => (
                <li key={f} style={{ fontSize:14,color:'#9ca3af',display:'flex',alignItems:'center',gap:10,fontWeight:300 }}>
                  <span style={{ color:'#a78bfa',fontSize:10 }}>✦</span>{f}
                </li>
              ))}
            </ul>
            <a href="mailto:hello@ryke.ai" style={{ display:'block',width:'100%',padding:14,borderRadius:8,fontSize:14,fontWeight:500,textDecoration:'none',textAlign:'center' as const,border:'1px solid rgba(124,58,237,0.3)',color:'#f8f6f2',background:'transparent',boxSizing:'border-box' as const }}>
              Contact Us
            </a>
          </div>
        </div>
      </section>

      {/* FOUNDER */}
      <div style={{ padding:'0 48px 100px',maxWidth:1200,margin:'0 auto' }}>
        <div style={{ background:'#111',border:'1px solid rgba(124,58,237,0.2)',borderRadius:24,padding:60,display:'grid',gridTemplateColumns:'auto 1fr',gap:48,alignItems:'center',position:'relative' as const,overflow:'hidden' }}>
          <div style={{ position:'absolute' as const,top:-100,right:-100,width:300,height:300,background:'radial-gradient(circle,rgba(124,58,237,0.15),transparent 70%)',pointerEvents:'none' }} />
          <div style={{ width:120,height:120,borderRadius:'50%',background:'linear-gradient(135deg,#4c1d95,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'serif',fontSize:42,fontWeight:700,color:'white',flexShrink:0,border:'3px solid rgba(124,58,237,0.3)' }}>SR</div>
          <div>
            <div style={{ fontFamily:'serif',fontSize:28,fontWeight:300,fontStyle:'italic',lineHeight:1.5,marginBottom:20,color:'#f8f6f2' }}>
              &ldquo;I built Ryke because real coaching should be accessible to everyone — not just the people who can afford $300 an hour. Guidance changes lives. That&apos;s why Ryke exists.&rdquo;
            </div>
            <div style={{ fontSize:15,fontWeight:500,color:'#a78bfa' }}>Sumair Roudani</div>
            <div style={{ fontSize:13,color:'#9ca3af',marginTop:2 }}>Founder & CEO, Ryke AI</div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ textAlign:'center' as const,padding:'120px 48px',position:'relative' as const,overflow:'hidden' }}>
        <div style={{ position:'absolute' as const,inset:0,background:'radial-gradient(ellipse 60% 60% at 50% 50%,rgba(124,58,237,0.1),transparent 70%)',pointerEvents:'none' }} />
        <h2 style={{ position:'relative',fontFamily:'serif',fontSize:'clamp(42px,6vw,80px)',fontWeight:300,lineHeight:1.1,letterSpacing:'-2px',marginBottom:24,color:'#f8f6f2' }}>
          One text changes <em style={{ fontStyle:'italic',color:'#a78bfa' }}>everything.</em>
        </h2>
        <p style={{ position:'relative',fontSize:17,color:'#9ca3af',marginBottom:48,fontWeight:300 }}>
          Start your free 1-month trial today. No app. No credit card required to begin.
        </p>
        <Link href="/onboarding" style={{ position:'relative',display:'inline-block',background:'#7c3aed',color:'white',padding:'18px 48px',borderRadius:12,fontSize:17,fontWeight:600,textDecoration:'none',boxShadow:'0 8px 32px rgba(124,58,237,0.4)',letterSpacing:'0.3px' }}>
          Start Free Trial →
        </Link>
        <p style={{ position:'relative',fontSize:13,color:'#6b7280',marginTop:16 }}>1-month free · No app download · Works on any phone</p>
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop:'1px solid rgba(124,58,237,0.2)',padding:'40px 48px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ fontFamily:'serif',fontSize:22,fontWeight:700,color:'#f8f6f2' }}>Ryke<span style={{ color:'#a78bfa' }}>.ai</span></div>
        <div style={{ fontSize:13,color:'#9ca3af' }}>© 2026 Ryke AI. All rights reserved.</div>
        <div style={{ display:'flex',gap:24 }}>
          {['Privacy','Terms','Coaches','Contact'].map(l => (
            <a key={l} href="#" style={{ fontSize:13,color:'#9ca3af',textDecoration:'none' }}>{l}</a>
          ))}
        </div>
      </footer>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        @keyframes msgIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .feat-card {
          background:#111; border:1px solid rgba(124,58,237,0.2); border-radius:16px;
          padding:32px; transition:all 0.3s; position:relative; overflow:hidden;
        }
        .feat-card::before {
          content:''; position:absolute; top:0; left:0; right:0; height:2px;
          background:linear-gradient(90deg,#4c1d95,#a78bfa); opacity:0; transition:opacity 0.3s;
        }
        .feat-card:hover { border-color:rgba(124,58,237,0.4); transform:translateY(-4px); box-shadow:0 20px 40px rgba(0,0,0,0.4); }
        .feat-card:hover::before { opacity:1; }
        @media(max-width:768px) {
          nav ul { display:none; }
        }
      `}</style>
    </>
  );
}
