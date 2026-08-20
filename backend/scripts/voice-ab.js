#!/usr/bin/env node
/**
 * Live A/B of the V1 and V2 rulebooks on the same messages.
 *
 * This is the M0 baseline and the first real evidence that the rebuild changed anything. Unit
 * tests prove the rules compile and reach the model; only a live call proves the model behaves
 * differently because of them.
 *
 * The headline number is reply length. V1 carries a hard "the WHOLE reply stays under 60 words"
 * plus a ban on one-line replies, which is the mechanical reason every answer comes back the
 * same size and the client said it "sounds the same". V2 removes both. If the length spread
 * does not visibly widen here, the rebuild has not done the thing it was built to do.
 *
 *   node scripts/voice-ab.js              both rulebooks, default fixtures
 *   node scripts/voice-ab.js --json       machine-readable, for storing a baseline
 *
 * Costs a few cents on Haiku. Read-only: it talks to Anthropic and nothing else, touches no
 * database, and sends no messages to anybody.
 *
 * WHAT THIS SHOWS IS NOT WHAT THE USER RECEIVES. These are raw model replies. The real send
 * path runs them through humanizeVoice() (messaging.service.ts:176), which strips markdown,
 * em-dashes and other artefacts. So markdown appearing here is cosmetic and already handled
 * downstream — judge the reasoning, the length and the choice of response, not the formatting.
 */

require('ts-node/register');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const { COACHING_STATIC_RULES } = require('../src/ai/prompts/coaching.prompt');
const { buildCachePrefix, buildL2 } = require('../src/ai/rulebook/compile');
const { classifyTopic } = require('../src/ai/rulebook/topic');

const JSON_OUT = process.argv.includes('--json');
/** Skip the V1 leg. Halves cost and time when re-checking a fix to a V2 rule. */
const V2_ONLY = process.argv.includes('--v2-only');
/** --only=BEH-17,BEH-09 to re-run just the fixtures a change was meant to affect. */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '')
  .replace('--only=', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Read the key from .env rather than the environment.
 *
 * The shell here exports a GOOGLE key under the name ANTHROPIC_API_KEY, so trusting
 * process.env gives a confusing 401 that looks like an Anthropic problem. Parse the file.
 */
function apiKeyFromEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('ANTHROPIC_API_KEY='));
  if (!line) throw new Error('ANTHROPIC_API_KEY not found in backend/.env');
  return line.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}

/**
 * Fixtures chosen to exercise the specific rules the client complained about, not to be
 * representative traffic. Each names the test case it maps to in TEST-CASES.md.
 */
const FIXTURES = [
  { id: 'BEH-01', text: 'whats 18% of 2500' },
  { id: 'BEH-02', text: 'thanks' },
  { id: 'BEH-03', text: 'done' },
  { id: 'BEH-04', text: 'help me figure out how to price my saas, no idea where to start' },
  { id: 'BEH-08', text: 'chipotle or cava' },
  { id: 'BEH-09', text: 'can you rewrite this: hey just checking in on the invoice from last month' },
  { id: 'BEH-12', text: 'i just got engaged!!' },
  { id: 'BEH-15', text: 'finished my ad' },
  { id: 'BEH-17', text: 'going gym later' },
  { id: 'BEH-20', text: 'finished my workout' },
  { id: 'BEH-21', text: 'just got home' },
  { id: 'FAIL-03', text: 'this song is fire' },
];

const client = new Anthropic({ apiKey: apiKeyFromEnvFile() });
const MODEL = 'claude-haiku-4-5-20251001';

async function ask(systemBlocks, text) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemBlocks,
    messages: [{ role: 'user', content: text }],
  });
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;

(async () => {
  const results = [];

  const selected = ONLY.length ? FIXTURES.filter((f) => ONLY.includes(f.id)) : FIXTURES;

  for (const f of selected) {
    const topic = classifyTopic(f.text);
    const playbook = buildL2(topic);

    // Same shape as production: cached rules first, then everything variable.
    const v1 = V2_ONLY ? '' : await ask([{ type: 'text', text: COACHING_STATIC_RULES }], f.text);
    const v2 = await ask(
      [
        { type: 'text', text: buildCachePrefix() },
        ...(playbook ? [{ type: 'text', text: playbook }] : []),
      ],
      f.text,
    );

    results.push({ ...f, topic, v1, v2, v1Words: words(v1), v2Words: words(v2) });

    if (!JSON_OUT) {
      console.log(`\n${'='.repeat(78)}`);
      console.log(`${f.id}  "${f.text}"${topic ? `   [topic: ${topic}]` : ''}`);
      console.log('='.repeat(78));
      console.log(`\n--- V1 (${words(v1)} words) ---\n${v1}`);
      console.log(`\n--- V2 (${words(v2)} words) ---\n${v2}`);
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ model: MODEL, results }, null, 2));
    return;
  }

  const stat = (key) => {
    const ws = results.map((r) => r[key]).sort((a, b) => a - b);
    const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
    return { min: ws[0], max: ws[ws.length - 1], mean: Math.round(mean), spread: ws[ws.length - 1] - ws[0] };
  };

  const a = stat('v1Words');
  const b = stat('v2Words');
  console.log(`\n${'='.repeat(78)}\nREPLY LENGTH\n${'='.repeat(78)}`);
  console.log(`V1  min ${a.min}  mean ${a.mean}  max ${a.max}  spread ${a.spread}`);
  console.log(`V2  min ${b.min}  mean ${b.mean}  max ${b.max}  spread ${b.spread}`);
  console.log(
    `\nshort replies (<=5 words):  V1 ${results.filter((r) => r.v1Words <= 5).length}` +
      `   V2 ${results.filter((r) => r.v2Words <= 5).length}`,
  );
  console.log(
    `long replies  (>60 words):  V1 ${results.filter((r) => r.v1Words > 60).length}` +
      `   V2 ${results.filter((r) => r.v2Words > 60).length}`,
  );
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
