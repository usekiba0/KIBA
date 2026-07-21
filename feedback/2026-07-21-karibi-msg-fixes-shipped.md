# Message to Karibi — what got fixed tonight

Hey — went through everything you flagged. All three were real, and digging into your account
turned up two more you hadn't hit yet. All fixed and live.

---

**The Bible verse, the duplicates, and "leg day"**

Root cause, and it explains all of it at once: when you asked for a verse every morning, KIBA
set it up as a repeating reminder with **one specific verse typed into it**. A repeating
reminder says the exact same thing forever — so you were going to get Matthew 6:34 every
morning for the rest of your life. It did that twice, so you got it twice a day.

It had also made a third one that said "leg day starts now" every single morning. You told it
leg day is Thursday. That one would have been wrong six days out of seven.

I deleted all three off your account, so tomorrow morning is clean.

Then I fixed the cause: KIBA can no longer put a verse, a weekday, or a specific session like
"leg day" into a repeating reminder. The system rejects it now rather than trusting the AI to
remember the rule.

Worth knowing — the real verse feature is a proper rotating list that changes daily and never
gets misquoted. What you were getting wasn't that. KIBA was writing scripture from memory,
which is how you ended up with a verse that's slightly off from the real one.

**The duplicate messages**

The two verses were technically different by exactly one character — one had quote marks
around it, the other didn't. The safety net that's supposed to block duplicate texts compares
them letter by letter, so one quotation mark was enough to slip past it. It now ignores
punctuation, capitals and spacing, so two messages that read the same get caught as the same.

**The Bible reminder you asked for three times**

This one was the worst and I want to be straight about it. KIBA told you "locked, 8am daily,
proof demanded" — and never actually created it. Nothing was ever scheduled. It also told you
you'd never asked for the verses in the first place, when it had set them up itself the night
before.

Setting a reminder and talking about setting a reminder were two separate things, and nothing
checked that they matched. So the AI could promise you something and simply not do it.

Now they're connected. If KIBA says a reminder is set and nothing was actually scheduled, that
sentence gets removed before the message sends and it asks you for the time instead. It can't
tell you something's handled when it isn't.

**The PPL question it kept re-asking**

You answered it — "8am Mon-Fri, gym pic by 8:35, leg day Thursday" — and thirteen hours later
the morning message asked you to pick your days again.

That wasn't the AI forgetting. There was genuinely nowhere in the system to store a weekly
schedule. It only existed in the conversation, and the morning message is a fixed template
reading off a to-do list that still said "pick your PPL days" because nothing ever ticked it
off.

There's now a proper place for it. Next time you tell KIBA your schedule it gets saved, it
shows up in every conversation as something KIBA already knows, and the morning message stops
asking once it's on file.

One honest note: it's empty right now — for you and everyone. It fills the next time you say
it. So tell KIBA your split once more and it should stick from then on.

**Two more I found that you hadn't reported yet**

Every time you moved your gym time that afternoon — 6pm, then 8:30, then 8, then 4:15 — KIBA
scheduled a fresh pair of reminders and never cancelled the old ones. You had three "30 min
till push" messages queued for the same minute. Rescheduling now replaces the old ones instead
of stacking.

And the delay you mentioned — the pause where it was supposed to wait and read several
messages together — you were right, it wasn't working. People leave 3 to 8 seconds between
texts and the window was only 1.5. It almost never caught anything and was just adding lag to
every single message. It's off now. Photos still batch, because those genuinely do arrive in
bursts.

---

**What you should notice from tomorrow**

No verse spam, no leg day on a Tuesday, no doubled messages, no stacked reminder pings, and
slightly faster replies. And if KIBA says it set a reminder, it set one.
