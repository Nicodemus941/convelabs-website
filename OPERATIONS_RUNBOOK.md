# ConveLabs — Operations Runbook

**Source of truth for running ConveLabs end-to-end.**
Anyone reading this top-to-bottom should be able to operate the business by Day 30 without asking the founder a single question.

> **Hormozi rule applied throughout:** every section answers *"what do I do when X happens?"* not *"how does X work in theory?"*. Theory only appears when it changes a decision.

---

## Table of contents

0. [TL;DR — the entire business in 90 seconds](#0-tldr)
1. [What ConveLabs is + revenue model](#1-what-convelabs-is)
2. [Roles + who does what](#2-roles)
3. [The daily loop (Mon–Sun)](#3-daily-loop)
4. [Workflows](#4-workflows)
   - 4.1 Patient booking
   - 4.2 Lab order intake (the OCR pipeline)
   - 4.3 Phleb visit + specimen delivery
   - 4.4 Membership signup (direct + bundled)
   - 4.5 Organization onboarding
   - 4.6 Pending insurance changes
   - 4.7 Tasks + notes (admin queue)
5. [The Inbox loop — admin's morning routine](#5-inbox-loop)
6. [Pricing reference](#6-pricing)
7. [Cron jobs](#7-cron-jobs)
8. [Edge functions](#8-edge-functions)
9. [Database — key tables](#9-database)
10. [HIPAA + compliance](#10-hipaa)
11. [Today's bug-fix journal (2026-04-30 → 05-01)](#11-bug-journal)
12. [Common issues + resolutions](#12-common-issues)
13. [Onboarding a new hire](#13-onboarding)
14. [Hand-off checklist (M&A / new owner)](#14-handoff)

---

## 0. TL;DR

**Customer:** Florida adults who hate going to a lab. Especially seniors, busy execs, and concierge-medicine patients whose doctors order frequent draws.

**Product:** A licensed phlebotomist comes to the patient's home or partner office, draws blood, delivers specimens to Quest / LabCorp / AdventHealth / Orlando Health / Genova / Mayo same day. **$150 mobile draw**, **$100 senior**, **$55 in-office**.

**Profit engine:** annual memberships ($99 / $199 / $399). Each membership locks ~24% off every visit + perks. Members average 3+ visits/yr, so the membership pays for itself fast and patient renewal is sticky.

**B2B engine:** partner practices (concierge MDs, functional medicine, longevity clinics) refer patients in bulk; system auto-detects a new practice from any uploaded lab order's NPI, registers it, and texts the founder so we can fill the manager email.

**Tech:** React + Vite frontend (Vercel auto-deploys from `main`), Supabase backend (Postgres + edge functions + storage + auth). Stripe for payments + subscriptions. Mailgun for email. Twilio for SMS. Anthropic Claude for OCR.

**Daily ops:** admin clears the **Inbox** tab (pending patient insurance confirmations + new-practice metadata gaps), assigns tasks via **Notes & Tasks**, watches **Calendar** for the day's draws. Phleb opens the **Phleb PWA** on their phone, sees their assignments with org chips + lab orders, draws, marks delivered.

**Health monitoring:** nightly E2E smoke runs at 5 AM ET, SMSes the owner on any FAIL.

---

## 1. What ConveLabs is

ConveLabs LLC is a Florida-licensed mobile phlebotomy + lab-logistics company. We are NOT a clinical lab and NOT a telehealth provider. We collect specimens at the patient's home or in-office, and deliver them to a real clinical lab (Quest, LabCorp, AdventHealth, Orlando Health, Genova Diagnostics, Mayo Clinic Labs, or specialty kit shipping via UPS/FedEx).

### Revenue streams

| Stream | Pricing | Notes |
|---|---|---|
| Mobile blood draw (at-home) | $150 | $115 with VIP, $130 with Regular, $99 with Concierge |
| Senior (65+) | $100 | $75 / $85 / $65 with tiers |
| In-office | $55 | $45 / $49 / $39 with tiers |
| Specialty kit (Genova, etc.) | $185–$200 | Includes shipping |
| Therapeutic phlebotomy | $200 | Per doctor order |
| Additional patient (companion, same address) | $75 | $45 with VIP |
| Membership · Regular | $99 / yr | Mon–Fri 6 AM–noon, Saturday 6–9 AM |
| Membership · VIP | $199 / yr | Most popular. 30-day advance window, Saturday 6–11 AM, family $45 |
| Membership · Concierge | $399 / yr | Anytime 6 AM–8 PM 7 days, dedicated phleb, NDA on request |
| Provider monthly (org-billed) | varies | $850 / $2,125 / $4,250 / $8,500 per 10/25/50/100 patients |

### Service area

Primary: Orlando, Winter Park, Windermere, Doctor Phillips, Lake Nona, Celebration, Kissimmee, Sanford, Eustis, Clermont, Montverde, Deltona, Geneva, Tavares, Mount Dora, Leesburg, Groveland, Mascotte, Minneola, Daytona Beach, DeLand, DeBary, Orange City. **Extended-area cities add a $75 surcharge.**

### Operating hours

- **Mon–Sun: 6 AM – 6 PM ET** (last bookable slot 5:30 PM)
- Same-day cutoff: **3 PM** (booking after that gets pushed to next day)
- Lead time: **90 minutes** minimum
- Concierge tier: anytime 6 AM – 8 PM 7 days

---

## 2. Roles

| Role | Who | Day-to-day |
|---|---|---|
| **Founder / Owner** | Nicodemme "Nico" Jean-Baptiste · `info@convelabs.com` · (941) 527-9169 | Strategy, partnerships, escalations |
| **Office manager / admin (super_admin)** | Naquala (`hickmannaquala6@gmail.com`) | Inbox triage, scheduling, billing reconciliation, patient outreach, partner relationships |
| **Phlebotomist** | Field staff (currently the founder + per-visit 1099s) | Visits, specimen delivery, status updates |
| **Concierge doctor** | Provider partners | Order labs through portal, view patient roster |
| **Provider manager** | Practice staff at partner orgs (e.g. Lara at Littleton) | Upload lab orders, monitor patient self-scheduling |
| **Patient** | End user | Book, upload lab order, confirm insurance, pay |

### Auth roles + permissions (high level)

- `super_admin` / `admin` / `owner` — full access; admin features gate to `is_admin()` Postgres helper
- `office_manager` — same as admin in practice, role kept for org-managers
- `phlebotomist` — phleb dashboard + PWA only; sees their own assignments
- `concierge_doctor` / `provider` — provider dashboard for their org only
- `patient` — patient dashboard; sees their own appointments + insurance + memberships only

Owner-only surfaces (filtered by `is_platform_owner()` on email match `nicodemmebaptiste@convelabs.com`):
- Hormozi Dashboard
- Upgrades & ROI tab

---

## 3. Daily loop

### 5 AM ET (cron)
- `e2e-smoke-test-nightly` runs, SMSes owner if any FAIL

### 6 AM ET (start of business)
- First mobile draws begin
- Phleb opens PWA, swipes to today's first card, taps "On my way"

### Throughout day
- Patients book via `/book-now` (auto-confirms with deposit) or partner-uploaded lab orders text patients booking links
- Reconcile-invoice-payments cron (every 30 min): pulls Stripe payment status, marks DB
- Detect-double-bookings cron (every 15 min): scans for slot conflicts
- Realtime channels keep dashboards live: SMS bell, task badges, inbox count, activity log

### Admin's morning (08:00 ET ish)
1. Open `/dashboard/{role}/inbox` — clear the queue (insurance confirmations + new-practice comms gaps)
2. Open `Notes & Tasks` — work assigned tasks
3. Open `Calendar` — confirm today's draws are properly assigned + lab orders attached
4. Open `Patients` — handle any patient outreach needed
5. Open `Invoices` — review unpaid + dunning queue

### Phleb's morning
1. Open PWA at `/phlebotomist-app` or `/dashboard/phlebotomist`
2. Tap first card → review patient name, address, lab orders, organization chip
3. Tap **"On my way"** → patient gets SMS with ETA
4. Drive, draw, deliver to lab
5. Tap **"Specimen Delivered"** → modal opens with one row per patient (companions auto-loaded). Enter tracking ID per patient. Tap **"Confirm all delivered"** → notifications fan out per-patient-per-org

### Evening (00:00 UTC = 8 PM ET, cron)
- `appointment-reminders-night-before` — sends tomorrow's confirmation SMS + email to every patient
- `send-fasting-reminders-daily` — fasting prep notice for tomorrow's morning fasting visits

### Post-visit automation
- `process-post-visit-sequences` (cron): fires WTE email, feedback SMS, Google review request, membership upsell, results check-in (gated by quiet-hours 9 PM – 8 AM ET)
- Stripe webhook on payment → mirrors `tenant_patients.membership_tier` if membership was bundled

---

## 4. Workflows

### 4.1 Patient booking

#### Path A — direct
1. Patient lands on `/book-now`
2. Picks service type (mobile / in-office / etc.)
3. Picks date + time (slot grid; tier-aware booking window)
4. Enters address + insurance + DOB
5. Optional: uploads lab order PDF (OCR runs in background)
6. Optional: ticks **"Add VIP membership"** at checkout — sees "Today: $314 (one charge)" math
7. Stripe Checkout opens, pays
8. Webhook creates appointment, sends confirmation, fires reminder cascade

#### Path B — provider-initiated
1. Provider manager logs into provider portal
2. Clicks **"Request labs for a patient"**
3. Picks patient from roster (or types new)
4. Drops lab order PDF
5. Picks "Draw by" date
6. Hits Submit → patient gets text + email with one-tap booking link
7. Patient self-schedules via the link
8. System confirms back to provider portal in real time

#### Path C — admin manual
- Admin → Calendar → click empty slot → **"Schedule appointment"** modal → fill manually
- Override conflicts via **"Confirm anyway"** if intentional (e.g. companion bookings)

### 4.2 Lab order intake — the OCR pipeline

```
Lab order PDF uploaded
    ↓
ONE Claude Vision call (model: claude-sonnet-4-20250514) extracts:
  • full text transcription
  • panels (CMP, Lipid, etc.)
  • fasting flag
  • ordering provider name + NPI + practice name + address
  • insurance carrier + member ID + group number
    ↓
4 parallel actions:
  1. Write panels + fasting → appointment_lab_orders + parent appointment
  2. Compare insurance to tenant_patients.insurance_*
       - none → no-op
       - extracted_new (no insurance on file) → AUTO-ADD
       - match → stamp 'match', no action
       - differs → queue pending_insurance_changes
  3. discover_or_link_provider_org RPC:
       - Match practice name/zip/NPI to existing org
       - If matched: link appointment to that org
       - If new: AUTO-CREATE organizations row with discovered_from_lab_order=true
                 + SMS the owner: "🆕 New practice auto-registered..."
  4. If 3+ referrals from a discovered org with outreach_status='untouched':
       additional SMS to owner: "📈 Partnership lead..."
```

#### Where lab orders can be uploaded

| Surface | Component |
|---|---|
| Booking flow (patient) | `LabOrderUploadStep.tsx` → during `/book-now` |
| Patient dashboard (post-booking) | `LabOrderUpload.tsx` |
| Phleb PWA (in the field) | `PhlebUploadLabOrderButton.tsx` |
| Admin appointment detail | `AppointmentLabOrdersPanel.tsx` |
| Visit token page (link patient gets via SMS) | `LabOrderTokenUpload.tsx` |
| Provider portal (single + bulk) | `CreateLabRequestModal.tsx` + `LinkedPatientsSection.tsx` |

All paths converge on the same `appointment_lab_orders` table, which fires `ocr-lab-order` edge fn on insert. The legacy `appointments.lab_order_file_path` column auto-syncs via `sync_appointment_lab_order_file_path` trigger (newline-joined for safety with comma-containing filenames).

### 4.3 Phleb visit + specimen delivery

1. Phleb opens PWA, taps appointment card
2. Reviews:
   - Patient name + phone + address + DOB
   - **Organization chip** — tap to view full org details (phone, lab accounts, providers); reassign or edit inline if needed
   - Lab orders (PDFs render inline via blob: URL — works for filenames with commas/spaces too)
   - Detected panels (chips)
   - Fasting flag (if applicable)
3. Tap **"On my way"** → status: `en_route` → patient SMS fires with ETA
4. Arrive, tap **"Arrived"** → `arrived`
5. Begin draw, tap **"Begin Job"** → `in_progress`
6. Complete draw
7. Drive to lab
8. Tap **"Specimens Delivered"** → modal opens
9. **Multi-patient case** (companions linked via `family_group_id`):
   - Modal auto-loads ALL patients in the family group
   - One row per patient with own specimen ID + lab destination + tube count
   - Auto-saves every keystroke (600 ms debounce)
   - **Org chip** per row — amber "·different" badge if companion is routed to a different practice
   - Per-row **Confirm delivered** OR master **Confirm all delivered**
10. Capture geo (button) + signature pad once for the whole stop
11. Each row's confirmation:
    - Inserts `specimen_deliveries` audit row
    - Stamps appointment `specimens_delivered_at`
    - Fires `send-specimen-delivery-notification` scoped to that one `appointmentId` → patient + that patient's org get a "Your specimens have been delivered" email
12. Status → `specimen_delivered`

**HIPAA rule:** every notification is scoped server-side to one `appointment_id`, which has one `organization_id`, which has its own recipient list. Cross-companion leak is architecturally impossible.

### 4.4 Membership signup

#### Direct (from `/pricing`)
1. Patient lands on `/pricing`, sees 4 tiers (Pay-As-You-Go / Regular / VIP / Concierge)
2. Each tile shows: today's price, future visit price, break-even visits ("pays for itself in 6 visits")
3. Founding 50 counter shows "13 VIP seats left" if active
4. Tap a tier → MembershipAgreementDialog opens (28-section attorney-style v2026-04-30-v3 agreement)
5. Tick "I have read" + "I understand non-refundable after 30 days OR after using a benefit"
6. Tap **"I agree — continue to payment"**
7. **If logged out:** sessionStorage saves the signed agreement, redirects to `/signup?fromMembership=1&plan=…&redirect=/pricing`
8. Patient creates account (or logs in via the link in SignupForm)
9. Returns to `/pricing` — auto-detects pending membership in sessionStorage, fires checkout immediately, **never re-shows the agreement**
10. Stripe Checkout (subscription mode) opens
11. Pay → webhook:
    - Creates `user_memberships` row
    - Mirrors `tenant_patients.membership_tier` so perks unlock everywhere
    - Founding-50 seat claim if VIP + still under 50
    - Welcome email fires

#### Bundled at booking checkout (in `/book-now`)
1. Patient is in the booking flow, on the CheckoutStep
2. Sees the **SubscribeAtCheckoutCard** with each tier showing:
   - Today's visit price (e.g. $115 with VIP)
   - + Annual fee ($199)
   - = **Total today: $314 (one charge)**
   - Save $X this visit · Pays for itself in N visits
   - Renews May 1 next year
3. Tap a tier → agreement dialog → agree
4. Stripe Checkout opens with **two line items** (visit + membership)
5. One subscription session, one card swipe
6. Webhook creates appointment AND user_memberships row, mirrors tier

#### Post-payment perks unlock automatically
- `tenant_patients.membership_tier` is mirrored from `user_memberships`
- Booking flow re-prices every future visit at member tier (`TIER_PRICING.mobile.vip = 115`)
- Member-only booking windows unlock
- Saturday access unlocks (VIP +)
- Family add-on rate drops to $45 (VIP +)
- Reschedule fees waived
- Complimentary results retrieval

### 4.5 Organization onboarding

#### Path A — auto-discovered from lab order
1. Patient/admin uploads a lab order
2. OCR extracts ordering practice name + NPI
3. `discover_or_link_provider_org` RPC tries to match → no match → INSERTs:
   - `organizations` row with `discovered_from_lab_order=true`, `outreach_status='untouched'`
   - `org_providers` row with NPI + physician name
4. Owner gets SMS: "🆕 New practice auto-registered..."
5. Admin opens **Inbox tab** → sees the new org under "New practices — fill comms"
6. Inline-edits manager_email + contact_email + phone
7. Taps **"Save & invite manager"** → `invite-org-manager` edge fn fires:
   - Creates auth user with `user_metadata.organization_id` stamped
   - Sets `organizations.manager_email`
   - Mints magic-link via Supabase admin API
   - Sends branded onboarding email via Mailgun (single-tap "Set My Password" CTA)
8. Manager taps email link → sets password → lands on `/dashboard/provider` already authenticated with org context

#### Path B — public registration
1. Practice visits `/providers/register`
2. Fills 5 fields: practice name, contact name, contact email, contact phone, primary lab dropdown
3. Submit → INSERT `provider_partnership_inquiries` row (referral_source='self_registration')
4. Owner sees in admin → triages → calls back

#### Path C — admin manual invite
1. Admin → Inbox tab OR Provider Acquisition tab → invite-org-manager edge fn manually
2. Same magic-link flow as Path A

### 4.6 Pending insurance changes

When OCR detects insurance on a lab order that differs from `tenant_patients.insurance_*`:

1. `pending_insurance_changes` row queued (idempotent — one open row per lab order)
2. **Patient side:** next dashboard load, `PendingInsuranceModal` pops up
   - Side-by-side compare
   - Patient picks "Use new" or "Keep existing"
   - "Use new" → `resolve_my_pending_insurance` RPC writes proposed values to `tenant_patients`
   - Either action resolves the queue row → modal won't reappear for that order
3. **Admin side:** Inbox tab shows the same row
   - Can "Email reminder" (sends nudge to patient)
   - Can "Force-update chart" (admin override)
   - Can "Keep existing" / "Dismiss"

### 4.7 Tasks + notes

The activity_log table is hybrid notes + tasks:

- **Owner creates a task:** Notes & Tasks tab → "New Task" → assignee + priority + due → Send
- **Assignee sees instantly:** realtime channel pushes INSERT → toast notification → sidebar badge
- **Assignee works it:**
  - Tap "Start working" → status: open → in_progress (system entry threads)
  - Add inline notes via "Add note" reply box (parent_id threading)
  - Tap "Mark done" → status: done, auto-stamps completed_at + completed_by
- **Owner sees the entire thread inline** — every reply, every status change, every system entry threaded under the parent

---

## 5. Inbox loop

The single canvas where admin clears OCR-pipeline items requiring human touch.

`/dashboard/{role}/inbox` (sidebar item: **Inbox**)

### Section 1 — Pending insurance confirmations
Every patient with a queued mismatch. For each:
- Side-by-side: On file vs. From lab order
- Actions:
  - 📧 Email reminder (sends templated nudge)
  - Keep existing
  - ✓ Force-update (admin override; writes proposed → tenant_patients)

### Section 2 — New practices missing comms
Every `organizations` row WHERE `discovered_from_lab_order=true` AND (manager_email IS NULL OR contact_email IS NULL).
- Shows: name, NPI, referral count, outreach status, age
- Inline edit: manager_email, contact_email, phone
- Actions:
  - Dismiss (sets `outreach_status='declined'`)
  - Save (just updates the org)
  - **→ Save & invite manager** (saves AND fires `invite-org-manager` magic-link email)

Both sections live-update via realtime channels. Sidebar badge counts open items across both sections.

---

## 6. Pricing

### Member tier pricing (TIER_PRICING in `src/services/pricing/pricingService.ts`)

```
Service              | none | member | vip  | concierge
---------------------|------|--------|------|----------
mobile               | $150 |  $130  | $115 |   $99
in-office            |  $55 |   $49  |  $45 |   $39
senior               | $100 |   $85  |  $75 |   $65
specialty-kit        | $185 |  $165  | $150 |  $135
specialty-kit-genova | $200 |  $180  | $165 |  $150
therapeutic          | $200 |  $180  | $165 |  $150
additional (companion)| $75 |   $55  |  $45 |   $35
```

### Surcharges

| Surcharge | Amount |
|---|---|
| Same-day / STAT | $100 |
| Weekend | $75 |
| Extended hours | $50 |
| Extended service area | $75 |

### Partner pricing (org-billed)

| Partner | Patient pays |
|---|---|
| The Restoration Place | $125 |
| Elite Medical Concierge | $0 (org_covers $72.25) |
| NaturaMed | $85 |
| ND Wellness | $85 |
| Aristotle Education | $0 (org_covers $185) |
| The Center for Natural & Integrative Medicine | varies (default_billed_to=patient) |
| Littleton Concierge Medicine | varies (default_billed_to=patient) |
| Private Health MD (Dr. Castro) | TBD — pending partnership |

Members keep their tier discount even on partner-routed visits (lowest-wins rule).

---

## 7. Cron jobs

(All times UTC unless noted.)

| Schedule | Job | What it does |
|---|---|---|
| `0 9 * * *` (5 AM ET) | e2e-smoke-test-nightly | 8-check health audit; SMSes owner on FAIL |
| `0 0 * * *` (8 PM ET) | appointment-reminders-night-before | Tomorrow's confirmation SMS + email |
| `0 0 * * *` | send-fasting-reminders-daily | Fasting prep notice for tomorrow's morning fasts |
| `0 * * * *` (every hour) | process-appointment-reminders | Hourly reminder check |
| `*/15 * * * *` | process-invoice-reminders | Dunning cascade |
| `*/30 * * * *` | reconcile-stripe-payments | DB ↔ Stripe drift catch |
| `*/30 * * * *` | reconcile-invoice-payments | Same for invoices (filter excludes voided/completed) |
| `*/30 * * * *` | auto-heal | Health checks, owner SMS on critical drift |
| `*/15 * * * *` | detect-double-bookings | Slot conflict scan + apology cascade (manual-override aware) |
| `47 * * * *` | pricing-drift-smoke-hourly | Catches partner-org pricing drift |
| `23 * * * *` | appointment-time-drift-smoke-hourly | Catches `appointment_date` UTC vs `appointment_time` ET drift |

To view: `SELECT jobname, schedule FROM cron.job ORDER BY jobname;`

---

## 8. Edge functions

(Selected — most relevant. Full list under `supabase/functions/`.)

### Patient-facing flows
- `create-appointment-checkout` — booking → Stripe; supports `subscribeToMembership` bundle; HIPAA-aware slot validation; normalizes time format ("11:30 AM" / "11:30:00" / "11:30")
- `create-checkout-session` — direct membership purchase
- `verify-appointment-checkout` — returns to `/payment-success`, marks appointment confirmed
- `update-user-password` — friendly error mapping (same_password / weak_password / too_short)
- `send-password-reset` — Mailgun-backed reset flow

### OCR + lab orders
- `ocr-lab-order` — Claude Vision pipeline (panels + fasting + insurance + provider extraction → fan-out)
- `extract-insurance-ocr` — separate ocr for insurance-card uploads
- `sanitize-lab-order-filenames` — admin maintenance: renames storage objects with unsafe chars to safe ASCII

### Organizations
- `invite-org-manager` — creates auth user + magic-link onboarding email for a partner-practice manager
- `invite-patient` — same flow for migrated patients (tenant_patients exists, no auth.users)
- `request-provider-claim` — fires when a patient ID's a provider for the first time

### Notifications
- `send-specimen-delivery-notification` — HIPAA-scoped per-appointment fan-out (patient SMS+email + linked org email)
- `send-sms-notification` — generic SMS with HIPAA recipient verification + quiet-hours gate
- `send-email` — generic Mailgun proxy
- `send-tenant-appointment-notification` — confirmation/reminder/reschedule emails (uses `_shared/appointment-format.ts` for ET-safe time strings)
- `send-appointment-reminder` (singular) — hourly reminder check
- `send-appointment-reminders` (plural) — nightly reminder fanout
- `send-fasting-reminders` — fasting prep
- `process-post-visit-sequences` — WTE / Google review / membership upsell / results check-in cascade

### Stripe
- `stripe-webhook` — handles every event type; HORMOZI: this is the brain. Handles checkout.session.completed for visit-only, membership-only, AND bundled paths; mirrors tier; claims founding seat; fires welcome email
- `reconcile-stripe-payments` — periodic drift catch
- `reconcile-invoice-payments` — invoices specifically

### Owner ops
- `daily-owner-brief` — 5 AM ET email summary of yesterday's revenue, today's draws, KPIs
- `auto-heal` — health checks, drift alerts
- `e2e-smoke-test` — 8 health checks, SMS owner on fail
- `activity-monitor` — flags unusual error_logs activity

### Maintenance / one-shots
- `sanitize-lab-order-filenames` — fixes URL-unsafe filenames (commas, spaces)

---

## 9. Database

(Selected key tables. Full schema is in `supabase/migrations/`.)

### `appointments`
The big one. Every visit. Companions are SEPARATE rows linked by `family_group_id`. Per-row:
- `patient_name`, `patient_email`, `patient_phone`, `address`, `appointment_date` (timestamptz UTC), `appointment_time` (HH:MM:SS, ET local — canonical for clock display)
- `service_type`, `service_name`, `total_amount`, `total_price`
- `phlebotomist_id` (auth user id), `organization_id` (linked partner org), `family_group_id`, `companion_role`
- `status` (scheduled / confirmed / en_route / arrived / in_progress / specimen_delivered / completed / cancelled)
- `payment_status` (pending / completed / voided / refunded / uncollectible)
- `lab_order_file_path` (legacy comma-or-newline joined; **read** layer)
- `lab_order_panels`, `lab_order_ocr_text`, `lab_order_full_text` (mirrored from appointment_lab_orders)
- `specimen_tracking_id`, `specimen_lab_name`, `specimens_delivered_at`, `delivery_location`, `delivery_signature_path`
- `pricing_breakdown` JSONB (full cart at checkout)
- ~80 columns total — full picture of every visit

### `tenant_patients`
Patient master. Per row:
- `first_name`, `last_name`, `email`, `phone`, `date_of_birth`, `address`, `city`, `state`, `zipcode`
- `insurance_provider`, `insurance_member_id`, `insurance_group_number`, `insurance_card_path`
- `membership_tier` (none / member / vip / concierge), `membership_status`, `membership_start_date`, `membership_end_date`, `membership_plan_id`
- `organization_id` (FK to organizations — patient's preferred provider)
- `lab_reminder_cadence_days`, `lab_reminder_deadline_at`, `overdue_flagged_at`
- `tenant_id` (multi-tenant root), `user_id` (auth user, may be null for migrated)
- UTM attribution columns

### `appointment_lab_orders`
Normalized lab order table. Per upload:
- `appointment_id`, `file_path` (storage key), `original_filename`, `content_sha256`, `file_size_bytes`, `mime_type`, `page_count`
- `ocr_status` (pending / running / complete / failed / skipped), `ocr_completed_at`, `ocr_detected_panels`, `ocr_full_text`, `ocr_fasting_required`, `ocr_error`
- `ocr_insurance_provider`, `ocr_insurance_member_id`, `ocr_insurance_group_number`, `insurance_match_status`
- `org_match_status` (matched / auto_created / unmatched), `org_match_reason`, `org_match_organization_id`
- `uploaded_by` (auth user), `uploaded_at`, `deleted_at`

Trigger: `sync_appointment_lab_order_file_path` keeps `appointments.lab_order_file_path` as a newline-joined list of active file_paths.

### `organizations`
Partner practices.
- `name`, `contact_email`, `contact_phone`, `manager_email`, `front_desk_email`, `fax`
- `npi`, `address_*`, `hours_of_operation` JSONB, `lab_accounts` JSONB
- `default_billed_to` ('patient' / 'org')
- `org_invoice_price_cents`, `subscription_tier`, `subscription_status`, `seat_cap`
- `discovered_from_lab_order` (bool), `discovered_ocr_sample`, `referral_count`, `outreach_status`, `outreach_note`, `outreached_at`, `first_discovered_at`, `last_referral_at`

### `org_providers`
Multi-doctor support per org. Per row: `organization_id`, `full_name`, `npi`, `email`, `phone`, `active`.

### `user_memberships`
Active memberships.
- `user_id`, `plan_id`, `stripe_customer_id`, `stripe_subscription_id`, `billing_frequency`, `credits_remaining`, `credits_allocated_annual`, `next_renewal`
- `is_primary_member`, `founding_member`, `founding_member_signup_date`, `founding_member_number`, `founding_locked_rate_cents`
- `is_supernova_member`, `bonus_credits`, `promotion_locked_price`

### `membership_plans`
- Regular / VIP / Concierge / Family / Individual / Individual+1 / Essential Care
- `monthly_price`, `quarterly_price`, `annual_price` (cents), `credits_per_year`, `is_concierge_plan`, `stripe_*_price_id`

### `membership_agreements`
Audit trail of every signed agreement.
- `user_id`, `plan_name`, `agreement_version` (e.g. `2026-04-30-v3`), `agreement_text_sha256`, `user_agent`, `ip_address`, `accepted_at`
- `user_membership_id` (linked after webhook fires), `stripe_subscription_id`, `stripe_checkout_session_id`

### `pending_insurance_changes`
OCR-detected insurance mismatches awaiting patient confirmation.
- `appointment_lab_order_id`, `appointment_id`, `tenant_patient_id`
- `current_*` (snapshot of stored), `proposed_*` (extracted from OCR)
- `status` (open / accepted_new / kept_existing / admin_reviewed / dismissed), `resolved_at`, `resolved_by`

### `pending_membership_followup_sms`
One-shot SMS to fire when a specific patient's membership lands.
- `user_id`, `to_phone`, `patient_name`, `message`, `fired_at`, `twilio_sid`

### `activity_log`
Hybrid notes + tasks.
- `appointment_id`, `patient_id`, `staff_id`, `assigned_to_user_id`
- `activity_type`, `description`, `metadata`
- `task_status`, `task_priority`, `task_due_at`, `task_completed_at`, `task_completed_by`
- `parent_id` (thread reply chain)

### `specimen_deliveries`
Per-delivery audit row inserted alongside the appointment-row update.
- `appointment_id`, `patient_id`, `specimen_id`, `lab_name`, `delivered_at`, `delivered_by`, etc.

### Storage buckets
- `lab-orders` — public, holds all uploaded requisitions. **Filenames must be ASCII-safe (no commas, spaces, parens)** — use `sanitize-lab-order-filenames` if any sneak through
- `specimen-signatures` — phleb signature pad output
- `chat-attachments` — admin chatbot context

---

## 10. HIPAA + compliance

### What we ARE
- HIPAA Covered Entity (specimen collection + transport)

### What we ARE NOT
- Telehealth / urgent-care / medical-advice provider
- Clinical lab (we deliver to one, but never run analyses)

### Records retention
- 6 years minimum on lab requisitions, appointment records, payment records, signed agreements, audit trails (per 45 CFR § 164.530(j)(2))
- Records destruction post-retention via HIPAA-compliant disposal

### Patient rights
- Access requests fulfilled within 30 days (`hello@convelabs.com` → admin)
- Right to know what's stored, who saw it, and to challenge inaccuracies

### Data flows
- All PHI encrypted in transit (HTTPS) and at rest (Supabase managed Postgres + S3 storage)
- RLS on every table — users see only their own rows; admins see everything
- Phlebs see their own assignments + the day's patients only
- Quiet-hours gate (9 PM – 8 AM ET) prevents non-emergency PHI texts
- HIPAA recipient verification on every SMS — phone-to-patient name match required, recipients flagged "unknown" are blocked

### Insurance / billing
- Membership is a SERVICE PLAN, not insurance. Does NOT cover Performing Lab charges, clinician visits, prescriptions, or medical complications.

### Membership Agreement (current version: v2026-04-30-v3, in `MembershipAgreementDialog.tsx`)
28 sections: Term, Auto-Renewal, Billing, **Refund Policy (no refund if benefit used in 30-day window)**, Cancellation, Founding Rate-Lock, Concierge Promise, HIPAA, No Medical Advice, Phleb Safety Disclosure, Limitation of Liability, Indemnification, Binding Arbitration + Class-Action Waiver + 30-day Opt-Out, Florida Governing Law, Force Majeure, E-SIGN consent, Assignment, Severability/Entire Agreement/Amendment, Contact, Telehealth Limitations, Chain of Custody, Mutual NDA option (concierge), Records Retention, No Insurance Coverage, Referral Credits, Publicity/Testimonial license, IP/Acceptable Use/DMCA, Acceptance.

**Strong recommendation: have a Florida health-care attorney review Sections 3.2, 10, 11, 12, 13, 21 before next major rollout.**

---

## 11. Bug-fix journal — 2026-04-30 → 2026-05-01

A 30+ commit sprint that hardened the system across booking, OCR, lab orders, memberships, organizations, phleb workflow, and admin tooling. Each entry is one diagnosed bug + the fix (commit hash) so future you can `git log` the fix when symptoms recur.

| # | Symptom (what user reported) | Root cause | Commit | Fix |
|---|---|---|---|---|
| 1 | "Patients can't register for membership" | `/join?tier=vip` route never declared; React Router fell through to 404 | `0d3283e` | New `/join` route with `JoinTier.tsx` — reads tier+email query, calls `create-checkout-session`, redirects to Stripe |
| 2 | Password reset shows generic "failed" on reused password | Supabase auth error "different from old" was getting swallowed by FunctionsHttpError | `aa437c1` | Edge fn maps known errors (same_password / weak_password / too_short) → friendly text, returns 200 |
| 3 | After password reset, redirect to dashboard fails | recovery session unreliable post `admin.updateUserById` | `aa437c1` | After update, signOut() + signInWithPassword() with new password → guaranteed fresh session |
| 4 | Notes section vanishes for new orgs (no patients yet) | `if (patients.length === 0) return null;` hid the entire section | `76a2182` | Empty state with "Add your first patient" CTA |
| 5 | Roster patients added via AddPatientModal don't show up | `tenant_patients.organization_id` column didn't exist | `76a2182` | Added column + index, backfill from latest appointment org, get_org_linked_patients UNIONs roster + appts |
| 6 | Provider has to retype patient name on every lab request | No roster picker on `CreateLabRequestModal` | `b5fa5db` | Added "Pick from roster" inline list with one-tap auto-fill |
| 7 | "owner is overriding intentional pairs but the conflict detector keeps nagging" | manual-override branch missing | `d585925` | Skip token-creation when both sides booking_source=manual |
| 8 | Lab orders uploaded by staff don't show on phleb PWA | Staff used new appointment_lab_orders table; readers still reading legacy lab_order_file_path | `0c15a22` | Trigger keeps legacy column auto-synced from normalized table |
| 9 | Silent ghost uploads (file picked but never landed) | No telemetry | `4b4344d` | Owner SMS on every silent upload failure (storage_upload, db_insert, exception, oversize, unsupported_type) |
| 10 | OCR has been silently failing for 24h | Anthropic deprecated `claude-3-5-sonnet-20241022` | `a4577a5` | Swap to `claude-sonnet-4-20250514` (verified active on this API key tier) |
| 11 | Lawrence Carpenter got "1 PM" reminder for 9 AM appointment | Hourly reminder fn used `appointment_date.toLocaleTimeString` without timeZone option — UTC stamp 13:00 = 9 AM ET rendered as "1 PM" | `ed13abf` `edd0398` | Use `appointment_time` for clock string + `timeZone:'America/New_York'`; new shared `formatApptForPatient()` helper |
| 12 | Reconciler logs spam every 30 min | Filter only excluded `payment_status='completed'`; voided rows looped | `c268638` | Widened filter to all terminal states; only log when actually marked paid |
| 13 | "Creating Account..." spinner spins forever | Pre-flight tenant_patients lookup hangs under anon RLS edge cases; no signup timeout | `4576c18` | Lazy-load existing-patient check; 30 s Promise.race timeout on signup |
| 14 | Lynn Whipple stuck — migrated patient can't sign up | tenant_patients exists but no auth.users row | `36779e7` | New `invite-patient` edge fn → magic-link onboarding for migrated patients |
| 15 | After Lynn pays, manual outreach needed | No automated post-payment booking-link nudge | `d001b5e` | `pending_membership_followup_sms` table + AFTER INSERT trigger on user_memberships |
| 16 | Notes Tab is a flat journal — can't assign tasks to admin | activity_log had no assignment columns | `470c318` | Added assigned_to_user_id, task_status, task_priority, task_due_at, parent_id; threaded reply UI; realtime |
| 17 | Admin doesn't see new tasks unless on Notes tab | No global indicator | `7f0c16d` | Sidebar live "Notes & Tasks (N)" badge with realtime channel |
| 18 | Patients don't see exact total at checkout | Math implicit | `8a4e5c2` | "What you'll pay today" panel — visit + membership = total + break-even visits |
| 19 | E2E test caught silent slot-availability failures | `appointmentTime` "11:30:00" 24-hour didn't match grid's "11:30 AM" 12-hour | `f806da3` | `normalizeSlotTime()` accepts any format; nightly e2e-smoke-test cron flags FAILS to owner |
| 20 | Mary Rienzi's 3 lab orders show as 1 | Booking-flow uploader only persisted first file path | `a2fcc36` | Trigger uses newline delimiter (filenames can have commas — Mary's "Rienzi, Mary Ellen.pdf"); 3 readers split on `\n` first |
| 21 | "Object not found 404" on Mary's lab orders | Supabase JS getPublicUrl/download don't encode commas | `497db17` `63d5684` | Manual `publicStorageUrl(bucket, path)` helper with per-segment `encodeURIComponent` |
| 22 | Some files STILL 404 even with manual encoding | Storage CDN inconsistent on commas/spaces | `6d70448` | `sanitize-lab-order-filenames` edge fn renames blobs to safe ASCII; idempotent maintenance command |
| 23 | Lara at Littleton needs portal access | No invite path for org managers | `8523c4c` | `invite-org-manager` edge fn — creates auth user + stamps user_metadata.organization_id + sets org.manager_email + sends magic link |
| 24 | Phleb can't manage org context in field | No org tab on phleb cards | `1940f0a` | `AssignOrgButton` View/Assign/Edit on every appointment card (PWA + dashboard) |
| 25 | Phleb can't enter specimen IDs for companions | Modal only handled one appointmentId | `8dadff2` | Multi-row modal with auto-save (600 ms debounce) and per-row HIPAA-safe notification routing |
| 26 | Insurance info on lab orders ignored | OCR didn't extract it | `9814392` | Claude prompt extracts insurance + queues confirm modal on patient dashboard; auto-add when nothing on file |
| 27 | New auto-discovered orgs sit without comms metadata | No first-detection alert | `9814392` | Owner SMS fires on every `auto_created` event |
| 28 | Admin doesn't have a single place to clear OCR queue | No unified inbox | `76e58f0` | Single Inbox tab — pending insurance + new-practice metadata gaps; sidebar live badge |

---

## 12. Common issues + resolutions

### "Patient can't log in"
1. Check `auth.users` for their email — `SELECT id, email FROM auth.users WHERE LOWER(email) = '...'`
2. If no row but `tenant_patients` row exists → migrated patient. Run `invite-patient` edge fn:
   ```sql
   SELECT net.http_post(
     url := '.../functions/v1/invite-patient',
     headers := jsonb_build_object('Authorization','Bearer <anon>'),
     body := jsonb_build_object('email', '<email>', 'redirectTo', '/dashboard')
   );
   ```
3. If both exist → password reset via `/forgot-password` (Mailgun-backed)

### "Lab order uploaded but phleb can't open it"
1. Check filename for commas/spaces/parens — these break the storage CDN
2. Run `sanitize-lab-order-filenames` for that appointment:
   ```sql
   SELECT net.http_post(
     url := '.../functions/v1/sanitize-lab-order-filenames',
     body := jsonb_build_object('appointmentId', '<uuid>')
   );
   ```
3. Trigger re-broadcasts the new safe paths to `lab_order_file_path` automatically

### "Reminder said wrong time"
1. Verify `appointment_time` column has the correct ET local time (e.g. `09:00:00`)
2. The reminder fn ALWAYS prefers `appointment_time` over `appointment_date.toLocaleTimeString` — if it's wrong, the data is wrong
3. Check the drift smoke: `SELECT * FROM appointments WHERE EXTRACT(HOUR FROM appointment_date AT TIME ZONE 'America/New_York') != EXTRACT(HOUR FROM appointment_time)` — heal via the script in commit `a4577a5`'s migration

### "Specimen tracking ID for companion not saving"
- Scope check: is the modal showing all companions in the family group? If only one, hard-refresh the PWA (commit `8dadff2`)
- Auto-save fires on 600 ms debounce — give it a moment before navigating away

### "Stripe payment succeeded but membership not active"
1. Check `user_memberships` for the `stripe_subscription_id`
2. If missing, the webhook didn't fire. Check Stripe dashboard → Developers → Webhooks → recent deliveries
3. Manual recovery: re-fire from Stripe dashboard. Or insert manually + run `claim_founding_seat` RPC

### "OCR returns 'unmatched' for an org that should match"
1. Check the OCR'd text — is the practice name actually visible? `SELECT ocr_full_text FROM appointment_lab_orders WHERE id = '<uuid>'`
2. Check `discover_or_link_provider_org` log: was alias mapping triggered? Add new physician → practice mapping in `PRACTICE_ALIAS_MAP` if needed

### "Reconciler is spamming error_logs"
- Already fixed (commit `c268638`). If it returns, check `reconcile-invoice-payments` query filter — should exclude `payment_status IN ('completed','voided','void','refunded','uncollectible')`

### "Cron job didn't run"
1. `SELECT jobname, schedule FROM cron.job` — confirm job is registered
2. `SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='...') ORDER BY start_time DESC LIMIT 5`
3. Check edge function logs for the specific call

---

## 13. Onboarding a new hire (Day 1 checklist)

For a new admin / office manager:

### Day 1
- [ ] Owner creates auth user via `invite-org-manager` (if joining a partner) or via Admin → Staff
- [ ] New hire logs in, sets password
- [ ] Walk through the 4 daily tabs: Calendar, Inbox, Notes & Tasks, Patients
- [ ] Watch one phleb visit through the system from the calendar side
- [ ] Read this runbook end-to-end (~45 min)

### Day 2
- [ ] Clear the Inbox (real, not a drill)
- [ ] Process at least 3 patient lookups via "Patients" tab
- [ ] Send 1 invoice manually
- [ ] Cancel + reschedule 1 test appointment

### Day 3
- [ ] Handle a real partner-practice email (e.g. "we want to refer 5 patients this month")
- [ ] Use `invite-org-manager` to onboard a new practice manager
- [ ] Edit an org's lab accounts via the Inbox or Organizations tab

### Week 1
- [ ] Cover 1 phleb's morning solo (admin-only, no field shadowing)
- [ ] Handle 1 disputed payment / refund request
- [ ] Run the e2e-smoke-test manually + read the output

### Month 1
- [ ] Take 1 weekend with no founder backup (test the playbook)

### Reading checklist
- [ ] This file (top to bottom)
- [ ] `MembershipAgreementDialog.tsx` lines 39+ (full member agreement v3)
- [ ] `ConveLabs Pricing` (this file, Section 6)
- [ ] `For Providers` page on the live site
- [ ] At least 3 SOP entries in the `Documentation` admin tab

---

## 14. Hand-off checklist — for an acquirer or new owner

If you're buying or inheriting ConveLabs, here's your verification list:

### Code + repo
- [ ] Repo: `github.com/Nicodemus941/convelabs-website` (request transfer)
- [ ] All edge functions in `supabase/functions/`
- [ ] All migrations in `supabase/migrations/` — apply order is filename-sorted
- [ ] CI/CD: Vercel auto-deploys from `main`. No manual build steps
- [ ] Environment variables: see `.env.example` (NOT in repo for security)

### Live infrastructure
- [ ] Supabase project `yluyonhrxxtyuiyrdixl` — admin/billing/usage
- [ ] Vercel project `convelabs-website` — admin/billing/domains
- [ ] Stripe account — connected accounts, products, webhooks
- [ ] Mailgun domain `mg.convelabs.com` — DKIM/SPF/DMARC verified
- [ ] Twilio account — phone number `+14074104939`, A2P 10DLC registration
- [ ] Anthropic API account — model access tier verified for `claude-sonnet-4-20250514`

### Data audit (run these)
```sql
-- Active appointments next 30 days
SELECT count(*) FROM appointments
WHERE appointment_date BETWEEN now() AND now() + interval '30 days'
  AND status NOT IN ('cancelled');

-- Active members + revenue run-rate
SELECT mp.name,
       count(*) as members,
       sum(mp.annual_price)/100 as gross_arr_dollars
FROM user_memberships um
JOIN membership_plans mp ON mp.id = um.plan_id
GROUP BY mp.name;

-- Org partnerships + activity
SELECT name, referral_count, outreach_status, last_referral_at
FROM organizations
ORDER BY referral_count DESC NULLS LAST
LIMIT 20;

-- Cron health
SELECT jobname, schedule FROM cron.job;

-- Recent errors (anything to fix on day 1?)
SELECT count(*) FROM error_logs WHERE created_at > now() - interval '7 days';

-- Open queues
SELECT 'pending_insurance' as q, count(*) FROM pending_insurance_changes WHERE status='open'
UNION ALL
SELECT 'discovered_orgs_missing_comms', count(*) FROM organizations
  WHERE discovered_from_lab_order=true AND (manager_email IS NULL OR contact_email IS NULL);
```

### Compliance + legal
- [ ] Florida health-care attorney review of Membership Agreement v3 (Sections 3.2, 10, 11, 12, 13, 21 specifically)
- [ ] HIPAA Business Associate Agreement with Supabase signed
- [ ] HIPAA BAA with Mailgun signed
- [ ] HIPAA BAA with Twilio signed
- [ ] Anthropic data-processing addendum confirmed
- [ ] FL DOH phlebotomy registration current
- [ ] FL Sales & Use Tax registration current
- [ ] LLC in good standing (verify on FL Sunbiz)

### People / vendors
- [ ] Per-visit phleb 1099 contracts signed
- [ ] Lab handoff agreements (if any) with Quest, LabCorp, AdventHealth, etc.
- [ ] Office address (if any) lease + utilities

### Operational handover
- [ ] 30-day shadow period — current owner stays available for questions via `info@convelabs.com`
- [ ] Membership renewal calendar (see `user_memberships.next_renewal`) — known annual revenue events
- [ ] Patient roster (~455+ tenant_patients) inherited
- [ ] Active partnerships (Littleton, CNIM, NaturaMed, ND Wellness, Restoration Place, Elite Medical Concierge, Aristotle Education) — make introduction calls
- [ ] Domain `convelabs.com` + email aliases (`info@`, `noreply@`, `dmca@`) transferred

### Hormozi rule for the buyer
> **Do nothing for 30 days.** Read this runbook, watch the system run, clear the Inbox daily, do a phleb ride-along once, talk to the manager. Don't change a thing for the first month. The system has been hardened through 30+ live bug fixes — most operational mistakes have already been made and codified into guards. Touching it before you understand it loses you money.

After 30 days, the next moves (in order of expected ROI):
1. Hire the second salaried phleb when 100+ visits/mo for 2 consecutive months (Hormozi master plan, Level 1 unlock)
2. Cohort LTV by acquisition channel — find the channel doubling the rest, double down
3. Content factory (founder voice on 3 platforms, 3× per week) — compounding asset
4. Partner registry → API for embedded booking — turns ConveLabs into a platform

---

## Maintenance

This file is the source of truth. **When you ship a meaningful change, update this file in the same commit.** No exceptions. If you can't update it, you don't understand the change well enough yet.

For minor changes, update the relevant section. For major changes (new revenue stream, new compliance requirement, new vertical), bump the version line below and add a changelog entry.

**Version:** 2026-05-01 · **Maintainer:** Nicodemme "Nico" Jean-Baptiste · `info@convelabs.com`
