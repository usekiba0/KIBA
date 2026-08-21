# Implementation Plan: KIBA Training V2

**Spec**: [`spec.md`](spec.md) · **Rulebook**: [`../../docs/training-v2/KIBA_RULEBOOK_V2.md`](../../docs/training-v2/KIBA_RULEBOOK_V2.md)
**Created**: 2026-08-20

---

## 1. The central problem: the corpus does not fit in the prompt

This is the constraint that determines the whole architecture, so it comes first.

| Quantity | Value |
|---|---|
| Training corpus delivered | 926,545 chars (~230k tokens) |
| Distilled V2 rulebook | ~38,000 chars |
| Current assembled coaching prompt | ~34,000 chars |
| **Hard ceiling enforced by test** | **37,200 chars** (`tests/unit/coaching.prompt.spec.ts:436`) |
| Production model | `claude-haiku-4-5` (`AI_MODEL`, `coaching.service.ts:933`) |

The client's instruction — *"make sure the AI actually absorbs everything, don't let it blow
past files"* — cannot be satisfied by pasting 40 documents into a prompt. Two facts make that
impossible: the corpus is 25× the prompt budget, and even if it fit, attention degrades
badly across a 230k-token instruction block. Stuffing it would produce **worse** adherence,
not better, and would add roughly 230k input tokens of latency and cost to every single
message.

**So "absorbing everything" is an engineering guarantee, not a copy-paste.** It is delivered
by three mechanisms, in this order of authority:

```
Tier A doctrine  ──compiled──▶  static prompt layer   (always present, cached)
Tier B playbooks ──retrieved─▶  dynamic prompt layer  (only the active domain)
Tier C examples  ──never sent──▶ eval fixtures         (verify behaviour, not instruct it)
```

Tier C is the important insight. **The mock conversations are 616,608 of the 926,545 chars —
two thirds of the corpus — and every one of them says, in its own header, that it must not be
copied.** They are not prompt material. They are the *test set*. Their value is realised by
scoring generated replies against them, which is a stronger guarantee than inclusion: it
proves the behaviour rather than merely requesting it.

---

## 2. Architecture

### 2.1 Prompt layers

| Layer | Content | Cached? | Budget |
|---|---|---|---|
| **L0 Identity & principles** | Rulebook §0–§1 | Yes — shared cache prefix | ~4k chars |
| **L1 Behaviour core** | §2–§9, §12, §14, §16, §18, §19 compiled to imperative rules | Yes | ~20k chars |
| **L2 Domain playbook** | One of §11's six packs, selected by topic classifier | No | ~2k chars |
| **L3 Communication Profile** | This user's learned style (§15) | No | ~600 chars |
| **L4 Live state** | Goals, open loops, Life State, todos, time, product entitlements | No | existing |

L0+L1 replace `COACHING_STATIC_RULES`. They must stay **byte-identical across users** — that
is what makes them an Anthropic cache prefix, and it is the reason latency and token spend
stayed manageable in V1. Anything user-specific belongs in L2–L4.

> ⚠️ Existing warning in `coaching.prompt.ts` still applies verbatim: put anything
> user-specific or time-specific in the static layer and the cache misses on every turn,
> and the win silently disappears.

### 2.2 Where the rules live

Prompts are **generated** from the rulebook, not hand-edited. `docs/training-v2/KIBA_RULEBOOK_V2.md`
is the source; a build step emits the L0/L1 strings. This is what stops the two drifting —
which is exactly how V1 ended up contradicting its own doctrine in nine places (spec §C-1…C-9).

### 2.3 Guards stay code, not prose

Prod runs Haiku 4.5. Established the hard way on 2026-07-29: **prompt-only guards do not
hold on this model.** Every invariant in spec §Invariants is enforced in code after
generation, never by asking the model nicely:

| Invariant | Enforcement | Status |
|---|---|---|
| INV-1 no fake actions | `reminder-claim-guard.ts`, `payment-claim.prompt.ts` | exists |
| INV-2 no fake memory | new `memory-claim-guard.ts` | **build** |
| INV-3 Pro terms from state | `price-guard.ts` extended | extend |
| INV-4 style instruction honoured | profile write path + assertion test | **build** |
| INV-5 consent before hard accountability | `ack-guard.ts` pattern | extend |
| INV-6 no vulnerability weaponisation | new `sensitive-memory-guard.ts` | **build** |
| INV-7 stale reminder cancelled | existing scheduler reconciliation | verify |
| INV-8 suppression honoured | retrieval filter | **build** |

