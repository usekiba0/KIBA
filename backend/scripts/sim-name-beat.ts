/**
 * Replays Karibi's exact 2026-07-29 opening against the LIVE intake prompt and
 * the prod model, three times (the failure was probabilistic, so one clean run
 * proves nothing). Watching for:
 *   - the goal question with the concrete menu comes back
 *   - no heritage guess
 *   - no parroted prompt example
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/sim-name-beat.ts
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { buildIntakeSystemPrompt, IntakeContext } from '../src/ai/prompts/intake.prompt';
import { OnboardingVariant } from '../src/data/entities/user.entity';

if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';

const ctx: IntakeContext = {
  name: null,
  intakeData: {},
  utcOffsetMinutes: null,
  nowUtc: new Date(),
  paymentLinkSent: false,
  sampleCoachingGiven: false,
  variant: OnboardingVariant.EXPLAINER,
  trialDays: 3,
  priceDisplay: '$9.99/month',
};

(async () => {
  console.log(`model: ${MODEL}\n`);
  for (let run = 1; run <= 3; run += 1) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: buildIntakeSystemPrompt(ctx),
      messages: [
        { role: 'user', content: 'who even is KIBA ?' },
        {
          role: 'assistant',
          content:
            "i'm KIBA. not an app you forget about. i live in your texts, check in daily, and call out the excuses that keep you stuck.\n\nwhat's your name tho?",
        },
        { role: 'user', content: 'Karibi' },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const lower = text.toLowerCase();
    console.log(`===== RUN ${run} =====\n${text}\n`);
    console.log(
      '  heritage guess :',
      /kalabari|nigerian|african|ijaw/.test(lower) ? 'PRESENT ✗' : 'none ✓',
    );
    console.log(
      '  goal ask       :',
      /lock in|locking in|gym|money|business|school/.test(lower) ? 'present ✓' : 'MISSING ✗',
    );
    // "whatever's been sitting on your mind" is the legitimate TAIL of step 2's
    // goal ask. It's only the failure when it arrives WITHOUT the concrete menu —
    // that's the open-ended question a cold lead answers with "nothing".
    const hasMenu = /gym|money|business|school|discipline/.test(lower);
    const vague = /sitting on your mind|going on with you rn/.test(lower) && !hasMenu;
    console.log('  vague opener   :', vague ? 'PRESENT ✗' : 'none ✓', '\n');
  }
})();
