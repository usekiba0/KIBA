import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SMS Terms of Service — KIBA',
  description: 'Terms for KIBA’s recurring automated text messages, including how to stop.',
};

/**
 * SMS Terms of Service.
 *
 * Required for A2P 10DLC campaign registration — a carrier reviewer opens this
 * page during review, and a dead link is an automatic rejection. Served from
 * this app rather than the marketing site so the URL is on infrastructure we
 * control and can't 404 at the moment it matters.
 *
 * Every claim below is true of the shipped system, not aspirational: the
 * keyword list matches `backend/src/messaging/opt-out.ts`, and the HELP copy
 * matches `HELP_REPLY`. If either changes, this page changes with it — a terms
 * page that describes behaviour the product doesn't have is worse than none.
 *
 * Deliberately plain and unstyled-looking: legal pages that try to be clever
 * read as evasive, and the reviewer is scanning for specific phrases.
 */
export default function SmsTerms() {
  return (
    <main className="legal">
      <h1>SMS Terms of Service</h1>
      <p className="updated">Last updated: 21 July 2026</p>

      <p>
        KIBA is an AI accountability coaching service delivered over text message. By
        providing your mobile number during signup, you consent to receive recurring
        automated text messages from KIBA, including daily check-ins, reminders you
        request, and conversational coaching replies.
      </p>

      <h2>Message frequency</h2>
      <p>
        Message frequency varies. It depends on your plan, the reminders you ask for, and
        how often you message us. A typical user receives a daily check-in plus replies to
        their own messages.
      </p>

      <h2>Cost</h2>
      <p>
        Message and data rates may apply, depending on your mobile plan. KIBA does not
        charge you for individual messages. <strong>Consent to receive messages is not a
        condition of purchase.</strong>
      </p>

      <h2>How to stop</h2>
      <p>
        Reply <strong>STOP</strong> to any message and you will be unsubscribed
        immediately. You will receive one confirmation message and nothing after that.
        STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT and OPTOUT work the same way.
      </p>
      <p>
        Reply <strong>START</strong> at any time to resume. UNSTOP and RESUME also work.
      </p>

      <h2>How to get help</h2>
      <p>
        Reply <strong>HELP</strong> to any message for program information and support
        details, or email{' '}
        <a href="mailto:support@usekiba.ai">support@usekiba.ai</a>.
      </p>

      <h2>Carriers</h2>
      <p>
        Carriers are not liable for delayed or undelivered messages. Supported carriers
        include AT&amp;T, Verizon Wireless, T-Mobile, Sprint, and others.
      </p>

      <h2>Privacy</h2>
      <p>
        We do not sell or share your mobile number with third parties for marketing
        purposes. See our <a href="/privacy">Privacy Policy</a> for how we handle your
        data.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms:{' '}
        <a href="mailto:support@usekiba.ai">support@usekiba.ai</a>.
      </p>

      <style>{`
        .legal {
          max-width: 680px;
          margin: 0 auto;
          padding: 64px 24px 96px;
          color: #cfe3f0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 15px;
          line-height: 1.7;
        }
        .legal h1 { font-size: 28px; color: #f0f9ff; margin: 0 0 6px; letter-spacing: -0.3px; }
        .legal h2 { font-size: 16px; color: #f0f9ff; margin: 32px 0 8px; }
        .legal p { margin: 0 0 14px; }
        .legal strong { color: #f0f9ff; }
        .legal a { color: #38bdf8; }
        .legal .updated { font-size: 13px; color: #5a7a92; margin-bottom: 28px; }
      `}</style>
    </main>
  );
}
