#!/usr/bin/env node
/**
 * Rule coverage report.
 *
 * Answers one question, in numbers rather than opinion: is any rule in the doctrine missing
 * from the compiled prompt or from the test suite?
 *
 * This exists because the client's explicit worry about the rebuild was "make sure the
 * important rules aren't getting lost because of how much training there is". The corpus is
 * 926k characters and the prompt budget is a fraction of that, so "did we drop something?" is
 * a fair question and prose cannot answer it.
 *
 *   npm run rules:coverage          human-readable report
 *   npm run rules:coverage -- --ci  exit 1 if anything is orphaned
 *
 * An orphan is a rule that reaches neither the model nor a test. Either is fatal: a rule the
 * model never sees does nothing, and a rule no test covers can be silently deleted later.
 */

require('ts-node/register');
const fs = require('fs');
const path = require('path');

const { RULES } = require('../src/ai/rulebook/rules');
const { compiledRuleIds, buildStaticPrompt } = require('../src/ai/rulebook/compile');

const CI = process.argv.includes('--ci');
const TOPICS = ['business', 'fitness', 'student', 'weight-loss', 'relationships', 'faith'];

// Rule ids referenced anywhere under tests/. A rule is "tested" if a spec names its id.
const testCorpus = (() => {
  const root = path.join(__dirname, '..', 'tests');
  let out = '';
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) out += fs.readFileSync(full, 'utf8');
    }
  };
  walk(root);
  return out;
})();

// A rule is "compiled" only if its text actually appears in a built prompt — not merely if
// compiledRuleIds() claims it. The claim and the string have drifted before.
const prompts = [buildStaticPrompt(null), ...TOPICS.map((t) => buildStaticPrompt(t))];
const compiledIds = new Set([null, ...TOPICS].flatMap((t) => compiledRuleIds(t)));

const rows = RULES.map((rule) => {
  const inPrompt = prompts.some((p) => p.includes(rule.text)) && compiledIds.has(rule.id);
  const inTests = testCorpus.includes(rule.id);
  return { rule, inPrompt, inTests, orphan: !inPrompt && !inTests };
});

const orphans = rows.filter((r) => r.orphan);
const untested = rows.filter((r) => !r.inTests && r.inPrompt);
const uncompiled = rows.filter((r) => !r.inPrompt);

const bySection = rows.reduce((acc, r) => {
  (acc[r.rule.section] ||= []).push(r);
  return acc;
}, {});

console.log('\nKIBA rule coverage');
console.log('='.repeat(62));
console.log(`rules in catalogue : ${RULES.length}`);
console.log(`reaching the model : ${rows.filter((r) => r.inPrompt).length}`);
console.log(`named by a test    : ${rows.filter((r) => r.inTests).length}`);
console.log(`ORPHANED           : ${orphans.length}`);
console.log('');

console.log('by rulebook section');
for (const section of Object.keys(bySection).sort()) {
  const group = bySection[section];
  const ok = group.filter((r) => r.inPrompt).length;
  console.log(`  ${section.padEnd(5)} ${String(ok).padStart(2)}/${String(group.length).padEnd(2)} compiled`);
}

if (uncompiled.length) {
  console.log('\nNOT REACHING THE MODEL:');
  for (const r of uncompiled) console.log(`  ${r.rule.id}  (${r.rule.section}, ${r.rule.source})`);
}

if (untested.length) {
  console.log('\nno test names these (compiled, but unprotected against deletion):');
  for (const r of untested) console.log(`  ${r.rule.id}`);
}

if (orphans.length) {
  console.log('\nORPHANS - in the doctrine, absent from both prompt and tests:');
  for (const r of orphans) console.log(`  ${r.rule.id}  (${r.rule.section}, ${r.rule.source})`);
}

console.log('');
if (CI && orphans.length > 0) {
  console.error(`FAIL: ${orphans.length} orphaned rule(s).`);
  process.exit(1);
}
if (CI && uncompiled.length > 0) {
  console.error(`FAIL: ${uncompiled.length} rule(s) never reach the model.`);
  process.exit(1);
}
console.log(orphans.length === 0 ? 'OK: no orphaned rules.' : '');
