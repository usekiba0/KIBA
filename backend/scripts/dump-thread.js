/*
 * Reconstruct a live conversation from Render logs — no screenshots needed.
 *
 * Every inbound lands as a `[SendBlue] Raw webhook payload` line and every
 * outbound as a `[SendBlue] Send response`, and BOTH carry the full message body
 * plus a provider `date_sent`. That is enough to rebuild a thread exactly as the
 * phone saw it, which is the only way to tell a generation bug from a delivery
 * bug (2026-07-31: replies were fine, delivery order was not).
 *
 * READ-ONLY. It never sends, edits or deletes anything.
 *
 * Usage:
 *   node scripts/dump-thread.js +18325604035              # last 12h
 *   HOURS=36 node scripts/dump-thread.js +18325604035
 *   node scripts/dump-thread.js                           # every number seen
 *
 * Credentials (from backend/.env or the environment):
 *   RENDER_API_KEY / RENDER_SERVICE_ID / RENDER_OWNER_ID
 *
 * Render's logs API caps at 100 rows per call and returns them oldest-first, so
 * a single wide window silently drops the newest events. We walk the range in
 * small slices instead — see CHUNK_MIN.
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
let fileEnv = '';
try {
  fileEnv = fs.readFileSync(envPath, 'utf8');
} catch {
  /* .env optional — real environment may already carry the keys */
}
const getEnv = (k) => process.env[k] ?? (fileEnv.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const KEY = getEnv('RENDER_API_KEY');
const SVC = getEnv('RENDER_SERVICE_ID');
const OWN = getEnv('RENDER_OWNER_ID');
if (!KEY || !SVC || !OWN) {
  console.error('Missing RENDER_API_KEY / RENDER_SERVICE_ID / RENDER_OWNER_ID.');
  process.exit(1);
}

const target = process.argv[2] || null;
const HOURS = Number(process.env.HOURS || 12);
const CHUNK_MIN = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Render's logs API rate-limits hard once you walk a range in slices. A 429 here
 * is silent data loss — the window just comes back empty and the thread looks
 * shorter than it was — so back off and retry rather than skipping.
 */
async function slice(startIso, endIso, text) {
  const u = new URL('https://api.render.com/v1/logs');
  u.searchParams.set('ownerId', OWN);
  u.searchParams.append('resource', SVC);
  u.searchParams.set('startTime', startIso);
  u.searchParams.set('endTime', endIso);
  u.searchParams.set('limit', '100');
  u.searchParams.set('text', text);

  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    if (r.ok) return (await r.json()).logs || [];
    if (r.status === 429) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`logs API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error('rate limited after 6 attempts');
}

/** The body is embedded as a JSON object inside the log line; pull it out. */
function extractPayload(message) {
  const at = message.indexOf('{"accountEmail"');
  if (at === -1) return null;
  // Walk braces so a '}' inside the message body can't truncate it early.
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = at; i < message.length; i++) {
    const c = message[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(message.slice(at, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

(async () => {
  const end = new Date();
  const start = new Date(end - HOURS * 3600e3);
  const seen = new Map();

  for (let t = start.getTime(); t < end.getTime(); t += CHUNK_MIN * 60e3) {
    const a = new Date(t).toISOString();
    const b = new Date(Math.min(t + CHUNK_MIN * 60e3, end.getTime())).toISOString();
    for (const text of ['Raw webhook payload', 'Send response for']) {
      let rows = [];
      try {
        rows = await slice(a, b, text);
      } catch (err) {
        console.error(`! ${a} ${text}: ${err.message}`);
        continue;
      }
      await sleep(400); // stay under the logs-API rate limit
      for (const row of rows) {
        const p = extractPayload(row.message.replace(/\x1b\[[0-9;]*m/g, ''));
        if (!p || typeof p.content !== 'string') continue;
        const phone = p.number || p.to_number || p.from_number;
        if (target && phone !== target) continue;
        // message_handle dedupes the webhook echo of our own outbound sends.
        const key = p.message_handle || `${phone}|${p.date_sent}|${p.content}`;
        if (seen.has(key)) continue;
        seen.set(key, {
          phone,
          at: p.date_sent || row.timestamp,
          outbound: !!p.is_outbound,
          content: p.content,
          media: p.media_url || '',
        });
      }
    }
  }

  const all = [...seen.values()].sort((x, y) => (x.at < y.at ? -1 : 1));
  if (!all.length) {
    console.log(`No messages found in the last ${HOURS}h${target ? ` for ${target}` : ''}.`);
    return;
  }

  const byPhone = new Map();
  for (const m of all) {
    if (!byPhone.has(m.phone)) byPhone.set(m.phone, []);
    byPhone.get(m.phone).push(m);
  }

  for (const [phone, msgs] of byPhone) {
    console.log(`\n${'='.repeat(72)}\n${phone}  —  ${msgs.length} messages\n${'='.repeat(72)}`);
    let prev = null;
    for (const m of msgs) {
      const t = new Date(m.at);
      // Gap between consecutive outbound bubbles is the delivery-order tell:
      // sequential sends land ~450ms apart, concurrent ones ~20ms.
      const gap =
        prev && m.outbound && prev.outbound ? ` (+${t - new Date(prev.at)}ms)` : '';
      const who = m.outbound ? 'KIBA' : 'USER';
      console.log(
        `\n[${t.toISOString().replace('T', ' ').slice(0, 19)}Z] ${who}${gap}${m.media ? ' [media]' : ''}`,
      );
      console.log(m.content);
      prev = m;
    }
  }
  console.log('');
})();
