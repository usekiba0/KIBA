'use client';
import { useState, useRef, useEffect } from 'react';

interface Message { who: 'user' | 'ryke'; text: string; }

const CHIPS = [
  'What should I eat pre-workout?',
  'Help me lose 10 lbs',
  "I can't sleep — too stressed",
];

const REPLIES: Record<number, string> = {
  0: "Great question! 30–45 min before training aim for fast carbs + small protein — banana + Greek yogurt, or toast + eggs. Skip high fat/fibre right before (slows digestion). What time is your workout? I'll get specific 🥗",
  1: "10 lbs is absolutely doable — let's make it sustainable. Quick questions: what does a typical day of eating look like for you, and are you doing any exercise right now? I want to build around your actual life, not a generic plan 💪",
  2: "Stress + sleep is such a common pair and more fixable than most people think. Tonight: no screens 30 min before bed, write down tomorrow's 3 tasks (clears your head), then try 4-7-8 breathing. What's running through your mind? Let's talk it through 🌙",
};

const FALLBACK = "Got it — I'm on it. Tell me a bit more about where you're at and I'll give you something specific and actionable. This is exactly what I'm here for 💬";

export default function SmsDemo() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [usedChips, setUsedChips] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const sendMessage = (text: string, chipIndex?: number) => {
    if (!text.trim() || typing) return;
    setMessages(m => [...m, { who: 'user', text }]);
    setInput('');
    setTyping(true);
    if (chipIndex !== undefined) setUsedChips(s => new Set(s).add(chipIndex));

    const reply = chipIndex !== undefined ? REPLIES[chipIndex] : FALLBACK;
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { who: 'ryke', text: reply }]);
    }, 1600);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', maxWidth: 1100, margin: '0 auto' }}>
      {/* Left */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: '#fb7185', marginBottom: 16, fontWeight: 500 }}>Live demo</div>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,4vw,52px)', fontWeight: 300, letterSpacing: '-1px', color: '#fafafa', lineHeight: 1.15, marginBottom: 20 }}>
          Try Ryke <em style={{ fontStyle: 'italic', color: '#8b5cf6' }}>right now.</em>
        </h2>
        <p style={{ fontSize: 15, color: '#a1a1aa', lineHeight: 1.7, fontWeight: 300, marginBottom: 32 }}>
          Pick a topic below or type your own question. See exactly how Ryke responds — no sign-up needed.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          {CHIPS.map((chip, i) => (
            <button
              key={i}
              onClick={() => sendMessage(chip, i)}
              disabled={typing || usedChips.has(i)}
              style={{ background: usedChips.has(i) ? 'rgba(225,29,72,0.06)' : 'rgba(225,29,72,0.08)', border: `1px solid rgba(225,29,72,${usedChips.has(i) ? 0.15 : 0.3})`, borderRadius: 10, padding: '12px 18px', textAlign: 'left' as const, cursor: typing || usedChips.has(i) ? 'default' : 'pointer', color: usedChips.has(i) ? '#71717a' : '#fda4af', fontSize: 14, fontWeight: 400, transition: 'all 0.2s', lineHeight: 1.4 }}
            >
              {usedChips.has(i) ? '✓ ' : '→ '}{chip}
            </button>
          ))}
        </div>
      </div>

      {/* Right — Phone */}
      <div style={{ position: 'relative' as const }}>
        <div style={{ position: 'absolute' as const, inset: -30, background: 'radial-gradient(ellipse at 50% 50%,rgba(225,29,72,0.12) 0%,transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ background: '#141414', borderRadius: 36, border: '6px solid #222', padding: '18px 14px 22px', boxShadow: '0 0 0 1px rgba(225,29,72,0.2),0 32px 64px rgba(0,0,0,0.6)' }}>
          {/* Header */}
          <div style={{ width: 72, height: 6, background: '#222', borderRadius: 3, margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#be123c,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}>R</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fafafa' }}>Ryke</div>
              <div style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Online now
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ minHeight: 220, maxHeight: 280, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 8, paddingRight: 2 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center' as const, padding: '40px 20px', color: '#52525b', fontSize: 13, lineHeight: 1.6 }}>
                Click a topic on the left<br />to start a conversation
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ padding: '9px 13px', borderRadius: m.who === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', fontSize: 12, lineHeight: 1.5, maxWidth: '88%', alignSelf: m.who === 'user' ? 'flex-end' : 'flex-start', background: m.who === 'user' ? 'linear-gradient(135deg,#e11d48,#be123c)' : '#222', color: '#fafafa', border: m.who === 'ryke' ? '1px solid rgba(225,29,72,0.15)' : 'none' }}>
                {m.text}
              </div>
            ))}
            {typing && (
              <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: '#222', border: '1px solid rgba(225,29,72,0.15)', alignSelf: 'flex-start', display: 'inline-flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block', animation: `typingPulse 1.2s ease ${i * 0.2}s infinite` }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
              placeholder="Type a message…"
              disabled={typing}
              style={{ flex: 1, background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '8px 14px', fontSize: 12, color: '#fafafa', outline: 'none' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={typing || !input.trim()}
              style={{ width: 32, height: 32, borderRadius: '50%', background: input.trim() && !typing ? 'linear-gradient(135deg,#e11d48,#8b5cf6)' : '#222', border: 'none', cursor: input.trim() && !typing ? 'pointer' : 'default', color: 'white', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >↑</button>
          </div>
        </div>
      </div>
      <style>{`@keyframes typingPulse{0%,80%,100%{opacity:.25;transform:scale(.85)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
