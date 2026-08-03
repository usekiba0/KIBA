---
id: 082
title: Multi-photo turns only read one image
stage: general
date: 2026-08-03
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: bug report (ad-hoc)
labels: ["vision", "media", "intake", "debouncer", "sendblue"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/71
files:
 - backend/src/messaging/inbound-media.ts (new)
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/coaching.service.ts
 - backend/tests/unit/inbound-media.spec.ts (new)
tests:
 - backend/tests/unit/inbound-media.spec.ts (14 new cases)
 - backend/tests/unit (108 suites / 1575 tests, all passing)
---

## Prompt

Also error 🚨 when u send KIBA multiple pics it only reads one

## Response snapshot

Root-caused against live Render logs rather than from the code alone.

**Evidence.** The SendBlue inbound webhook carries `media_url` as a SINGLE string
(confirmed from prod raw-payload log lines), so a multi-photo iMessage send
arrives as N separate webhooks. `MessageDebouncerService` already merges those
correctly — prod shows `[Debounce] merged 2 webhooks … → 2 media, 1 text parts`
on 2026-07-30. The loss happened downstream of the merge, and that same prod turn
ran `path:"intake"`, which was the worst of the three code paths.

**Three defects, all "classify the batch off entry [0]":**

1. **Intake path dropped every photo but the first.** `handleIntakeMessage` took a
   singular `imageUrl`/`imageContentType` and re-wrapped it as `[imageUrl]`.
   Leads in onboarding — who send photos often — could never be seen with more
   than one. (`coaching.processor.ts:907`, `:1300`, `:1475` pre-fix.)
2. **Coaching path passed 4 URLs but only resolved the first one's type.** The
   magic-byte sniff that rescues extension-less SendBlue CDN URLs ran on
   `mediaUrls[0]` only; photos 2..N kept `application/octet-stream`, so
   `isSupportedImageFormat()` rejected them and they were silently dropped.
3. **Mixed batches were judged by whichever attachment landed first.** A voice
   note ahead of a gym photo rejected the whole turn with "i can't play voice
   notes yet"; a reaction GIF ahead of a real photo sent the batch down the GIF
   branch and skipped proof.

**Fix.** New pure module `inbound-media.ts` with `resolveMediaContentTypes()`
(sniffs every unidentified attachment, concurrently — serial sniffs would add
seconds to a photo turn) and `classifyInboundMedia()` (partitions the batch,
picks an image as the primary for single-media consumers, reports over-cap
drops). The processor now feeds resolved arrays to both the intake and coaching
paths. `runChat` states the photo count when a caption accompanies several
images, since the model otherwise answers the text and describes only the first.

## Outcome

- ✅ Impact: all photos in a burst reach the model on both the intake and coaching paths; mixed batches resolve to the photo instead of failing on a sibling; over-cap truncation is logged instead of silent.
- 🧪 Tests: 14 new unit cases for batch resolution/classification; full unit suite 1575/1575 green; `tsc --noEmit` clean.
- 📁 Files: 1 new module, 1 new spec, 2 edited.
- 🔁 Next prompts: decide on persisting the full media set (see reflection); re-check `MESSAGE_IMAGE_DEBOUNCE_MS` if photos still split across turns.
- 🧠 Reflection: `messages.media_url` is still a single column, so only photo #1 is persisted. The turn itself is now correct, but photo recall (`findRecentInboundImage`) and proof storage still see one image — a follow-up asking "what about the other pic" a few messages later will find only the first. Fixing that needs a schema migration and was deliberately left out of this diff.

## Evaluation notes (flywheel)

- Failure modes observed: a batch-shaped input consumed by index-[0] logic in three independent places; the debouncer's correct merge masked it because the merge itself logged success.
- Graders run and results (PASS/FAIL): unit suite PASS (1575/1575); typecheck PASS.
- Prompt variant (if applicable): added an explicit attachment-count line to the captioned multi-image user turn.
- Next experiment (smallest change to try): add `media_urls jsonb` to `messages` and have `findRecentInboundImage` return the whole set, so recall matches what the turn actually saw.
