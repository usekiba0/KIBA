import { ImageResponse } from 'next/og';

/**
 * The card that renders inside the text message when KIBA sends someone their
 * checkout link.
 *
 * This is the whole reason the SMS points at OUR domain (`/plan?t=...`) instead
 * of a raw checkout.stripe.com URL — we own the preview. Before this existed the
 * link arrived as a bare grey compass icon, which reads like spam next to a
 * branded card (Karibi 2026-07-28, comparing against Tomo's member card).
 *
 * Deliberately says nothing about price or trial length: the trial is
 * referral-aware and set in Stripe, so any number baked into an image here would
 * eventually contradict the checkout page it links to.
 */

// Edge runtime, not node: @vercel/og's node build resolves its bundled font via
// fileURLToPath, which throws on Windows paths and breaks `next build` locally.
// Edge is also the runtime Vercel recommends for OG generation, so this is the
// normal setup rather than a workaround with a cost.
export const runtime = 'edge';

export const alt = 'KIBA — your accountability partner, in your messages';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Mirrors the palette in src/app/page.tsx and the /plan page itself.
const BG = '#050d1a';
const TX = '#f0f9ff';
const R = '#0ea5e9';
const V = '#10b981';

/** Opacity ramp for the stacked wordmark — brightest in the middle, fading out
 * top and bottom, so the eye lands on the center row. Five rows, not seven:
 * seven overflowed the 630px card, clipping the last row and pushing the caption
 * out of frame entirely. */
const ROWS = [0.2, 0.45, 1, 0.45, 0.2];

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
          position: 'relative',
        }}
      >
        {/* Warm accent bloom so the card doesn't read as a flat black rectangle
            when iMessage renders it against a dark thread. */}
        <div
          style={{
            position: 'absolute',
            top: -180,
            left: 300,
            width: 600,
            height: 420,
            background: `linear-gradient(135deg, ${R}, ${V})`,
            opacity: 0.22,
            filter: 'blur(120px)',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {ROWS.map((opacity, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                opacity,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 62,
                  fontWeight: 800,
                  letterSpacing: -2,
                  color: TX,
                }}
              >
                KIBA
              </span>
              <span
                style={{
                  marginLeft: 18,
                  padding: '6px 22px 9px',
                  borderRadius: 999,
                  background: `linear-gradient(135deg, ${R}, ${V})`,
                  color: '#03131f',
                  fontSize: 40,
                  fontWeight: 700,
                }}
              >
                member
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 46,
            fontSize: 28,
            color: '#7eb4cc',
            letterSpacing: 1,
          }}
        >
          tap to start — no app, no login
        </div>
      </div>
    ),
    size,
  );
}