---

## 3. The Communication Profile

The single largest new piece of state, and the thing V1 has no equivalent of.

```ts
// backend/src/ai/communication-profile.ts
export type Scope = 'turn' | 'session' | 'standing';
export type Confidence = 'weak' | 'moderate' | 'strong' | 'explicit';

export interface ProfileDimension {
  value: number;        // -1.0 … +1.0 on a continuous axis
  confidence: Confidence;
  scope: Scope;
  evidenceCount: number;
  lastUpdated: Date;
  lastEvidence: string; // short abstraction, never a transcript
}

export interface CommunicationProfile {
  userId: string;
  formality: ProfileDimension;            // casual … professional
  messageLength: ProfileDimension;        // terse … detailed
  humourFrequency: ProfileDimension;
  humourStyle: 'dry'|'sarcastic'|'teasing'|'absurd'|'self-deprecating'|'minimal'|null;
  directness: ProfileDimension;           // gentle … blunt
  accountabilityIntensity: ProfileDimension; // supportive … firm … aggressive
  emotionalExpressiveness: ProfileDimension;
  emojiUsage: ProfileDimension;
  profanityTolerance: ProfileDimension;
  explanationDepth: ProfileDimension;     // answer-only … detailed reasoning
  questionTolerance: ProfileDimension;
  initiativePreference: ProfileDimension; // reactive … proactive
  reactionFrequency: ProfileDimension;    // tapbacks: none … most turns
  contextOverrides: Partial<Record<'business'|'fitness'|'relationships'|'emotional', Partial<CommunicationProfile>>>;
  suppressedTopics: string[];             // INV-8
}
```

### Update rules

- **Explicit instruction → `confidence: 'explicit'`, applied from the next turn.** The user
  must never repeat a communication correction (Rulebook §15).
- **Behavioural evidence** moves a dimension by a small delta and increments `evidenceCount`.
  A dimension only reaches `strong` at `evidenceCount >= 3`. One data point never flips a
  dimension — that is failure mode #12 and #16.
- **Scope decay:** `turn` clears after the reply; `session` clears after 6h of silence;
  `standing` persists. "don't joke rn" is `turn`. "don't joke with me" is `standing`.
- **Outcome override:** if a stated preference correlates with disengagement — the user asked
  for hard accountability but stops replying after harsh messages — the profile reduces
  intensity anyway. Outcomes beat declarations (Rulebook §15).
- **Store abstractions.** `lastEvidence` holds "asked for shorter replies twice", never the
  raw message.

### Rendering into L3

The profile is never printed as data. It compiles to a short imperative block, e.g.
`keep replies short. skip the tapback. no jokes this session. answer first, reasoning only if asked.`
KIBA must never verbalise it (FR-10, failure mode from Master 32 §43).

---

## 4. Value Application mechanism

Rules alone under-trigger this on Haiku. A lightweight classifier runs on the inbound message
and sets a flag consumed by L1:

1. Does the message name an artefact or task KIBA could improve? (ad, email, page, workout,
   study plan, resume, decision, purchase, difficult conversation)
2. Is the artefact something the user can send over text?
3. Would involvement **materially** improve the outcome, or is acknowledgement enough?

Only 1 ∧ 2 ∧ 3 raises `offerAssistance`. Guardrail: `offerAssistance` may fire at most once
per artefact per conversation — repeated offers are failure mode #11 (feature-dump) and
Master 32 §60.

---

## 5. Eval harness

This is how the client's "make sure it actually absorbs everything" is *proved* rather than
asserted.

### 5.1 Corpus-derived fixtures

| Source | Fixture type | Count (target) |
|---|---|---|
| Stress Test days 1–7 | Adversarial multi-turn replay (Jordan) | 7 |
| Alex mocks | Style + continuity replay | 3 |
| Maya mocks | Style + continuity replay | 2 |
| Anthology | Persona regression (Tyler, Marcus, Devon, Jamie) | 4 |
| Master 23 | Memory write/no-write assertions | ~30 |
| Master 31 §2 | Value Application worked examples | 12 |
| Stress Test §64 | One negative probe per failure mode | 21 |

