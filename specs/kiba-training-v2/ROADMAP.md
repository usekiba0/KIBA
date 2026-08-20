# Training V2 — Build Roadmap

**Approved by client 2026-08-21** (`feedback aug 2026/kiba updated 0022.pdf`): Section 4 rebuild
+ recording fix, both free. Pricing confirmed **$9.99/month, 3-day trial**. Appendix H skipped.

**Scope of this roadmap: the approved free work only.** Phase-gated items (Communication
Profile, relationship stages, inside jokes, micro-growth, timeline, challenge engine) are
excluded and must not be built — see `spec.md` PHASE GATE.

Today is **Fri 21 Aug 2026**. Client wants to launch iMessage ASAP; Twilio still gates
Android/SMS independently of everything here.

---

## The client's four constraints, quoted

These govern the whole build. From his response doc:

1. *"make sure the 40 training files are implemented in the best order/architecture possible,
   not just thrown into context"*
2. *"Use the Masters as the actual rules, the mock convos as examples/tests and not scripts"*
3. *"remove the old conflicting rules you found"*
4. *"make sure the important rules aren't getting lost because of how much training there is"*

Constraint 4 is the one with teeth. It is why **M2 exists before M3**: rule coverage is
measured, not assumed.

---

## Milestones

| | Milestone | Working days | Target | Gate to pass |
|---|---|---|---|---|
| **M0** | Baseline locked | 0.5 | Fri 21 Aug | 113 unit tests green; V1 behaviour captured on fixtures |
| **M1** | Rulebook → prompt compiler | 2 | Tue 25 Aug | L0+L1 generated, byte-identical across users, under size ceiling |
| **M2** | Rule-coverage harness | 1 | Wed 26 Aug | Every Tier-A rule maps to ≥1 assertion; report shows 0 orphans |
| **M3** | **First testable build** | 1.5 | **Thu 27 Aug** | 9 contradictions gone; length/bubbles/Value Application live on staging |
| **M4** | Client testing round 1 | — | Thu 27 – Mon 31 Aug | Karibi hammers it; feedback logged |
| **M5** | Recording fix | 3 | Thu 3 Sep | Completions + proof persist; Execution Score reads non-zero |
| **M6** | Eval harness + fixtures | 4 | Wed 9 Sep | Jordan/Alex/Maya/Anthology replays scored; V1 baseline beaten |
| **M7** | Guards + failure-mode suite | 3 | Mon 14 Sep | 21 failure modes + 8 invariants all asserted |
| **M8** | Release | 1 | Tue 15 Sep | Full gate green; PR reviewed against `kiba-v1-pre-training-v2` |

**He can test from M3 — four working days from now.** Everything after that hardens
underneath him while he uses it.

---

## M0 — Baseline (today)

Nothing is safe to change until we can prove what changed.

- [x] `npm test` green — **113 suites / 1676 tests, exit 0** (2026-08-21)
- [x] Branch `feat/training-v2-rebuild` created off `8b254cc`
- [ ] Capture V1 replies for the fixture set (30 inbound messages) using the **archived** V1
      prompt, store as `tests/fixtures/v1-baseline.json`
- [ ] Record V1 reply-length distribution — this is the number M3 must visibly move
- [ ] Commit everything from the 2026-08-20 session (currently 49 untracked paths)

**Why it matters:** without a V1 baseline we can claim improvement but never show it, and the
client explicitly does not want to go "back and forth fixing the same behavior issues."

---

## M1 — Rulebook → prompt compiler

Prompts stop being hand-written. `docs/training-v2/KIBA_RULEBOOK_V2.md` becomes the source;
a build step emits `KIBA_L0_IDENTITY` and `KIBA_L1_BEHAVIOUR`.

- [x] Rule catalogue with stable IDs → `backend/src/ai/rulebook/rules.ts` (**64 rules**, each
      citing its rulebook § and source document)
- [x] Compiler → `backend/src/ai/rulebook/compile.ts` (L0 / L1 / L2 assembly)
- [x] L2 playbook packs, retrieved by topic, only the active one sent
- [x] Assertion: cache prefix byte-identical, no interpolation, nothing user- or time-specific
- [x] Assertion: static prompt under budget — **9,504 chars**, 9,863 with a playbook
- [x] Assertion: no price literal can enter the prompt (INV-3)
- [x] Topic classifier → `topic.ts` (deterministic keyword scoring, no extra model call)
- [x] Selector → `select.ts` (V1/V2 switch + `TRAINING_V2_ENABLED` / `TRAINING_V2_NUMBERS`)
- [x] Wired into `coaching.service.ts`; env vars declared and validated in `app.module.ts`
- [x] Ported to the intake path via `intakeRulesPrefix()` — the path Karibi actually tests

