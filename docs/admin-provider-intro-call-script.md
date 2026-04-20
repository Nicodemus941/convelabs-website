# ConveLabs — Provider Intro Call Script
## *For when a patient names a doctor's office that isn't already partnered with us*

**Purpose:** Every patient booking where the referring provider is NOT in our orgs is a free warm-intro opportunity. A 90-second call with the provider's front desk gets us their email + mental real estate. The call is *service-first*, not sales.

**Who calls:** Admin (you). Make the call within 4 business hours of the booking.

**What to have ready:**
- Patient's first name + appointment date/time
- The doctor's name (if the patient gave one)
- Your tone: friendly, confident, **not** apologetic, **not** salesy

---

## The Script

### Opening (the gatekeeper handshake) — 15 seconds

> *"Hi, this is [Your Name] calling from ConveLabs — we're a concierge mobile lab service in Central Florida. Is the office manager or a clinical lead available for a quick 60-second courtesy call? If they're busy, whoever handles lab referrals is perfect."*

**Why this works:** You identify, you name the outcome ("concierge mobile lab"), you scope the call ("60 seconds"), and you route to the right person without being passed around. Most front desks will route you immediately.

---

### When they say *"Yes, this is [name], what's this about?"* — 30 seconds

> *"Great. Thanks so much for taking the call. Quick context: one of your patients — [Patient First Name] — booked an at-home lab draw with us yesterday. She mentioned Dr. [Provider Name] ordered the bloodwork. We're going to draw the labs [date], deliver the specimen to [LabCorp / Quest] the same morning, and results will come back through your normal fax or portal route in 48 to 72 hours.*
>
> *I'm calling because we like to send the ordering provider a delivery receipt when we drop the specimen — just so your front desk doesn't have to chase it. Could I grab the best email for that?"*

**Why this works:**
- You lead with *their* patient, *their* doctor, a *real* visit — not a pitch
- You've already provided value (the delivery receipt idea) before asking for anything
- The ask is tiny: an email address
- You didn't say the words "sales," "marketing," "demo," or "software" once

---

### When they give you the email — 10 seconds

> *"Perfect, thank you. I'll send a confirmation email today and a delivery receipt once the specimen lands at the lab. No action needed on your end — just wanted to keep you in the loop."*

Pause. If they say "okay, thanks" — **hang up.** You got what you came for. The product will do the rest (the 5-email drip takes it from here).

---

### When they ask *"what's this going to cost us?"* — 15 seconds

> *"Zero. The patient pays us the same way they'd pay LabCorp or Quest — through their insurance or a self-pay rate. You don't get billed, and we don't charge the practice anything for the email updates. Your patient saves the trip; you save the front-desk time. Nobody pays more."*

That "zero, nobody pays more" line kills 80% of hesitation.

---

### When they ask *"how does this work technically?"* — 30 seconds (only if they ask)

> *"It's really simple. Your patient downloads the lab order, uploads it into our site or texts us a photo, and picks a 30-min window. Our phlebotomist — a licensed CLIA-trained phleb — comes to their home or office, draws the labs on-site, and drives the specimen straight to [LabCorp / Quest]. Same lab. Same CPT codes. Same insurance path. Same results. We're just the delivery layer."*

Stop there. **Do not mention the provider portal yet.** That's for email 3.

---

### When they ask about the provider portal — 30 seconds (they may ask, especially at concierge practices)

> *"Funny you should ask. We do have a free provider portal — some of the practices in Winter Park use it to skip the fax entirely. Your staff types the patient's name, drops the lab order PDF, and the patient gets a one-click booking link automatically. Takes about 15 seconds per order. Would it be helpful if I emailed you a quick walkthrough?"*

**Only** offer if they asked. If they say yes, send email 3 (the teach) manually from the admin panel instead of waiting for the drip.

---

### When the front desk says *"Dr. X is really particular — we need to check with her first"* — 20 seconds

> *"Totally understand. How about this: let me send the delivery receipt email this one time just for [Patient's] visit so Dr. X can see what it looks like. If she loves it, we make it a standing routine. If she hates it, you tell me to stop and we stop. Fair?"*

The "fair?" close is powerful. Very few people say "no" to "fair."

---

### When they say *"We don't partner with outside labs"* — 10 seconds

> *"Totally fair. I'll still send the one-time delivery receipt so this patient's referral is documented, but I won't follow up after that. Appreciate your time."*

Back off immediately. Mark the row `status='declined'` in the admin panel. No further contact.

---

## Etiquette Rules — Non-Negotiable

1. **Never say the words:** "demo," "partnership," "upsell," "marketing," "onboarding." These are professional-service offices — they don't want to hear sales language.
2. **Never ask for business on the first call.** The goal is: get the email, leave a positive impression, hang up.
3. **Never mention the patient's full name.** First name only — HIPAA-adjacent courtesy.
4. **Never ask what tests were ordered.** We have the lab order; the practice doesn't need to restate anything.
5. **Under 2 minutes.** If the call goes past 3 minutes, you're selling instead of servicing.

---

## After the Call — What You Do

1. Open the admin **Provider Acquisition** tab.
2. Find the row for this provider.
3. Click **"Email found"** → paste the email → hit save.
4. The system automatically fires Email 1 (courtesy notification) within ~60 seconds.
5. Email 2 (delivery confirmation) fires automatically when the phleb logs the specimen as delivered.
6. Emails 3, 4, 5 fire on day 5, 12, 26 per the drip schedule.

**You do nothing else.** The 5-email drip runs on its own.

---

## Edge Cases

### You can't find the doctor in Google (new hire? moved?)
- Call the patient back (politely): *"Quick question — I'm having trouble reaching Dr. [Name]. Is there a practice name or city you remember?"*
- If still unreachable → admin panel → mark row `status='pending_research'` and leave it. Sometimes a patient re-books later with clearer info.

### The patient actually doesn't have a specific doctor
- They used an urgent care, telehealth, concierge-direct — no long-term provider to acquire.
- Mark row `status='declined'` and delete the provider info. Patient still gets served.

### The practice IS already a ConveLabs org but the patient didn't know
- The `capture_referring_provider` RPC auto-detects this via email match.
- If it didn't catch it, search orgs by practice name → if it's the same org, mark referring_provider row `matched_org_id` and status `converted`.

---

## Anti-Script: Don't Say These Things

> *"We're a software company…"*

No. You're a mobile lab service.

> *"We'd love to partner with you…"*

No. You're calling to notify them about their patient, not to partner.

> *"Let me schedule a demo…"*

No. The 5-email drip is the demo.

> *"We have a better way…"*

No. They're already doing their job fine. You're offering them a faster option, not a correction.

---

## Why This Works (For Your Confidence)

Every one of these calls has three outcomes:
1. **Best:** You get the email. We send 5 emails over 26 days. 12–20% convert to a portal signup. Each signup = ~$300–800 MRR over the year.
2. **Middle:** You get the email but they never activate the portal. We still service every one of their patients for free. Goodwill compounds.
3. **Worst:** They say "remove me." You lose 60 seconds, they never get another email. No downside.

**There is no negative outcome.** The math is one-way.

Every call is free revenue on the table. Go make them.
