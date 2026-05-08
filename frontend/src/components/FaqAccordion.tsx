'use client';
import { useState } from 'react';

const FAQS = [
  {
    q: 'Does Kiba work on Android?',
    a: 'Yes — Kiba works on any phone that can send and receive SMS. Android users get standard SMS. iPhone users automatically receive iMessages (blue bubbles) via our SendBlue integration, so the experience is native on both platforms.',
  },
  {
    q: 'What happens when my free trial ends?',
    a: "Nothing changes abruptly. Your trial lasts a full 30 days. The day before it ends, Kiba will text you a reminder. After that, your card is charged and accountability continues uninterrupted. You can cancel anytime — just text 'CANCEL' to Kiba.",
  },
  {
    q: 'Is my conversation private?',
    a: 'Absolutely. Your messages are encrypted in transit and at rest. We never sell your data, share it with third parties, or use it to train AI models. You can request a full export or deletion of your data at any time.',
  },
  {
    q: 'How is Kiba different from just setting a reminder?',
    a: "Reminders are passive — you can ignore them. Kiba uses your own words against you. It knows what you said you wanted, what you said you were afraid of, and who you said you were falling behind. It demands proof, not promises.",
  },
  {
    q: 'Can Kiba text me at 2am?',
    a: "Yes — Kiba is available 24 hours a day, 7 days a week. If you committed to a task and haven't reported back, Kiba will follow up. There is no off-hours. There is no snooze.",
  },
  {
    q: 'What if I need a real human coach?',
    a: "Kiba is not a replacement for human coaching — it is a layer of accountability that runs 24/7. For users who want escalation to a live coach, that option is available on Pro and Elite plans.",
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
