---
id: 007
title: Onboarding users' photos never reached vision
stage: green
date: 2026-06-02
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: check karibi msg he is not getting images read
labels: ["vision", "onboarding", "intake", "imessage", "sendblue", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/vision.service.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/src/messaging/media-type.ts
 - backend/tests/unit/media-type.spec.ts
 - backend/tests/unit/vision.service.spec.ts
tests:
 - backend/tests/unit/media-type.spec.ts (11 new, pass)
 - backend/tests/unit/vision.service.spec.ts (2 new for validateProofFromUrl, pass)
 - backend/tests/unit/coaching.service.spec.ts (pass)
 - backend/tests/unit/{message-debouncer,proof.service,message-router}.spec.ts (pass)
---

## Prompt

check karibi msg he is not getting images read

(Follow-up: Karibi pasted production logs showing a pre-payment lead sending two car
photos during onboarding; KIBA replied "i can't see images in here — this is text only".)

## Response snapshot

Root cause (confirmed from prod logs, not the first hypothesis): the inbound photos
arrived fine — SendBlue `media_url` carried real extensions
(`…/inbound-file-store/<id>_IMG_3768.jpeg`, `…_IMG_3755.heic`) — but the user was in
INTAKE stage. `CoachingProcessor.process` routes pre-payment users to
`handleIntakeMessage` and `return`s at the stage-routing gate, which sits ABOVE the
`numMedia > 0` vision branch. So onboarding photos never reached vision; the intake AI
got only the text and improvised "i can't see images" (the intake prompt had no such
rule — pure hallucination from a missing image).

Fix:
1. Lifted media-type resolution above stage routing; pass the image into
   `handleIntakeMessage` → `generateIntakeReply` → existing `runChat` vision path
   (which already handles HEIC via `prepareImageBlock`).
2. Added `intake.prompt.ts` PHOTOS rule: KIBA can see images, react specifically, tie
   to the close, never claim "text only".
3. Defensive hardening: new `media-type.ts` byte-sniffer recovers the real MIME when
   the URL extension is absent/unknown (extension-less SendBlue CDN URLs), wired in as
   a fallback before the image/audio/video classification. Also fixes the inverse
   mislabel (a `.caf` voice note guessed as an image).
4. Gap #2 (also fixed, "see whatever fits"): proof submission previously hardcoded
   validation_status ACCEPTED and never called VisionService.validateProof. Added
   `validateProofFromUrl` (fetch + HEIC→JPEG + validate, FAILS OPEN) and a lenient gate
   in the processor: proof is only refused on a CONFIDENT mismatch (is_valid=false &&
   confidence >= 0.8) with a friendly resend nudge; everything uncertain or any infra
   failure is accepted. Wrongly rejecting a real user's proof is worse than a borderline
   accept.

## Outcome

- ✅ Impact: (1) onboarding/intake users' photos are now seen by vision; KIBA reacts on-tone instead of denying it can see images. (2) proof photos are actually looked at, with a lenient confident-mismatch-only reject. Coaching-mode vision unchanged.
- 🧪 Tests: 37 unit tests pass across media-type + coaching + proof + vision suites; `tsc --noEmit` clean; DI verified (MessagingModule imports AiModule which exports VisionService).
- 📁 Files: 1 new util + tests; processor, coaching service, vision service, and intake prompt edited.
- 🔁 Next prompts: end-to-end test on the live SendBlue number (real .jpeg + .heic) to confirm; tune the 0.8 reject threshold from prod data; consider storing proof confidence (needs a migration).
- 🧠 Reflection: first hypothesis (extension-less URLs) was wrong; the logs the user pulled were decisive. Verify the actual failing path before committing to a fix.

## Evaluation notes (flywheel)

- Failure modes observed: stage routing returning before the media branch — a structural ordering bug invisible to unit tests that mock single services.
- Graders run and results (PASS/FAIL): PASS (tsc + 5 unit suites).
- Prompt variant (if applicable): intake.prompt.ts PHOTOS rule added.
- Next experiment (smallest change to try): proof-path vision validation (gap #2) behind a confidence threshold so legit proof isn't rejected.