**Directly answers constraint 1.** The architecture is the tiering, and it's testable.

---

## M2 — Rule-coverage harness ← *the anti-"rules got lost" mechanism*

This is the milestone that exists purely because of constraint 4.

- [x] Every rule carries a stable ID
- [x] `npm run rules:coverage` implemented, with `--ci` mode that exits non-zero
- [x] **Gate met: 64 rules, 64 compiled, 0 orphans**
- [x] Non-negotiable rule list — 29 rules that cannot be deleted without failing the build.
      Added because the report showed most rules were compiled but unnamed by any test, so
      deleting one outright would have passed silently
- [ ] Wire `rules:coverage --ci` into the release gate (M8)

Without this, "did we lose a rule?" is a matter of opinion. With it, it's a number.

---

## M3 — First testable build ← *what the client feels*

The nine contradictions, resolved:

| | Change |
|---|---|
| C-1 | 60-word cap removed — length becomes a judgement |
| C-2 | one-liner ban removed — "bet" / "nah" / "450" are valid complete replies |
| C-3 | bubble default inverted to one |
| C-4 | identity reframed friend-first, general brain |
| C-5 | tapback frequency no longer fixed at "most turns" |
| C-6 | fixed personality mix replaced |
| C-7 | pipeline reordered — solve before motivate |
| C-8 | Value Application added (Masters 30/31) |
| C-9 | coaching-side selling unblocked, honest about live state |

Plus: anti-repetition, natural rhythm, and **the intake prompt ported too** — intake is where
Karibi tests, and V1's tapbacks never reached it.

Ships behind `TRAINING_V2_ENABLED`, defaulting off, plus a `TRAINING_V2_NUMBERS` allowlist so
it can be flipped for one number without touching the five live users.

**Status 21 Aug:** coaching AND intake paths both wired, 115 suites / 1767 tests green, four
commits on `feat/training-v2-rebuild`. Remaining for M3: the BEH-01…BEH-34 behaviour fixtures,
which need live model calls and so land with the M6 harness.

⚠️ **Design note that shaped the wiring.** The domain playbook goes in the DYNAMIC block, not
the cached one. Appending it to the cached block would give a different prefix per topic,
splintering one shared cache entry into seven colder ones with no error and no log line, just
a larger bill. Asserted in `rulebook-select.spec.ts`.

---

## M5 — Recording fix

Free, and the prerequisite for the Execution Score ever being honest.

- [ ] Find why `is_proof_submission` is written nowhere
- [ ] Find why zero tasks have ever completed
- [ ] Backfill where safely inferable; do not fabricate history
- [ ] Assert: a completion round-trips to a non-zero score

---

## Parallel, not on the critical path

- **Pricing → $9.99.** Code already defaults to `$9.99/month`; the env override set $20.
  Change is `STRIPE_PRICE_ID_INDIVIDUAL` + `STRIPE_PRICE_DISPLAY`. ⚠️ **Blocked on a decision:**
  5 active subscribers at $20, 0 trialing. Migrate or grandfather — client's call.
- **Twilio steps for the client.** Short, and it unblocks Android/SMS.
- **Linq comparison, dashboard re-scope, A–E split.** Client-requested docs. Roughly 2–3 days
  between them; each one delays M3 if taken first.

---

## Risks

| Risk | Mitigation |
|---|---|
| Removing the length cap makes replies long and slow (`genMs ≈ 1624ms + 8ms/token`) | Safety ceiling far above the judgement rule; alert on p95 output tokens |
| Rules lost in the volume — the client's stated fear | M2 coverage gate, zero orphans |
| Haiku 4.5 can't hold the fuller doctrine | M6 scores Haiku vs Sonnet; decide on numbers, not vibes |
| Regression nobody notices | M0 baseline + M6 comparison against archived V1 |
| Cache prefix broken → cost and latency regress silently | M1 byte-identical assertion |
| Scope creep from the phase-gated items | PHASE GATE banners in spec and tasks |
