# Provider Dashboard — Hormozi Structure

*Built backward from the promises made in the partner announcement emails.
If a promise was made, the dashboard must deliver it visibly. Otherwise
trust collapses on day two.*

## The Promise Inventory (what the emails committed us to)

From `scripts/send-partner-drafts.mjs`, these are the things we told
partners are "live today":

| # | Promise | Must-be-visible dashboard element |
|---|---|---|
| 1 | Patient online booking | Patient booking URL + per-org rules shown |
| 2 | Instant payment at booking (Stripe) | Payment ledger + receipts downloadable |
| 3 | ConveLabs OCR Technology (fasting/urine detection) | Per-visit "prep analyzed" status w/ detected panels |
| 4 | Insurance capture at checkout | Insurance card on file (Yes/No) per patient |
| 5 | Lab-order uploads | Lab order file visible on every appointment |
| 6 | Specimen tracking IDs + notifications | Live "Collected → Picked up → Delivered → Resulted" timeline |
| 7 | Real-time Collected/Not Collected status | Per-appointment state pill |
| 8 | Transparent recollection policy (free / 50% off) | Footer link + visible on any disputed visit |
| 9 | Receipts + QuickBooks sync | Receipts tab, QB-synced indicator |
| 10 | Billing isolation (org's billing walled off) | "Your billing history — scoped to your org only" banner |
| 11 | Team logins | Team tab: invite/manage staff logins |
| 12 | Schedule-next-appt for this patient (coming soon) | Future: patient timeline shows next doctor appt |
| 13 | Recollection guarantee in writing | Static "Guarantee" section |
| 14 | Founding partner pricing locked | "Your locked rate" callout |

Per-org personalizations we also promised:
- **Aristotle**: VIP unrestricted window, $185/visit org-billed, fasting protocol reinforcement
- **CAO**: patient-name masking on every surface, draw-only chain-of-custody, Net-0 instant-Stripe
- **Elite Medical**: Subscription Plans (Starter 10 / Monthly Flex / Annual Partner) with live MTD usage
- **Littleton**: advanced panel support, podcast collab door, membership upsell at checkout
- **NaturaMed**: specialty-kit integrity, 6–9am window, AlignHer protocol-aligned intake
- **ND Wellness**: anytime booking, performance panels, recovery-panel integration
- **The Restoration Place**: BioTE panel mix, BioTE-aligned prep, 6–9am AM-cortisol enforcement

---

## Information Architecture (the Hormozi layout)

Every section earns its place by mapping to a promise. Anything we promised
and don't show is a trust leak.

```
┌─ HEADER ──────────────────────────────────────────────────────────────┐
│  ConveLabs. [PROVIDER]           [email]  [Sign out]                  │
├─ WELCOME ────────────────────────────────────────────────────────────┤
│  [avatar] WELCOME BACK                                                │
│           Elite Medical Concierge  [founding partner]                 │
│           Dr. Monica Sher · elitemedicalconcierge@gmail.com           │
├─ PRIMARY CTA ────────────────────────────────────────────────────────┤
│  [ 🩸 Schedule a new visit → ]    (dominant red button, above fold)   │
├─ LIVE OPS (what's happening right now) ──────────────────────────────┤
│  Today's visits:     3 scheduled · 1 in progress · 0 delivered        │
│  Awaiting results:   2 specimens in transit                           │
│  Needs attention:    1 patient missing lab order                      │
│  [table: upcoming 7 days, each row → detail page]                     │
├─ THIS MONTH (billing + performance) ─────────────────────────────────┤
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐       │
│  │  MTD visits  │  MTD spend   │  Avg turnaround│  Open issues│       │
│  │     14       │   $1,011.50  │    28 hrs      │      0      │       │
│  └──────────────┴──────────────┴──────────────┴──────────────┘       │
│  [Usage predictor: "At current pace you'll hit 22 visits/mo."]        │
│  [If Elite Subscription active: plan name + usage-against-cap chart]  │
├─ QUICK ACTIONS (2x2 grid on desktop, stack on mobile) ───────────────┤
│  📅 Schedule a visit   👥 My patients                                 │
│  💳 Subscription plans 📄 Billing history                             │
├─ PARTNERSHIP RULES ──────────────────────────────────────────────────┤
│  Your locked partnership (already built, keep)                        │
│  + RECOLLECTION GUARANTEE in writing, prominent                       │
│  + TEAM section: add staff logins                                     │
├─ HELP FOOTER ────────────────────────────────────────────────────────┤
│  Need something? info@convelabs.com · (941) 527-9169                  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Section-by-Section Spec

### 1. Welcome Header (already built — enhance)
- [x] Org name + contact name
- [ ] ADD: founding-partner badge if `organizations.onboarded_before = '2026-05-01'`
- [ ] ADD: last login timestamp ("You last signed in 3 days ago") — builds trust via visibility
- [ ] ADD: pending notifications count (e.g., "2 results ready to review")

### 2. Primary CTA — "Schedule a new visit"
- ONE above-the-fold red button. No secondary actions at same weight.
- Click → opens modal OR navigates to `/provider/schedule` (new route, scoped form)
- Form is pre-scoped to this org — auto-applies org rules (window, billing mode, masking)

### 3. Live Ops Section (new, critical)
- **Today's visits**: live count with status breakdown (scheduled/in-progress/completed)
- **Awaiting results**: count of specimens where `collected_at` IS NOT NULL AND `result_received_at` IS NULL
- **Needs attention**: count of appointments where `lab_order_file_path` IS NULL OR `lab_destination` IS NULL OR address incomplete
- Each clickable → deep-link to filtered appointment list
- **Upcoming 7 days table**: patient name (or ref ID if masked), date/time, status pill, one-click actions (reschedule / cancel / view details)

### 4. This Month Section (usage + billing glance)
- **MTD visits count** — pulls from `appointments` scoped to `organization_id` for current month
- **MTD spend** — sum of `total_amount` for completed visits this month
- **Avg turnaround** — collected_at → result_received_at average (trust signal)
- **Open issues** — unresolved tickets / missing data
- **Usage predictor** — linear extrapolation from MTD pace → EOM estimate
- **For Elite on a subscription**: current plan name, MTD usage vs. cap, overage estimate
- **Anchor**: "Annual Partner would save you $X this year at this pace" (Hormozi upsell)

### 5. Quick Actions Grid (evolve from placeholders)
Each tile must be LIVE, not "Coming soon":
- **📅 Schedule a visit** → `/provider/schedule`
- **👥 My patients** → `/provider/patients` (list + search + add)
- **💳 Subscription plans** → `/provider/subscription` (tiers + enrollment + current plan)
- **📄 Billing history** → `/provider/billing` (invoice list, download PDF, QB-synced badge)

When a tile isn't ready, replace "Coming soon" with:
> *"We're shipping this Week of May 6. Want early access? Email info@convelabs.com"*
→ at least gives the partner a reason to not feel abandoned.

### 6. Partnership Rules Card (already built — enhance)
- [x] Default bill-payer, patient price, org invoice price
- [ ] ADD: scheduling window visualization ("Mon–Fri 6am–2pm" as a visual day strip)
- [ ] ADD: member stacking rule with plain-English explanation
- [ ] ADD: patient-name masking indicator for CAO
- [ ] ADD: locked-pricing date badge ("Locked since Apr 2026 — grandfathered")

### 7. Team Section (NEW — we promised team logins)
- List of all staff with portal access under this org
- Each row: name, email, last login, role, [remove button]
- **"Invite a team member"** button → modal with email, role picker (manager / coordinator / viewer)
- Invited person gets SMS + email with magic link to set up
- Uses same `staff_location_assignments` schema (or new `org_portal_members` table)

### 8. Recollection Guarantee Block (NEW — explicit promise)
- Always visible, short:
> **Our recollection guarantee (in writing):**
> - If **ConveLabs** made the error → recollection is **100% free**
> - If the **reference lab** made the error → recollection is **50% off**
- "Report a recollection" button → one-click form that creates an admin ticket

### 9. Help / Contact Footer (already built — enhance)
- [x] Email + phone
- [ ] ADD: "Live chat" link (even if it opens a mailto for now — sets expectation)
- [ ] ADD: "Request a feature" button → mailto with "[Feature request]" prefix + orgname pre-filled

---

## Nice-to-Haves (Level-2 shipments)

### Trust + stickiness
- **Live activity feed**: *"Sharlene scheduled Antoinette Voll for Tue 8am · 2 min ago"* — team audit + real-time feel
- **Announcement changelog** on dashboard: *"New this week: results email fires 2 hrs after collection"* — shows we ship weekly
- **NPS pulse** once a month: *"How's the lab workflow? 😕 😐 🙂 😍"* — one tap

### Revenue expansion
- **Usage predictor with plan comparison** (built into This Month card):
  *"At 22 visits/mo pace: Monthly Flex = $1,589. Annual Partner = $1,324 (save $265)."*
- **"Refer another practice" program** embedded: $500 credit per successful referral. One-click "share your partner page"
- **Per-patient "schedule recurring visits"** — turn one-offs into subscriptions (Hormozi LTV play)

### Operational depth
- **Mass-schedule CSV import** — upload patient roster → schedule 20 visits at once
- **Google Calendar integration** — push their org's visits to their GCal in one click
- **Export patient roster as CSV** (HIPAA-scoped to their org)
- **Patient pre-visit readiness score** per appointment: did they upload lab order? insurance? fasting confirmed? Each visit gets a "Ready/Check/Blocked" pill matching the phleb card

### Proof + social
- **Result turnaround leaderboard** (anonymized across orgs): "Your avg: 28 hrs. ConveLabs network avg: 34 hrs." — makes the partner feel premium
- **Testimonial capture**: after any 5-star-rated visit, DM the org contact: "Mind if we use your words on the homepage?" — UGC flywheel

### Security + compliance
- **Audit log view** for the org contact: who on their team did what, when
- **HIPAA BAA download** — one-click PDF with their org info pre-filled for compliance shelves
- **Consent form generator** — creates custom consent forms in their brand, patient signs on the tablet at draw time

### Emotional loyalty (Hormozi's "gifts + attention")
- **Birthday/anniversary auto-email** from Nico (org's onboarding anniversary)
- **Quarterly business review deck** auto-generated (visits, savings, patient satisfaction) — email to org contact Q1, Q2, Q3, Q4
- **"Nico's open office hours"** slot embedded in dashboard — click → book a 15-min call

---

## Hormozi UI/UX principles applied

1. **One primary CTA above the fold.** "Schedule a visit" is the job. Don't split attention.
2. **Every section earns its place** by mapping to a promise we made. Cut anything that doesn't.
3. **Show live data over static text.** "14 visits this month" beats "MTD usage: coming soon" by 10x.
4. **Personalize per org.** Elite sees subscription plans. CAO sees masking reminders. Aristotle sees VIP-window callout. Same page, different emphasis.
5. **Mobile-first.** Partner staff check on phones. 320px width must work.
6. **Trust signals everywhere:** recollection guarantee, billing isolation, HIPAA badge, "rate locked" callout.
7. **No "Coming soon" without a date.** Either ship it, remove it, or give a ship date + early-access CTA. Dead placeholders kill trust faster than no placeholder.
8. **One-click to contact a human.** Nico's email + phone always reachable in two taps max.
9. **Every data point has a "why should I care?" tooltip.** Not "MTD spend" → "Month-to-date spend — what your org owes us this month."
10. **Never make them log in twice.** Magic-link from emails; SMS OTP when they do need to re-auth; session lasts 30 days.

---

## Build order (what ships first)

### Phase 1 — Core ops (do next, roughly 1-2 days):
1. Live Ops section with real data (today's visits, awaiting results, needs attention)
2. This Month section with real data (MTD visits, spend, turnaround)
3. Replace "Coming soon" on Schedule + My Patients with real pages
4. Recollection Guarantee block
5. Team Logins section

### Phase 2 — Revenue (unlocks Elite subscription):
6. Subscription Plans page with live Stripe enrollment (3 tiers)
7. Billing History page with downloadable PDFs + QB-sync indicator
8. Usage predictor w/ plan comparison

### Phase 3 — Loyalty + expansion:
9. Live activity feed
10. Referral program
11. CSV mass-schedule
12. Per-org NPS + changelog

Everything beyond Phase 3 = nice-to-have, prioritize when Level 1 revenue
milestones unlock.
