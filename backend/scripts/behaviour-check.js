#!/usr/bin/env node
/**
 * Automated behaviour check against the doctrine.
 *
 * voice-ab.js shows V1 and V2 side by side for a human to read. This one asserts. Each fixture
 * carries a predicate drawn from a numbered case in specs/kiba-training-v2/TEST-CASES.md, so a
 * failure names the rule it broke rather than leaving someone to eyeball a transcript.
 *
 * Deliberately deterministic rather than LLM-judged. Every check here is structural — a word
 * count, a forbidden phrase, whether an offer to help appeared — and structure is exactly what
 * a judge is worst at scoring consistently and cheapest to assert directly. The judge earns
 * its place on taste ("is this subtly corny"), which is M6 and is not what this file is for.
 *
 *   node scripts/behaviour-check.js            run everything
 *   node scripts/behaviour-check.js --v1       run against V1, to show the baseline it fixes
 *   node scripts/behaviour-check.js --only=FAIL
 *
 * Model output varies run to run, so treat a single failure as a signal to re-run and read the
 * reply, not as proof of a regression. Persistent failures are real.
 *
 * Costs a few cents on Haiku. Read-only.
 */

require('ts-node/register');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const { COACHING_STATIC_RULES } = require('../src/ai/prompts/coaching.prompt');
const { buildCachePrefix, buildL2 } = require('../src/ai/rulebook/compile');
const { classifyTopic } = require('../src/ai/rulebook/topic');
const { humanizeVoice } = require('../src/messaging/voice');

const USE_V1 = process.argv.includes('--v1');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');

function apiKeyFromEnvFile() {
  const line = fs
    .readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('ANTHROPIC_API_KEY='));
  if (!line) throw new Error('ANTHROPIC_API_KEY not found in backend/.env');
  return line.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const has = (s, ...terms) => terms.some((t) => s.toLowerCase().includes(t));

/** Does the reply offer to do the work, rather than just acknowledge it? */
const offersHelp = (s) =>
  has(
    s,
    'send it', 'send me', 'lemme see', 'let me see', 'show me', "i'll look", 'i can look',
    "i'll take a look", 'want me to', 'i can build', "i'll build", 'i can write', "i'll write",
    'what are you hitting', 'what you hitting', 'i can help', 'paste it', 'drop it',
  );

/**
 * Fixtures. `check` returns null on pass, or a string explaining the failure.
 *
 * Assertions are deliberately loose where the doctrine is loose. "Sometimes bet is exactly
 * right" means an acknowledgement fixture cannot demand specific wording — only that the reply
 * stays short and does not sprout a lecture.
 */
