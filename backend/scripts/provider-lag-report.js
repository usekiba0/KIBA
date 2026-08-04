/*
 * SendBlue inbound forwarding-lag report (Karibi 2026-08-04).
 *
 * WHY THIS EXISTS
 * turn_latency.e2eMs starts at OUR webhook receipt, so everything the provider
 * spent handing the message over used to be invisible. Measured 2026-08-03 it is
 * p50 ~2.6s — roughly HALF the perceived latency of a fast text reply. Sendblue
 * Support reproduced it on their own clocks (median 2.8s, p90 4.5s, max 7.9s,
 * ~97% of events >2s), called it a webhook dispatch-path issue, and confirmed
 * there is NO customer-selectable webhook region or latency path to configure
 * around it. They are investigating with no ETA.
 *
 * So the decision "do we migrate off SendBlue" hangs on whether that number
 * moves. This script re-measures it. Run it, compare against BASELINE below.
 *
 * READ-ONLY. It only reads Render logs. It never writes or sends anything.
 *
 * Usage:
 *   node scripts/provider-lag-report.js            # last 4 days
 *   DAYS=7 node scripts/provider-lag-report.js
 *
 * Credentials (from backend/.env or the environment):
 *   RENDER_API_KEY, RENDER_SERVICE_ID, RENDER_OWNER_ID
 */
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
let fileEnv = '';
try { fileEnv = fs.readFileSync(envPath, 'utf8'); } catch { /* .env optional */ }
const getEnv = (k) =>
  process.env[k] ?? (fileEnv.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const API_KEY = getEnv('RENDER_API_KEY');
const SERVICE_ID = getEnv('RENDER_SERVICE_ID');
const OWNER_ID = getEnv('RENDER_OWNER_ID');
const DAYS = Number(getEnv('DAYS') || 4);
const SLICE_H = 6;

/** Measured 2026-08-03, n=104, and independently corroborated by Sendblue. */
const BASELINE = { n: 104, p50: 2601, p90: 4738, max: 10225, mean: 3022 };
const VENDOR = { p50: 2800, p90: 4500, max: 7900 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const pct = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : NaN);

async function get(url) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } });
    if (res.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Render logs API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error('rate limited after retries');
}

/** Pull one text-filtered slice. Render's cursor overlaps pages, so callers dedupe. */
async function sweep(text, onLine) {
  const endMs = Date.now();
  const startMs = endMs - DAYS * 24 * 3600 * 1000;
  for (let t = startMs; t < endMs; t += SLICE_H * 3600 * 1000) {
    let cursor = new Date(t).toISOString();
    const endIso = new Date(Math.min(t + SLICE_H * 3600 * 1000, endMs)).toISOString();
    for (let page = 0; page < 8; page++) {
      const url = new URL('https://api.render.com/v1/logs');
      url.searchParams.set('ownerId', OWNER_ID);
      url.searchParams.set('resource', SERVICE_ID);
      url.searchParams.set('startTime', cursor);
      url.searchParams.set('endTime', endIso);
      url.searchParams.set('limit', '100');
      url.searchParams.set('text', text);
      const data = await get(url);
      const logs = data.logs || [];
      for (const l of logs) onLine(strip(l.message || ''), Date.parse(l.timestamp));
      if (!data.hasMore || !data.nextStartTime || !logs.length || data.nextStartTime === cursor) break;
      cursor = data.nextStartTime;
      await sleep(900);
    }
    await sleep(900);
  }
}

function firstJson(msg, marker) {
  const i = msg.indexOf(marker);
  if (i < 0) return null;
  const s = msg.indexOf('{', i);
  if (s < 0) return null;
  let d = 0;
  for (let j = s; j < msg.length; j++) {
    if (msg[j] === '{') d++;
    else if (msg[j] === '}') { d--; if (!d) { try { return JSON.parse(msg.slice(s, j + 1)); } catch { return null; } } }
  }
  return null;
}

