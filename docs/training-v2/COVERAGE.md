# Training V2 — Source Coverage Manifest

**Delivered by client:** 2026-08-20 (`feedback aug 2026/`)
**Ingested:** 2026-08-20 — every file extracted to text, read end to end, mapped to a rule in
[`KIBA_RULEBOOK_V2.md`](KIBA_RULEBOOK_V2.md).

**41 PDFs · 622 pages · 926,545 characters.**

The client's inventory named 40 training files. All 40 are present. The 41st
(`KIBA V1 Product Features`) is a product/engineering brief, not AI training — it is
answered separately and deliberately excluded from the behavioural rulebook.

---

## Inventory check against what the client listed

| Client said | Expected | Found | Status |
|---|---|---|---|
| 32 KIBA Master Training docs | 32 | 32 (`master_1`–`master_29`, `Master_30`, `master 31`, `master 32`) | ✅ complete |
| Alex mock convos | — | 3 (Days 1–2, 3–5, 6–7) | ✅ complete |
| Maya mock convos | — | 2 (Days 1–3, 4–7) | ✅ complete |
| KIBA Final Master Stress Test — Jordan | 1 | 1 (titled "7 Day Adversarial Training"; the user inside is Jordan) | ✅ complete |
| KIBA Legacy Intelligence Consolidation | 1 | 1 | ✅ complete |
| KIBA Clean Mock Conversation Anthology | 1 | 1 (Tyler, Marcus, Devon, Jamie) | ✅ complete |
| **Total training files** | **40** | **40** | ✅ |
| *(extra)* KIBA V1 Product Features | — | 1 | ⚠️ product brief, not training — see [`../../feedback/2026-08-20-karibi-training-v2-reply.md`](../../feedback/2026-08-20-karibi-training-v2-reply.md) |

No duplicates survived the client's re-upload: all 41 SHA-256 prefixes below are distinct.

---

## Authority tiers

The stress test (§63) sets an explicit conflict hierarchy. Every source below is tagged with
the tier it occupies, because that tier decides which document wins when two disagree.

| Tier | Meaning | Sources |
|---|---|---|
| **A — Core doctrine** | Overrides playbooks and examples. Compiled directly into the system prompt. | Masters 1–21, 30, 31, 32; Stress Test universal notes |
| **B — Playbooks** | Domain knowledge. Loses to Tier A and to personalization. | Masters 24–29 |
| **C — Example libraries** | Teach reasoning only. Explicitly **low authority** — never copied. | Masters 22, 23; all mock convos; Anthology |
| **S — Supplemental** | Explicitly self-subordinating to newer rules. | Legacy Intelligence Consolidation |
| **P — Product brief** | Not behavioural training. | V1 Product Features |

---

## Full manifest

| File | Pages | Chars | SHA-256 (12) |
|---|---|---|---|
| `kiba_master_1` | 3 | 5,416 | `b992ea5668e0` |
| `kiba_master_2` | 4 | 5,857 | `24101ca27bc0` |
| `kiba_master_3` | 4 | 6,052 | `1920702a7f29` |
| `kiba_master_4` | 4 | 5,860 | `e61d128b309f` |
| `kiba_master_5` | 4 | 6,458 | `869608067e3d` |
| `kiba_master_6` | 4 | 5,134 | `f9d6056771dc` |
| `kiba_master_7` | 3 | 4,834 | `f08ffd18478e` |
| `kiba_master_8` | 3 | 5,551 | `b959e0b78bc7` |
| `kiba_master_9` | 4 | 5,367 | `78d251f63583` |
| `kiba_master_10` | 3 | 5,163 | `d41463e04c56` |
| `kiba_master_11` | 3 | 4,925 | `f1130649abcb` |
| `kiba_master_12` | 3 | 4,907 | `5224714142d0` |
| `kiba_master_13` | 4 | 5,432 | `8e638bcc4c69` |
| `kiba_master_14` | 3 | 5,403 | `3366ad13e318` |
| `kiba_master_15` | 3 | 5,380 | `4faa14bdefde` |
| `kiba_master_16` | 3 | 4,784 | `25cd810ec594` |
| `kiba_master_17` | 3 | 4,532 | `d1d49f800c95` |
| `kiba_master_18` | 3 | 4,801 | `c743aa430251` |
| `kiba_master_19` | 3 | 4,737 | `3e02cc6e74a4` |
| `kiba_master_20` | 3 | 4,440 | `83bce55abdf9` |
| `kiba_master_21` | 3 | 4,654 | `bb6b6509cac2` |
| `kiba_master_22` | 2 | 4,307 | `02f8bb4a4117` |
| `kiba_master_23` | 3 | 3,989 | `56b81ade0020` |
| `kiba_master_24` | 3 | 4,685 | `fac1aa579c4a` |
| `kiba_master_25` | 3 | 5,184 | `ad7a759e2053` |
| `kiba_master_26` | 3 | 3,859 | `7fb6e6aad890` |
| `kiba_master_27` | 3 | 5,166 | `5c61d7317209` |
| `kiba_master_28` | 3 | 5,091 | `74d053b8c680` |
| `kiba_master_29` | 3 | 4,328 | `868e1e69d79e` |
| `KIBA_Master_30 - Value Application Outcome Ownership and Pro Conversion Engine` | 5 | 10,692 | `2edf8af0084d` |
| `kiba master 31` | 28 | 26,104 | `914c55a6a47a` |
| `kiba master 32` | 49 | 39,593 | `04f775959b82` |
| `KIBA Final Master Stress Test - 7 Day Adversarial Training` | 45 | 48,426 | `9f75f3440422` |
| `KIBA Legacy Intelligence Consolidation - Clean Training` | 10 | 14,695 | `767af3c9d9d9` |
| `KIBA Clean Mock Conversation Anthology` | 10 | 10,633 | `db77a70d03e1` |
| `KIBA Mock Convo Days 1 and 2 - Alex` | 75 | 139,784 | `1f295738286a` |
| `KIBA Mock Convo Days 3-5 - Alex` | 99 | 162,881 | `85623cde417f` |
| `KIBA Mock Convo Days 6-7 - Alex` | 75 | 119,881 | `b6ab716659c0` |
| `KIBA Mock Convo Days 1-3 - Maya` | 66 | 88,745 | `1b57f7385fe3` |
| `KIBA Mock Convo Days 4-7 - Maya ` | 59 | 105,317 | `efe82c4213fa` |
| `KIBA V1 Product Features - Dashboard Execution Score and AI Mini Apps` | 8 | 13,498 | `fe7a76a191a3` |

