/**
 * Coaching (post-pay) conversation simulator — V4 validation harness.
 * Runs a scripted paid-user convo through the REAL model + live buildSystemPrompt
 * to confirm the achievement-partner behavior: diagnose by goal type, build a real
 * deliverable, no generic/scripted lines. Tools aren't wired (text only).
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/sim-coaching.ts
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '../src/ai/prompts/coaching.prompt';

if (!process.env.ANTHROPIC_API_KEY && fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';

const user = { id: 'u1', name: 'Marcus', phone_number: '+15550001111' };
const profile = {
  fears: 'staying average', avoidance_patterns: 'scrolling instead of working',
  comparison_figure: 'his cousin', public_failure_scenario: 'friends seeing him fail',
  typical_failure_moment: 'afternoons', embarrassment: null,
  pressure_preference: 'pressure', cussing_ok: false,
} as unknown as Parameters<typeof buildSystemPrompt>[1];

function systemPrompt() {
  return buildSystemPrompt(
    user, profile, 60, 0,
    undefined, undefined,
    { nowUtc: new Date(), userOffsetMinutes: -300 },
    [], undefined, 1,
    { goals: 'grow my clothing brand', city: 'Houston', why: null },
    null,
  );
}

// A paid user bringing a business goal — watch for: asks the brand specifics
// before any "bottleneck", builds a real move, never "what makes you fold".
const SCENARIO = [
  'yo i wanna grow my clothing brand this month but i feel stuck',
  'streetwear, mostly tees and hoodies',
  'maybe like 3k a month right now',
  'honestly i barely post, instagram mostly',
];

async function run() {
  const history: Anthropic.Messages.MessageParam[] = [];
  console.log(`\n=== COACHING SIM (model: ${MODEL}) ===`);
  for (const msg of SCENARIO) {
    history.push({ role: 'user', content: msg });
    const res = await client.messages.create({
      model: MODEL, max_tokens: 400, system: systemPrompt(), messages: history,
    });
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
    history.push({ role: 'assistant', content: text || '(no text)' });
    console.log(`\nUSER: ${msg}`);
    console.log(`KIBA: ${text.replace(/\[pause\]/g, '\n      ')}`);
  }
  console.log('\n=== END ===\n');
}

run().catch((e) => { console.error(e); process.exit(1); });
