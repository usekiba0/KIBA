/**
 * Which lever actually cuts vision latency: FEWER IMAGES or a SHORTER REPLY?
 *
 * Prod on 2026-08-03/04 was ambiguous — a 1-image turn took 13.8s while 3-image
 * turns averaged 15.2s (so image count looked irrelevant), yet 6-image turns took
 * 32-36s (so it looked decisive). Both can't be right, and the answer decides
 * whether to spend effort on the prompt or on the cap.
 *
 * This runs the REAL coaching system prompt against REAL inbound photos, varying
 * exactly two things — image count, and whether a hard brevity instruction is
 * appended — and prints genMs against output tokens for each cell.
 *
 * Run (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/sim-vision-latency.ts
 *
 * Costs a handful of Sonnet vision calls. Read-only: it never sends a message.
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { deterministicParams } from '../src/ai/model-params';
import { buildSystemPrompt } from '../src/ai/prompts/coaching.prompt';

const ENV_PATH = fs.existsSync('.env') ? '.env' : 'D:/kibi/backend/.env';
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AI_VISION_MODEL || 'claude-sonnet-5';

const IMAGES = [
  'https://storage.googleapis.com/inbound-file-store/5XBAr5w9_FE7203FA-81BD-47F0-9692-BAB276CD5EED.JPG',
  'https://storage.googleapis.com/inbound-file-store/BtRsaoiL_2339C58D-E07C-40B7-85E1-B914EC5BD99A.JPG',
  'https://storage.googleapis.com/inbound-file-store/bxj4QAVN_IMG_0529.PNG',
];

const mockUser: any = {
  id: 'sim', name: 'Sam', phone_number: '+10000000000',
  utc_offset_minutes: 300, iana_timezone: 'Asia/Karachi',
  intake_data: { goal: 'get lean before a trip' }, status: 'active',
};
const mockProfile: any = {
  fears: 'being seen as lazy', avoidance_patterns: 'scrolling instead of starting',
  comparison_figure: 'his brother', pressure_preference: 'direct',
  cussing_ok: false, faith_ok: false,
};

// The instruction under test. Appended to the user turn, mimicking what a prompt
// change would do, so we can price it before editing KIBA's voice.
const BREVITY =
  '\n\n(reply in ONE short sentence, under 12 words total. no lists, no follow-up question.)';

async function run(label: string, nImages: number, brevity: boolean) {
  const system = buildSystemPrompt(mockUser, mockProfile, 72, 0);
  const blocks: any[] = IMAGES.slice(0, nImages).map((url) => ({
    type: 'image', source: { type: 'url', url },
  }));
  const text = 'what do you see' + (brevity ? BREVITY : '');
  blocks.push({ type: 'text', text });

  const t0 = Date.now();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: blocks }],
    ...deterministicParams(MODEL),
  } as Anthropic.Messages.MessageCreateParamsNonStreaming);
  const ms = Date.now() - t0;
  const out = res.usage.output_tokens;
  const inp = res.usage.input_tokens;
  const body = res.content[0].type === 'text' ? res.content[0].text : '';
  console.log(
    `${label.padEnd(22)} genMs=${String(ms).padStart(6)}  out=${String(out).padStart(4)}tok  ` +
    `in=${String(inp).padStart(6)}tok  ms/outTok=${(ms / Math.max(1, out)).toFixed(1)}`,
  );
  console.log(`   reply: ${body.replace(/\s+/g, ' ').slice(0, 110)}`);
  return { ms, out, inp };
}

(async () => {
  console.log(`model: ${MODEL}\n`);
  const cells: Array<[string, number, boolean]> = [
    ['1 img, normal', 1, false],
    ['3 img, normal', 3, false],
    ['1 img, BRIEF', 1, true],
    ['3 img, BRIEF', 3, true],
  ];
  const results: Record<string, { ms: number; out: number; inp: number }> = {};
  for (const [label, n, brief] of cells) {
    // Two samples per cell — one call is noise at these variances.
    const a = await run(label + ' #1', n, brief);
    const b = await run(label + ' #2', n, brief);
    results[label] = { ms: (a.ms + b.ms) / 2, out: (a.out + b.out) / 2, inp: (a.inp + b.inp) / 2 };
    console.log('');
  }

  console.log('='.repeat(70));
  console.log('MEANS (2 samples each)');
  for (const [label] of cells) {
    const r = results[label];
    console.log(`  ${label.padEnd(16)} genMs=${Math.round(r.ms).toString().padStart(6)}  out=${Math.round(r.out).toString().padStart(4)}tok  in=${Math.round(r.inp).toString().padStart(6)}tok`);
  }
  const imgEffect = results['3 img, normal'].ms - results['1 img, normal'].ms;
  const briefEffect1 = results['1 img, normal'].ms - results['1 img, BRIEF'].ms;
  const briefEffect3 = results['3 img, normal'].ms - results['3 img, BRIEF'].ms;
  console.log('\nEFFECT SIZES');
  console.log(`  +2 images        : ${imgEffect >= 0 ? '+' : ''}${Math.round(imgEffect)}ms`);
  console.log(`  brevity @ 1 img  : ${briefEffect1 >= 0 ? '-' : '+'}${Math.abs(Math.round(briefEffect1))}ms`);
  console.log(`  brevity @ 3 img  : ${briefEffect3 >= 0 ? '-' : '+'}${Math.abs(Math.round(briefEffect3))}ms`);
  console.log('\nVERDICT: whichever effect is larger is the lever worth spending on.');
})().catch((e) => { console.error(e); process.exit(1); });