---

## What each Tier-A/B document contributes

| Doc | Section title | Feeds |
|---|---|---|
| Master 1 | Vision & Product Philosophy | Rulebook §0 identity, §1 Friend First, Solve Before Motivate |
| Master 2 | Core Intelligence Principles (20) | Rulebook §1 — the overriding principles |
| Master 3 | Decision Engine (21 rules) | Rulebook §2 pre-response pipeline |
| Master 4 | Personality & Messaging Engine | Rulebook §3 voice, bubbles, emoji, profanity, escalation |
| Master 5 | Memory & Relationship Engine | Rulebook §5 memory purpose, Life Graph, relationship stages |
| Master 6 | Memory Write Engine | Rulebook §5 write pipeline, categories, confidence, never-save list |
| Master 7 | Life State Engine | Rulebook §6 |
| Master 8 | Proactive Messaging Engine | Rulebook §7 notification budget, escalation ladder, ghost recovery |
| Master 9 | Onboarding Engine | Rulebook §8 |
| Master 10 | Accountability Engine | Rulebook §4 |
| Master 11 | Everyday AI Engine | Rulebook §9 |
| Master 12 | Relationship & Retention Engine | Rulebook §10 |
| Master 13 | Domain Intelligence Engine | Rulebook §11 universal coaching framework |
| Master 14 | Edge Cases & Adaptive Reasoning | Rulebook §12 |
| Master 15 | QA & Evaluation Engine (9 categories) | Eval harness — `plan.md` §5, scoring rubric |
| Master 16 | Internal Reasoning & Response Generation | Rulebook §2 (10-step pipeline) |
| Master 17 | Challenge & Habit Building | Rulebook §13 |
| Master 18 | Trust, Safety & User-First | Rulebook §14 |
| Master 19 | Continuous Learning & Personalization | Rulebook §15 + Communication Profile schema |
| Master 20 | Conversation Mastery | Rulebook §3 flow, rhythm, AI-habit bans |
| Master 21 | Decision Engine (prioritization) | Rulebook §2 prioritization framework |
| Master 22 | Appendix A — Gold Standard Response Library | Example policy: variability requirement, anti-memorization |
| Master 23 | Appendix B — Memory Example Library | Memory write test fixtures |
| Master 24 | Appendix C — Business Playbook | Playbook pack |
| Master 25 | Appendix D — Fitness Playbook | Playbook pack |
| Master 26 | Playbook Usage Rules + Student Playbook | **Playbook precedence rule** + playbook pack |
| Master 27 | Appendix F — Weight Loss Playbook | Playbook pack |
| Master 28 | Appendix G — Relationships Playbook | Playbook pack |
| Master 29 | Appendix I — Faith Playbook | Playbook pack |
| Master 30 | Value Application / Outcome Ownership / Pro Conversion (condensed) | Rulebook §16, §17 |
| Master 31 | Same section, long form with worked examples | Rulebook §16, §17 examples |
| Master 32 | Personality Adaptation & Energy Matching (87 rules) | Rulebook §15 + Communication Profile schema |
| Stress Test | 7-day adversarial + 81 universal notes + 21 failure modes | Rulebook §18 conflict hierarchy, §19 failure modes; eval suite |
| Legacy Consolidation | 30 keep/discard rules | Rulebook §17 clean sales model, §14 safety |
| Anthology | 4 personas | Persona regression fixtures |

---

## Gaps found

Three documented gaps are listed in [`GAPS-FOR-CLIENT.md`](GAPS-FOR-CLIENT.md), plus one
internal contradiction between the Stress Test and the Legacy Consolidation over hardcoded
Pro pricing — resolved in the rulebook in favour of live product state.
