#!/usr/bin/env node
/**
 * Per-stage latency report for a live probe session.
 *
 * WHY THIS EXISTS
 * "Messages are taking 8+ seconds" is not actionable, and neither is a single
 * median. On 2026-08-18 a 24.9s reply took six ad-hoc log queries to explain, and
 * two wrong theories along the way (a queue stall — there is no queue on the
 * inbound path; then a provider stall — it was the configured photo window). Every
 * millisecond was already in the logs. What was missing was one command that lays
 * the stages side by side.
 *
 * You text KIBA from a real phone (see the CHECKLIST below), then run this. It
 * rebuilds each turn from Render logs and attributes the wait to a stage.
 *
 * READ-ONLY. It only reads Render logs. It never sends, edits or deletes anything.
 *
 * Usage:
 *   node scripts/probe-latency.js                 # last 30 minutes
 *   node scripts/probe-latency.js 90              # last 90 minutes
 *   node scripts/probe-latency.js 90 +18325604035 # one sender only
 *   node scripts/probe-latency.js --checklist     # print the probe plan and exit
 *
 * Credentials (from backend/.env or the environment):
 *   RENDER_API_KEY / RENDER_SERVICE_ID / RENDER_OWNER_ID
 */
const fs = require('fs');
const path = require('path');

// ── The probe plan ─────────────────────────────────────────────────────────────
// Each probe isolates a different stage. Run them IN ORDER, and write down your
// own stopwatch time for each — that is the only way to size the outbound hop,
// which is invisible from inside the server.
const CHECKLIST = `
PROBE PLAN — text these from a real phone, in this order.
Record your own stopwatch time (send → reply visible) for every single one.

  #   probe                          repeat  isolates                              expect
  1   "probe 1" .. "probe 15"        15x     baseline: provider + model + send     debounce ~0ms
  2   "what should i eat today"       5x      model time scaling with reply length  genMs grows w/ tokens
  3   one JPEG photo                  5x      image window + vision model           debounce ~4000ms
  4   the same photo as HEIC          5x      HEIC transcode on top of #3           debounce ~4000ms
  5   two HEIC photos at once         5x      burst window + timer resets           debounce >=8000ms
  6   two photos ~10s apart           3x      photo-recency escalation              2nd also burst window

*** NEVER SEND THE SAME TEXT TWICE WITHIN 5 SECONDS. *** Identical inbound text
from the same user inside the dedup window is DROPPED, and until 2026-08-18 that
window was 30s — sending "hi" fifteen times measured one turn and silently threw
away fourteen. Number every probe ("probe 1", "probe 2", ...) so each is unique
and you can match a row in the table to a specific send. If a probe vanishes,
grep the logs for inbound_deduped.

WHY 15x ON PROBE 1: a single sample cannot catch an intermittent stall. The
complaint is about the tail, not the median, so the tail is what needs samples.

WHY #3 AND #4 ARE A PAIR: without the JPEG control you cannot tell HEIC transcode
cost from the image debounce window. Same photo, same size, only the format differs.

TWO STAGES THIS SCRIPT CANNOT SEE:
  stage 0  your phone -> SendBlue    (only SendBlue can measure it)
  stage 9  SendBlue -> your phone    (no delivery-status webhook is handled)
Both live in: stopwatch - perceivedMs. If that gap is consistently >1s, take the
numbers to SendBlue. Do NOT report perceivedMs to anyone as "the response time" —
it is a floor.
`;

if (process.argv.includes('--checklist')) {
  console.log(CHECKLIST);
  process.exit(0);
}

function loadEnv() {
  const out = { ...process.env };
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line);
      if (m && !out[m[1]]) out[m[1]] = m[2].trim();
    }
  }
  return out;
}
const env = loadEnv();
const API_KEY = env.RENDER_API_KEY;
const SERVICE_ID = env.RENDER_SERVICE_ID;
const OWNER_ID = env.RENDER_OWNER_ID;
if (!API_KEY || !SERVICE_ID || !OWNER_ID) {
  console.error('Needs RENDER_API_KEY, RENDER_SERVICE_ID, RENDER_OWNER_ID (backend/.env or env).');
  process.exit(1);
}

const MINUTES = Number(process.argv[2] || 30);
const PHONE = process.argv[3] || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function get(url) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
    });
    if (res.status === 429) { await sleep(4000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Render logs API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error('rate limited after retries');
}

/**
 * Render caps a page at 100 rows and returns them oldest-first, so a single wide
 * window silently drops the newest events. Slice the range and page each slice,
 * with the server-side `text` filter doing the narrowing — an unfiltered page is
 * swamped by unrelated lines (that mistake produced a confident "zero results").
 */
async function sweep(text, onLine) {
  const endMs = Date.now();
  const startMs = endMs - MINUTES * 60_000;
  const SLICE_MS = 60 * 60_000;
  for (let t = startMs; t < endMs; t += SLICE_MS) {
    let cursor = new Date(t).toISOString();
    const endIso = new Date(Math.min(t + SLICE_MS, endMs)).toISOString();
    for (let page = 0; page < 12; page++) {
      const url = new URL('https://api.render.com/v1/logs');
      url.searchParams.set('ownerId', OWNER_ID);
      url.searchParams.set('resource', SERVICE_ID);
      url.searchParams.set('startTime', cursor);
      url.searchParams.set('endTime', endIso);
      url.searchParams.set('limit', '100');
      url.searchParams.set('text', text);
      const data = await get(url);
      const logs = data.logs || [];
      for (const l of logs) onLine(strip(l.message || ''), l.timestamp);
      if (!data.hasMore || !data.nextStartTime || !logs.length || data.nextStartTime === cursor) break;
      cursor = data.nextStartTime;
      await sleep(700);
    }
    await sleep(700);
  }
}

function firstJson(msg) {
  const start = msg.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < msg.length; i++) {
    if (msg[i] === '{') depth++;
    else if (msg[i] === '}') {
      depth--;
      if (!depth) { try { return JSON.parse(msg.slice(start, i + 1)); } catch { return null; } }
    }
  }
  return null;
}

