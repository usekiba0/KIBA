/**
 * END-TO-END intake harness (V4). Unlike sim-intake.ts (prompt only), this runs
 * the REAL CoachingService.generateIntakeReply — the full tool loop (the model
 * calling save_intake_field, the runChat retries, the forced no-tools completion)
 * — against an in-memory user with in-memory tool handlers. It surfaces the exact
 * production behavior, including when the model returns NO text (which is where
 * the "still with you on…" fallback fires). No DB, no network except Anthropic.
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/sim-intake-e2e.ts
 */
import * as fs from 'fs';
import { CoachingService } from '../src/ai/coaching.service';
import { IntakeContext } from '../src/ai/prompts/intake.prompt';
import { OnboardingVariant, IntakeData } from '../src/data/entities/user.entity';

if (!process.env.ANTHROPIC_API_KEY && fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const config = {
  get: (k: string, d?: unknown) => (k === 'AI_MODEL' ? process.env.AI_MODEL || 'claude-haiku-4-5-20251001' : d),
  getOrThrow: () => process.env.ANTHROPIC_API_KEY,
} as never;
const repo = { findOne: async () => null, save: async (x: unknown) => x, update: async () => ({}), count: async () => 0, find: async () => [] } as never;
const correction = { getActiveKnowledge: async () => [] } as never;

const svc = new CoachingService(config, repo, repo, repo, repo, repo, correction);

const user = {
  id: 'sim-1', name: null as string | null, phone_number: '+10000000000',
  intake_data: {} as IntakeData, utc_offset_minutes: null as number | null,
  onboarding_variant: OnboardingVariant.STANDARD,
  payment_link_sent_at: null as Date | null, sample_coaching_given: false,
};

const handlers = {
  saveIntakeField: async (input: { field: string; value: unknown }) => {
    const { field, value } = input;
    if (field === 'name') user.name = value as string;
    else if (field === 'utc_offset_minutes') user.utc_offset_minutes = Number(value);
    else (user.intake_data as Record<string, unknown>)[field] = value;
    return { ok: true as const, field };
  },
  sendPaymentLink: async () => { user.payment_link_sent_at = new Date(); return { ok: true as const, checkout_url: 'https://pay.test/x' }; },
  scheduleReminder: async () => ({ ok: true as const, reminder_id: 'r1', fire_at_iso: new Date().toISOString(), fires_in: 'soon' }),
};

function ctx(): IntakeContext {
  return {
    name: user.name, intakeData: user.intake_data, utcOffsetMinutes: user.utc_offset_minutes, nowUtc: new Date(),
    paymentLinkSent: !!user.payment_link_sent_at, sampleCoachingGiven: user.sample_coaching_given,
    variant: OnboardingVariant.STANDARD, trialDays: 7, priceDisplay: '$20/month',
  };
}

// Full V4 acceptance run — the Ali/Sam flow + the edge probes (direct question,
// value-on-request, the close).
const SCENARIO = [
  'Hey',
  'Sam',
  'Get my business to 100k a month and plan my days better',
  'I run 2 business a sports betting picks sub and an Ai app',
  'Around 50k a month',
  'Mainly not getting enough new subs retention solid',
  'Mostly meta ads but having issues with organic',
  'Not really consistent with content',
  'honestly just freedom not stressing about money',
  'wait how are you actually gonna help me with this',
  'give me a content idea for the picks page',
  'real and direct, cussing is fine',
  "i'm in karachi",
  'yeah i am serious lets do it',
];

async function run() {
  console.log('\n=== INTAKE E2E (real service + tools) ===');
  const recent: Array<{ role: string; content: string }> = [];
  let emptyCount = 0;
  for (const msg of SCENARIO) {
    recent.push({ role: 'user', content: msg });
    const { reply } = await svc.generateIntakeReply(user as never, recent as never, msg, ctx() as never, handlers as never);
    const empty = !reply || !reply.trim();
    if (empty) emptyCount++;
    const shown = empty ? '‹EMPTY MODEL REPLY → processor pastes "still with you on…" fallback›' : reply.replace(/\[pause\]/g, '\n      ');
    console.log(`\nUSER: ${msg}`);
    console.log(`KIBA: ${shown}`);
    recent.push({ role: 'ai', content: reply || '' });
  }
  console.log(`\n=== END — ${emptyCount} empty reply(s) out of ${SCENARIO.length} turns ===\n`);
}

run().catch((e) => { console.error(e); process.exit(1); });
