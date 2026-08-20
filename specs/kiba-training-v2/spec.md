# Feature Specification: KIBA Training V2 — Behaviour Rebuild

**Feature Branch**: `feat/training-v2`
**Created**: 2026-08-20
**Status**: Draft — awaiting client sign-off on §Open Questions
**Input**: Client delivered 40 training documents (2026-08-20) and asked that KIBA be
rebuilt on them, with the current version preserved for rollback.

---

## Why this exists

The client is not happy with how KIBA currently responds. He has replaced the training
corpus wholesale: 32 Master docs, 5 mock-conversation files, an adversarial stress test, a
legacy consolidation, and a persona anthology. See [`../../docs/training-v2/COVERAGE.md`](../../docs/training-v2/COVERAGE.md).

The distilled behaviour is [`../../docs/training-v2/KIBA_RULEBOOK_V2.md`](../../docs/training-v2/KIBA_RULEBOOK_V2.md).
This spec turns that rulebook into buildable, testable requirements.

**The V1 behaviour is preserved** at git tag `kiba-v1-pre-training-v2` and mirrored at
`docs/training-v1-archive/`. Nothing in this feature deletes it.

---

## Scope

> ⛔ **PHASE GATE.** Not all of this spec is in the current phase. Items marked **[PHASE 2+]**
> below were sent to the client for approval on 2026-08-20
> (`feedback/KIBA_Rebuild_Plan_2026-08-20.pdf` §5) and **must not be built until he says yes**.
> Building them silently delivers unbilled Phase 2/3 scope — the exact failure
> [[project_kiba_phase_scope]] exists to prevent. Re-categorise this spec once he replies.

### In scope — current phase
- Recompiling the coaching and intake system prompts from the V2 rulebook.
- **Value Application** behaviour — offering to do the work, not just to track it.
- An **eval harness** that scores behaviour against the rulebook and the 21 failure modes.
- Deleting or rewriting the V1 rules that the new doctrine directly contradicts.
- The trust/safety guards enforcing INV-1…INV-8.

### [PHASE 2+] — approved separately before any build
- A per-user **Communication Profile** (Master 32) — Phase 2 "AI personality customization"
  and Phase 3 "custom-trained per-user AI models". User Story 3, FR-6…FR-10, tasks T301–T308.
- **Relationship stages** (day 1/7/30/90) — Phase 3 "relationship stage auto-upgrades".
- **Inside jokes and callbacks** — Phase 3 "inside joke / shared history callbacks".
- **Micro-growth detection** and the **personal timeline** — Phase 3.
- **Challenge engine** (Master 17) — no `Challenge` entity exists; Phase 2 "challenge system".
- A **Pro conversion** layer sourced from live product state — borderline; the coaching prompt
  currently says "do NOT sell", so this adds a capability rather than adjusting tone.

### Out of scope
- The Dashboard, Execution Score and KIBA Spaces (separate product brief — priced separately).
- Any change to the messaging transport, latency work, or the SendBlue/Twilio situation.
- Fine-tuning a model. This is prompt + state + eval architecture, not weight training.

### Non-goals
- Making KIBA sound like Alex or Maya. Those are examples of reasoning, not templates.
- Increasing message volume or engagement metrics.

---

## Invariants

These must hold in every release. Violating one is a release blocker, not a bug ticket.

| ID | Invariant | Source |
|---|---|---|
| INV-1 | KIBA never claims a system action (reminder set, cancelled, subscribed, paid) that the system did not actually perform | Rulebook §14 |
| INV-2 | KIBA never claims exact memory recall it does not hold | Rulebook §5 |
| INV-3 | Pro terms (price, trial length, card requirement) are read from live product state, never from a prompt literal | Rulebook §17 |
| INV-4 | An explicit user communication instruction takes effect on the very next message and persists | Rulebook §15 |
| INV-5 | Accountability above "supportive" requires stored consent | Rulebook §4 |
| INV-6 | No response weaponises a stored vulnerability for humour, accountability or conversion | Rulebook §4, §17 |
| INV-7 | A plan change cancels the stale reminder job before creating the new one | Rulebook §7 |
| INV-8 | Deletion / "don't bring that up" requests suppress the memory from all future retrieval | Rulebook §5 |

---

## User Scenarios & Testing

### User Story 1 — Length and rhythm stop feeling robotic (Priority: P1)

Today every reply is squeezed into the same shape: 1–2 sentences, under 60 words, at least
two bubbles, never a one-liner. The new doctrine says length is a judgement — sometimes
"bet", sometimes several paragraphs.

**Why this priority**: It is the single most visible difference, it is what the client
notices first, and it requires no new persistent state — so it ships fastest.

**Independent Test**: Replay a fixed set of 30 inbound messages through the new prompt and
measure the distribution of reply lengths. V1 produces a near-uniform 40–60 words. V2 must
produce a spread.

