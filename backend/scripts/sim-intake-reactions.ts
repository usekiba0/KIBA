/**
 * Tapback marker simulator for the SIGN-UP flow (2026-08-07).
 *
 * Intake is the risky place to add reactions: it carries a standing "NO emojis
 * in the sign-up flow" rule Karibi has flagged repeatedly, and it's a fast Q&A
 * where a tapback on every answer would be exactly the gimmicky noise that rule
 * exists to prevent. So this checks BOTH directions — that the marker gets used
 * on turns that matter, AND that routine form answers stay bare.
 *
 * Read-only: talks to Anthropic, never to SendBlue or the database.
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/sim-intake-reactions.ts
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildIntakeSystemPrompt, IntakeContext } from '../src/ai/prompts/intake.prompt';
import { OnboardingVariant } from '../src/data/entities/user.entity';
import { extractReaction } from '../src/messaging/outbound-reaction';
import { scrubIntakeVoice } from '../src/messaging/voice';

if (!process.env.ANTHROPIC_API_KEY && fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';

function ctx(): IntakeContext {
  return {
    name: 'Marcus',
    intakeData: { goal_description: 'lose 30 pounds' },
    utcOffsetMinutes: -300,
    paymentLinkSent: false,
    sampleCoachingGiven: false,
    variant: OnboardingVariant.STANDARD,
    trialDays: 3,
    priceDisplay: '$20/month',
  };
}

const TURNS: { text: string; expectReaction: boolean; note: string }[] = [
  { text: 'honestly i just dont wanna be the fat friend in the wedding photos', expectReaction: true, note: 'a real why, took guts' },
  { text: 'i been trying since january and quit like 4 times lol', expectReaction: true, note: 'an admission' },
  { text: 'my last coach ghosted me after i paid him 300 bucks', expectReaction: true, note: 'something that matters' },
  { text: 'houston', expectReaction: false, note: 'routine form answer — should stay bare' },
  { text: '7am', expectReaction: false, note: 'routine form answer — should stay bare' },
  { text: 'yeah', expectReaction: false, note: 'bare ack' },
];

const VALID = ['love', 'like', 'dislike', 'laugh', 'emphasize', 'question'];

(async () => {
  console.log(`sim-intake-reactions — model=${MODEL}\n${'='.repeat(72)}`);
  const system = buildIntakeSystemPrompt(ctx());
  let onMatters = 0;
  let onRoutine = 0;
  let leaked = 0;
  let emojiLeaked = 0;
  let wordless = 0;

  for (const turn of TURNS) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: turn.text }],
    });
    const raw = res.content.filter((b) => b.type === 'text').map((b) => (b as any).text).join('');
    const { reaction, text } = extractReaction(raw);

    if (reaction) {
      if (turn.expectReaction) onMatters++;
      else onRoutine++;
      if (!text.trim()) wordless++;
    }
    const invented = [...raw.matchAll(/\[\s*react\s*:\s*([a-z]*)\s*\]/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((r) => !VALID.includes(r));
    leaked += invented.length;
    // The no-emoji rule must survive the new block: scrubIntakeVoice is the
    // deterministic backstop, so compare against what it would strip.
    if (scrubIntakeVoice(text) !== text.trim()) emojiLeaked++;

    console.log(`\n> ${turn.text}`);
    console.log(`  (${turn.note})`);
    console.log(`  reaction: ${reaction ?? '—'}${turn.expectReaction ? '' : '   [expected none]'}`);
    if (invented.length) console.log(`  INVENTED: ${invented.join(', ')}`);
    console.log(`  reply:    ${text.replace(/\[pause\]/g, ' | ').slice(0, 180)}`);
  }

  const matters = TURNS.filter((t) => t.expectReaction).length;
  console.log(`\n${'='.repeat(72)}`);
  console.log(`reacted on ${onMatters}/${matters} turns that matter`);
  console.log(`reacted on ${onRoutine}/${TURNS.length - matters} routine turns (should be 0-1)`);
  console.log(`invented: ${leaked}   text-emoji leaked: ${emojiLeaked}   marker-only replies: ${wordless}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
