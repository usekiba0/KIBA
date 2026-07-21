const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

export interface LegalDoc {
  slug: string;
  title: string;
  body: string;
}

/**
 * Minimal fallbacks used ONLY when the API is unreachable at build or
 * revalidate time.
 *
 * A privacy policy page that renders an error, or nothing, during a carrier
 * review is an automatic campaign rejection — so these pages must degrade to
 * something truthful rather than to a blank. The authoritative text lives in
 * `backend/src/data/legal-content.ts`; this is a short, accurate stand-in that
 * still carries the two lines carriers specifically look for (no selling or
 * sharing of numbers, and how to stop).
 */
const FALLBACK: Record<string, LegalDoc> = {
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    body: `KIBA is an AI accountability coaching service delivered over text message.

We collect your name, mobile number, goals and the content of your conversation with KIBA, and we use them to deliver the coaching service. Message content is processed by our AI provider to generate replies, and messages are delivered through SendBlue and Twilio. Payments are handled by Stripe; card details never reach our servers.

**We never sell your personal information, and we never share your mobile number with third parties for marketing purposes.**

Reply STOP to any message to be unsubscribed immediately. To request a copy of your data or have it deleted, email support@usekiba.ai.

## Contact

support@usekiba.ai`,
  },
  'sms-terms': {
    slug: 'sms-terms',
    title: 'SMS Terms of Service',
    body: `By providing your mobile number during signup, you consent to receive recurring automated text messages from KIBA. Message frequency varies. Message and data rates may apply. Consent is not a condition of purchase.

Reply STOP to any message to unsubscribe immediately, or START to resume. Reply HELP, or email support@usekiba.ai, for help.

Carriers are not liable for delayed or undelivered messages.

## Contact

support@usekiba.ai`,
  },
};

export async function fetchLegalDoc(slug: 'privacy' | 'sms-terms'): Promise<LegalDoc> {
  try {
    const res = await fetch(`${API}/legal/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(String(res.status));
    const doc = (await res.json()) as Partial<LegalDoc>;
    if (!doc?.body?.trim()) throw new Error('empty body');
    return { slug, title: doc.title?.trim() || FALLBACK[slug].title, body: doc.body };
  } catch {
    return FALLBACK[slug];
  }
}
