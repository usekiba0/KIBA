import { ImageResponse } from 'next/og';

/**
 * Site-wide default link preview. Any KIBA URL that doesn't define its own card
 * (the marketing page, the success page, legal pages) falls back to this one, so
 * no KIBA link ever shows up as a bare icon in a message or a DM.
 */

// See the note in plan/opengraph-image.tsx — edge avoids @vercel/og's Windows
// font-resolution crash at build time and is Vercel's recommended OG runtime.
export const runtime = 'edge';

export const alt = 'KIBA — the system that makes ignoring your goals impossible';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#050d1a';
const TX = '#f0f9ff';
const R = '#0ea5e9';
const V = '#10b981';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `radial-gradient(ellipse at 50% 0%, #0d2740 0%, ${BG} 62%)`,
          padding: 80,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -160,
            left: 320,
            width: 560,
            height: 400,
            background: `linear-gradient(135deg, ${R}, ${V})`,
            opacity: 0.2,
            filter: 'blur(120px)',
            display: 'flex',
          }}
        />

        <div
          style={{
            display: 'flex',
            fontSize: 128,
            fontWeight: 800,
            letterSpacing: -6,
            color: TX,
          }}
        >
          KIBA
        </div>

        <div
          style={{
            display: 'flex',
            width: 180,
            height: 5,
            borderRadius: 999,
            marginTop: 30,
            marginBottom: 38,
            background: `linear-gradient(135deg, ${R}, ${V})`,
          }}
        />

        <div
          style={{
            display: 'flex',
            fontSize: 40,
            color: '#7eb4cc',
            textAlign: 'center',
            lineHeight: 1.35,
            maxWidth: 900,
          }}
        >
          The system that makes ignoring your goals impossible.
        </div>
      </div>
    ),
    size,
  );
}
