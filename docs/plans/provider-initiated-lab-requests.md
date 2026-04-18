# Provider-Initiated Lab Requests — Hormozi Structure

*The "my doctor told me to get this done" workflow. Provider requests →
patient gets a personalized booking link → appointment auto-propagates
back to the provider's dashboard with real-time status.*

---

## Why Hormozi would bet on this

**This is a Grand Slam Offer move that compounds in three directions:**

1. **Value to the provider** — they delegate the scheduling chase to us for free. Every office in the country loses 30–60 min per patient to "did you get your labs drawn yet?" phone tag. Removing that pain is a ~$50/hour gift per patient per ordered draw. At 20 patients/month a mid-size practice reclaims 10–20 hours of admin labor. **That's the offer anchor — they'd happily pay for this alone.**

2. **Value to the patient** — white-glove experience. Their doctor's office sends them a personalized link already filled with everything. They click, pick a time, they're done. Zero forms. Zero "what lab did she order again?"

3. **Value to us (the flywheel)** — every provider-initiated request creates:
   - A new patient record (LTV play — they'll book again without the provider chasing)
   - A new patient *account* opt-in (grows our list)
   - A locked-in appointment at our pricing
   - A visible "your doctor trusts ConveLabs" social proof moment
   - Data signal (we now know this doctor refers volume X per month — weights them for loyalty programs)

**Hormozi's law #7: every flow that eliminates a minute of friction for the
customer creates an hour of loyalty.** This flow eliminates 30 min per
patient for the provider AND 20 min of "finding the lab" friction for the
patient. Both sides will tell other providers/patients about it.

---

## The Flow (end-to-end, every touch)

### Step 1 — Provider creates a lab request (in their dashboard)

Primary CTA on provider dashboard — **"Request labs for a patient"**
(sits next to "Schedule a new visit"). Click → modal:

```
 ┌─ Request labs ────────────────────────────────────────┐
 │                                                       │
 │  PATIENT                                              │
 │  Name: [ Jane Smith                               ]  │
 │  Email: [ jane@gmail.com         ]  or             │
 │  Phone: [ 407-555-0123            ]  (at least one)  │
 │                                                       │
 │  THE ORDER                                            │
 │  Upload lab order: [📄 Choose file or drop here]     │
 │  ↳ on upload, ConveLabs OCR reads it and pre-fills   │
 │    the "detected panels" chips + fasting/urine flag  │
 │                                                       │
 │  TIMING                                               │
 │  Draw no later than: [ 2026-05-01 ]  (required)      │
 │  Her next visit with you: [ 2026-05-06 ] (optional)  │
 │                                                       │
 │  NOTES (optional)                                     │
 │  [                                                ]  │
 │  [ e.g. 'fasting 12hrs required' or 'first-time    │
 │    collection — she's nervous, be gentle'        ]  │
 │                                                       │
 │  [ Cancel ]              [ Send request to patient ] │
 └───────────────────────────────────────────────────────┘
```

On submit:
- Row inserted into `patient_lab_requests` with `access_token` (random UUID,
  expires in 14 days)
- ConveLabs OCR runs against the upload, stores detected panels + fasting flag
- Patient notification fires (email + SMS if phone present)
- Provider sees a toast: *"Request sent to Jane · we'll notify you when she books"*

### Step 2 — Patient notification (the magic moment)

**Email** (HTML — nice, personal):

> Subject: *"Dr. Sher ordered your bloodwork — 2 minutes to book"*
>
> Hi Jane,
>
> **Dr. Monica Sher at Elite Medical Concierge** requested bloodwork for you. She needs the results before your next visit with her on **Tue, May 6**.
>
> **Draw deadline: Fri, May 1** (so results are in her hands before your consult).
>
> [📅 Book my draw in 90 seconds →]  (big red button)
>
> — The panels she ordered —
> Lipid, CMP, TSH, HbA1c, Vitamin D
> ⚠️ Fasting required (12 hrs water only)
>
> We come to you. Or we offer an in-office visit in Maitland. Whichever you prefer.

**SMS** (same substance, 160 chars):

> *"ConveLabs: Dr. Sher at Elite Medical ordered your bloodwork by Fri May 1 (before your May 6 consult). Book in 90 sec: convelabs.com/lab/ABC123"*

Both include the same one-time-use `access_token` link.

### Step 3 — Patient lands on `/lab-request/:token`

Custom page — different from `/book-now` because the patient is in a
specific context:

```
 ┌───────────────────────────────────────────────────────┐
 │  [ConveLabs logo]                                     │
 │                                                       │
 │  Hi Jane 👋                                            │
 │                                                       │
 │  Dr. Monica Sher at Elite Medical Concierge           │
 │  ordered bloodwork for you.                           │
 │                                                       │
 │  ┌─ Urgency banner (color shifts with days left) ─┐  │
 │  │ 🟡 4 days left                                  │  │
 │  │ Draw by Fri, May 1 · your consult is May 6     │  │
 │  └─────────────────────────────────────────────────┘  │
 │                                                       │
 │  What she ordered:                                    │
 │  [Lipid] [CMP] [TSH] [HbA1c] [Vitamin D]             │
 │  ⚠️ Fasting required · 12 hrs water only              │
 │                                                       │
 │  Where would you like your blood drawn?              │
 │  ┌─ Choose one ────────────────────────────────────┐ │
 │  │ 🏡 At my home/office (mobile)    — $150         │ │
 │  │ 🏥 At ConveLabs Maitland office  — $55          │ │
 │  └─────────────────────────────────────────────────┘ │
 │                                                       │
 │  [ Pick a time → ]                                   │
 │                                                       │
 │  ─────────────────                                    │
 │  Already have a ConveLabs account? [Sign in]         │
 │  New? Creating one is one click at the end.          │
 └───────────────────────────────────────────────────────┘
```

**UX decisions:**
- **Service choice upfront** (not after time selection) — Elite Medical is
  concierge, so many of their patients want mobile. But choice is theirs.
- **Urgency banner is visual + shifts color** based on days-to-deadline:
  - 🟢 > 7 days: "Plenty of time"
  - 🟡 3–7 days: "4 days left" (like the above)
  - 🔴 < 3 days: "URGENT — only 2 days left to meet the deadline"
- **OCR output shown as chips** — they see what panels before committing
- **Fasting warning inline** — they don't miss it when they go to book
- **Pricing per org rules** — if the org's `default_billed_to = 'org'`, the
  dollar amounts are replaced with *"Your visit — covered by Elite Medical"*

After time picked → confirmation step:
- Insurance card upload (pre-prompts them)
- Final confirm with deadline, time, service, cost
- **Create account** prompt (Hormozi flywheel anchor):
  > "Create a ConveLabs account? Next time you need labs it's one click.
  >  Also unlocks membership pricing — saves $15+ on this visit."
  > [Create account] (primary) [Skip — book as guest] (secondary)

On submit:
- Appointment created with `lab_request_id` foreign key
- `patient_lab_requests.appointment_id` and `patient_scheduled_at` stamped
- Provider notified (email + dashboard badge refresh)
- Patient gets normal confirmation email + SMS

### Step 4 — Provider gets notified (dashboard update)

In real time (via supabase realtime or poll):
- Badge on provider dashboard's "Lab requests" section: "1 new"
- Email to provider's account: *"Jane Smith just scheduled her draw for Thu May 2 at 8am."*
- If enabled in notification preferences: SMS to provider too

Lab request row moves from "Pending" → "Scheduled" visually.

### Step 5 — Provider sees real-time status

On the provider dashboard's Lab Requests section, each row shows the live
state of the linked appointment:

| State | Visual | What it means |
|---|---|---|
| `pending_schedule` | ⏳ yellow | Patient hasn't booked yet |
| `scheduled` | 📅 blue | Patient booked, date visible |
| `in_progress` | 🧑‍⚕️ amber | Phleb en route |
| `collected` | 🧪 purple | Blood drawn; specimen ID visible |
| `specimen_delivered` | 📦 cyan | Delivered to reference lab + tracking ID |
| `resulted` | ✅ green | Results in; link to view |
| `expired` | 🔴 red | Patient didn't book by deadline — auto-reminded twice |

Each row clickable → drawer/modal with full detail (times, addresses,
tracking IDs, specimen delivery logs, downloadable lab order, recollection
policy link).

### Step 6 — Phlebotomist perspective

The uploaded lab order flows through:
- `patient_lab_requests.lab_order_file_path`
- → `appointments.lab_order_file_path` (copied on schedule)
- → Phleb's appointment card already renders this field

Phleb sees:
- The lab order PDF inline (already built in Sprint 3)
- OCR-detected panels as chips
- Fasting/urine prep requirements banner
- "Requested by: Dr. Sher @ Elite Medical Concierge · follow-up May 6"

Plus we'll add a small badge: **"Provider-initiated"** so phleb knows this
is a delegated booking (handling may differ — don't ask patient to re-sign
consent, for example).

---

## Schema

```sql
CREATE TABLE patient_lab_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  created_by uuid REFERENCES auth.users(id),

  -- Patient identity
  patient_name text NOT NULL,
  patient_email text,
  patient_phone text,
  -- collision guard: same trigger as tenant_patients — can't be an org login

  -- The order
  lab_order_file_path text,
  lab_order_panels jsonb DEFAULT '[]'::jsonb,
  lab_order_full_text text, -- OCR full text for search/audit
  fasting_required boolean DEFAULT false,
  urine_required boolean DEFAULT false,
  gtt_required boolean DEFAULT false,

  -- Timing
  draw_by_date date NOT NULL,
  next_doctor_appt_date date,
  next_doctor_appt_notes text,

  -- Provider notes
  admin_notes text,

  -- Token for the patient-facing page
  access_token text UNIQUE NOT NULL,
  access_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),

  -- State machine
  status text NOT NULL DEFAULT 'pending_schedule'
    CHECK (status IN ('pending_schedule', 'scheduled', 'completed', 'cancelled', 'expired')),

  -- Linked appointment (once patient books)
  appointment_id uuid REFERENCES appointments(id),

  -- Audit
  patient_notified_at timestamptz,
  patient_reminded_at timestamptz,
  patient_reminder_count int DEFAULT 0,
  patient_scheduled_at timestamptz,
  provider_notified_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_lab_requests_org ON patient_lab_requests(organization_id, status);
CREATE INDEX idx_lab_requests_token ON patient_lab_requests(access_token) WHERE status = 'pending_schedule';
CREATE INDEX idx_lab_requests_appointment ON patient_lab_requests(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_lab_requests_draw_by ON patient_lab_requests(draw_by_date) WHERE status = 'pending_schedule';

-- Append to appointments
ALTER TABLE appointments ADD COLUMN lab_request_id uuid REFERENCES patient_lab_requests(id);

-- RLS
ALTER TABLE patient_lab_requests ENABLE ROW LEVEL SECURITY;
-- Providers can CRUD their own org's requests (via service-role edge fns)
-- Patients can read a row only by matching access_token (edge fn checks)
```

---

## Edge Functions

1. **`create-lab-request`** — provider submits form
   - Verify caller is `provider` + belongs to `organization_id`
   - Upload lab order to storage
   - OCR via existing `ocr-lab-order` fn
   - Insert row with generated `access_token`
   - Send patient email (Mailgun) + SMS (Twilio) if phone
   - Stamp `patient_notified_at`

2. **`get-lab-request`** — patient hits `/lab-request/:token`
   - Validates token + expiry
   - Returns org info (name, phone, masking rules), patient info, OCR panels, dates
   - Does NOT return internal admin_notes (org-internal)

3. **`schedule-lab-request`** — patient submits booking
   - Validates token
   - Creates appointment with `lab_request_id` foreign key + copied `lab_order_file_path`, `lab_order_panels`, etc.
   - Runs through the normal billing rules (`org_covers` → patient pays $0, etc.)
   - Updates lab_request row status → 'scheduled', stamps `patient_scheduled_at`
   - Notifies the provider who created it (email + dashboard badge)
   - Optionally creates a patient account if they checked the "create account" box

4. **`remind-lab-request-patients`** — nightly cron
   - Finds `patient_lab_requests` where status = 'pending_schedule' AND draw_by_date within 3 days AND last_reminder > 24hrs ago
   - Sends a second reminder email + SMS with URGENT framing
   - Max 3 reminders total
   - After expired: stamps status='expired', emails the provider

5. **`notify-provider-of-schedule`** — called by schedule-lab-request
   - Sends email to provider contact + any team members with notification prefs enabled
   - Inserts into existing dashboard notifications table (if we have one)

---

## Information Architecture (provider dashboard changes)

Two new sections in `ProviderDashboard`:

### Section: "Request labs for a patient" (above-the-fold, next to Schedule)
- Second primary button, equal visual weight to "Schedule a visit"
- Click → modal described in Step 1

### Section: "Lab requests" (new section in the middle of dashboard)
- Tabs: **Pending** (N) · **Scheduled** (N) · **Completed** (N) · **Expired** (N)
- Pending shows: patient name · draw-by date · days-until (colored) · "Resend" button · "Cancel" button
- Scheduled shows: patient name · scheduled date/time · status pill · "View appointment" link
- Completed shows: patient name · completion date · specimen tracking ID · results link (when ready)
- Expired shows: patient name · draw-by date · "Resend with new deadline" button

Bonus row action: hover a row to reveal a "Copy patient link" button that
puts the one-time URL on clipboard — useful if the patient says "I didn't
get the email."

---

## Nice-to-Haves (Level-2 shipments)

### Provider-side
- **Reminder cadence config** — let the provider choose 1, 2, or 3 reminder
  attempts before auto-expiry (default: 3)
- **Custom notification copy** — provider can write a personal note that
  appears in the patient notification ("Hi Jane, don't forget your 12hr fast…")
- **Bulk lab requests** — upload CSV of 20 patients → creates 20 requests
  in one action
- **Request template library** — save "AM cortisol draw by 9am + fasting"
  as a template, reuse per patient
- **Reminder on doctor's appointment day** — SMS to provider: "Jane's
  results arrived yesterday — results link: X"
- **Auto-cancel logic** — if draw_by_date passes without booking, and
  next_doctor_appt is also past, auto-cancel and notify

### Patient-side
- **SMS-only booking** — patient can reply to the SMS with 1-3 (pre-offered
  time slots) and book without opening a browser. Twilio-first UX.
- **Apple/Google Pay integration** for patient-pay visits (faster checkout)
- **Pre-visit reminders** — 24h and 2h before appointment via SMS
- **"Reschedule" link embedded** in confirmation for patient flexibility

### Data / system
- **Realtime dashboard updates** via Supabase Realtime on
  `patient_lab_requests` + `appointments` — provider sees status change
  without refresh
- **Provider weekly digest email** — "This week: 12 lab requests sent,
  9 scheduled, 2 expired. Here's what to follow up on."
- **Analytics on provider dashboard** — "Request → schedule conversion:
  85% · avg time to schedule: 4 hrs 20 min"
- **Patient-account-adoption funnel** — track % of lab-request patients
  who create ConveLabs accounts (Hormozi LTV signal)

### Compliance / trust
- **HIPAA-compliant audit trail** on every lab_request state change — who,
  when, what
- **E-consent embedded** on the patient booking page — signature capture,
  stored as PDF attached to the appointment
- **Lab order redaction controls** — some labs order sensitive panels
  (STD, HIV); phleb card option to "hide panels from view unless clicked"

### Phleb-side integration
- **Badge: "Provider-initiated"** on phleb appointment card so they know
  the order context
- **Pre-visit patient note** passes through — provider's notes visible
  before draw ("she's anxious", "she has hard veins in left arm", etc.)
- **Phleb completion → provider auto-notify** when status transitions to
  `collected` and again on `specimen_delivered`

---

## Hormozi UI/UX laws applied

1. **Two-click provider action**: "Request labs" → fill form → done.
   Absolutely no subforms, tabs, or multi-page wizards. One dialog.

2. **Patient booking in 90 seconds from email click**: no logins required,
   no "enter your info" step (we have it from the request), time+confirm only.

3. **Urgency is visually shown, not stated**: color-coded banner changes as
   deadline approaches. Words are backup; color is primary signal.

4. **Provider stays in the dashboard**: no tab-switching. Status updates
   happen in-place. Email notifications supplement, not replace.

5. **Create-account is optional, framed as benefit**: "save $15 on this
   visit" — not "sign up required." Conversion funnel, not forced.

6. **Every notification is actionable**: email has the button, SMS has
   the link, dashboard has the deep-link. No dead notifications.

7. **Failed bookings convert to reminders, not silence**: 3 escalating
   reminder attempts before declaring expired. Provider gets the final
   expiration notification so they can intervene manually.

8. **Collision guards apply**: patient email can't be an org login email
   (existing trigger catches it); lab order upload size/type guarded.

9. **Mobile-first**: the patient is clicking from their phone 95% of the
   time. Everything renders cleanly at 320px.

10. **Real-time > polling**: provider dashboard uses Supabase realtime on
    `patient_lab_requests` channel so status updates feel instant. No
    refresh button needed.

---

## Build order (what ships first)

### Phase 1 — Core flow (1 session of focused work):
1. DB migration: `patient_lab_requests` table + FK on `appointments`
2. Edge fn: `create-lab-request` (includes email + SMS)
3. Edge fn: `get-lab-request` + `schedule-lab-request`
4. Provider UI: "Request labs" button + modal on ProviderDashboard
5. Provider UI: Lab Requests section on ProviderDashboard
6. Patient-facing: `/lab-request/:token` page
7. Phleb card badge: "Provider-initiated"

### Phase 2 — Reliability + UX polish:
8. Reminder cron (`remind-lab-request-patients`)
9. Realtime subscription on provider dashboard
10. Provider notification email when patient schedules
11. Account-creation flow on patient side
12. SMS-only reply-to-book (Twilio webhooks)

### Phase 3 — Scale features:
13. Bulk CSV request upload
14. Request templates library
15. Custom notification copy
16. Weekly digest email
17. Analytics (conversion rate, avg time to book)
18. Apple/Google Pay on patient side
