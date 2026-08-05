---
id: 094
title: Ship activation-asks PR and unblock CI
stage: general
date: 2026-08-06
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: "do it" -> "merge it" -> "commit those PHRs too"
labels: ["ci", "eslint", "release", "apple-masking", "tooling-gotcha"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/79
files:
 - backend/src/ai/coaching.service.ts
 - history/prompts/general/089-092 (committed)
tests:
 - full unit + contract: 1660 passing, 4 skipped (needs live Postgres)
 - CI: Backend Lint + Test PASS, Frontend Lint + Build PASS
---

## Prompt

do it → merge it → commit those PHRs too

## Response

Shipped the activation-asks fallback trigger (see PHR 093 for the change itself).
PR #79 merged to master as `e3cd529`; branch deleted; local master synced.

### The CI failure — and the gotcha behind it

First CI run failed on **Backend — Lint + Test** despite `jest` and `tsc --noEmit` both
passing locally. The log showed `423 problems (2 errors, 421 warnings)`. The 421 warnings
are pre-existing `no-explicit-any` noise and do not fail the build; the **2 errors** did:

```
backend/src/ai/coaching.service.ts
  6:8  error  'axios' is defined but never used        @typescript-eslint/no-unused-vars
  9:8  error  'heicConvert' is defined but never used  @typescript-eslint/no-unused-vars
```

Neither was mine. Both were left behind by the HEIC pre-transcode (#78), which moved the
transcoding into `image-prep.ts`. Verified each symbol appeared exactly once in the file —
its own import line — and confirmed both were present on `master`, so this was failing CI
on **every branch cut from master**, not just this PR. Removed in a separate commit
(`d5dc6af`) so the diff stays honest about which change owns which line.

### ⚠️ TOOLING GOTCHA — local lint CANNOT reproduce a CI lint failure

`backend/package.json:11` defines:

```
"lint": "ESLINT_USE_FLAT_CONFIG=false eslint \"{src,tests}/**/*.ts\" --fix"
```

The `--fix` means running `npm run lint` locally **silently repairs whatever is fixable and
then reports success**. CI runs the same script on a clean checkout where unused imports
are not auto-fixable, so they surface there and only there. That is exactly how two dead
imports reached master.

To preview what CI will see:

```
cd backend && ESLINT_USE_FLAT_CONFIG=false npx eslint "{src,tests}/**/*.ts"
```

Second gotcha stacked on top: on a Windows checkout that bare command floods with
`prettier/prettier  Delete ␍` CRLF errors that CI never sees. Suppress them with
`--rule '{"prettier/prettier":"off"}'` to isolate the real errors.

### Also recorded

Committed PHRs 089–092 (lag re-measure, client artifact + scheduled re-check, read-receipt
and typing-bubble verification) plus this one. Deliberately did NOT stage the stray
`069-...prompt.md.tmp.26512.ae7f03c1076a` temp file, or any of the many untracked client
PDFs/media in the working tree.

## Outcome

- PR #79 merged (`e3cd529`). Deploys to Render automatically; the sweep installs on boot
  alongside the existing three crons and first runs within the hour — expect
  `activation_asks_sweep` log entries with a candidate count.
- Master's CI lint is green again for everyone, not just this branch.
- Follow-ups unchanged and both client-side: Apple brand profile In Review since 07-28 with
  the `textkiba.com` org-domain mismatch; proof pipeline still dead with 2 product
  decisions outstanding.
