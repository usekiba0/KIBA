/**
 * Training Doc v2 pre-launch verification harness.
 *
 * Runs the doc's own "Test methodology before launch" (section 7) against the
 * REAL model and the LIVE prompts, then grades each numbered failure mode
 * automatically. Nothing here touches a real phone number, Stripe, or the DB —
 * it drives buildIntakeSystemPrompt / buildSystemPrompt directly and mutates the
 * context between turns exactly as save_intake_field would have persisted it.
 *
 * The doc's checklist, verbatim:
 *   - 5 full onboardings using different persona openings (question, greeting,
 *     one-word, skeptical, hype). Grade name reaction, opener, close.
 *   - Every close must contain at least one specific callback.        (P1.1)
 *   - No close may end on a readiness question.                       (P1.2)
 *   - Every name reaction must differ.                                (P1.3)
 *   - Never silent on a mid-size city.                                (P1.4)
 *   - >=2 tests use "done" as fake proof — KIBA must reject.          (P0.2)
 *   - >=1 test gives ambiguous input — KIBA must ask, not execute.    (P0.3)
 *   - >=1 test ghosts 4h+ then sends a coded confession — KIBA must
 *     engage it, not menu-retreat.                                    (P1.5)
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/sim-trainingdoc-v2.ts
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildIntakeSystemPrompt, IntakeContext } from '../src/ai/prompts/intake.prompt';
import { buildSystemPrompt } from '../src/ai/prompts/coaching.prompt';
import { OnboardingVariant } from '../src/data/entities/user.entity';
import { PressurePreference } from '../src/data/entities/psychological-profile.entity';
import { humanizeVoice, scrubIntakeVoice } from '../src/messaging/voice';
import { stripIdentityReferendum } from '../src/messaging/intake-close-guard';

// .env WINS over the shell here, deliberately. This machine exports a Google API
// key as ANTHROPIC_API_KEY, which shadows the real one and makes every call 401.
// The other sim scripts use shell-first loading and hit exactly that trap.
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
// Match the live Render config so the sim grades the copy users actually get.
const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? 3);
const PRICE = process.env.STRIPE_PRICE_DISPLAY ?? '$20/month';

type Turn = { user: string; kiba: string };
type Finding = { id: string; ok: boolean; detail: string };

/** Full transcripts, written to disk so a failed grade can be read, not guessed at. */
const transcript: any[] = [];
const OUT = process.env.SIM_OUT || 'sim-trainingdoc-v2.json';

const findings: Finding[] = [];
const record = (id: string, ok: boolean, detail: string) => {
  findings.push({ id, ok, detail });
};

function say(text: string): string {
  return text.replace(/\[pause\]/g, '\n      ');
}

/**
 * Put the raw model output through the SAME deterministic pipeline prod uses
 * before it reaches a phone. The first run of this harness graded raw output and
 * reported five em-dash failures that users would never have seen — humanizeVoice
 * converts them at send(). Grading pre-pipeline text measures the model; grading
 * post-pipeline text measures the PRODUCT, which is what we actually ship.
 */
const throughIntakePipeline = (raw: string): string =>
  stripIdentityReferendum(scrubIntakeVoice(humanizeVoice(raw)));
const throughCoachingPipeline = (raw: string): string => humanizeVoice(raw);

// ---------------------------------------------------------------------------
// PART A — five onboardings, one per persona opening
// ---------------------------------------------------------------------------

type Persona = {
  key: string;
  opening: string;
  variant: OnboardingVariant;
  name: string;
  /** A deliberately mid-size city — the doc's P1.4 failure was silence on these. */
  city: string;
  region: string[];
  /** The strongest emotional disclosure. The close MUST call one of these back. */
  discloseText: string;
  callbackTokens: string[];
  goal: string;
  script: string[];
};

