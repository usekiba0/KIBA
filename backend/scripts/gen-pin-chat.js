/* eslint-disable */
// One-off generator for the post-purchase "pin our chat" retention image.
// Original KIBA design (not a copy of any third-party asset). Renders an SVG
// to PNG via sharp so we ship a real, hostable image. Re-run with:
//   node backend/scripts/gen-pin-chat.js
// Output: frontend/public/pin-chat.png
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const W = 1080, H = 1350;

// KIBA palette (from frontend/src/app/globals.css)
const NAVY = '#050d1a', SURFACE = '#0c1829', WHITE = '#f0f9ff';
const SKY = '#0ea5e9', EMERALD = '#10b981', MUTED = '#7eb4cc';

const row = (y, color, title, sub, faded) => `
  <g opacity="${faded ? 0.38 : 1}">
    <circle cx="150" cy="${y + 44}" r="34" fill="${color}"/>
    <text x="210" y="${y + 36}" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${WHITE}">${title}</text>
    <text x="210" y="${y + 74}" font-family="Arial, sans-serif" font-size="24" fill="${MUTED}">${sub}</text>
  </g>`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${SKY}"/>
      <stop offset="1" stop-color="${EMERALD}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.18" r="0.6">
      <stop offset="0" stop-color="${SKY}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${NAVY}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- brand mark -->
  <circle cx="${W / 2}" cy="170" r="64" fill="url(#brand)"/>
  <text x="${W / 2}" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="62" font-weight="800" fill="${WHITE}">K</text>
  <text x="${W / 2}" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="800" letter-spacing="10" fill="${WHITE}">KIBA</text>

  <!-- headline -->
  <text x="${W / 2}" y="408" text-anchor="middle" font-family="Arial, sans-serif" font-size="76" font-weight="800" fill="${WHITE}">Pin our chat</text>
  <text x="${W / 2}" y="462" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="${MUTED}">so I stay at the top of your messages</text>

  <!-- messages mock card -->
  <rect x="90" y="540" width="${W - 180}" height="470" rx="40" fill="${SURFACE}"/>
  <text x="140" y="610" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${MUTED}">Messages</text>

  <!-- pinned KIBA row, highlighted -->
  <rect x="118" y="636" width="${W - 236}" height="118" rx="26" fill="#12233b"/>
  ${row(648, 'url(#brand)', 'KIBA', 'your day, locked in', false)}
  <!-- pin glyph -->
  <g transform="translate(905,676) rotate(40)">
    <rect x="-9" y="-26" width="18" height="34" rx="6" fill="${SKY}"/>
    <rect x="-3" y="8" width="6" height="26" fill="${SKY}"/>
    <circle cx="0" cy="-26" r="13" fill="${EMERALD}"/>
  </g>

  ${row(786, '#34506b', 'Group chat', 'let’s get dinner', true)}
  ${row(894, '#34506b', 'Work', 'sounds good', true)}

  <!-- steps -->
  <text x="${W / 2}" y="1120" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="${WHITE}">Long-press our chat &#8594; tap Pin</text>
  <text x="${W / 2}" y="1176" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="${MUTED}">takes 2 seconds. then you’ll always see me first.</text>
</svg>`;

const outDir = path.resolve(__dirname, '..', '..', 'frontend', 'public');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'pin-chat.png');

sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then((info) => console.log(`wrote ${out} (${info.width}x${info.height}, ${info.size} bytes)`))
  .catch((err) => { console.error('render failed:', err.message); process.exit(1); });
