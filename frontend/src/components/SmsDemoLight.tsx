'use client';
import { useState, useRef, useEffect } from 'react';

interface Message { who: 'user' | 'ryke'; text: string; }

const AC  = '#B45309';
const S1  = '#F5F0E8';
const TX  = '#1C1917';
const MT  = '#78716C';

const CHIPS = [
  'What should I eat pre-workout?',
  'Help me lose 10 lbs',
  "I can't sleep — too stressed",
];

const REPLIES: Record<number, string> = {
  0: "30–45 min before training: fast carbs + small protein. Banana + Greek yogurt, or toast + eggs. Skip high fat/fibre right before. What time is your workout? I'll get more specific 🥗",
  1: "10 lbs is absolutely doable — let's make it sustainable. What does a typical day of eating look like, and are you doing any exercise right now? I want to build around your actual life 💪",
  2: "Stress and sleep go hand in hand. Tonight: no screens 30 min before bed, write tomorrow's 3 tasks to clear your head, then try 4-7-8 breathing. What's on your mind? Let's talk it through 🌙",
};

const FALLBACK = "Got it — I'm on it. Tell me a bit more about where you're at and I'll give you something specific and actionable. This is exactly what I'm here for 💬";

export default function SmsDemoLight() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [usedChips, setUsedChips] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll the message container — NOT the whole page
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
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
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' as const, color: AC, marginBottom: 16, fontWeight: 600 }}>Live demo</div>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px,4vw,52px)', fontWeight: 300, letterSpacing: '-1px', color: TX, lineHeight: 1.15, marginBottom: 20 }}>
          Try Ryke <em style={{ fontStyle: 'italic', color: AC }}>right now.</em>
        </h2>
        <p style={{ fontSize: 15, color: MT, lineHeight: 1.7, fontWeight: 300, marginBottom: 32 }}>
          Pick a topic below or type your own question. See exactly how Ryke responds — no sign-up needed.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          {CHIPS.map((chip, i) => (
            <button
              key={i}
              onClick={() => sendMessage(chip, i)}
              disabled={typing || usedChips.has(i)}
              style={{
                background: usedChips.has(i) ? 'rgba(180,83,9,0.05)' : 'rgba(180,83,9,0.07)',
                border: `1px solid rgba(180,83,9,${usedChips.has(i) ? 0.15 : 0.25})`,
                borderRadius: 10, padding: '12px 18px', textAlign: 'left' as const,
                cursor: typing || usedChips.has(i) ? 'default' : 'pointer',
                color: usedChips.has(i) ? MT : AC,
                fontSize: 14, fontWeight: 400, transition: 'all 0.2s', lineHeight: 1.4,
              }}
            >
              {usedChips.has(i) ? '✓ ' : '→ '}{chip}
            </button>
          ))}
        </div>
      </div>

      {/* Right — Phone */}
      <div style={{ position: 'relative' as const }}>
        <div style={{ background: 'white', borderRadius: 36, border: '6px solid #EDE7DC', padding: '18px 14px 22px', boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>
          <div style={{ width: 60, height: 6, background: S1, borderRadius: 3, margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px 10px', borderBottom: '1px solid rgba(0,0,0,0.07)', marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: AC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}>R</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>Ryke</div>
              <div style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Online now
              </div>
            </div>
          </div>

          {/* Messages — scroll inside this container only */}
          <div ref={containerRef} style={{ minHeight: 220, maxHeight: 280, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: 8, paddingRight: 2 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center' as const, padding: '40px 20px', color: MT, fontSize: 13, lineHeight: 1.6 }}>
                Click a topic on the left<br />to start a conversation
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                padding: '9px 13px',
                borderRadius: m.who === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                fontSize: 12, lineHeight: 1.5, maxWidth: '88%',
                alignSelf: m.who === 'user' ? 'flex-end' : 'flex-start',
                background: m.who === 'user' ? AC : S1,
                color: m.who === 'user' ? 'white' : TX,
              }}>
                {m.text}
              </div>
            ))}
            {typing && (
              <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: S1, alignSelf: 'flex-start', display: 'inline-flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: MT, display: 'inline-block', animation: `smsDemoTyping 1.2s ease ${i * 0.2}s infinite` }} />
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(input); } }}
              placeholder="Type a message..."
              disabled={typing}
              style={{ flex: 1, background: S1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 20, padding: '8px 14px', fontSize: 12, color: TX, outline: 'none' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={typing || !input.trim()}
              style={{ width: 32, height: 32, borderRadius: '50%', background: input.trim() && !typing ? AC : S1, border: 'none', cursor: input.trim() && !typing ? 'pointer' : 'default', color: input.trim() && !typing ? 'white' : MT, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >&#8593;</button>
          </div>
        </div>
      </div>
      <style>{`@keyframes smsDemoTyping{0%,80%,100%{opacity:.25;transform:scale(.85)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
