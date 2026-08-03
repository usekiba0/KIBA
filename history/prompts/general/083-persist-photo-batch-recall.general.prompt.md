---
id: 083
title: Persist and recall the whole photo batch
stage: general
date: 2026-08-03
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/persist-photo-batch
user: usekiba0
command: follow-up to PHR 082 ("do it")
labels: ["vision", "media", "migration", "recall", "admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/72
files:
 - backend/src/data/migrations/1782200000000-AddMessageMediaBatch.ts (new)
 - backend/src/data/entities/message.entity.ts
 - backend/src/data/admin.service.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/src/messaging/image-recall.ts
 - backend/tests/unit/image-recall.spec.ts
 - backend/tests/unit/coaching.service.spec.ts
 - frontend/src/app/admin/page.tsx
tests:
 - backend/tests/unit/image-recall.spec.ts (8 new batch-recall cases)
 - backend/tests/unit + tests/contract (112 suites / 1611 passing, 1 suite + 4 tests skipped — needs live Postgres)
---

## Prompt

do it

(Following the offer at the end of PHR 082: close the persistence gap — `messages.media_url`
holds one URL, so photo recall and the admin thread still saw a single image for a turn that
carried several.)

## Response snapshot

PR #71 made the live turn read every photo. This closes the half of the problem
that sat at the DB boundary.

**The gap.** A multi-photo send is merged into ONE `messages` row, but that row
had a single `media_url` / `media_content_type` pair. So KIBA saw four photos
while replying, then a minute later — asked "what about the other one" —
`findRecentInboundImage` handed back only the first, and the admin thread
rendered a 4-photo turn as one image.

**Migration.** `media_urls` / `media_content_types` (jsonb) on `messages`,
backfilled to a one-entry array for every legacy row with a `media_url` so
readers never branch on NULL. The singular columns are KEPT and still written
with entry [0] — every historical row has them, proof submission and the admin
API still read them, and dropping them would break things for no gain.
`migrationsRun: true` with a glob, so no registration list to update.

**Ordering constraint worth remembering.** The insert is the atomic
cross-instance dedup point (unique `twilio_sid` / `provider_message_id`), and the
byte sniff that resolves extension-less SendBlue URLs is a network call — parking
it in front of that insert would delay the duplicate-reply guard. So the row is
written with the controller's extension guess, then patched with the resolved
types straight after classification. Nothing in that turn reads it back (recall
runs on a LATER turn), so it stays off the reply path.

That patch also closes a **latent pre-existing recall bug**: a sniffed HEIC was
being recorded as `application/octet-stream`, and recall only re-attaches media
whose type starts with `image/` — so a photo the model had demonstrably just
looked at was unrecallable a message later. That was true for single photos too,
independent of the batch work.

**Recall.** `findRecentInboundImages()` returns every photo of the most recent
qualifying turn; `findRecentInboundImage()` stays as the first-photo view. It now
picks the latest turn that actually HAD photos, so a newer text-only or GIF-only
message no longer shadows the last real photo turn.

## Outcome

- ✅ Impact: a multi-photo turn survives the DB boundary — recall re-attaches the same photos the turn looked at, and the admin thread renders all of them.
- 🧪 Tests: 8 new batch-recall cases; 1611 passing across unit + contract; both backend and frontend `tsc --noEmit` clean.
- 📁 Files: 1 migration, 1 entity, 2 services, 1 pure module, 2 specs, 1 frontend view.
- 🔁 Next prompts: after deploy, confirm the migration ran and pull Render logs for `image_recall_reattached` with `images > 1`.
- 🧠 Reflection: the ordering constraint is the non-obvious part — the "just resolve types before saving" instinct would have put a 4s-timeout network call in front of the duplicate-reply guard. Patch-after is the right shape because the only reader is a later turn.

## Evaluation notes (flywheel)

- Failure modes observed: a fix that was correct in memory and lossy in storage — the turn read all four photos, the row kept one. Also caught a latent single-photo recall bug hiding behind the same unresolved content type.
- Graders run and results (PASS/FAIL): unit + contract PASS (1611); backend typecheck PASS; frontend typecheck PASS.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): assert on a real Postgres that the backfill leaves zero rows with `media_url IS NOT NULL AND media_urls IS NULL`.
