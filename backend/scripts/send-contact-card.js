/*
 * One-off: send the KIBA contact card (.vcf) to a specific number, out of band.
 *
 * Why this exists: the contact card IS the Apple masking (Apple has no native
 * branding for a business that texts first), and it normally goes out once per
 * user via ProofService.maybeSendActivationAsks — guarded by a one-shot
 * `activation_asks_sent_at` stamp. Once a user is stamped they can never be sent
 * it again by the normal path, so demoing it or repairing a user who was stamped
 * while CONTACT_CARD_URL was unset needs a manual send.
 *
 * DELIBERATELY does NOT touch `activation_asks_sent_at`. It sends and nothing
 * else, so it can never make a user ineligible for the real flow.
 *
 * Usage (from backend/):
 *   node scripts/send-contact-card.js +18325604035
 *   node scripts/send-contact-card.js +18325604035 --dry-run
 *
 * Credentials are read from Render (RENDER_API_KEY + RENDER_SERVICE_ID in
 * backend/.env), so it always uses exactly what prod uses — no drift between the
 * card this sends and the card users get.
 */
const fs = require('fs');
const path = require('path');

const to = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!to || !/^\+\d{8,15}$/.test(to)) {
  console.error('Usage: node scripts/send-contact-card.js +1XXXXXXXXXX [--dry-run]');
  console.error('Number must be E.164 (leading +, digits only).');
  process.exit(2);
}

const envPath = path.join(__dirname, '..', '.env');
let fileEnv = '';
try { fileEnv = fs.readFileSync(envPath, 'utf8'); } catch { /* optional */ }
const local = (k) => process.env[k] ?? (fileEnv.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const MESSAGE = "quick thing — save my contact so i always show up as KIBA in your texts 📲";

async function renderEnv() {
  const key = local('RENDER_API_KEY');
  const svc = local('RENDER_SERVICE_ID');
  if (!key || !svc) throw new Error('RENDER_API_KEY / RENDER_SERVICE_ID missing from backend/.env');
  const res = await fetch(`https://api.render.com/v1/services/${svc}/env-vars?limit=100`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Render env-vars HTTP ${res.status}`);
  const out = {};
  for (const e of await res.json()) out[e.envVar.key] = e.envVar.value;
  return out;
}

(async () => {
  const env = await renderEnv();
  const cardUrl = env.CONTACT_CARD_URL;
  const keyId = env.SENDBLUE_API_KEY_ID;
  const secret = env.SENDBLUE_API_SECRET_KEY;
  const from = env.SENDBLUE_FROM_NUMBER;

  for (const [k, v] of Object.entries({ CONTACT_CARD_URL: cardUrl, SENDBLUE_API_KEY_ID: keyId, SENDBLUE_API_SECRET_KEY: secret, SENDBLUE_FROM_NUMBER: from })) {
    if (!v) { console.error(`Missing ${k} in the Render environment.`); process.exit(3); }
  }

  // Verify the card is actually serving before we point a phone at it. A .vcf
  // that 404s still "sends" fine — the text lands and the attachment silently
  // vanishes, which is exactly how this class of bug hides.
  const head = await fetch(cardUrl);
  const ctype = head.headers.get('content-type') || '';
  const body = await head.text();
  console.log(`card: ${cardUrl}`);
  console.log(`      HTTP ${head.status}, ${ctype}, ${body.length} bytes`);
  if (head.status !== 200 || !/vcard/i.test(ctype)) {
    console.error('Contact card is not serving as a vCard — refusing to send.');
    process.exit(4);
  }
  const fn = (body.match(/^FN:(.*)$/m) || [])[1];
  const tels = (body.match(/^TEL[^:]*:(.*)$/gm) || []).map((l) => l.split(':')[1]);
  console.log(`      FN=${fn}  TEL=${tels.join(', ')}  photo=${/^PHOTO/m.test(body) ? 'yes' : 'NO'}`);

  if (dryRun) { console.log(`\nDRY RUN — would send to ${to} from ${from}:\n  "${MESSAGE}"`); return; }

  const res = await fetch('https://api.sendblue.co/api/send-message', {
    method: 'POST',
    headers: {
      'sb-api-key-id': keyId,
      'sb-api-secret-key': secret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number: to, from_number: from, content: MESSAGE, media_url: cardUrl }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`\nsend → HTTP ${res.status}  status=${data.status ?? '?'}  error_code=${data.error_code ?? 'null'}`);
  if (data.error_message) console.log(`error_message: ${data.error_message}`);
  if (!res.ok || String(data.status).toUpperCase() === 'ERROR') process.exit(5);
  console.log(`Sent to ${to}. Note: delivery is async — QUEUED means accepted, not delivered.`);
})().catch((err) => { console.error(err.message); process.exit(1); });
