/**
 * Side-by-side vision comparison, so AI_VISION_MODEL is changed on evidence
 * rather than on a release note.
 *
 * Runs the SAME two calls the product makes — the proof verdict from
 * vision.service, and a food read from the coaching path — against two models,
 * and prints answers, latency and cost next to each other.
 *
 * Run (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/sim-vision.ts <image-url-or-path> ["task description"]
 *
 * Example:
 *   npx ts-node -r tsconfig-paths/register scripts/sim-vision.ts ./meal.jpg "eat a high-protein lunch"
 *
 * Override the pair with:  SIM_MODELS=claude-sonnet-4-6,claude-sonnet-5
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { deterministicParams } from '../src/ai/model-params';

const ENV_PATH = fs.existsSync('.env') ? '.env' : 'D:/kibi/backend/.env';
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = (process.env.SIM_MODELS || 'claude-sonnet-4-6,claude-sonnet-5')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// Published list prices, $ per million tokens. Only used to print a rough
// per-photo cost — not a billing source.
const PRICE: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-opus-5': { in: 5, out: 25 },
};

const [, , imageArg, taskArg] = process.argv;
if (!imageArg) {
  console.error('usage: sim-vision.ts <image-url-or-path> ["task description"]');
  process.exit(1);
}
const TASK = taskArg || 'eat a high-protein lunch';

/** Matches the product: a URL source for remote, base64 for a local file. */
function imageBlock(): Anthropic.Messages.ImageBlockParam {
  if (/^https?:\/\//i.test(imageArg)) {
    return { type: 'image', source: { type: 'url', url: imageArg } } as Anthropic.Messages.ImageBlockParam;
  }
  const bytes = fs.readFileSync(imageArg);
  const ext = imageArg.toLowerCase().split('.').pop();
  const mediaType = (
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: bytes.toString('base64') },
  };
}

// Verbatim from vision.service.validateProof — comparing anything else would
// measure the prompt, not the model.
const PROOF_PROMPT = `Does this image prove the person completed this task: "${TASK}"?
If you cannot tell what the image shows, or it is too dark/blurry/cropped to judge, say so
with a low confidence rather than guessing.
Return ONLY valid JSON: {"is_valid": boolean, "confidence": 0.0-1.0, "reason": "one sentence"}`;

// The read that matters in conversation: what is it, can you read the signage,
// and does it admit uncertainty instead of inventing a number.
const READ_PROMPT =
  'Look at this photo. In under 60 words: what exactly is it? Name any brand, restaurant or ' +
  'text you can read in the image. If it is food, estimate calories as a RANGE and say what ' +
  'you are unsure about. Do not invent specifics you cannot see.';

async function run(model: string, label: string, prompt: string, maxTokens: number) {
  const started = Date.now();
  try {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: [imageBlock(), { type: 'text', text: prompt }] }],
      ...deterministicParams(model),
    } as Anthropic.Messages.MessageCreateParamsNonStreaming);

    const ms = Date.now() - started;
    const text = res.content.find((b) => b.type === 'text');
    const price = PRICE[model];
    const cost = price
      ? (res.usage.input_tokens * price.in + res.usage.output_tokens * price.out) / 1e6
      : null;

    console.log(`\n  ${label}`);
    console.log(`  ${'-'.repeat(70)}`);
    console.log(`  ${(text && text.type === 'text' ? text.text : '(no text)').replace(/\n/g, '\n  ')}`);
    console.log(
      `\n  ${ms}ms · in ${res.usage.input_tokens} / out ${res.usage.output_tokens} tokens` +
        (cost !== null ? ` · ~$${cost.toFixed(5)} per photo` : ''),
    );
  } catch (err) {
    console.log(`\n  ${label}`);
    console.log(`  ${'-'.repeat(70)}`);
    console.log(`  FAILED: ${(err as Error).message}`);
    console.log('  (a 400 here is the point of this script — fix it before flipping the env var)');
  }
}

(async () => {
  console.log(`\nimage: ${imageArg}`);
  console.log(`task:  "${TASK}"`);
  console.log(`models: ${MODELS.join('  vs  ')}`);

  console.log(`\n\n=== 1. PROOF VERDICT — the call that decides whether evidence counts ===`);
  for (const model of MODELS) await run(model, model, PROOF_PROMPT, 128);

  console.log(`\n\n=== 2. PHOTO READ — what the user actually sees in conversation ===`);
  for (const model of MODELS) await run(model, model, READ_PROMPT, 300);

  console.log(
    `\n\nJudge on: did it name the right thing, did it read the signage, and did it ` +
      `admit what it could not see.\nIf the winner is not the model in AI_VISION_MODEL, change the env var.\n`,
  );
})();