const PERSONAS: Persona[] = [
  {
    key: 'QUESTION',
    opening: 'what even is this',
    variant: OnboardingVariant.EXPLAINER,
    name: 'marcus',
    city: 'macon georgia',
    region: ['georgia', 'south', 'east coast', 'atl'],
    goal: 'cut the weekend drinking',
    discloseText:
      "i lose the whole sunday. head hurts, im useless. and my daughter be asking why im always sleepy on weekends lol",
    callbackTokens: ['daughter'],
    script: [
      'trying to cut the weekend drinking',
      'fridays and saturdays mostly, with the boys',
      'been 3 years like this since her and me split',
      'i did dry january once and 3 weeks last summer so i can do it',
    ],
  },
  {
    key: 'GREETING',
    opening: 'yo',
    variant: OnboardingVariant.CASUAL,
    name: 'tay',
    city: 'toledo ohio',
    region: ['ohio', 'midwest', 'east coast'],
    goal: 'get back in the gym',
    discloseText:
      'my pops had a heart thing last year and i keep telling myself im next if i dont fix it i guess',
    callbackTokens: ['pops', 'dad', 'heart', 'father'],
    script: [
      'need to get back in the gym',
      'i used to go 5x a week two years ago, now nothing',
      'i got a planet fitness down the street, no excuse really',
      'i can do 4 days if im honest',
    ],
  },
  {
    key: 'ONE-WORD',
    opening: 'gym',
    variant: OnboardingVariant.STANDARD,
    name: 'Priya',
    city: 'boise idaho',
    region: ['idaho', 'boise', 'mountain', 'west'],
    goal: 'train for a half marathon',
    discloseText:
      "i signed up for the half in october and told everyone at work. kind of regret saying it out loud now",
    callbackTokens: ['half', 'october', 'work', 'told everyone'],
    script: [
      'training for a half marathon',
      'i run maybe twice a week, longest is 5 miles',
      'mornings before work is the only time that works',
      'yeah 5am if i actually get up',
    ],
  },
  {
    key: 'SKEPTIC',
    opening: 'does this actually work or is it another app that i pay for and forget',
    variant: OnboardingVariant.STANDARD,
    name: 'Dee',
    city: 'shreveport',
    region: ['louisiana', 'shreveport', 'south', 'central'],
    goal: 'launch my clothing brand',
    callbackTokens: ['walmart', 'shifts', 'job'],
    discloseText:
      "im tired of pulling shifts at walmart while these 20 year olds online say theyre making 100k a month. sort of feels like im behind",
    script: [
      'trying to launch my clothing brand',
      'i got samples made but i havent posted anything or reached out to anybody',
      'i dunno what to even post honestly',
      'i could do one outreach dm a day maybe',
    ],
  },
  {
    key: 'HYPE',
    opening: "AYYY let's get it, i'm ready to lock in fr",
    variant: OnboardingVariant.CASUAL,
    name: 'Jordan',
    city: 'fresno',
    region: ['fresno', 'california', 'cali', 'west coast', 'central valley'],
    goal: 'stop doomscrolling and finish my album',
    callbackTokens: ['album', 'brother', 'beat'],
    discloseText:
      "my brother passed in 2023 and the album was supposed to be for him. i havent touched it in months tbh",
    script: [
      'i wanna stop doomscrolling and actually finish my album',
      'i lose like 4 hours a night on tiktok easy',
      'i got 6 songs half done',
      'nights are when i actually make stuff',
    ],
  },
];

async function ask(system: string, history: Anthropic.Messages.MessageParam[]): Promise<string> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system,
    messages: history,
  });
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();
}