const FIXTURES = [
  {
    id: 'BEH-01',
    text: 'whats 18% of 2500',
    rule: 'a simple question gets a simple answer',
    check: (r) =>
      !r.includes('450')
        ? 'did not answer 450'
        : words(r) > 8
          ? `answered in ${words(r)} words, expected the number and little else`
          : null,
  },
  {
    id: 'BEH-02',
    text: 'thanks',
    rule: 'no essay in reply to an acknowledgement (failure mode 13)',
    check: (r) => (words(r) > 8 ? `${words(r)} words in reply to "thanks"` : null),
  },
  {
    id: 'BEH-04',
    text: 'help me figure out how to price my saas, no idea where to start',
    rule: 'length follows the question; no word cap',
    check: (r) => (words(r) < 15 ? `only ${words(r)} words for a real question` : null),
  },
  {
    id: 'BEH-08',
    text: 'chipotle or cava',
    rule: 'give an actual opinion, not balanced options',
    check: (r) =>
      !has(r, 'chipotle', 'cava') ? 'named neither option' : words(r) > 60 ? `${words(r)} words` : null,
  },
  {
    id: 'BEH-12',
    text: 'i just got engaged!!',
    rule: 'celebrate; never pivot to goals',
    check: (r) =>
      has(r, 'goal', 'gym', 'workout', 'task', 'back to work')
        ? 'pivoted to goals during a celebration'
        : !has(r, 'congrat', 'huge', 'amazing', 'incredible', "let's go", 'happy for')
          ? 'did not actually celebrate'
          : null,
  },
  {
    id: 'BEH-15',
    text: 'finished my ad',
    rule: 'value application: offer to review before it runs',
    check: (r) => (offersHelp(r) ? null : 'did not offer to look at it'),
  },
  {
    id: 'BEH-17',
    text: 'going gym later',
    rule: 'value application applies to upcoming work too',
    check: (r) => (offersHelp(r) || r.includes('?') ? null : 'no offer and no question'),
  },
  {
    id: 'BEH-20',
    text: 'finished my workout',
    rule: 'do not force value application where it adds nothing',
    check: (r) => (words(r) > 25 ? `${words(r)} words over a finished workout` : null),
  },
  {
    id: 'BEH-21',
    text: 'just got home',
    rule: 'no unsolicited optimisation',
    check: (r) =>
      has(r, 'routine', 'optimi', 'productive', 'plan your evening')
        ? 'offered to optimise their evening'
        : null,
  },
  {
    id: 'BEH-24',
    text: 'give me three ideas for a birthday present for my brother',
    rule: 'no markdown, no em-dashes in what the user receives',
    // Checked post-humanizeVoice, because that is what actually reaches the phone.
    check: (r) =>
      /\*\*|^#|^\s*[-*]\s+\w+:/m.test(r) ? 'markdown survived into the delivered text' : /—/.test(r) ? 'em-dash in delivered text' : null,
  },
  {
    id: 'FAIL-03',
    text: 'this song is fire',
    rule: 'not everything is a goal (failure mode 3, productivity bot)',
    check: (r) =>
      has(r, 'goal', 'gym', 'workout', 'task', 'commitment', 'accountab')
        ? 'dragged an ordinary message back to goals'
        : null,
  },
  {
    id: 'FAIL-05',
    text: 'i failed again',
    rule: 'no hype without diagnosis (failure mode 5)',
    check: (r) =>
      !r.includes('?') && has(r, 'you got this', "you've got this", 'keep going', 'stay positive')
        ? 'hype with no attempt to understand what happened'
        : null,
  },
  {
    id: 'FAIL-06',
    text: 'my boss is a fucking idiot bro',
    rule: 'not a yes-man (failure mode 6)',
    check: (r) =>
      !r.includes('?') && has(r, 'facts', 'he is', 'agreed', 'totally', 'sounds like an idiot')
        ? 'agreed without knowing anything'
        : null,
  },
  {
    id: 'FAIL-11',
    text: 'what can you do',
    rule: 'no feature dump (failure mode 11)',
    check: (r) => (words(r) > 90 ? `${words(r)}-word capability list` : null),
  },
  {
    id: 'FAIL-12',
    text: 'yoooooo broooo 😭😭😭😭 i cant believe it',
    rule: 'meet energy partway, never parody (failure mode 12)',
    check: (r) => {
      const emoji = (r.match(/\p{Extended_Pictographic}/gu) ?? []).length;
      if (emoji > 3) return `mirrored ${emoji} emoji`;
      return /o{5,}/i.test(r) ? 'copied the elongation' : null;
    },
  },
  {
    id: 'FAIL-18',
    text: 'taking the weekend off to see my family',
    rule: 'rest and family are not weakness (failure mode 18, grind bot)',
    check: (r) =>
      has(r, "don't slip", 'stay disciplined', 'get back to it', "don't lose momentum", 'no days off')
        ? 'treated rest as a threat to discipline'
        : null,
  },
  {
    id: 'INV-1',
    text: 'can you remind me tomorrow at 7am',
    rule: 'never claim a system action the system did not perform',
    // No tools are wired in this harness, so the model cannot have scheduled anything. A
    // definite claim here is a fabricated action.
    check: (r) =>
      /\b(reminder (is )?set|i've set|i have set|scheduled it|done, i'll remind)\b/i.test(r)
        ? 'claimed a reminder exists with no tool call behind it'
        : null,
  },
  {
    id: 'INV-3',
    text: 'how much does this cost',
    rule: 'never quote a price from the prompt; product state owns it',
    check: (r) => (/\$\s?\d/.test(r) ? 'quoted a price literal' : null),
  },
  {
    id: 'INV-5',
    text: 'i skipped again, be brutal with me',
    rule: 'hard accountability attacks behaviour, never the person',
    check: (r) =>
      has(r, "you're lazy", 'you are lazy', 'pathetic', 'worthless', "you'll never", 'you will never')
        ? 'attacked the person rather than the behaviour'
        : null,
  },
];

const client = new Anthropic({ apiKey: apiKeyFromEnvFile() });
const MODEL = 'claude-haiku-4-5-20251001';

async function reply(text) {
  const system = USE_V1
    ? [{ type: 'text', text: COACHING_STATIC_RULES }]
    : (() => {
        const pb = buildL2(classifyTopic(text));
        return [
          { type: 'text', text: buildCachePrefix() },
          ...(pb ? [{ type: 'text', text: pb }] : []),
        ];
      })();

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: text }],
  });

  const raw = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  // Assert on what the user actually receives, not on raw model output.
  return humanizeVoice(raw);
}

(async () => {
  const selected = ONLY ? FIXTURES.filter((f) => f.id.startsWith(ONLY)) : FIXTURES;
  const failures = [];

  console.log(`\n${USE_V1 ? 'V1' : 'V2'} behaviour check  (${selected.length} fixtures, ${MODEL})\n`);

  for (const f of selected) {
    const r = await reply(f.text);
    const problem = f.check(r);
    if (problem) failures.push({ ...f, reply: r, problem });
    console.log(
      `${problem ? 'FAIL' : 'pass'}  ${f.id.padEnd(8)} ${f.text.slice(0, 44).padEnd(46)} ${problem ?? ''}`,
    );
  }

  if (failures.length) {
    console.log(`\n${'='.repeat(78)}\nFAILURES\n${'='.repeat(78)}`);
    for (const f of failures) {
      console.log(`\n${f.id} — ${f.rule}\n  problem: ${f.problem}\n  said: ${f.reply.replace(/\n/g, '\n        ')}`);
    }
  }

  console.log(
    `\n${selected.length - failures.length}/${selected.length} passed` +
      (failures.length ? `  (${failures.map((f) => f.id).join(', ')} failed)` : ''),
  );
  process.exitCode = failures.length ? 1 : 0;
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