### 5.2 Scoring

Each generated reply is scored by an LLM judge against the 11-point quality gate
(Rulebook §20) and the 10-category rubric (Rulebook §21), 1–5 each.

- **Release gate:** mean ≥ 4.0/5 across categories, **and** zero INV-* violations, **and**
  zero failure-mode probes triggering.
- The judge runs on a larger model than production. Judging with the model under test is
  circular.

### 5.3 The honest limitation

An LLM judge is not a human. It will catch structural failures — fake state, wrong length,
essay-on-thanks, sales-bot behaviour, ignored corrections — reliably. It will not reliably
catch "this is subtly corny". Final sign-off on voice remains a human read of the replay
transcripts. Budget for that; do not present the score as proof of taste.

---

## 6. Phasing

| Phase | Content | Ships |
|---|---|---|
| **P0** | Backup ✅, rulebook ✅, spec ✅, coverage ✅ | done 2026-08-20 |
| **P1** | Rulebook → L0/L1 compiler; delete the nine contradictions (C-1…C-9); Value Application; length/bubble rework | prompt-only, no migration |
| **P2** | Eval harness + fixtures; baseline V1 vs V2 scores | proves P1 |
| **P3** | Communication Profile: schema, migration, write path, L3 rendering | needs DB migration |
| **P4** | Guards: memory-claim, sensitive-memory, suppression retrieval filter | code, not prose |
| **P5** | Pro conversion engine wired to live product state | needs Open Question #1 answered |

P1 and P2 are the release the client will feel. P3 is where the "it knows me" difference
compounds, and it cannot be faked in a prompt.

---

## 7. Model recommendation

The doctrine asks for something specific:

> KIBA should feel like "Claude/ChatGPT-level intelligence that knows me". Not "a chatbot
> retrieving the closest training script."  — *Stress Test, Master Training Notes*

Haiku 4.5 is a fast, cheap model chosen when the prompt was a simpler rulebook. The V2
behaviour asks it to hold a conflict hierarchy, a personalisation model, an internal decision
pipeline and 21 negative constraints simultaneously — and to *not* pattern-match to examples,
which is exactly the behaviour small models default to under a long instruction block.

**Recommendation:** run the P2 eval on Haiku 4.5 and Sonnet 5 side by side and let the
rubric decide. `src/ai/model-params.ts` already makes the 5-series flip safe. Do not flip
blind — measure. If Sonnet wins materially, the cost delta is a business decision for the
client, and the latency delta is small next to the ~7.4s of provider lag that dominates the
round trip anyway.

---

## 8. Risks

| Risk | Blast radius | Mitigation |
|---|---|---|
| V2 removes V1's length cap → replies get long and slow | Latency: genMs ≈ 1624ms + 8.0ms/output token, so a 3× longer reply is ~+2s | Keep a **safety** ceiling far above the judgement rule; alert on p95 output tokens |
| Cache prefix broken by putting profile data in L1 | Every turn misses cache; cost and latency regress silently | Assertion test: L0+L1 byte-identical across two different users |
| Personalisation overfits and users get a worse KIBA | Trust | `evidenceCount >= 3` before `strong`; outcome override; profile reset command |
| Behaviour regresses vs V1 and nobody notices | Reputation with client | Run the eval against the archived V1 first; keep the baseline |
| Rulebook and prompt drift apart again | Recreates the C-1…C-9 problem | Prompt is generated, never hand-edited |

---

## 9. Architectural decisions worth recording

📋 Three decisions here meet the significance test — long-term consequences, real
alternatives considered, cross-cutting:

1. **Examples as eval fixtures rather than prompt content** — the choice that makes the
   corpus tractable at all.
2. **Communication Profile as persistent per-user state rather than in-context inference** —
   introduces a schema, a migration and a write path.
3. **Model tier for coaching turns (Haiku 4.5 vs Sonnet 5)** — cost, latency and quality.

Document reasoning and tradeoffs? Run `/sp.adr training-v2-architecture`
