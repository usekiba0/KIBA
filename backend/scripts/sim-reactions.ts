/**
 * Tapback marker simulator (Karibi 2026-08-07 — "if i say i went to the gym it
 * can thumbs up or put !! on it and then talk").
 *
 * The REACTIONS block in the coaching prompt is only real if the live model
 * actually emits `[react:...]`, and prod runs Haiku, where prompt-only rules are
 * historically weak. This runs the REAL buildSystemPrompt against the REAL model
 * over a scripted set of turns and reports:
 *
 *   - how often a marker appears at all (Karibi wants MOST substantive turns)
 *   - whether it's one of the six valid tapbacks (an invented one sends nothing)
 *   - whether it sits at the START of the reply (react first, then talk)
 *   - whether words still followed it (the marker must never replace the reply)
 *   - that logistics-only turns stay bare
 *
 * Read-only: talks to Anthropic, never to SendBlue or the database.
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/sim-reactions.ts
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '../src/ai/prompts/coaching.prompt';
import { extractReaction } from '../src/messaging/outbound-reaction';

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

/** `expectReaction: false` = a bare logistics turn that should NOT get a tapback. */
const TURNS: { text: string; expectReaction: boolean; note: string }[] = [
  { text: 'just got back from the gym', expectReaction: true, note: "Karibi's example #1 — a done task" },
  { text: 'hit 225 for 5 today first time ever', expectReaction: true, note: 'a real win' },
  { text: 'bro i sent you a pic of someone elses food lmaooo', expectReaction: true, note: "Karibi's example #2 — fake proof, joke" },
  { text: 'nah i didnt do it, been on my phone all afternoon', expectReaction: true, note: 'a weak excuse' },
  { text: 'my dad got his results back today. not good', expectReaction: true, note: 'heartfelt — should NOT be a laugh' },
  { text: 'what time did you say the check in was', expectReaction: false, note: 'pure logistics — bare reply is fine' },
  { text: 'ok', expectReaction: false, note: 'empty ack' },
];

const VALID = ['love', 'like', 'dislike', 'laugh', 'emphasize', 'question'];

(async () => {
  console.log(`sim-reactions — model=${MODEL}\n${'='.repeat(72)}`);
  const system = systemPrompt();
  let reacted = 0;
  let expectedReacted = 0;
  let leaked = 0;
  let replacedWords = 0;
  let notAtStart = 0;

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
      reacted++;
      if (turn.expectReaction) expectedReacted++;
      if (!raw.trimStart().toLowerCase().startsWith('[react:')) notAtStart++;
      if (!text.trim()) replacedWords++;
    }
    // An invented marker is stripped by extractReaction, so catch it in the RAW
    // text — that's the only place it's still visible.
    const invented = [...raw.matchAll(/\[\s*react\s*:\s*([a-z]*)\s*\]/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((r) => !VALID.includes(r));
    if (invented.length) leaked += invented.length;

    console.log(`\n> ${turn.text}`);
    console.log(`  (${turn.note})`);
    console.log(`  reaction: ${reaction ?? '—'}${turn.expectReaction ? '' : '   [expected none]'}`);
    if (invented.length) console.log(`  INVENTED: ${invented.join(', ')}`);
    console.log(`  reply:    ${text.replace(/\[pause\]/g, ' | ').slice(0, 180)}`);
  }

  const shouldReact = TURNS.filter((t) => t.expectReaction).length;
  console.log(`\n${'='.repeat(72)}`);
  console.log(`reacted on ${expectedReacted}/${shouldReact} substantive turns (Karibi wants MOST)`);
  console.log(`reacted on ${reacted - expectedReacted}/${TURNS.length - shouldReact} logistics turns (lower is better)`);
  console.log(`invented reactions: ${leaked}   marker-replaced-the-words: ${replacedWords}   not-at-start: ${notAtStart}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
