import type { Metadata } from 'next';

/**
 * Metadata-only layout for the texted checkout link.
 *
 * `plan/page.tsx` is a client component, so it can't export `metadata` itself —
 * this wrapper is what lets the SMS preview carry its own title and description
 * instead of inheriting the marketing-site copy from the root layout. The card
 * image comes from the sibling `opengraph-image.tsx`.
 */
export const metadata: Metadata = {
  title: 'Start with KIBA',
  description: 'Your accountability partner, in your messages. No app, no login.',
  openGraph: {
    title: 'Start with KIBA',
    description: 'Your accountability partner, in your messages. No app, no login.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Start with KIBA',
    description: 'Your accountability partner, in your messages. No app, no login.',
  },
  // A checkout link is personal and single-use — keep it out of search results.
  robots: { index: false, follow: false },
};

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