async function runOnboarding(p: Persona): Promise<{
  turns: Turn[];
  nameReaction: string;
  cityReaction: string;
  /**
   * The CHALLENGE message (prompt step 7) — the dare + callback that lands
   * BEFORE the yes. This is the message the doc means by "the close": it's where
   * the disclosure callback belongs and where the identity referendum fired.
   * The first run of this harness graded the post-yes turn instead, which is
   * deliberately just one short line + the link, so every callback check failed
   * and every referendum check passed vacuously.
   */
  challenge: string;
  /** The post-yes line that precedes the payment link (prompt step 8). */
  postYes: string;
}> {
  const ctx: IntakeContext = {
    name: null,
    intakeData: {},
    utcOffsetMinutes: null,
    nowUtc: new Date(),
    paymentLinkSent: false,
    sampleCoachingGiven: false,
    variant: p.variant,
    trialDays: TRIAL_DAYS,
    priceDisplay: PRICE,
  };
  const history: Anthropic.Messages.MessageParam[] = [];
  const turns: Turn[] = [];

  const step = async (user: string): Promise<string> => {
    history.push({ role: 'user', content: user });
    const raw = await ask(buildIntakeSystemPrompt(ctx), history);
    const kiba = throughIntakePipeline(raw);
    // History carries the SENT text — that's what the user replied to.
    history.push({ role: 'assistant', content: kiba || '(empty)' });
    turns.push({ user, kiba });
    return kiba;
  };

  // 1. the persona-specific opening
  await step(p.opening);
  // 2. the NAME — this reply is the name-reaction beat we grade (P1.3)
  const nameReaction = await step(p.name);
  ctx.name = p.name;

  // 3. the goal + diagnostic build
  await step(p.script[0]);
  ctx.intakeData.goal_description = p.goal;
  ctx.intakeData.goals = [p.goal];
  for (const line of p.script.slice(1, 3)) await step(line);

  // 4. THE DISCLOSURE — the emotional payload the close must call back (P1.1/P1.7)
  await step(p.discloseText);
  ctx.intakeData.why_it_matters = p.discloseText;
  ctx.intakeData.avoidance_patterns = p.script[1];

  await step(p.script[3]);

  // 5. tone, then CITY — this reply is the cultural-mirror beat we grade (P1.4)
  await step('real and direct, you can cuss');
  ctx.intakeData.cussing_ok = true;
  const cityReaction = await step(p.city);
  ctx.intakeData.city = p.city;
  ctx.utcOffsetMinutes = -300;

  // 6. confirm the time. The reply to THIS is the challenge — everything is
  //    locked, so the prompt's step 7 fires. The confirmed time is now SETTLED
  //    state, so re-asking it here is the P1.8 failure.
  const challenge = await step('9am works');
  ctx.checkinTime = '09:00';
  const postYes = await step("yeah i'm in, let's do it");

  return { turns, nameReaction, cityReaction, challenge, postYes };
}

// ---------------------------------------------------------------------------
// PART B — post-pay coaching: fake proof, ambiguous input, ghost confession
// ---------------------------------------------------------------------------

const coachUser: any = {
  id: 'sim',
  name: 'Marcus',
  goals: 'send 1 outreach DM a day for the clothing brand',
  intake_data: { city: 'Macon' },
  miss_counts_by_dow: [0, 0, 0, 0, 0, 0, 0],
};
const coachProfile: any = {
  fears: 'staying stuck while everyone moves forward',
  avoidance_patterns: 'says he did it without doing it',
  comparison_figure: 'guys online claiming 100k a month',
  public_failure_scenario: 'friends seeing him quit again',
  typical_failure_moment: 'friday nights',
  pressure_preference: PressurePreference.PRESSURE,
};

async function runCoaching(label: string, history: Anthropic.Messages.MessageParam[]): Promise<string> {
  const system = buildSystemPrompt(coachUser, coachProfile, 68, 1, undefined, undefined, undefined, [
    { id: 't1', content: 'send 1 outreach DM to a clothing brand', status: 'open' } as any,
  ]);
  const reply = throughCoachingPipeline(await ask(system, history));
  console.log(`\n  [${label}]`);
  for (const m of history.filter((h) => h.role === 'user')) {
    console.log(`  USER: ${typeof m.content === 'string' ? m.content : ''}`);
  }
  console.log(`  KIBA: ${say(reply)}`);
  return reply;
}

// ---------------------------------------------------------------------------
// Graders
// ---------------------------------------------------------------------------

const READINESS_CLOSES = [
  /you\s+(really\s+)?(wanna|want to)\s+do this/i,
  /just testing/i,
  /still thinking about it/i,
  /you\s+(wanna|want to)\s+lock (this|that) in\s+or\s+nah/i,
  /(you\s+)?ready to lock (this|that) in/i,
  /are you (serious|actually ready)/i,
  /you down to actually do it/i,
  /you gonna follow through or nah/i,
  /no half (measures|stepping)/i,
];

const PROOF_REJECTIONS = [
  /not proof/i, /that'?s not proof/i, /screenshot/i, /send me/i, /need to see/i,
  /can'?t count it/i, /doesn'?t count/i, /proof first/i, /show me/i,
];

