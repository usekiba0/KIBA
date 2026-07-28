import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const TITLE = 'KIBA — The system that makes ignoring your goals impossible.';
const DESCRIPTION =
  'AI-powered accountability system. Deep psychological pressure, proof-based check-ins, and zero tolerance for silent failure.';

/**
 * `metadataBase` is what turns the generated `opengraph-image` into the absolute
 * URL that iMessage, WhatsApp, and every other unfurler require — without it
 * Next emits a relative path and the preview silently falls back to a bare icon.
 * Points at the app host (onboarding.usekiba.ai), NOT the marketing domain, since
 * that's the host the texted links actually resolve to.
 */
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://onboarding.usekiba.ai',
  ),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'KIBA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=DM+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
