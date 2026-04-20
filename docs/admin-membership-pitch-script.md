# ConveLabs — Admin Membership Pitch Script

**Purpose:** When a patient (or org contact) asks *"what's the difference between just paying per visit vs. becoming a member?"* — answer with this structure. Delivers a Hormozi-style value stack, handles top 5 objections, closes with scarcity.

**Length:** 90–120 seconds on the phone. ~45 seconds if they're already warm.

---

## 1 · The Hook (15 seconds)

> *"Great question. Most patients draw labs 4–6 times a year. The average American spends almost 3 hours per trip — drive, park, wait, draw, deliver. We built memberships for people who'd rather give that time back to themselves."*

Pause. Let them respond. Most will say *"ok, so what does it cost?"* — **do not go to price yet.** Go to outcome.

---

## 2 · The Three-Tier Outcome Summary (30 seconds)

> *"We have three levels, built around how much time you want back:*
>
> **Member — $99/year.** *Priority booking windows, $10 off every visit, results dashboard, and family members stack under one account. Most of our patients start here — pays for itself in 2 visits.*
>
> **VIP — $199/year.** *This is where the real convenience lives. Same-day mobile draws are free (normally $49 surcharge), your rate is locked for life, one family add-on included, and you get the Founding Member badge — only 50 of those ever. There are **N left**.*
>
> **Concierge Elite — $399/year.** *For people who want bloodwork handled like a personal assistant service — whenever, wherever. Includes everything in VIP plus unlimited rescheduling, early access to new service lines, and a dedicated care coordinator.*
> *"Which of those sounds closest to how you'd actually use us?"*

**Key technique:** end with a question that forces them to self-segment. Their answer tells you which tier to close on.

---

## 3 · The Value Stack (only for VIP — the anchor tier)

If they're leaning toward **VIP**:

> *"Let me show you the math on VIP. At $199 a year, you get:*
> - *12 months of VIP membership — $199*
> - *Founding rate-locked for life — saves ~$50/yr vs future pricing*
> - *One free family add-on — $75 value*
> - *Priority same-day booking — $150 value*
> - *Founding Member #N badge + first access to future services — priceless*
>
> *Stacked value is $474. Your price is $199. **Pays for itself in one visit.** And we only open 50 Founding seats ever — there are N left."*

**The close:** *"Want me to reserve seat #N for you right now?"*

---

## 4 · Handling Top 5 Objections

### Objection: *"I don't draw labs that often."*
> *"Totally fair. Here's the simple math: if you draw labs even twice a year, Member at $99 saves you $20 + the time. If you draw four times, you're saving $40 plus earning priority. If you draw less than that, we'd probably send you back to non-member — we don't want to sell you something you won't use."*

Honesty builds trust. The moment you say "we'd send you back" they stop hearing "sales pitch."

### Objection: *"I have insurance — why would I pay a membership?"*
> *"Our membership doesn't replace insurance. It covers the **convenience** side — the phleb coming to you, the priority windows, the family add-on, the rate-lock. Your insurance still covers the labs themselves the same way. So if anything, it **stretches** what your insurance already buys."*

### Objection: *"Can I try one visit first?"*
> *"Yep. Book a single visit at the regular rate. If you become a member within 7 days, we credit what you already paid toward your first year. Works out the same either way — we're just removing the decision friction."*

(This is a real policy — credit applies if upgraded within 7 days. Check `user_memberships.credit_applied` logic.)

### Objection: *"What if I move / want to cancel?"*
> *"Cancel anytime. We prorate refunds for the months you didn't use. Literally no lock-in — the only thing you'd lose is the Founding rate-lock if you came back later at a higher price."*

### Objection: *"Why should I trust you vs. just going to LabCorp?"*
> *"Same labs. Literally the same LabCorp or Quest — we just deliver your specimen to them. Same CLIA-certified processing, same results. The only thing that changes is who comes to whom. LabCorp makes you come to them; we come to you."*

---

## 5 · Close With Scarcity (only if they're still deciding)

> *"I want to be real with you — we have N Founding VIP seats left out of 50 total. After those are gone, that rate-lock is gone forever. It's not an act, it's just how we scoped the launch. Want me to hold seat #N while we finish this conversation?"*

Do not press after that. Silence is their turn.

---

## 6 · Follow-Up Rules

- If they say **yes**: process payment immediately — don't "send them a link." Momentum dies in inboxes.
- If they say **maybe**: "Totally fair. I'll text you the link — it's open for 48 hours. After that the seat releases." Then do exactly that.
- If they say **no**: thank them, say "If anything changes, I'm one text away" — don't leave negative air. A no today is a maybe in 60 days.

---

## Admin Cheat Sheet

| Tier | Price | Anchor benefit | Best for |
|---|---:|---|---|
| Member | $99/yr | $10 off every visit + priority booking | 2–3 draws/yr |
| **VIP** ⭐ | $199/yr | Founding rate-lock + free family add-on | 4+ draws/yr or family |
| Concierge | $399/yr | Unlimited rescheduling + dedicated coordinator | high-touch / exec |

**Always lead with VIP.** It's the anchor tier. Most people up-compare to Concierge or down-compare to Member — either way you've qualified them by starting in the middle.

---

## Red Flags — Don't Close

- Patient mentions a tight budget / "between paychecks" → **don't pitch membership.** Offer single visit instead, invite them to upgrade later.
- Patient has a medical urgency (new diagnosis, ER follow-up) → **don't pitch.** Get them booked fast, follow up with membership offer after their results land.
- Patient says *"my doctor told me to use a lab membership"* → **verify.** We don't want doctors pitching memberships — our job is to pitch the provider portal to *them,* not turn them into our sales team.
