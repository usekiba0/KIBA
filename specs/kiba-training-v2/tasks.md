# Tasks: KIBA Training V2

**Spec**: [`spec.md`](spec.md) · **Plan**: [`plan.md`](plan.md)
Dependency-ordered. `[P]` = parallelisable with its siblings.

---

## P0 — Foundation (COMPLETE)

- [x] **T001** Freeze V1 behaviour — git tag `kiba-v1-pre-training-v2` + readable snapshot at
  `docs/training-v1-archive/` with SHA-256 manifest.
  *Verify:* `git diff kiba-v1-pre-training-v2 -- backend/src/ai` returns empty on a clean tree.
- [x] **T002** Extract all 41 PDFs to text → `docs/training-v2/_extracted/`.
- [x] **T003** Read every document end to end; map each to a rulebook section → `COVERAGE.md`.
- [x] **T004** Distil the canonical rulebook → `KIBA_RULEBOOK_V2.md`.
- [x] **T005** Diff V2 doctrine against the V1 prompt; record every contradiction (C-1…C-9).
- [x] **T006** Write spec, plan, tasks.

---

## P1 — Prompt rebuild (prompt-only, no migration)

- [ ] **T101** Build the rulebook → prompt compiler. Reads `KIBA_RULEBOOK_V2.md`, emits
  `KIBA_L0_IDENTITY` and `KIBA_L1_BEHAVIOUR` as generated TypeScript.
  *Test:* compiler output is deterministic; regenerating produces no diff.
- [ ] **T102** Assert the cache prefix is user-invariant.
  *Test:* `buildSystemPrompt` for two different users yields byte-identical L0+L1.
- [ ] **T103** Enforce the size ceiling. L0+L1+L2+L3+L4 < 37,200 chars.
  *Test:* extend `tests/unit/coaching.prompt.spec.ts:436` to the new assembly.
- [ ] **T104** Resolve C-1, C-2, C-3 — remove the 60-word cap, remove "never a one-liner",
  invert the bubble default to one.
  *Test:* fixture "18% of 2500?" → reply is `450` and nothing else; fixture "thanks" →
  reply ≤ 5 words; fixture "help me price my SaaS" → reply may exceed 60 words.
- [ ] **T105** Resolve C-4, C-6, C-7 — reframe identity to friend-first general brain,
  replace the fixed personality mix, reorder the pipeline to solve-before-motivate.
  *Test:* fixture "rewrite this email" produces a rewrite with no accountability preamble.
- [ ] **T106** [P] Implement Value Application (FR-4, FR-5) incl. the `offerAssistance`
  classifier and the once-per-artefact guardrail.
  *Test:* all 12 Master 31 §2 examples produce an assistance offer; "finished my workout"
  and "just got home" produce none.
- [ ] **T107** [P] Implement the anti-repetition and rhythm rules (Rulebook §3).
  *Test:* across 30 consecutive replies no opener repeats more than 4 times.
- [ ] **T108** [P] Topic classifier → L2 playbook retrieval (FR-16).
  *Test:* a fitness message loads only the fitness pack; prompt size stays under ceiling.
- [ ] **T109** Port the same changes to `intake.prompt.ts`.
  *Note:* intake is where the client tests. V1 tapbacks never reached intake — do not repeat
  that mistake. *Test:* intake fixture exercises reactions and Value Application.

---

## P2 — Eval harness (proves P1)

- [ ] **T201** Harness skeleton: replay a fixture conversation, capture every generated reply,
  score with an LLM judge on a larger model than production.
- [ ] **T202** [P] Fixtures — Stress Test days 1–7 (Jordan, adversarial).
- [ ] **T203** [P] Fixtures — Alex days 1–2, 3–5, 6–7 (style + continuity).
- [ ] **T204** [P] Fixtures — Maya days 1–3, 4–7.
- [ ] **T205** [P] Fixtures — Anthology personas: Tyler, Marcus, Devon, Jamie.
- [ ] **T206** [P] Fixtures — Master 23 memory write/no-write assertions (~30).
- [ ] **T207** [P] Negative probes — one per failure mode, all 21 (Rulebook §19).
  *Test:* each probe asserts the failure mode does **not** appear.