function report(label, lags) {
  lags.sort((a, b) => a - b);
  if (!lags.length) { console.log(`\n${label}: no samples`); return null; }
  const mean = Math.round(lags.reduce((a, b) => a + b, 0) / lags.length);
  const stats = { n: lags.length, p50: pct(lags, 0.5), p90: pct(lags, 0.9), max: lags[lags.length - 1], mean };
  console.log(`\n${label}`);
  console.log(`  n=${stats.n}  p50=${stats.p50}ms  p90=${stats.p90}ms  max=${stats.max}ms  mean=${stats.mean}ms`);
  console.log(`  over 2s: ${Math.round((lags.filter((x) => x > 2000).length / lags.length) * 100)}%`);
  return stats;
}

(async () => {
  console.log(`SendBlue forwarding-lag report — last ${DAYS}d — ${new Date().toISOString()}`);
  console.log('='.repeat(66));
  if (!API_KEY || !SERVICE_ID || !OWNER_ID) {
    console.log('\nMISSING CREDENTIALS — cannot measure.');
    console.log('  Needs RENDER_API_KEY, RENDER_SERVICE_ID, RENDER_OWNER_ID');
    console.log('  These live in backend/.env, which is gitignored — so this script');
    console.log('  CANNOT run in a cloud/CI checkout. Run it locally.');
    process.exitCode = 2;
    return;
  }

  // Preferred source: the providerLagMs field, logged on every turn since PR #74.
  const fromMetric = [];
  await sweep('turn_latency', (msg) => {
    const j = firstJson(msg, '{"timestamp"');
    if (j && typeof j.providerLagMs === 'number') fromMetric.push(j.providerLagMs);
  });

  // Cross-check: recompute from raw payloads (SendBlue date_updated -> our receipt).
  const seen = new Map();
  await sweep('Raw webhook payload', (msg, recv) => {
    const p = firstJson(msg, 'Raw webhook payload:');
    if (!p || !p.message_handle || !p.date_updated) return;
    if (seen.has(p.message_handle)) return;
    const lag = recv - Date.parse(p.date_updated);
    if (lag >= 0 && lag < 120_000) seen.set(p.message_handle, lag);
  });

  const a = report('A) from turn_latency.providerLagMs', fromMetric);
  const b = report('B) recomputed from raw payloads (cross-check)', [...seen.values()]);
  const now = a || b;

  console.log('\n' + '='.repeat(66));
  console.log('BASELINE 2026-08-03 (ours) : ' +
    `n=${BASELINE.n} p50=${BASELINE.p50}ms p90=${BASELINE.p90}ms max=${BASELINE.max}ms`);
  console.log('BASELINE (Sendblue, their own clocks): ' +
    `p50=${VENDOR.p50}ms p90=${VENDOR.p90}ms max=${VENDOR.max}ms`);

  if (!now) { console.log('\nNo samples in window — inconclusive, widen DAYS.'); return; }
  const dP50 = now.p50 - BASELINE.p50;
  const dP90 = now.p90 - BASELINE.p90;
  const pctChange = Math.round((dP50 / BASELINE.p50) * 100);
  console.log(`\nCHANGE: p50 ${dP50 >= 0 ? '+' : ''}${dP50}ms (${pctChange >= 0 ? '+' : ''}${pctChange}%)  ` +
    `p90 ${dP90 >= 0 ? '+' : ''}${dP90}ms`);

  // A 20% move on this sample size is the threshold worth acting on either way.
  if (pctChange <= -20) {
    console.log('\nVERDICT: IMPROVED. Sendblue appears to have shipped a fix — do NOT migrate.');
  } else if (pctChange >= 20) {
    console.log('\nVERDICT: WORSE. Escalate with Sendblue and start a competitor trial.');
  } else {
    console.log('\nVERDICT: UNCHANGED. Sendblue acknowledged this on 2026-08-04 with no ETA.');
    console.log('  If it has been weeks with no movement, that is the evidenced case for');
    console.log('  trialling an alternative on a second number and comparing THIS metric.');
    console.log('  Migration cost to weigh: number porting, A2P/opt-out state, crisis-alert');
    console.log('  retest, and a rebuild of the inbound media contract (media_url is a single');
    console.log('  string, one webhook per attachment — the batching path depends on it).');
  }
})();
