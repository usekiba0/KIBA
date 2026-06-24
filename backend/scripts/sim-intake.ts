/**
 * Intake conversation simulator (V4 validation harness).
 *
 * Runs a scripted user-side conversation through the REAL model + the live
 * buildIntakeSystemPrompt, printing KIBA's actual replies turn by turn. Lets us
 * watch the new diagnostic flow behave against the doc's gold convo BEFORE it
 * ever touches a real number. Tools aren't wired here — we mutate the context
 * between turns to mirror what save_intake_field would have persisted, so the
 * prompt's "WHAT YOU KNOW" advances exactly as it would in prod.
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/sim-intake.ts
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildIntakeSystemPrompt, IntakeContext } from '../src/ai/prompts/intake.prompt';
import { OnboardingVariant } from '../src/data/entities/user.entity';

// Load .env if the var isn't already in the shell (no dotenv dependency needed).
if (!process.env.ANTHROPIC_API_KEY && fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';

function baseCtx(): IntakeContext {
  return {
    name: null, intakeData: {}, utcOffsetMinutes: null, nowUtc: new Date(),
    paymentLinkSent: false, sampleCoachingGiven: false,
    variant: OnboardingVariant.CASUAL, trialDays: 7, priceDisplay: '$20/month',
  };
}

type Step = { user: string; after?: (c: IntakeContext) => void };

// The doc's gold convo (Karibi, business → 100k). Watching for: business TYPE
// asked before any bottleneck, no "what makes you fold", no early "why does it
// matter", initiative on the check-in time, natural close framing.
const SCENARIO: Step[] = [
  { user: 'Hey KIBA' },
  { user: 'Bett' }, // two-bubble name — KIBA should read both before locking
  { user: 'Karibi', after: (c) => { c.name = 'Karibi'; } },
  {
    user: 'get my businesses to 100k month profit, start planning my day better',
    after: (c) => {
      c.intakeData.goals = ['get businesses to 100k/mo profit', 'plan my day better'];
      c.intakeData.goal_description = 'get businesses to 100k/mo profit';
    },
  },
  { user: 'I run two online businesses, a sports betting picks subscription and an AI accountability app' },
  { user: 'Around 50k a month combined' },
  { user: 'Mainly not getting enough new ones in, my retention is actually solid' },
  { user: 'Mainly Meta ads but I have account issues. some organic too' },
  {
    user: 'Not really consistent with content',
    after: (c) => { c.intakeData.avoidance_patterns = 'inconsistent with content; ad accounts down'; },
  },
];

async function run() {
  const ctx = baseCtx();
  const history: Anthropic.Messages.MessageParam[] = [];
  console.log(`\n=== INTAKE SIM (model: ${MODEL}) ===`);
  for (const step of SCENARIO) {
    history.push({ role: 'user', content: step.user });
    const res = await client.messages.create({
      model: MODEL, max_tokens: 400,
      system: buildIntakeSystemPrompt(ctx),
      messages: history,
    });
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim();
    history.push({ role: 'assistant', content: text || '(no text)' });
    console.log(`\nUSER: ${step.user}`);
    console.log(`KIBA: ${text.replace(/\[pause\]/g, '\n      ')}`);
    step.after?.(ctx);
  }
  console.log('\n=== END ===\n');
}

run().catch((e) => { console.error(e); process.exit(1); });
