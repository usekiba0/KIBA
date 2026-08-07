---
id: 096
title: Tapback frequency — Karibi ask
stage: general
date: 2026-08-07
surface: agent
model: claude-opus-5[1m]
feature: none
branch: chore/privacy-followup-contact-card
user: usekiba0
command: (pasted WhatsApp thread — Karibi/Sumair on reactions)
labels: ["tapbacks","reactions","imessage","latency","client-feedback"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (read-only audit — no files modified)
tests:
 - (none run — analysis only)
---

## Prompt

[8:25 am, 07/08/2026] Karibi Maclyaton: I’m saying I think it’d be better if it reacts more adds more emotion too it
[8:25 am, 07/08/2026] Sumair Roudani: Why
If it reacts more frequently then reasoning will be less
[8:26 am, 07/08/2026] Sumair Roudani: I’m saying I think it’d be better if it reacts more adds more emotion too it
Lets discuss ot today
[8:26 am, 07/08/2026] Karibi Maclyaton: Do you know what I mean by reactions?
[8:26 am, 07/08/2026] Karibi Maclyaton: Okay
[8:26 am, 07/08/2026] Sumair Roudani: You mean this right
[8:26 am, 07/08/2026] Karibi Maclyaton: These
[8:27 am, 07/08/2026] Karibi Maclyaton: Like if I say I went to then gym it can thumbs up or put !! Reaction on it and then talk
[8:27 am, 07/08/2026] Karibi Maclyaton: Or if I send a fake proof picture it can put 🤣 reaction and then talk abt it

## Response snapshot

Audited the existing tapback implementation and prod logs rather than rebuilding.

**Already built and wired** (do NOT rebuild):
- `backend/src/messaging/messaging.service.ts:426-470` — `sendReaction()` → SendBlue `POST /api/send-reaction`; six valid values `love | like | dislike | laugh | emphasize | question`; opt-out gated; best-effort (never throws).
- `backend/src/ai/coaching.service.ts:465-481` — `REACT_TO_MESSAGE_TOOL`, offered only when the handler exists (`:885`).
- `backend/src/messaging/coaching.processor.ts:2221-2235` — handler attached only when `channel === 'imessage' && messageHandle`.
- `backend/src/messaging/message-debouncer.service.ts:270` — Apple GUID carried through the debounce batch.
- `backend/src/messaging/inbound-reaction.ts` — inbound tapbacks (`Liked "…"`) dropped, no wasted AI turn.

**Prod evidence (Render logs, 168h window, read-only):**
- `tool_react_to_message` → **0 hits**
- `"path":"coaching"` → **0 hits**; every `turn_latency` line in the window is `"path":"intake"`.
- Conclusion: zero tapbacks because there were zero coaching turns, not because the feature is broken.

**Real gap found:** `generateIntakeReply` exposes only `[SAVE_INTAKE_FIELD_TOOL, SEND_PAYMENT_LINK_TOOL, SCHEDULE_REMINDER_TOOL]` (`coaching.service.ts:929`). Tapbacks are structurally impossible during signup — which is the flow Karibi has been testing in.

**Sumair's objection:** right that there is a cost, wrong about which. A tapback is a tool call → a second model round-trip → roughly +1.6–2.5s on that turn (`genMs ≈ 1624ms + 8.0ms/output-token`). It does not reduce reasoning quality.

**Recommended fix that dissolves the tradeoff:** emit the reaction as an inline marker in the reply text (`[react:laugh]`), stripped deterministically pre-send and dispatched alongside the first bubble — same pattern as the existing `[pause]` burst marker (`backend/src/messaging/voice.ts:59-70`). Zero extra round-trip, so frequency becomes free and the "SPARINGLY" language in the tool description can be relaxed to Karibi's spec.

**Client-facing constraint:** iMessage has exactly six tapbacks. Arbitrary emoji are not possible. Karibi's two examples map cleanly — 👍 = `like`, ‼️ = `emphasize`, 🤣 = `laugh`.

## Outcome

- ✅ Impact: Karibi's ask is a tuning change, not a build. Feature verified present; the only structural gap is intake-mode.
- 🧪 Tests: none run (read-only audit).
- 📁 Files: none modified.
- 🔁 Next prompts: implement the `[react:…]` inline marker; extend to intake; relax the SPARINGLY guidance.
- 🧠 Reflection: "0 in the logs" needed the denominator — 0 coaching turns made the 0 tapbacks meaningless as a signal.

## Evaluation notes (flywheel)

- Failure modes observed: unpaginated Render log scans hit the 12k-line page cap and returned all-zero counts; the server-side `text=` filter is the correct tool.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): inline `[react:…]` marker behind the existing bubble-splitter, measured against a coaching turn's `genMs`.