function gradeClose(p: Persona, challenge: string, postYes: string) {
  const lc = challenge.toLowerCase();
  // Both messages are part of the close moment; the referendum can land in either.
  const both = `${challenge}\n${postYes}`;

  // Grade the callback across the whole CLOSE WINDOW, not one fixed turn. KIBA
  // paces the build to the person — a skeptic gets one more diagnostic beat than
  // someone who arrived ready — so the challenge can land on either turn. An
  // earlier version of this grader checked only the first turn and reported
  // "closing amnesia" for conversations where the callback was one message later.
  const lcBoth = both.toLowerCase();
  const hit = p.callbackTokens.find((t) => lcBoth.includes(t.toLowerCase()));
  record(`P1.1 close-callback [${p.key}]`, !!hit,
    hit ? `calls back "${hit}"` : `no callback from [${p.callbackTokens.join(', ')}]`);

  const readiness = READINESS_CLOSES.find((re) => re.test(both));
  record(`P1.2 no-identity-referendum [${p.key}]`, !readiness,
    readiness ? `matched banned pattern ${readiness}` : 'no readiness question');

  const reask = /what time (do you want|works|should i)/i.test(both);
  record(`P1.8 no-reask-settled-time [${p.key}]`, !reask,
    reask ? 're-asked a time already confirmed' : 'did not re-ask the time');

  // P0.4's actual requirement is that KIBA never quotes a CHALLENGE WINDOW the
  // billing won't honour. NOT naming a duration is fine. Match only durations in
  // lock-in framing — an earlier version flagged "4 days" when KIBA was echoing
  // the user's own "i can do 4 days if im honest" (their training frequency).
  const wrong = new RegExp(
    `(?:next|the|for|give you|got)\\s+(?!${TRIAL_DAYS}\\b)(\\d+)\\s*(?:day|days|month|months)\\b[^.!?]{0,40}?(?:lock|prove|challenge|trial)`
    + `|(?!${TRIAL_DAYS}\\b)(\\d+)[\\s-]?(?:day|days|month|months)\\s+lock[\\s-]?in`,
    'i',
  );
  const badMatch = both.match(wrong);
  record(`P0.4 no-wrong-window [${p.key}]`, !badMatch,
    badMatch ? `quoted "${badMatch[0]}" on a ${TRIAL_DAYS}-day trial` : `no window other than ${TRIAL_DAYS}d`);

  const named = new RegExp(`\\b${TRIAL_DAYS}[\\s-]?days?\\b`, 'i').test(both);
  record(`P0.4 states the real window [${p.key}] (soft)`, named,
    named ? `names the ${TRIAL_DAYS}-day lock in` : 'did not name the window (not a defect, just noted)');
}

function gradeCity(p: Persona, reply: string) {
  const lc = reply.toLowerCase();
  const acknowledged = p.region.some((r) => lc.includes(r.toLowerCase()))
    || lc.includes(p.city.split(' ')[0].toLowerCase());
  record(`P1.4 city-acknowledged [${p.key}]`, acknowledged,
    acknowledged ? 'named the city/region' : `silent on "${p.city}"`);
}