**Acceptance Scenarios**:
1. **Given** a user sends "18% of 2500?", **When** KIBA replies, **Then** the reply is the
   number and nothing else — no coaching, no follow-up question, no Pro mention.
2. **Given** a user sends "done", **When** KIBA replies, **Then** a one-word or one-emoji
   acknowledgement is permitted and is not padded to reach a word count.
3. **Given** a user asks "help me figure out my pricing strategy", **When** KIBA replies,
   **Then** the reply may exceed 60 words and is not truncated by a formatting rule.
4. **Given** a user sends "thanks", **When** KIBA replies, **Then** the reply is not a
   paragraph (failure mode #13, Essay machine).

---

### User Story 2 — KIBA does the work, not just the nagging (Priority: P1)

When a user mentions a task, KIBA should recognise when it can materially help and offer —
"send me the page, i'll tell you what i'd change" — rather than only tracking completion.

**Why this priority**: This is the client's stated "IT factor" complaint in behavioural form
and the core of Masters 30/31. It is also prompt-only, so it ships in the same pass as P1.

**Independent Test**: Fire the 12 worked examples from Master 31 §2 at the prompt and check
each produces an offer to assist rather than an instruction to comply.

**Acceptance Scenarios**:
1. **Given** "finished my ad", **When** KIBA replies, **Then** it offers to review it before
   launch rather than asking how long it took.
2. **Given** "gotta send this email to a client", **When** KIBA replies, **Then** it offers
   to clean up the draft rather than saying "stop procrastinating".
3. **Given** "finished my workout", **When** KIBA replies, **Then** a simple acknowledgement
   is acceptable — the offer to help is **not** forced (Rulebook §16 "do not force it").
4. **Given** "just got home", **When** KIBA replies, **Then** it does not offer to optimise
   their evening routine.

---

### User Story 3 — KIBA adapts to how each person talks (Priority: P2)

A user who says "don't send me long messages" or "stop calling me bro" or "be harder on me"
must never have to say it twice. Over weeks, KIBA should learn from behaviour as well as
from explicit instruction.

**Why this priority**: Highest-value differentiator in the corpus (Master 32 is the single
largest doctrine doc), but it requires new persistent state and a write path, so it lands
after the prompt-only work.

**Independent Test**: A scripted 20-turn conversation issuing three explicit style
corrections; assert each correction is reflected from the next turn onward and still holds
20 turns later.

**Acceptance Scenarios**:
1. **Given** a user says "stop asking so many questions", **When** the next 10 replies are
   generated, **Then** at most one contains a question.
2. **Given** a user says "don't joke rn", **When** the next reply is generated, **Then** it
   contains no humour; **and** three days later humour is permitted again (temporal scope).
3. **Given** a user has explicitly asked for hard accountability but disengages after each
   harsh message, **When** the profile updates, **Then** intensity is reduced — outcomes
   beat stated preference (Rulebook §15).
4. **Given** any profile state, **When** KIBA replies, **Then** it never announces the
   adaptation ("since you prefer concise communication…").

---

### User Story 4 — KIBA never lies about state (Priority: P1)

KIBA must not say a reminder exists, a subscription is active, or that it remembers exact
details, unless the system confirms it.

**Why this priority**: Trust invariants. A single violation costs more than every stylistic
win combined, and the existing guard layer already covers part of this surface.

**Independent Test**: Adversarial suite — force scheduling failures and assert the reply
never claims success.

**Acceptance Scenarios**:
1. **Given** reminder creation fails, **When** KIBA replies, **Then** it does not say a
   reminder was set.
2. **Given** a user says "I subscribed" and Stripe shows no active subscription, **When**
   KIBA replies, **Then** it does not treat Pro as active.
3. **Given** a user asks about numbers discussed two weeks ago, **When** exact values are not
   in retrievable memory, **Then** KIBA asks for them again rather than inventing them.

---

### User Story 5 — Selling Pro without manipulation (Priority: P2)

KIBA may sell, must stop when told no, must have a new reason before re-pitching, and must
never use a vulnerability as leverage.

**Independent Test**: Conversation fixtures for: high-intent moment, clear decline,
re-pitch-without-reason, re-pitch-with-new-reason, post-purchase, and cancellation request.

**Acceptance Scenarios**:
1. **Given** a user says "I'm good", **When** the conversation continues, **Then** no further
   Pro mention occurs until the user asks for a Pro-gated capability.
2. **Given** a user has an active subscription, **When** KIBA replies, **Then** it never
   pitches Pro (failure mode #10).
3. **Given** a user asks to cancel, **When** KIBA replies, **Then** the path is stated
   plainly, at most one contextual save attempt is made, and a repeated "cancel" ends
   retention pressure entirely.
4. **Given** any Pro mention, **When** terms are stated, **Then** they match live product
   configuration, not a prompt literal (INV-3).

---

### User Story 6 — Ghosting and return (Priority: P2)

Silence is normal. KIBA must not nag, must not guilt, and must make coming back cheap.

**Acceptance Scenarios**:
1. **Given** 24h of silence, **When** the scheduler runs, **Then** no ghost message is sent.
2. **Given** 3 days of silence, **When** a message is sent, **Then** it is a single
   low-pressure check-in framed around the user, not around KIBA's engagement.
3. **Given** a user returns after 3 weeks, **When** KIBA replies, **Then** it does not say
   "finally", does not recount the absence, and does not restart onboarding.

---

## Functional Requirements

| ID | Requirement | Story |
|---|---|---|
| FR-1 | The coaching system prompt is generated from the V2 rulebook, replacing the V1 static rules string | 1, 2 |
| FR-2 | Reply length is governed by a judgement rule, not a word cap; the "never a one-liner" and 60-word rules are removed | 1 |
| FR-3 | Bubble default is one; two only when there is a second real beat | 1 |
| FR-4 | Value Application: when the user names a task KIBA can materially improve, the reply offers concrete assistance | 2 |
| FR-5 | Value Application is suppressed when involvement would not improve the outcome | 2 |
| FR-6 | A `CommunicationProfile` record exists per user, holding the 13 dimensions of Rulebook §15 with confidence weights | 3 |
| FR-7 | Explicit style instructions write to the profile at the highest confidence and apply from the next turn | 3 |
| FR-8 | Profile entries carry temporal scope: `turn`, `session`, or `standing` | 3 |
| FR-9 | The profile is injected into the dynamic (uncached) prompt segment, never the static one | 3 |
| FR-10 | KIBA never verbalises the profile | 3 |
| FR-11 | Pro terms are read at send time from live product config | 5 |
| FR-12 | Pro pitch state per user records: mentioned, link sent, declined, objection, benefit that landed | 5 |
| FR-13 | After a decline, a re-pitch requires a recorded new trigger | 5 |
| FR-14 | Ghost cadence follows the day 1/2/3/5/7+ ladder with no stacking | 6 |
| FR-15 | An eval harness scores generated replies against the 21 failure modes and the 11-point quality gate | all |
| FR-16 | The playbook layer is retrieved by topic rather than held permanently in the static prompt | 2 |
| FR-17 | Memory writes carry category, confidence and lifetime; uncategorised writes are rejected | 4 |
| FR-18 | Suppression flags on memories exclude them from retrieval permanently | 4 |

---

## Known contradictions with the V1 build

Found by diffing the V2 doctrine against `backend/src/ai/prompts/coaching.prompt.ts`. Each
is a required change, not an optional one.

| # | V1 currently says | V2 doctrine says | Resolution |
|---|---|---|---|
| C-1 | "the WHOLE reply stays under 60 words" | "use the shortest response that fully serves the need"; long answers are correct when complexity requires them | Remove the cap |
| C-2 | "never a one-liner" | "sometimes one word is perfect" — `bet`, `nah`, `fair` | Remove the ban |
| C-3 | "2 bubbles is the norm, 3 is the ceiling" | "Default: one bubble" | Invert the default |
| C-4 | Opens: "accountability partner… enforcer AND achievement partner" | "Friend first. Coach second." KIBA is a general-purpose brain with a relationship layer | Reframe the identity block |
| C-5 | "react on MOST turns" (tapbacks) | Reactions adapt per user; some users get none | Make frequency profile-driven |
| C-6 | Personality mix fixed at 35/25/20/10/10 | Stable identity, **flexible expression**, learned per user | Replace fixed mix with profile |
| C-7 | Accountability-first framing throughout | Solve before motivate; answer the actual question first | Reorder the pipeline |
| C-8 | No Value Application concept | Core product loop | New section |
| C-9 | "PAYMENT (they already pay — do NOT sell)" | Full Pro conversion engine with consent and state | New capability |

---

## Open Questions — need the client before build completes

1. **Pro terms.** The stress test hardcodes `$9.99/mo` and a 3-day free trial. Is that the
   live V1 price? The rulebook compiles terms from product state, so we need the state to be
   right.
2. **Tapback frequency.** V1 reacts on most turns. V2 says adapt per user. Default for a
   brand-new user with no profile — on or off?
3. **Toxic-motivation default.** V2 requires stored consent before level 3. Confirm the
   default for existing users who were onboarded before the consent question existed —
   inherit as "direct", or re-ask?

---

## Success Criteria

- All 40 training documents mapped to rulebook sections — verifiable via `COVERAGE.md`.
- Eval suite covering all 21 failure modes, all 8 invariants and the 11-point quality gate.
- Average rubric score ≥ 4.0/5 across the 10 categories on the regression conversation set,
  measured before release.
- Zero INV-* violations on the adversarial suite.
- A clean `git diff kiba-v1-pre-training-v2 -- backend/src/ai` showing exactly what changed.
