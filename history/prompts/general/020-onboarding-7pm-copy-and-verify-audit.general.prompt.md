---
id: 020
title: Onboarding "7pm not now" copy fix + retention/time verify audit
stage: general
date: 2026-06-30
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: (conversation) "work everything apart from latency lever"
labels: ["onboarding", "copy", "memory-digest", "timezone", "verification"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/onboarding/page.tsx
tests:
 - frontend tsc --noEmit (clean)
 - backend tsc --noEmit (clean, no backend change)
---

## Prompt

work everything apart from latency lever

(Continuation of the 2026-06-29 feedback batch. Open list at the time: onboarding "texts at 7pm instead of now" + green-vs-blue bubble [BLOCKED on repro]; hard mandatory-proof DB gate [product decision]; SEO [client confirm]; memory-digest retry/rebuild [low priority]; verify NULL-offset time fix [RC-2]; latency lever b [EXCLUDED by this instruction]; prompt-caching [optional cost-opt].)

## Response snapshot

Ran two read-only Explore traces (onboarding first-message path; relationship digest + NULL-offset handling), then acted on the findings.

**1. "7pm instead of now" — ROOT-CAUSED + FIXED (frontend copy).** Not a backend scheduling bug. Backend already sends an immediate welcome SMS on web/Stripe/beta signup (buildWelcomeMessage: "hey {name} — i'm KIBA… reply YES when you're ready and we get to work", queued with NO delay). The defect was the success-screen copy contradicting it: "Kiba will text you at {checkin_time} every day **starting tomorrow**" — with the frontend picker offering 19:00, a user who picks 7pm reads "7pm starting tomorrow," misses that KIBA already texted them, and reports "starts at 7pm instead of now." There is NO `19:00`/`setHours(19)`/hour===19 anywhere in backend src; the only 19:00 is the frontend CHECKIN_TIMES picker option. Fix = rewrote page.tsx success copy to lead with the immediate text ("Kiba just texted you — check your phone and reply now to get started. After that, daily check-ins at {checkin_time}."). Green-vs-blue bubble already handled by the START-to-+14695634418 iMessage-activation block right below it (green = SMS/Twilio fallback before iMessage activation; no code bug).

**2. NULL-offset time fix (RC-2) — VERIFIED SOLID, no change.** Every local-time site guards null and refuses to fabricate: coaching.processor time-query short-circuit asks for city when offset null (never lets model answer); coaching.prompt formatTimeContext null branch forbids guessing; intake.prompt timeBlock null branch forbids inventing a clock; scheduling tools reject recurring reminders when offset null. Only "default" is `?? null`, which routes to ask-the-user. FLAGGED (not changed — regression risk): checkin.service.scheduleCheckin coalesces null offset to 0 (UTC) instead of skipping like recap.service does → a COMPLETE user with null offset would get a UTC-misaligned check-in (edge case; offset is normally captured at intake).

**3. Memory-digest retry — DECIDED NOT TO BUILD.** Trace confirms summarisation.service.updateRelationshipMemory already has 3 layers of preserve-on-failure (empty result → keep prior + warn; thrown error → propagates before the userRepo.update so digest untouched; caller is fire-and-forget .catch that only logs), and it auto-rebuilds at the next session boundary. A retry loop is marginal. No code change.

**4/5. Hard mandatory-proof gate / SEO — not code-now.** Proof gate is a product decision (prompt already enforces; recommend not hard-gating). SEO awaits client confirm.

## Outcome

- ✅ Impact: Onboarding success screen no longer implies KIBA goes silent until "7pm tomorrow"; sets the correct expectation that KIBA texts immediately and to reply now. RC-2 and digest-retention re-verified solid (no code needed).
- 🧪 Tests: frontend `tsc --noEmit` clean; backend `tsc --noEmit` clean (no backend change). No unit test covers the static success copy.
- 📁 Files: frontend/src/app/onboarding/page.tsx (1 line, success-screen copy).
- 🔁 Next prompts: deploy decision; decide on checkin null-offset asymmetry (skip like recap vs ask-for-city); hard-proof gate yes/no; SEO confirm; latency lever b after turn_latency telemetry.
- 🧠 Reflection: Auditing before editing paid off again — 3 of 5 "open" items were already solid or a decision, and the one real bug was in the frontend, not the backend everyone was staring at.

## Evaluation notes (flywheel)

- Failure modes observed: "blocked on repro" was actually resolvable by tracing the full path — the symptom (7pm) lived in copy, not logic.
- Graders run and results (PASS/FAIL): tsc PASS (frontend + backend).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if reporters still say "nothing happened," consider firing the first daily check-in later today (not tomorrow) when signup is well before the chosen time.
