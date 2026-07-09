/*
 * Render log auditor for the time-fabrication class of bugs (Karibi 2026-07-09).
 *
 * Karibi's standing complaint: KIBA keeps inventing WHEN things happened ("the
 * link went through yesterday" to a same-day payer; "you slept through today"
 * about a prior-day message). We added a deterministic guard that rewrites those
 * claims before send. This script verifies, against LIVE Render logs, that:
 *
 *   A) the guard is actually firing in prod   → operation "event_timing_corrected"
 *      / "time_claim_corrected" log lines (GOOD — a fabrication was caught pre-send)
 *   B) nothing slipped past it                → outbound/log text still containing a
 *      raw bug signature ("went through yesterday", "slept through … today", …)
 *   C) the service is healthy                 → public /v1/health returns 200
 *   D) no unhandled errors around the coaching path
 *
 * It is READ-ONLY. It never posts, deletes, or mutates anything.
 *
 * Usage:
 *   node scripts/check-render-logs.js                 # last 6h of logs
 *   HOURS=24 node scripts/check-render-logs.js        # widen the window
 *
 * Credentials (from backend/.env or the environment):
 *   RENDER_API_KEY     required for log pull — https://dashboard.render.com/u/settings#api-keys
 *   RENDER_SERVICE_ID  required — the backend web service id (srv-xxxxxxxx)
 *   RENDER_OWNER_ID    required by Render's logs API — team/user id (tea-… or usr-…)
 *   HEALTH_URL         optional — defaults to https://kiba-1.onrender.com/v1/health
 *
 * Without the API creds it STILL runs the health check and tells you exactly
 * which env vars to set — it degrades, it does not lie about being "all clear".
 */
const path = require('path');
const fs = require('fs');

