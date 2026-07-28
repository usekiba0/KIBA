/**
 * Per-generation request tuning for the Claude API.
 *
 * The 5-series models (Claude Sonnet 5, Opus 5) changed two things that our
 * request shapes depended on, and both fail QUIETLY rather than loudly:
 *
 *  1. `temperature` — a non-default value is rejected with a 400. Every
 *     structured-JSON call we make sends `temperature: 0` for determinism, so
 *     flipping a model id to a 5-series without handling this breaks the call.
 *
 *  2. Thinking — omitting the `thinking` parameter used to mean "don't think".
 *     On the 5-series it means "think adaptively". That is actively wrong for
 *     us in two ways: it adds latency to a product judged on feeling instant,
 *     and `max_tokens` caps thinking + answer TOGETHER — so a 128-token proof
 *     verdict would spend its whole budget thinking and return truncated JSON.
 *     We'd never see an error; the parse would fail and the verdict would
 *     silently fail open.
 *
 * So the model id alone is not a safe thing to swap. These helpers make it one:
 * flip `AI_VISION_MODEL` to a 5-series in Render and the request shape follows
 * automatically, with no code change and no redeploy.
 *
 * Note the older models are NOT given `thinking: {type:'disabled'}` explicitly.
 * It is their default behaviour, and sending a parameter a model may not accept
 * is exactly the kind of avoidable 400 this file exists to prevent.
 */

/**
 * Matches a 5-series model id, and deliberately does NOT match
 * `claude-haiku-4-5-20251001` — the naive test for "-5" hits its date suffix
 * and its 4-5 version, which would send 5-series params to a 4-series model.
 */
const FIVE_SERIES = /^claude-(?:opus|sonnet|haiku|fable|mythos)-5(?:$|[-.])/;

/**
 * Fable 5 and Mythos 5 think ALWAYS, and the parameter that turns thinking off
 * on every other model is rejected on them: `thinking: {type: 'disabled'}`
 * returns a 400 at any effort level. The only accepted forms are omitting the
 * parameter entirely or sending `{type: 'adaptive'}`.
 *
 * So the "is this a 5-series model" test is not sufficient on its own — these
 * two need `thinking` left off the request completely. Without this split the
 * helpers below would emit the one shape these models reject, and every call
 * would 400 the moment AI_VISION_MODEL was pointed at one. That is the exact
 * failure this file exists to prevent, so it is worth the extra branch.
 */
const ALWAYS_THINKING = /^claude-(?:fable|mythos)-5(?:$|[-.])/;

/** Request fields that differ between model generations. */
export interface GenerationTuning {
  temperature?: number;
  thinking?: { type: 'disabled' };
}

export function isFiveSeries(model: string): boolean {
  return FIVE_SERIES.test(model.trim());
}

/** True when the model refuses `thinking: {type:'disabled'}` — Fable 5 / Mythos 5. */
export function isAlwaysThinking(model: string): boolean {
  return ALWAYS_THINKING.test(model.trim());
}

/**
 * For structured-JSON calls (proof verdicts, nutrition analysis) where we want
 * the least creative answer the model can give.
 *
 * 4-series: `temperature: 0`, which is what these prompts were tuned on.
 * 5-series: temperature is gone, so determinism comes from the prompt instead —
 * and thinking is turned off so the whole `max_tokens` budget goes to the JSON.
 * Fable/Mythos 5: neither knob exists — send nothing.
 *
 * ⚠️ Fable 5 / Mythos 5 are NOT safe to drop into the low-`max_tokens` callers
 * here without also raising `max_tokens`. Thinking cannot be turned off and it
 * shares the `max_tokens` budget with the answer, so a 128-token proof verdict
 * would spend the budget thinking and return truncated JSON — the silent
 * fail-open this file was written to avoid. Raise the cap first.
 */
export function deterministicParams(model: string): GenerationTuning {
  if (isAlwaysThinking(model)) return {};
  return isFiveSeries(model) ? { thinking: { type: 'disabled' } } : { temperature: 0 };
}

/**
 * For conversational calls, where temperature was never set and must stay
 * unset. Only job is to keep a 5-series model from thinking before it replies —
 * which Fable/Mythos 5 do not allow, so they get nothing.
 */
export function noThinking(model: string): GenerationTuning {
  if (isAlwaysThinking(model)) return {};
  return isFiveSeries(model) ? { thinking: { type: 'disabled' } } : {};
}
