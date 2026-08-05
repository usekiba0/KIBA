---
id: 089
title: Can we achieve instant messages — client question
stage: general
date: 2026-08-05
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: pasted WhatsApp thread with Karibi asking whether SendBlue confirmed instant messages are achievable
labels: ["latency", "sendblue", "client-comms", "provider-lag", "typing-indicator"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none — analysis + client draft only)
tests:
 - (none run)
---

## Prompt

[10:10 pm, 05/08/2026] Karibi Maclyaton: Hey bro how's everything going
[10:10 pm, 05/08/2026] Karibi Maclyaton: Did sendblue send update ?
[10:11 pm, 05/08/2026] Sumair Roudani: yes bro got an update
[10:11 pm, 05/08/2026] Sumair Roudani: i have a strategy testing that
[10:11 pm, 05/08/2026] Sumair Roudani: give me  a day more will comebaack to you
[10:11 pm, 05/08/2026] Karibi Maclyaton: Ok
[10:11 pm, 05/08/2026] Karibi Maclyaton: But did they say we can likely achieve those instant messages?
[10:12 pm, 05/08/2026] Karibi Maclyaton: Got some ppl to test for me some said they would rather if messages get instant bc some ppl are impatient and it removes friction from them leaving the messages

## Response

Answered the client question with the measured latency budget rather than a guess.

**Fast text-turn budget (no tools, short reply):**

| Segment | Time | In our control |
|---|---|---|
| User send → our webhook (SendBlue forwarding) | p50 2601ms, p90 4738ms | No |
| Text debounce | 0ms (`message-debouncer.service.ts:125`, `TEXT_DEBOUNCE_MS = 0`) | Yes — already zero |
| Typing bubble appears | ~200ms after receipt (`messaging.controller.ts:117`) | Yes — shipped |
| Model generation | 1624ms + 8.0ms/output-token | Yes — reply length is the lever |
| Send → delivered on device | not instrumented | No |

Total ≈ 5.5–7s wall clock; ~half is SendBlue's dispatch path before our code runs.

**Key facts cited** (from `backend/scripts/provider-lag-report.js:1-24`): SendBlue Support reproduced the lag on their own clocks (median 2.8s, p90 4.5s, max 7.9s, ~97% of events >2s), called it a webhook dispatch-path issue, confirmed there is **no customer-selectable webhook region or latency path**, and are investigating with no ETA.

**Conclusion given:** literally instant (<1s) is not achievable by anyone running an LLM over iMessage — carrier hop each way plus generation. Realistic floor if SendBlue fixed everything is ~3.5s. Migrating providers buys the same ~2.6s at the cost of a number migration plus A2P re-approval risk.

**Reframe:** the tester complaint ("impatient", "friction") is about *silence*, not seconds — and the typing indicator (already live) closes that gap at ~2.8s. Same wait, different felt experience.

Delivered a WhatsApp-ready draft reply for Karibi in his register (no jargon, ends with "let me finish the test and I'll show you before/after tomorrow").

**Flagged two unknowns:** (1) the contents of the *new* SendBlue update — only the 2026-08-04 support response is in-repo; (2) what strategy the user is currently testing. Recommended `node backend/scripts/provider-lag-report.js` to re-measure against the n=104 baseline before promising the client any improvement.

## Outcome

- No code changed. Analysis + client-comms draft.
- Follow-ups: re-run the provider-lag report if the new SendBlue update claims movement; decide migrate-vs-wait once that number is re-measured.