// ── env: prefer real environment, fall back to backend/.env (never overrides) ──
const envPath = path.join(__dirname, '..', '.env');
let fileEnv = '';
try { fileEnv = fs.readFileSync(envPath, 'utf8'); } catch { /* .env optional */ }
const getEnv = (k) =>
  process.env[k] ?? (fileEnv.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const API_KEY = getEnv('RENDER_API_KEY');
const SERVICE_ID = getEnv('RENDER_SERVICE_ID');
const OWNER_ID = getEnv('RENDER_OWNER_ID');
const HEALTH_URL = getEnv('HEALTH_URL') || 'https://kiba-1.onrender.com/v1/health';
const HOURS = Number(getEnv('HOURS') || 6);

// Guard-fired markers — these are GOOD. They mean a fabrication was caught before
// the text ever reached the user.
const GUARD_OPS = ['event_timing_corrected', 'time_claim_corrected'];

// Raw fabrication signatures — these are BAD. If any of these show up in an
// OUTBOUND message line, a wrong claim escaped the guard and hit the user.
const BUG_SIGNATURES = [
  /went through (?:yesterday|last week|last night|the other day|a few days ago|\d+ days ago)/i,
  /(?:you )?(?:paid|signed up|subscribed|joined) (?:yesterday|last week|the other day)/i,
  /(?:slept through|missed work|missed today)[^.\n]{0,25}\btoday\b/i,
  /\b(?:today|this morning) you (?:said|told me|slept|missed)\b/i,
];
const ERROR_SIGNATURES = [/unhandledrejection/i, /\bECONNREFUSED\b/i, /\bstack:/i, /"level":"error"/i, / ERROR /];

// Colorize for a terminal; go plain when NO_COLOR is set (e.g. CI step summaries).
const paint = (code) => (s) => (process.env.NO_COLOR ? `${s}` : `\x1b[${code}m${s}\x1b[0m`);
const c = { g: paint(32), r: paint(31), y: paint(33), dim: paint(2) };

async function checkHealth() {
  process.stdout.write(`\n[C] Health check → ${HEALTH_URL}\n`);
  try {
    const res = await fetch(HEALTH_URL, { method: 'GET' });
    if (res.status === 200) console.log('    ' + c.g(`OK (HTTP 200)`));
    else console.log('    ' + c.r(`UNHEALTHY (HTTP ${res.status})`));
    return res.status === 200;
  } catch (err) {
    console.log('    ' + c.r(`unreachable: ${err.message}`));
    return false;
  }
}

async function fetchLogs() {
  // Render Logs API: paginated, newest first. Requires ownerId + resource filter.
  const start = new Date(Date.now() - HOURS * 3600 * 1000).toISOString();
  const all = [];
  let cursorStart = start;
  for (let page = 0; page < 20; page++) {
    const url = new URL('https://api.render.com/v1/logs');
    url.searchParams.set('ownerId', OWNER_ID);
    url.searchParams.set('resource', SERVICE_ID);
    url.searchParams.set('startTime', cursorStart);
    url.searchParams.set('limit', '100');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Render logs API HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const logs = data.logs || [];
    all.push(...logs);
    if (!data.hasMore || !data.nextStartTime || logs.length === 0) break;
    cursorStart = data.nextStartTime;
  }
  return all;
}

function scan(logs) {
  const guardHits = [];
  const bugHits = [];
  const errorHits = [];
  for (const l of logs) {
    const msg = typeof l === 'string' ? l : l.message || JSON.stringify(l);
    if (GUARD_OPS.some((op) => msg.includes(op))) guardHits.push(msg);
    if (BUG_SIGNATURES.some((re) => re.test(msg))) bugHits.push(msg);
    if (ERROR_SIGNATURES.some((re) => re.test(msg))) errorHits.push(msg);
  }
  return { guardHits, bugHits, errorHits };
}

(async () => {
  console.log(`KIBA Render log audit — last ${HOURS}h — ${new Date().toISOString()}`);
  console.log('='.repeat(64));

  const healthy = await checkHealth();

  if (!API_KEY || !SERVICE_ID || !OWNER_ID) {
    console.log('\n' + c.y('LOG PULL SKIPPED — missing Render API credentials.'));
    console.log('  Set these (in backend/.env or the environment) to enable the log scan:');
    if (!API_KEY) console.log('    - RENDER_API_KEY    (dashboard → Account Settings → API Keys)');
    if (!SERVICE_ID) console.log('    - RENDER_SERVICE_ID (the backend service, srv-…)');
    if (!OWNER_ID) console.log('    - RENDER_OWNER_ID   (team/user id, tea-… or usr-…)');
    console.log('\n' + c.y('RESULT: health verified only; logs NOT audited. Not a clean bill.'));
    process.exitCode = healthy ? 2 : 1; return; // 2 = partial (health ok, logs unchecked)
  }

  console.log(`\n[A/B/D] Pulling logs for ${SERVICE_ID}…`);
  let logs;
  try {
    logs = await fetchLogs();
  } catch (err) {
    console.log('    ' + c.r(err.message));
    process.exitCode = 1; return;
  }
  console.log(`    ${logs.length} log lines scanned.`);

  const { guardHits, bugHits, errorHits } = scan(logs);

  console.log(`\n[A] Guard fired (fabrication caught pre-send): ${guardHits.length ? c.g(guardHits.length) : c.dim('0')}`);
  guardHits.slice(0, 5).forEach((m) => console.log('    ' + c.dim(m.slice(0, 160))));

  console.log(`\n[B] Fabrications that ESCAPED to users: ${bugHits.length ? c.r(bugHits.length) : c.g('0')}`);
  bugHits.slice(0, 10).forEach((m) => console.log('    ' + c.r(m.slice(0, 200))));

  console.log(`\n[D] Error lines: ${errorHits.length ? c.y(errorHits.length) : c.g('0')}`);
  errorHits.slice(0, 5).forEach((m) => console.log('    ' + c.dim(m.slice(0, 160))));

  console.log('\n' + '='.repeat(64));
  const clean = healthy && bugHits.length === 0;
  console.log(clean
    ? c.g('RESULT: CLEAN — service healthy, no fabrication signatures in the window.')
    : c.r('RESULT: NEEDS ATTENTION — see [B]/[C] above before announcing anything live.'));
  process.exitCode = clean ? 0 : 1;
})();
