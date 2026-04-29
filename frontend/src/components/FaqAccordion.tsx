'use client';
import { useState } from 'react';

const FAQS = [
  {
    q: 'Does Ryke work on Android?',
    a: 'Yes — Ryke works on any phone that can send and receive SMS. Android users get standard SMS/MMS. iPhone users automatically receive iMessages (blue bubbles) via our SendBlue integration, so the experience is native on both platforms.',
  },
  {
    q: 'What happens when my free trial ends?',
    a: "Nothing changes abruptly. Your trial lasts a full 30 days. The day before it ends, Ryke will text you a reminder. After that, your card is charged $20/month and coaching continues uninterrupted. You can cancel anytime — just text 'CANCEL' to Ryke.",
  },
  {
    q: 'Is my conversation private?',
    a: 'Absolutely. Your messages are encrypted in transit and at rest. We never sell your data, share it with third parties, or use it to train AI models. You can request a full export or deletion of your data at any time.',
  },
  {
    q: 'How is Ryke different from just asking ChatGPT?',
    a: "ChatGPT has no memory of you between sessions and gives generic answers. Ryke knows your goals, body metrics, health conditions, and history from day one — and proactively checks in on you. It's a coach, not a chatbot.",
  },
  {
    q: 'Can I text Ryke at 2am?',
    a: "Yes — Ryke is available 24 hours a day, 7 days a week. There's no off-hours, no waiting room, no scheduling. Text whenever you need support, motivation, a meal idea, or someone to talk to. Ryke is always there.",
  },
  {
    q: 'What if I need a real human coach?',
    a: "Ryke is built to work alongside human coaches, not replace them. If you ever need a live human, Ryke will flag it and connect you. Our Coach Pro and Elite plans let professional coaches deploy Ryke under their brand — so your AI and human support stay in sync.",
  },
];

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
      {FAQS.map((faq, i) => (
        <div
          key={i}
          style={{ background: '#111113', border: `1px solid ${open === i ? 'rgba(225,29,72,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s' }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, gap: 16 }}
          >
            <span style={{ fontSize: 15, fontWeight: 500, color: '#fafafa', lineHeight: 1.4 }}>{faq.q}</span>
            <span style={{ color: open === i ? '#fb7185' : '#71717a', fontSize: 20, flexShrink: 0, transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.25s, color 0.2s', lineHeight: 1 }}>+</span>
          </button>
          {open === i && (
            <div style={{ padding: '0 24px 20px', fontSize: 14, color: '#a1a1aa', lineHeight: 1.75, fontWeight: 300 }}>
              {faq.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
