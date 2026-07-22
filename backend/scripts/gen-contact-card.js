/* eslint-disable */
// Generator for the onboarding contact card (Apple-masking Path B). Renders a
// KIBA "K" avatar (same palette as the original pin-chat design) and embeds it
// as the vCard PHOTO so the saved contact shows the brand mark. Re-run with:
//   node backend/scripts/gen-contact-card.js
// Output: frontend/public/kiba-contact.vcf
// Numbers/URL configurable via env; defaults are the live SendBlue (iMessage)
// and Twilio (SMS fallback) numbers — one saved contact brands both threads.
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Register the compiled builder via ts-node so script + app share ONE source.
require('ts-node').register({ transpileOnly: true });
const { buildVcard } = require('../src/onboarding/contact-card');

const NAME = process.env.CONTACT_NAME || 'KIBA';
const NUMBERS = (process.env.CONTACT_NUMBERS || '+14695634418,+18327355182').split(',');
const URL = process.env.CONTACT_URL || 'https://usekiba.ai';

// KIBA palette (from frontend/src/app/globals.css / gen-pin-chat)
const NAVY = '#050d1a', WHITE = '#f0f9ff', SKY = '#0ea5e9', EMERALD = '#10b981';

const SIZE = 240;
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${SKY}"/>
      <stop offset="1" stop-color="${EMERALD}"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${NAVY}"/>
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE * 0.42}" fill="url(#brand)"/>
  <text x="${SIZE / 2}" y="${SIZE / 2 + 34}" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="104" font-weight="800" fill="${WHITE}">K</text>
</svg>`;

async function main() {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const vcf = buildVcard({
    name: NAME,
    numbers: NUMBERS,
    url: URL,
    photoPngBase64: png.toString('base64'),
  });

  const outDir = path.resolve(__dirname, '..', '..', 'frontend', 'public');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'kiba-contact.vcf');
  fs.writeFileSync(out, vcf);
  console.log(`wrote ${out} (${vcf.length} bytes, photo ${png.length}b png, numbers: ${NUMBERS.join(' ')})`);
}

main().catch((err) => { console.error('vcf render failed:', err.message); process.exit(1); });
