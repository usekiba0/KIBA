#!/usr/bin/env node
/**
 * Read-only audit of the execution-recording pipeline.
 *
 * The Execution Score reads daily_tasks and proofs. KIBA's live tools write daily_todos. If
 * those two have drifted apart, the score is computed from tables nothing populates, which is
 * why it reads 0 for every user while the product looks like it is working.
 *
 * This counts both sides so the answer is data rather than inference.
 *
 *   node scripts/recording-audit.js
 *
 * SELECTs only. Writes nothing, sends nothing.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function databaseUrl() {
  const line = fs
    .readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found in backend/.env');
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
}

const QUERIES = [
  ['users', 'SELECT count(*)::int AS n FROM users'],
  ['daily_tasks total', 'SELECT count(*)::int AS n FROM daily_tasks'],
  ['daily_tasks by status', "SELECT status, count(*)::int AS n FROM daily_tasks GROUP BY status ORDER BY n DESC"],
  ['proofs total', 'SELECT count(*)::int AS n FROM proofs'],
  ['proofs by validation', 'SELECT validation_status, count(*)::int AS n FROM proofs GROUP BY validation_status'],
  ['daily_todos total', 'SELECT count(*)::int AS n FROM daily_todos'],
  ['daily_todos by status', 'SELECT status, count(*)::int AS n FROM daily_todos GROUP BY status ORDER BY n DESC'],
  ['daily_todos completed_at set', 'SELECT count(*)::int AS n FROM daily_todos WHERE completed_at IS NOT NULL'],
  ['messages inbound with media', "SELECT count(*)::int AS n FROM messages WHERE media_url IS NOT NULL"],
  ['messages flagged is_proof_submission', 'SELECT count(*)::int AS n FROM messages WHERE is_proof_submission = true'],
  ['execution_scores rows', 'SELECT count(*)::int AS n FROM execution_scores'],
  ['execution_scores non-zero', 'SELECT count(*)::int AS n FROM execution_scores WHERE current_score > 0'],
];

(async () => {
  const client = new Client({
    connectionString: databaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  for (const [label, sql] of QUERIES) {
    try {
      const { rows } = await client.query(sql);
      if (rows.length === 1 && 'n' in rows[0]) {
        console.log(`${label.padEnd(38)} ${rows[0].n}`);
      } else if (rows.length === 0) {
        console.log(`${label.padEnd(38)} (none)`);
      } else {
        console.log(`${label}`);
        for (const r of rows) {
          const k = Object.values(r)[0];
          const v = Object.values(r)[1];
          console.log(`  ${String(k).padEnd(36)} ${v}`);
        }
      }
    } catch (e) {
      console.log(`${label.padEnd(38)} ERROR: ${e.message.split('\n')[0]}`);
    }
  }

  await client.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