- [ ] **T208** Invariant suite — one adversarial case per INV-1…INV-8.
- [ ] **T209** Baseline run against the archived V1 prompt; store scores for comparison.
  *This is the number that answers "did V2 actually get better".*
- [ ] **T210** Release gate in CI: mean ≥ 4.0/5, zero INV violations, zero failure-mode hits.

---

## P3 — Communication Profile (needs DB migration)

> ⛔ **PHASE GATE — DO NOT BUILD WITHOUT CLIENT APPROVAL.**
> This whole block is outside the current phase. Master 32 maps onto Phase 2's
> "AI personality customization" and onto Phase 3's carve-out for "custom-trained per-user
> AI models" / the Emotional Activation Learning System. Same gate applies to relationship
> stages, inside jokes, micro-growth detection, the personal timeline, and the challenge
> engine. Sent for approval 2026-08-20 as
> `feedback/KIBA_Rebuild_Plan_2026-08-20.pdf` §5 (items A–F).
> Partial credit: `psychological_profiles.pressure_preference` and `.cussing_ok` already
> ship, and `PatternSignals` already does weakest-day and recurring-excuse detection — so
> only the genuinely new dimensions are billable. See [[project_kiba_phase_scope]].

- [ ] **T301** Schema + migration for `communication_profile` (plan §3).
- [ ] **T302** Write path: explicit instruction detector → `confidence: 'explicit'`.
  *Test:* "stop asking so many questions" → ≤ 1 question in the next 10 replies.
- [ ] **T303** Write path: behavioural evidence accumulation, `evidenceCount >= 3` before
  `strong`. *Test:* a single short message does not flip `messageLength`.
- [ ] **T304** Scope decay — `turn` clears after the reply, `session` after 6h.
  *Test:* "don't joke rn" suppresses humour now and permits it three days later.
- [ ] **T305** Outcome override — stated preference loses to measured disengagement.
- [ ] **T306** L3 renderer: profile → imperative block. *Test:* never verbalised (FR-10).
- [ ] **T307** Context-specific overrides (business vs fitness vs emotional).
- [ ] **T308** User-facing profile reset.

---

## P4 — Guards (code, not prose — Haiku will not hold these in a prompt)

- [ ] **T401** `memory-claim-guard.ts` (INV-2) — strip or rewrite claims of exact recall not
  backed by retrievable memory.
- [ ] **T402** `sensitive-memory-guard.ts` (INV-6) — block sensitive categories from humour,
  accountability and conversion contexts.
- [ ] **T403** Suppression retrieval filter (INV-8) — "don't bring that up" excludes the
  memory permanently.
- [ ] **T404** Extend `ack-guard.ts` for consent-gated accountability (INV-5).
  *Preserve the existing escape:* "bet" answering a question is consent and must still write.
- [ ] **T405** Verify INV-7 stale-reminder cancellation with a plan-change integration test.

---

## P5 — Pro conversion (blocked on client Open Question #1)

- [ ] **T501** Pro terms resolver — price, trial length, card requirement from live product
  config (INV-3, FR-11).
- [ ] **T502** Pitch state per user: mentioned / link sent / declined / objection / benefit
  that landed (FR-12).
- [ ] **T503** Re-pitch requires a recorded new trigger (FR-13).
  *Test:* after "I'm good", no Pro mention until a Pro-gated capability is requested.
- [ ] **T504** Post-conversion selling stops entirely (failure mode #10).
- [ ] **T505** Cancellation path: clear, one save attempt, then pressure ends.

---

## Definition of done

- Every task's test passes.
- Eval mean ≥ 4.0/5, zero INV violations, zero failure-mode probes triggering.
- V2 beats the T209 V1 baseline on the same fixtures.
- `git diff kiba-v1-pre-training-v2 -- backend/src/ai` reviewed line by line before merge.
- A human has read the Alex, Maya and Jordan replay transcripts and signed off on voice.
