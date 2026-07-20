---
id: 023
title: Karibi call action items triage
stage: misc
date: 2026-07-20
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: fix/queue-drain-and-reminder-dedup
user: usekiba0
command: (chat) meeting notes + next steps dump from Karibi/Sumair call
labels: ["triage","planning","latency","affiliate-code","stripe","beta-launch"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (read-only) backend/src/messaging/message-debouncer.service.ts
tests:
 - none (triage only)
---

## Prompt

Next steps
[Karibi Mac] Grant developer access: Grant developer access for Stripe through the application.
[sumair roudani] Provide Stripe link: Supply the link to the documentation for developer settings.
[sumair roudani] Reduce response latency: Decrease the delay for AI replies by 2 to 3 seconds.
[The group] Launch beta: Release the app for 20 users on Monday.
[sumair roudani] Implement affiliate code: Create a referral code feature in the admin panel.
[sumair roudani] Verify milestone funding: Consult finance records regarding payment status and share the findings on Monday.
[Karibi Mac] Design landing page: Send a UI layout for the payment screen.
[sumair roudani] Configure payment plans: Set up monthly and yearly options on the Stripe checkout page.
[sumair roudani] Create tutorial GIF: Develop a visual guide for the pin message feature or hire an external designer.
[sumair roudani] Quote mini-apps: Share pricing details for the requested additional features by tomorrow.
[sumair roudani] Demonstrate fixes: Apply feedback and showcase the updated version tomorrow.

Details
Personal Check-in and Technical Setup: Sumair Roudani mentioned heavy rains in Pakistan, which caused local infrastructure issues and led to a tree falling near their residence. Karibi Mac asked about their week, and Sumair Roudani noted they had been busy hosting a visiting family member. Karibi Mac confirmed that the Stripe integration issues were resolved and agreed to provide Sumair Roudani with developer access to the Stripe account to assist with further configurations.
Sports and Access Rights: Karibi Mac and Sumair Roudani briefly discussed the upcoming World Cup match between Spain and Argentina, with Karibi Mac planning to watch the game while Sumair Roudani expressed that they were not interested in sports. Regarding access, Karibi Mac agreed to grant developer rights via computer after the call to prevent the need for future manual access requests from Sumair Roudani.
Application Testing and Feature Prioritization: Karibi Mac shared that they had been conducting tests on the application, including monitoring the behavior of "ghost messages" and delayed response times. Sumair Roudani proposed that internet and web access, originally planned for the second phase, should be the next major focus. The two agreed to prioritize integrating web access into the mobile application rather than treating it as a standalone feature.
Message Response Latency: Sumair Roudani explained that the AI was intentionally configured to respond within 8 to 10 seconds to avoid data loss during bursts of messages. Karibi Mac expressed concern that this delay detracts from the "live" feel of the conversation and could lead to user boredom. Sumair Roudani agreed to attempt reducing the latency by 2 to 3 seconds to gather feedback, and Karibi Mac suggested implementing a "read" status so users do not assume they are being ignored.
Feedback Loop and Training Strategy: Karibi Mac proposed a process of conducting mock conversations and sending comparisons between the current AI output and alternative responses to help train the model. Sumair Roudani confirmed this strategy is effective, noting that such comparisons provide clear insights into the desired tone, word formation, and text indentation for the AI.
Beta Launch and User Acquisition: Karibi Mac stated plans to launch the beta version of the application as soon as possible, targeting the following Monday, with an initial goal of acquiring 20 free users. To support this, Sumair Roudani agreed to implement an affiliate code feature on the admin dashboard, which would allow users to redeem a one-month free trial.
Payment Milestones Verification: Sumair Roudani requested that Karibi Mac accept and fund a new milestone request. Karibi Mac expressed confusion, noting that all five previously agreed-upon milestones appeared to be paid in full. Sumair Roudani apologized for the misunderstanding and agreed to verify the financial records with their team to provide an update on Monday.
Application Deployment Strategy: Regarding future application development, Sumair Roudani advised focusing on a functional chat feature first to ensure a smooth approval process on Apple and Android app stores, noting that initial rejections can cause complications for future updates. Sumair Roudani confirmed that all chats will be synchronized through a central database, ensuring consistency across both SMS and the mobile application.
Dashboard and Payment Plan Integration: Sumair Roudani explained that integrating email and calendar services would require a Model Context Protocol (MCP) server to allow users to connect their preferred applications. Regarding payment plans, Sumair Roudani committed to ensuring both monthly and yearly options are available on the Stripe checkout by Monday, while noting that a fully customized UI for the payment page might require further coordination with Stripe.
UI Design and Customization: Karibi Mac inquired about customizing the visual design of the payment page. Sumair Roudani encouraged Karibi Mac to create a design using tools like Figma or Photoshop, stating that they would replicate the look and feel as closely as possible to minimize back-and-forth communication.
Pin Message Tutorial: Karibi Mac requested a solution for creating a GIF tutorial to show users how to pin messages. Sumair Roudani agreed to attempt to create the GIF independently, but stated that if a professional designer is hired, the cost would be approximately $100 to $120. Sumair Roudani promised to provide an update on this by the following day.
Future Planning and Wrap-up: Sumair Roudani and Karibi Mac agreed to reconnect the following day to review fixes, discuss feedback, and address the pricing for mini-application development. Sumair Roudani committed to checking the records for the mini-app pricing and providing an update during their next meeting.

## Response snapshot

Triaged the 11 next-steps into build work vs. non-code items. Build work owned by us and due before Monday's 20-user beta:

1. **Affiliate / referral code in admin panel** — biggest new build. Codes redeemable for 1 month free trial. Needs an entity + migration, admin dashboard CRUD, redemption path in SMS intake, and Stripe trial extension on checkout.
2. **Stripe monthly + yearly plans on checkout** — second price + plan selection in the checkout session.
3. **Latency 8-10s → 5-7s** — measured the debounce path first: `IMAGE_DEBOUNCE_MS = 3000`, `TEXT_DEBOUNCE_MS = 1500` in `backend/src/messaging/message-debouncer.service.ts:26,34`. Debounce is only ~1.5s of the wall clock, so the 8-10s is dominated by LLM inference + prompt-assembly hops, not the burst window. Need a real timing trace before cutting anything.
4. **"Read" status / typing indicator** — SendBlue supports typing indicators; cheap perceived-latency win that pairs with #3.

Non-code / client-side: Stripe developer access + docs link, milestone funding check, payment-page design from Karibi, pin-message GIF, mini-app quote. Web/internet access and the mobile app remain Phase 2 — flagged per the stay-in-phase-1 guardrail.

Asked which thread to start on, recommending latency trace + affiliate code as the pre-Monday pair.