function gradeVoice(p: Persona, turns: Turn[]) {
  const all = turns.map((t) => t.kiba).join('\n');
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all);
  record(`voice no-emoji-in-intake [${p.key}]`, !emoji, emoji ? 'emoji found in sign-up flow' : 'clean');
  const md = /\*\*|^#{1,3}\s|\[.+\]\(.+\)/m.test(all);
  record(`voice no-markdown [${p.key}]`, !md, md ? 'markdown found' : 'clean');
  const emdash = /[—–]/.test(all);
  record(`voice no-em-dash [${p.key}]`, !emdash, emdash ? 'em-dash found' : 'clean');
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${'='.repeat(78)}`);
  console.log(`TRAINING DOC v2 — PRE-LAUNCH VERIFICATION`);
  console.log(`model: ${MODEL}   trial: ${TRIAL_DAYS}d   price: ${PRICE}`);
  console.log('='.repeat(78));

  const nameReactions: Record<string, string> = {};

  for (const p of PERSONAS) {
    console.log(`\n\n${'-'.repeat(78)}\nONBOARDING ${p.key}  (opening: "${p.opening}")\n${'-'.repeat(78)}`);
    const { turns, nameReaction, cityReaction, challenge, postYes } = await runOnboarding(p);
    for (const t of turns) {
      console.log(`\nUSER: ${t.user}`);
      console.log(`KIBA: ${say(t.kiba)}`);
    }
    transcript.push({ persona: p.key, turns, nameReaction, cityReaction, challenge, postYes });
    nameReactions[p.key] = nameReaction;
    gradeClose(p, challenge, postYes);
    gradeCity(p, cityReaction);
    gradeVoice(p, turns);
  }

  // P1.3 — every name reaction must be different from every other.
  const seen = new Map<string, string>();
  let dupes = 0;
  for (const [key, text] of Object.entries(nameReactions)) {
    const norm = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
    for (const [otherKey, otherNorm] of seen) {
      if (norm === otherNorm) { dupes++; console.log(`\n!! identical name reaction: ${key} == ${otherKey}`); }
    }
    seen.set(key, norm);
  }
  record('P1.3 name-reactions-all-differ', dupes === 0, dupes === 0 ? '5 distinct reactions' : `${dupes} identical pair(s)`);

  // ---- PART B ------------------------------------------------------------
  console.log(`\n\n${'='.repeat(78)}\nPOST-PAY COACHING CHECKS\n${'='.repeat(78)}`);

  // P0.2 — fake proof, twice, on a NON-fitness commitment.
  for (const [i, word] of ['done', 'sent it, handled'].entries()) {
    const reply = await runCoaching(`P0.2 fake proof #${i + 1} ("${word}")`, [
      { role: 'assistant', content: 'outreach dm to a clothing brand today. thats the one thing.' },
      { role: 'user', content: word },
    ]);
    const rejected = PROOF_REJECTIONS.some((re) => re.test(reply));
    record(`P0.2 rejects bare "${word}"`, rejected, rejected ? 'asked for evidence' : 'ACCEPTED WORDS AS PROOF');
  }

  // P0.3 — ambiguous input must produce a question, never fake execution.
  for (const [i, amb] of ['ima run for other ppl more money can be made', "let's do that"].entries()) {
    const reply = await runCoaching(`P0.3 ambiguous #${i + 1} ("${amb}")`, [
      { role: 'user', content: amb },
    ]);
    const firstPerson = /\b(i'?m|i am) (doing|starting|working on) (that|it)\b/i.test(reply)
      || /let me get started/i.test(reply);
    const asks = reply.includes('?');
    record(`P0.3 no first-person hallucination ("${amb.slice(0, 24)}...")`, !firstPerson,
      firstPerson ? 'SPOKE AS THE USER' : 'stayed in role');
    record(`P0.3 clarifies instead of executing ("${amb.slice(0, 24)}...")`, asks,
      asks ? 'asked a clarifying question' : 'did not ask');
  }

  // P0.3 — a declined config question must NOT be answered for them.
  const declined = await runCoaching('P0.3 declined city', [
    { role: 'assistant', content: 'what city you in? i wanna get your check-in on your clock.' },
    { role: 'user', content: "doesn't matter bro" },
  ]);
  const guessed = /\b(houston|chicago|atlanta|dallas|miami|new york|los angeles)\b/i.test(declined);
  record('P0.3 does not invent a declined city', !guessed,
    guessed ? `GUESSED a city: "${declined.match(/\b(houston|chicago|atlanta|dallas|miami|new york|los angeles)\b/i)?.[0]}"` : 'offered a fallback instead');

  // P1.5 — ghost, then a coded confession. Must engage it, not menu-retreat.
  const ghost = await runCoaching('P1.5 ghost + coded confession', [
    { role: 'assistant', content: "so which one feels doable — the line you use when someone offers, or just sitting out the heavy spots for now?" },
    { role: 'user', content: '[16 hours later] yeah idk i disappeared. was a long night lol' },
  ]);
  const engaged = /long night|what happened|you drink|did you drink|how was it|rough one|no judgment|talk to me/i.test(ghost);
  const retreated = /which one|the line or|sitting out|pick one/i.test(ghost);
  record('P1.5 engages the coded confession', engaged, engaged ? 'named it' : 'did not engage it');
  record('P1.5 no menu-retreat', !retreated, retreated ? 'RETURNED TO THE PRE-GHOST MENU' : 'did not re-offer the menu');

  // ---- REPORT ------------------------------------------------------------
  console.log(`\n\n${'='.repeat(78)}\nGRADE SHEET\n${'='.repeat(78)}`);
  const fails = findings.filter((f) => !f.ok);
  for (const f of findings) {
    console.log(`${f.ok ? ' PASS' : '*FAIL'}  ${f.id.padEnd(46)} ${f.detail}`);
  }
  fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, trialDays: TRIAL_DAYS, transcript, findings }, null, 2));
  console.log(`\n(full transcripts written to ${OUT})`);
  console.log('-'.repeat(78));
  console.log(`${findings.length - fails.length}/${findings.length} passed, ${fails.length} failed`);
  if (fails.length) {
    console.log('\nFAILURES:');
    for (const f of fails) console.log(`  - ${f.id}: ${f.detail}`);
  }
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
