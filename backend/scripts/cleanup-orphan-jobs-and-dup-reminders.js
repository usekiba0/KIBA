/*
 * One-off cleanup for the "dozens of messages every morning" incident
 * (Karibi 2026-07-08). The code fix (branch fix/queue-drain-and-reminder-dedup)
 * prevents NEW duplicates/orphans, but does not retroactively clean what is
 * already queued in prod. This script does that, once.
 *
 * It handles two things:
 *   A) Duplicate daily reminder chains — more than one PENDING daily reminder
 *      for the same (user, local time). Keeps the oldest chain, cancels the
 *      rest (marks the row CANCELLED + removes its Bull job).
 *   B) Orphan Bull jobs — delayed/waiting jobs for a user that no longer exists
 *      (userId-keyed jobs whose user is gone, and reminder jobs whose row is
 *      gone). Removes them from Redis. Repeatable system crons are left alone.
 *
 * SAFE BY DEFAULT: dry-run unless you pass LIVE=1. Dry-run only reads.
 *   node scripts/cleanup-orphan-jobs-and-dup-reminders.js          # preview
 *   LIVE=1 node scripts/cleanup-orphan-jobs-and-dup-reminders.js   # execute
 *
 * Reads DATABASE_URL + REDIS_URL from backend/.env. A Render *internal* db host
 * (dpg-xxxx-a, no dot) is rewritten to the Oregon external host so it can run
 * from a laptop; on Render the internal host already resolves.
 */
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const Bull = require('bull');
const { URL } = require('url');

const LIVE = process.env.LIVE === '1';
const envPath = path.join(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const getEnv = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

let dbUrl = getEnv('DATABASE_URL');
// Rewrite bare Render internal host (…@dpg-xxxx-a/…) to the external Oregon host.
dbUrl = dbUrl.replace(/@(dpg-[a-z0-9]+-a)\//, '@$1.oregon-postgres.render.com/');

const redisUrl = getEnv('REDIS_URL');
const rp = new URL(redisUrl);
const redis = {
  host: rp.hostname,
  port: Number(rp.port || 6379),
  password: decodeURIComponent(rp.password || ''),
  username: rp.username || undefined,
  tls: rp.protocol === 'rediss:' ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

const tag = LIVE ? '[LIVE]' : '[DRY-RUN]';
function log(...a) { console.log(...a); }

async function main() {
  const pg = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const queue = new Bull('accountability', { redis });

  log(`\n${tag} cleanup starting\n`);

  // Live user id set (for orphan detection).
  const liveUsers = new Set(
    (await pg.query('SELECT id FROM users')).rows.map((r) => r.id),
  );
  log(`live users: ${liveUsers.size}`);

  // ─────────────────────────────────────────────────────────────────────────
  // A) Duplicate daily reminder chains.
  // ─────────────────────────────────────────────────────────────────────────
  log('\n=== A) duplicate daily reminder chains ===');
  // Dup key is (user, local time, NORMALIZED message) — NOT time alone. Two
  // different-purpose chains legitimately share a clock slot (Karibi 2026-07-22:
  // a 9am gym chain AND a 9am bible-verse chain — time-only grouping would have
  // "deduped" one of them away, which is exactly a silent reminder loss). The
  // normalization (lowercase, strip punctuation, collapse whitespace) still
  // catches the real dup pair that differed only by quote marks.
  const NORM = `regexp_replace(lower(message), '[^a-z0-9]+', ' ', 'g')`;
  const dupGroups = await pg.query(`
    SELECT user_id, recurrence_local_time, ${NORM} AS norm_msg,
           count(DISTINCT recurrence_parent_id) AS chains
    FROM scheduled_reminders
    WHERE status='pending' AND recurrence_rule='daily'
    GROUP BY user_id, recurrence_local_time, ${NORM}
    HAVING count(DISTINCT recurrence_parent_id) > 1
  `);

  let chainsCancelled = 0;
  let dupJobsRemoved = 0;
  for (const g of dupGroups.rows) {
    // All pending rows in this (user, time, message) slot, oldest chain first —
    // keep the first parent, cancel every other chain's pending row(s).
    const rows = (await pg.query(`
      SELECT id, recurrence_parent_id, bull_job_id, created_at, left(message,50) AS msg
      FROM scheduled_reminders
      WHERE status='pending' AND recurrence_rule='daily'
        AND user_id=$1 AND recurrence_local_time=$2
        AND ${NORM} = $3
      ORDER BY created_at ASC
    `, [g.user_id, g.recurrence_local_time, g.norm_msg])).rows;

    const keepParent = rows[0].recurrence_parent_id;
    log(`\n user=${g.user_id.slice(0,8)} slot=${g.recurrence_local_time} chains=${g.chains} → keep parent ${String(keepParent).slice(0,8)}`);
    for (const r of rows) {
      const keep = r.recurrence_parent_id === keepParent;
      log(`   ${keep ? 'KEEP  ' : 'CANCEL'} row=${r.id.slice(0,8)} parent=${String(r.recurrence_parent_id).slice(0,8)} job=${r.bull_job_id || '-'} "${r.msg}"`);
      if (keep) continue;
      if (LIVE) {
        await pg.query(
          `UPDATE scheduled_reminders SET status='cancelled', failure_reason='cleanup script: duplicate daily chain' WHERE id=$1`,
          [r.id],
        );
        if (r.bull_job_id) {
          const job = await queue.getJob(r.bull_job_id);
          if (job) { await job.remove().catch(() => {}); dupJobsRemoved++; }
        }
      }
      chainsCancelled++;
    }
  }
  log(`\n duplicate chains ${LIVE ? 'cancelled' : 'to cancel'}: ${chainsCancelled} (bull jobs removed: ${dupJobsRemoved})`);

  // ─────────────────────────────────────────────────────────────────────────
  // B) Orphan Bull jobs (user or reminder row gone).
  // ─────────────────────────────────────────────────────────────────────────
  log('\n=== B) orphan Bull jobs ===');
  const jobs = await queue.getJobs(['delayed', 'waiting', 'paused']);

  // Reminder jobs are keyed by reminderId — figure out which rows still exist.
  const reminderIds = jobs.map((j) => j.data && j.data.reminderId).filter(Boolean);
  const existing = new Set();
  if (reminderIds.length) {
    const found = await pg.query(
      `SELECT id FROM scheduled_reminders WHERE id = ANY($1::uuid[])`,
      [reminderIds],
    );
    found.rows.forEach((r) => existing.add(r.id));
  }

  let orphanRemoved = 0;
  for (const j of jobs) {
    const d = j.data || {};
    let orphan = false;
    let why = '';
    if (d.userId && !liveUsers.has(d.userId)) { orphan = true; why = `deleted user ${d.userId.slice(0,8)}`; }
    else if (d.reminderId && !existing.has(d.reminderId)) { orphan = true; why = `deleted reminder ${d.reminderId.slice(0,8)}`; }
    if (!orphan) continue;
    const fireAt = new Date(j.timestamp + (j.opts.delay || 0)).toISOString().slice(0, 16);
    log(`   REMOVE ${j.name.padEnd(24)} fire=${fireAt} (${why})`);
    if (LIVE) { await j.remove().catch(() => {}); }
    orphanRemoved++;
  }
  log(`\n orphan jobs ${LIVE ? 'removed' : 'to remove'}: ${orphanRemoved}`);

  await queue.close();
  await pg.end();
  log(`\n${tag} done. duplicateChains=${chainsCancelled} orphanJobs=${orphanRemoved}`);
  if (!LIVE) log('\nRe-run with  LIVE=1  to execute.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
