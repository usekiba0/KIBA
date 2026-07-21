/**
 * Default text for the public legal pages.
 *
 * Stored here rather than only in the database so the pages can NEVER render
 * blank: a privacy policy that 404s or shows an empty box during a carrier
 * review is worse than one that is merely out of date. The database copy (in
 * `app_settings`, editable from the admin panel) overrides this when present.
 *
 * ── IMPORTANT ─────────────────────────────────────────────────────────────
 * Every factual claim below was written against the actual schema and the
 * actual third-party integrations, not from a template:
 *
 *   collected      → user.entity.ts, psychological-profile.entity.ts,
 *                    message.entity.ts (content + media_url), goal.entity.ts,
 *                    proof.entity.ts, execution-score.entity.ts
 *   AI processing  → @anthropic-ai/sdk (ai/anthropic.factory.ts)
 *   delivery       → SendBlue (iMessage) + Twilio (SMS), messaging.service.ts
 *   payments       → Stripe; we store customer/subscription ids only, card
 *                    details never touch our servers (Stripe Elements)
 *   deletion       → admin.service.deleteUserByPhone, a real cascading wipe
 *   opt-out        → messaging/opt-out.ts, enforced at the send chokepoint
 *
 * If any of those change, this text has to change with them. A policy that
 * describes behaviour the product does not have is the problem it was meant
 * to prevent.
 *
 * This is an accurate description of how the system handles data. It is NOT
 * legal advice, and it should be reviewed by the business's attorney before
 * or alongside A2P submission.
 */

export interface LegalDoc {
  title: string;
  body: string;
}

export const LEGAL_SLUGS = ['privacy', 'sms-terms'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

const PRIVACY_BODY = `Last updated: 22 July 2026

KIBA is an AI accountability coaching service delivered over text message. This policy explains what we collect, why, who we share it with, and how to get it deleted.

## Who we are

KIBA is operated as an SMS and iMessage coaching service. For any privacy question or request, contact support@usekiba.ai.

## What we collect

You give us most of this directly, during signup or in conversation:

- Your name and mobile phone number.
- Your city or timezone, so messages arrive at a sensible local hour.
- Your goals, why they matter to you, and the plan you agree to.
- Background you share during intake — what you have struggled with, what tends to derail you, and how you want to be spoken to.
- The content of the messages you exchange with KIBA, including photos you send as proof.
- Records of your progress: tasks, completions, streaks and scores.

We also record technical information needed to deliver messages, such as delivery status and timestamps.

We do not collect your location, your health app data, or your contacts.

## How we use it

- To deliver the coaching service: daily check-ins, reminders you ask for, and replies to your messages.
- To remember your goals and history, so KIBA does not ask you the same thing twice.
- To process your subscription.

We do not use your information to build advertising profiles.

## Who we share it with

We use a small number of service providers, and only to run the service:

- **Anthropic** — the content of your conversation is sent to Anthropic's AI models to generate KIBA's replies. This is core to how the product works.
- **SendBlue and Twilio** — to deliver messages to your phone over iMessage and SMS.
- **Stripe** — to process payments. Card details are entered directly with Stripe and never reach our servers; we store only the identifiers Stripe gives us.
- **Render** — hosting and database infrastructure.

**We never sell your personal information, and we never share your mobile number with third parties for marketing purposes.**

We may disclose information if required by law, or where we believe in good faith that someone is at risk of serious harm.

## A note on safety

KIBA is a coaching service, not a medical or crisis service. If a conversation suggests you may be at risk, we may flag it for human review so someone can respond. KIBA is not a substitute for professional help.

## How long we keep it

We keep your information while your account is active, so KIBA can remember you between conversations. If you ask us to delete your account, we remove your profile, your conversation history and your uploaded photos.

## Your choices

- **Stop messages at any time** by replying STOP to any message. You will be unsubscribed immediately and receive one confirmation. Reply START to resume.
- **Request a copy of your data, or its deletion**, by emailing support@usekiba.ai.

## Security

Data is transmitted over encrypted connections and stored on managed infrastructure with restricted access. No system is perfectly secure, and we cannot guarantee absolute security.

## Age

KIBA is intended for adults. It is not directed at children, and we do not knowingly collect information from anyone under 18.

## Changes

If this policy changes materially we will update the date at the top of this page.

## Contact

support@usekiba.ai`;

const SMS_TERMS_BODY = `Last updated: 22 July 2026

KIBA is an AI accountability coaching service delivered over text message. By providing your mobile number during signup, you consent to receive recurring automated text messages from KIBA, including daily check-ins, reminders you request, and conversational coaching replies.

## Message frequency

Message frequency varies. It depends on your plan, the reminders you ask for, and how often you message us. A typical user receives a daily check-in plus replies to their own messages.

## Cost

Message and data rates may apply, depending on your mobile plan. KIBA does not charge you for individual messages. Consent to receive messages is not a condition of purchase.

## How to stop

Reply STOP to any message and you will be unsubscribed immediately. You will receive one confirmation message and nothing after that. STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT and OPTOUT work the same way.

Reply START at any time to resume. UNSTOP and RESUME also work.

## How to get help

Reply HELP to any message for program information and support details, or email support@usekiba.ai.

## Carriers

Carriers are not liable for delayed or undelivered messages. Supported carriers include AT&T, Verizon Wireless, T-Mobile, Sprint, and others.

## Privacy

We do not sell or share your mobile number with third parties for marketing purposes. See our Privacy Policy for how we handle your data.

## Contact

support@usekiba.ai`;

export const DEFAULT_LEGAL: Record<LegalSlug, LegalDoc> = {
  privacy: { title: 'Privacy Policy', body: PRIVACY_BODY },
  'sms-terms': { title: 'SMS Terms of Service', body: SMS_TERMS_BODY },
};

export function isLegalSlug(v: string): v is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(v);
}
