# Training V2 — Gaps & Conflicts Found

**For:** Karibi · **From:** Ali · **Date:** 2026-08-20
**Method:** all 41 delivered PDFs extracted to text and read end to end, then diffed against
each other, against the live product configuration, and against the existing codebase.

You asked me to tell you if anything's missing before we finish. Five things. One is a real
hole, one is a live contradiction that would put a wrong number in front of a customer, and
three are decisions only you can make.

---

## 🔴 1. Appendix H does not exist

The playbooks run **A, B, C, D, E, F, G, … I**. There is no **H**.

| Appendix | Doc | Topic |
|---|---|---|
| A | Master 22 | Gold Standard Response Library |
| B | Master 23 | Memory Example Library |
| C | Master 24 | Business |
| D | Master 25 | Fitness |
| E | Master 26 | Student |
| F | Master 27 | Weight Loss |
| G | Master 28 | Relationships |
| **H** | **— missing —** | **?** |
| I | Master 29 | Faith |

Master 13 (Domain Intelligence) names **Money** and **Content Creation** as core domains, and
neither has a playbook. My guess is H was going to be Money/Finance. Two of your four
anthology personas have money problems (Devon's pricing and slow payers, Marcus's income
goal), and money is one of the most common accountability topics there is.

**What I need:** either the missing Appendix H doc, or a "skip it" — in which case money
questions fall back to Master 13's general framework, which is thinner but works.

---

## 🔴 2. Live price conflict — the docs say $9.99, the product charges $20

| Source | Price | Trial |
|---|---|---|
| KIBA Final Master Stress Test (4 places) | **$9.99/mo** | first 3 days free |
| Live product (`STRIPE_PRICE_DISPLAY`) | **$20/month** | `STRIPE_TRIAL_DAYS=3` |

The trial length matches. The price does not.

Your own Legacy Intelligence Consolidation (§28) actually predicts this exact problem and
solves it: *"No hardcoded product terms in training examples — current verified product
configuration is the source of truth."* So the rule is already written, and I've built the
rulebook that way: KIBA reads the price from Stripe at send time and can never quote a
literal from a document.

**What I need:** confirm $20/month is right. If the plan was to launch at $9.99, that's a
Stripe change, not a training change — tell me and I'll do it.

---

## 🟠 3. No doctrine for photos, screenshots and media

KIBA can already see images, and Master 30 assumes it constantly — "send me the page", "lemme
see it", "send me the car". But nothing in the 40 documents says how KIBA should behave when
a user sends:

- a screenshot of someone else's messages (a fight with a partner, a client email)
- a meme or a joke photo with no task attached
- a voice note
- multiple photos at once
- something the user didn't mean to send

Master 10 covers *proof* photos well. Everything else is undefined. This is worth a page
because it's a daily behaviour, not an edge case — and "reacting to the wrong thing in a
photo" is one of the fastest ways KIBA feels dumb.

**What I need:** either a short doc, or agreement that I extend the rulebook myself from the
principles already in Masters 3 and 11 and you review it.

---

## 🟡 4. Compliance language sits outside the training, and must stay that way

The docs mention "STOP" 23 times — always as motivational language ("stop bullshitting"),
never as the SMS keyword. That's fine, but worth stating explicitly so it doesn't get
optimised away later: **STOP, HELP and the opt-out flow are carrier-mandated and are handled
in code, above the AI layer.** No amount of personality adaptation may soften, delay or
rephrase them. I've written that into the rulebook's conflict hierarchy (§18, tier 1).

**No action needed from you** — flagging it so it's on the record.

---

## 🟡 5. Three decisions I can't make for you

Listed in the spec as Open Questions; repeating them here so they're in one place.

1. **Tapbacks for brand-new users.** V1 reacts on most turns. Master 32 says reaction
   frequency should adapt per person. For a user with no history yet — start with reactions
   on, or off? *(My recommendation: on but sparse. It's the fastest warmth signal we have,
   and the profile will tune it within a day.)*

2. **Existing users and accountability consent.** Master 10 requires stored consent before
   hard accountability. Users onboarded before that question existed have no stored
   preference. Inherit them as "direct", or have KIBA ask once? *(My recommendation: ask
   once. It's a good message and it demonstrates the new KIBA immediately.)*

3. **Model tier.** The doctrine asks KIBA to feel like "Claude/ChatGPT-level intelligence
   that knows me". We currently run the fast cheap model. The V2 behaviour is materially
   harder to hold. I want to run the eval on both and let the numbers decide rather than
   guess — but a step up costs more per message, so it's your call once you see the scores.

---

## What I did *not* find missing

For completeness, because you asked me to check everything — these are all covered
thoroughly and I have no notes:

Personality and tone · memory (write, retrieval, confidence, expiry) · Life State ·
proactive messaging and the notification budget · onboarding · accountability levels and
escalation · everyday AI breadth · relationship progression · edge cases and adaptive
reasoning · challenges · trust and honesty about system state · continuous personalisation ·
conversation rhythm and anti-AI-cadence · value application and outcome ownership · Pro
selling and the anti-manipulation rules · the conflict hierarchy · the 21 failure modes ·
the per-response quality gate.

That's a genuinely strong corpus. The stress test in particular does something most training
sets never do — it defines what KIBA must **not** become, by name, twenty-one times. That
list is what I've turned into the automated test suite, so those failures get caught by CI
rather than by you noticing them in a conversation.
