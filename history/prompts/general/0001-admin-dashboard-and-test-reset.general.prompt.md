---
id: 0001
title: Admin dashboard and self-serve test reset
stage: general
date: 2026-06-04
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/multi-goal-pipeline
user: usekiba0
command: general chat
labels: ["admin", "dashboard", "testing", "data-rights", "onboarding"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - C:\Users\hp\.claude\projects\D--kibi\memory\project_kiba_admin_tooling.md (created)
  - C:\Users\hp\.claude\projects\D--kibi\memory\MEMORY.md (index entry)
tests:
  - none (investigation only)
---

## Prompt

> Also is there an easy way to remove myself and start over as a new user when I want to test the flows so I don't have to ping you every time about it?
>
> Last thing - do we have a dashboard ready to see trials , purchases , revenue all KIBA info and users on sms texts etc.
>
> also check this doc file:///D:/kibi/feedback/KIBA_V1_SMS_Accountability_Operating_System_FULL.pdf

## Response

Three questions, all resolvable from existing code (no changes made):

1. **Self-serve test reset — already exists.** Admin UI at frontend `/admin` route, Users tab has a per-user red Delete button → `DELETE /admin/users/by-phone/:phone` (admin.controller.ts:135, admin.service.ts:303). Delete self, re-text KIBA from same phone → new user (onboarding keys off phone_number). User no longer needs to ping Claude between flow tests.
   - Caveat surfaced: raw `DELETE FROM users` with NO FK cascade in DB → leaves orphan rows (messages/goals/sessions/subscription) and does not cancel Stripe. Thorough `DataRightsService.deleteUserData()` (cascades + cancels Stripe) exists but is unused by the admin button. Offered to wire the button to it.

2. **Dashboard — already exists.** Same `/admin` page Dashboard tab (getDashboardStats, admin.service.ts:29): MRR/ARR, total/active/trial/paused/cancelled users, subs by status, Trial→Paid conversions, message volume 24h/7d, crisis alerts. Users tab = per-user detail + full SMS conversation history + block/unblock/flag/delete. Login uses backend INTERNAL_API_KEY via x-internal-key header.

3. **V1 spec PDF** read in full (8 pages) via pdftotext. Foundational V1 developer spec: daily plan → missions → follow-ups → proof → score → recap → pattern learning; 14 features across Phase 1/2/3. Consistent with shipped Phase 1; offered a spec-vs-implemented diff if wanted.

Saved memory `project_kiba_admin_tooling.md` documenting admin tooling locations + the orphan-delete caveat.

## Follow-ups / risks

- Optional: wire admin Delete button to DataRightsService.deleteUserData() for clean test resets (no orphans, cancels Stripe trial).
- Optional: spec-vs-implemented diff against the V1 PDF to catalogue any Phase 1 gaps.
- PHR system had no template/history dir in repo before this record; created history/prompts/general/.