const pct = (arr, q) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const fmt = (v, w = 6) => String(v == null ? '-' : v).padStart(w);

(async () => {
  const turns = new Map();
  await sweep('turn_latency', (msg, ts) => {
    const j = firstJson(msg);
    if (j && j.operation === 'turn_latency') turns.set(j.timestamp || ts, j);
  });

  const merges = [];
  await sweep('merged', (msg, ts) => {
    const m = /merged (\d+) webhooks for (\S+) → (\d+) media, (\d+) text parts/.exec(msg);
    if (m) merges.push({ ts, webhooks: +m[1], from: m[2], media: +m[3], text: +m[4] });
  });

  let rows = [...turns.values()].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  if (PHONE) {
    console.log(`\nNOTE: turn_latency carries userId, not a phone number, so --phone cannot filter it.`);
    console.log(`      Showing every turn; the merge list below is filtered to ${PHONE}.`);
  }

  console.log(`\n${'='.repeat(112)}`);
  console.log(`PER-STAGE LATENCY — last ${MINUTES}min — ${new Date().toISOString()}`);
  console.log('='.repeat(112));

  if (!rows.length) {
    console.log('\nNo turns in this window. If you just texted, wait ~20s for logs to land, then rerun.');
    console.log('If it stays empty, the service may not have restarted since deploy — check /deploys.');
    return;
  }

  console.log(
    '\ntime      path    ' +
    'media web  window  debounce   provLag   gen    send  PERCEIVED  flags',
  );
  console.log('-'.repeat(112));
  for (const r of rows) {
    const flags = [];
    const deb = num(r.debounceMs);
    const win = num(r.debounceWindowMs);
    // debounceMs far above the configured window means the timer was RESET by a
    // later webhook — the single most misread number in this whole pipeline.
    if (deb != null && win != null && win > 0 && deb > win * 1.5) flags.push(`window reset (+${deb - win}ms)`);
    if (deb != null && (win == null || win === 0) && deb > 1000) flags.push('debounce with no window — investigate');
    if (num(r.providerLagMs) != null && r.providerLagMs > 4000) flags.push(`provider slow ${r.providerLagMs}ms`);
    if (num(r.genMs) != null && r.genMs > 6000) flags.push(`long generation ${r.genMs}ms`);
    if (num(r.perceivedMs) != null && r.perceivedMs >= 8000) flags.push('OVER 8s');
    console.log(
      String(r.timestamp || '').slice(11, 19) + '  ' +
      String(r.path || '?').padEnd(7) +
      fmt(r.mediaCount, 5) + fmt(r.webhooksMerged, 4) + fmt(r.debounceWindowMs, 8) +
      fmt(r.debounceMs, 10) + fmt(r.providerLagMs, 10) + fmt(r.genMs, 6) + fmt(r.sendMs, 8) +
      fmt(r.perceivedMs, 11) + '  ' + flags.join('; '),
    );
  }

  // ── Stage attribution ────────────────────────────────────────────────────────
  const byPath = new Map();
  for (const r of rows) {
    const k = r.path || '?';
    if (!byPath.has(k)) byPath.set(k, []);
    byPath.get(k).push(r);
  }
  console.log('\n' + '='.repeat(112));
  console.log('STAGE ATTRIBUTION (medians, ms)');
  console.log('='.repeat(112));
  console.log('path       n   provLag  debounce     gen    send  PERCEIVED  p90    max   over8s');
  console.log('-'.repeat(112));
  const line = (label, rs) => {
    const f = (k) => rs.map((r) => num(r[k])).filter((v) => v != null);
    const p = f('perceivedMs');
    console.log(
      String(label).padEnd(9) + fmt(rs.length, 4) +
      fmt(pct(f('providerLagMs'), 0.5), 9) + fmt(pct(f('debounceMs'), 0.5), 10) +
      fmt(pct(f('genMs'), 0.5), 8) + fmt(pct(f('sendMs'), 0.5), 8) +
      fmt(pct(p, 0.5), 11) + fmt(pct(p, 0.9), 7) + fmt(p.length ? Math.max(...p) : null, 7) +
      fmt(`${p.filter((v) => v >= 8000).length}/${p.length}`, 8),
    );
  };
  line('ALL', rows);
  for (const [k, rs] of byPath) line(k, rs);

  if (merges.length) {
    console.log('\n' + '='.repeat(112));
    console.log('DEBOUNCER MERGES (why a debounce window was longer than its base)');
    console.log('='.repeat(112));
    for (const m of merges) {
      if (PHONE && m.from !== PHONE) continue;
      console.log(`${m.ts.slice(11, 19)}  ${m.from}  ${m.webhooks} webhooks -> ${m.media} media, ${m.text} text`);
    }
  }

  console.log('\n' + '='.repeat(112));
  console.log('BLIND SPOTS — not in any number above');
  console.log('='.repeat(112));
  console.log('  stage 0  phone -> SendBlue    only SendBlue can measure it');
  console.log('  stage 9  SendBlue -> phone    no delivery-status webhook is handled');
  console.log('  stage 7  guard chain          inside totalMs, not broken out');
  console.log('\n  PERCEIVED is a FLOOR, not the response time. Both blind stages sit in');
  console.log('  (your stopwatch - PERCEIVED). Record the stopwatch or that gap stays unknown.');
  console.log('\nRun `node scripts/probe-latency.js --checklist` for the probe plan.\n');
})().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
