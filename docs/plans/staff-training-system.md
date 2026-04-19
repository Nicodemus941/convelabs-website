# Staff Training System (Admin Portal) — Hormozi Structure

*"You are only as good as the worst thing your admin says to a partner on
the phone." — the point of this system is to make sure every admin who
picks up a Nico-isn't-available call has the exact right answer in under
30 seconds, with confidence, and can log what they said so we learn
collectively.*

---

## Why this matters (Hormozi frame)

The lab-request workflow we just built means partners (Dr. Sher, Shawna
at CAO, Christelle at Restoration Place) will call the office asking
questions that today only you know the answers to. When they do:

- If the admin says *"I'm not sure, let me have Nico call you back"* → we
  lose 20 min of turnaround on a question that has a 10-second answer
- If the admin says the wrong thing → a partner loses trust in the system
- If the admin says the right thing confidently → we earn more loyalty
  than the original email announcement did

**Hormozi's rule: the back-office support experience is a hidden sales
channel.** Every time an admin nails a partner's question, that partner
tells their PA, their front desk, and two referral buddies at their
next medical conference.

Build the system so that answering questions correctly is the EASIEST
path, not the hardest.

---

## What the system does (in 3 sentences)

1. A **Training** section appears in the admin sidebar with searchable
   courses, a comprehensive FAQ database, and an "ask Nico" escalation path.
2. Every topic (subscription packages, lab requests, billing isolation,
   HIPAA rules, recollection policy, partnership-specific rules per org)
   gets a course + 5–10 canned FAQs with verbatim answers.
3. When a partner calls with a question, the admin hits Cmd+K → search →
   read the answer → click "Send to partner" to email them the matching
   FAQ as a formatted reply.

---

## Admin sidebar — where it lives

Today's sidebar (from `AdminLayout`): Overview · Calendar · Patients ·
Organizations · Invoices · Operations · Hormozi Dashboard · Settings · …

**New sidebar entry**: **📚 Training** (right under "Hormozi Dashboard")

Sub-nav inside Training:
- **Overview** — landing with "recommended next course"
- **Courses** — structured video + text tutorials
- **FAQs (Knowledge Base)** — searchable, copy-to-clipboard answers
- **Subscription Packages** — pricing + who fits which tier
- **Lab Request System** — the new workflow, step by step
- **Partners** — org-specific rules (per-org handbook)
- **HIPAA & Compliance** — the non-negotiables
- **Ask Nico** — send a question + get a documented answer

---

## Schema

```sql
-- Courses: structured training modules
CREATE TABLE IF NOT EXISTS training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  summary text,
  category text NOT NULL,  -- 'system' | 'subscription' | 'partner' | 'compliance' | 'ops'
  content_md text,         -- markdown-rendered lesson body
  video_url text,
  estimated_minutes int,
  required boolean DEFAULT false,
  published boolean DEFAULT false,
  sort_order int DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- FAQs: searchable knowledge base — admin's cheat sheet
CREATE TABLE IF NOT EXISTS training_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer_short text NOT NULL,       -- one-liner for SMS/quick reply
  answer_long text NOT NULL,        -- full answer with context
  category text NOT NULL,
  tags text[] DEFAULT '{}'::text[], -- for faceted search
  partner_org_id uuid REFERENCES organizations(id), -- NULL = applies to all
  helpful_count int DEFAULT 0,
  unhelpful_count int DEFAULT 0,
  last_reviewed_at timestamptz,
  published boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Full-text search over both
CREATE INDEX idx_training_faqs_tsv ON training_faqs
  USING gin(to_tsvector('english', question || ' ' || answer_short || ' ' || answer_long));
CREATE INDEX idx_training_courses_tsv ON training_courses
  USING gin(to_tsvector('english', title || ' ' || COALESCE(summary,'') || ' ' || COALESCE(content_md,'')));

-- Track admin progress (Hormozi: what gets measured gets completed)
CREATE TABLE IF NOT EXISTS training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  course_id uuid NOT NULL REFERENCES training_courses(id),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  quiz_score int,
  UNIQUE(user_id, course_id)
);

-- FAQ search log: what did admins actually ask? Gold for product ops.
CREATE TABLE IF NOT EXISTS training_search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  query text NOT NULL,
  result_count int,
  clicked_faq_id uuid REFERENCES training_faqs(id),
  was_helpful boolean,
  follow_up_question text, -- if they had to ask Nico anyway
  created_at timestamptz DEFAULT now()
);

-- Ask-Nico escalations
CREATE TABLE IF NOT EXISTS training_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  question text NOT NULL,
  context text, -- which partner asked? what situation?
  answered_at timestamptz,
  answer text,
  answer_by uuid REFERENCES auth.users(id),
  converted_to_faq_id uuid REFERENCES training_faqs(id),
  created_at timestamptz DEFAULT now()
);
```

---

## Required content to seed (the minimum viable training corpus)

### Courses (4 required on day 1)

1. **"How ConveLabs Works — 10-minute system overview"**
   Everything a new admin needs: the patient journey, the provider portal,
   the phleb workflow, billing isolation, recollection policy.

2. **"The Subscription Packages — memorize these 4 tiers"**
   - Regular Member ($99/yr): 6am–12pm weekdays + Sat 6–9am, ~$20 saved/visit
   - VIP ($199/yr): 6am–2pm weekdays + Sat 6–11am, ~$35 saved/visit + priority
   - Concierge ($399/yr): anytime + Sun by request, ~$51 saved/visit + dedicated phleb
   - Who fits which (quick-match decision tree)

3. **"The Lab Request System — provider orders labs for patients"**
   The feature we just shipped. What triggers it, what the patient sees,
   what the provider sees, what happens if the patient doesn't book,
   how reminders escalate, when to intervene manually.

4. **"Partner-specific rules — the per-org handbook"**
   Elite Medical (org pays, $72.25/visit, subscription-driving), CAO
   (draw-only, masked names, $55 to CAO), Restoration Place (6-9am AM
   cortisol enforced, $125 patient-pay), etc. One page per org.

### FAQs (seed with the 20 most-likely partner questions)

Examples:

| Q | Short answer | Long answer |
|---|---|---|
| "Does the patient pay at booking or after?" | *At booking if patient-pay. Instantly via Stripe when they confirm. Org-billed visits are charged to the org's card on file at booking too — we don't do receivables.* | [2-paragraph explanation with billing isolation, org vs patient, how Stripe receipts land, how to pull a receipt from our system, what the partner sees] |
| "My patient never got their SMS reminder — why?" | *SMS goes out at 8 PM ET the night before morning fasting draws. Check the patient's phone is correctly on file — not the provider's — and that the appointment is before noon. If both check out, forward me the appt ID and I'll look at Twilio logs.* | [step-by-step diagnostic flow] |
| "Can we reschedule a recurring series all at once?" | *Yes — open the series in admin calendar, right-click any visit → "Reschedule series". Moves all remaining visits by the same offset. Send me the series ID if you hit any issues.* | [full workflow w/ screenshots] |
| "Why is the patient's name masked on some appointments?" | *Because they're a CAO clinical trial participant — we hide patient names from all views except super_admin. Chain-of-custody still works normally.* | [explain HIPAA + sponsor-required masking + how to unmask if legitimately needed] |
| "A partner wants to refer another practice — what do I offer?" | *Flag it to me. I'll personally call that practice. Keep the referring partner in the loop with an email — 'Nico will reach out to Dr. X this week, thanks again'. We don't have a referral-fee program yet but it's in planning.* | [talk track for the referring partner] |

Each FAQ has a one-click **"Copy answer"** and **"Email answer to partner"** button.

---

## UI wireframe

```
┌────────────────────────────────────────────────────┐
│ ConveLabs Admin                                     │
├──────┬─────────────────────────────────────────────┤
│      │                                             │
│  📊  │   Training                                   │
│  📅  │                                             │
│  👥  │   [ Search 🔍  Cmd+K  ]                     │
│  🏢  │                                             │
│  💰  │   Required courses (4)   [3/4 ✓]            │
│  ⚙️  │   ┌───────────────────────────────────────┐│
│  📚 ◄│   │ 📖 Subscription Packages  ✓ Complete  ││
│      │   │ 📖 Lab Request System     ✓ Complete  ││
│  Tng │   │ 📖 How ConveLabs Works    ✓ Complete  ││
│      │   │ 📖 Partner Handbook       ⏳ 4 min left││
│      │   └───────────────────────────────────────┘│
│      │                                             │
│      │   Top FAQs this week                        │
│      │   ⭐ Does patient pay at booking?           │
│      │   ⭐ Why is a name masked?                  │
│      │   ⭐ How to cancel a series?                │
│      │                                             │
│      │   Partner handbooks                         │
│      │   🏥 Aristotle  🏥 CAO  🏥 Elite           │
│      │   🏥 Littleton  🏥 Natura  🏥 ND           │
│      │   🏥 Restoration Place                      │
│      │                                             │
│      │   [ 🆘 Ask Nico directly  ]                 │
│      │   [ 📊 My learning dashboard ]              │
│      │                                             │
└──────┴─────────────────────────────────────────────┘
```

### Cmd+K search panel (anywhere in admin)

```
┌──────────────────────────────────────────────────┐
│ 🔍 What can I help you find?                     │
│ ┌──────────────────────────────────────────────┐ │
│ │ does patient pay at booking                  │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ FAQs                                              │
│ ❓ "Does the patient pay at booking or after?"   │
│    At booking if patient-pay. Org-billed...      │
│    [ Copy answer ]  [ Email to partner ]  [ Open]│
│                                                   │
│ ❓ "Can we delay patient payment by 7 days?"     │
│    Not for patient-pay bookings — Stripe...      │
│    [ Copy ]  [ Email ]  [ Open ]                 │
│                                                   │
│ Courses                                           │
│ 📖 How ConveLabs Works (sec 4: billing flow)    │
│ 📖 Subscription Packages                         │
│                                                   │
│ Didn't find it? [ Ask Nico this question → ]    │
└──────────────────────────────────────────────────┘
```

### "Ask Nico" escalation

When admin escalates, we capture:
- Exact question
- Context (which partner asked? what were they trying to do?)
- Email/SMS ping to Nico
- Nico answers inline → answer stamps `training_escalations.answered_at`
- Optional: "Should this become a public FAQ?" → one-click converts the
  Q+A into a published `training_faqs` row

Compound effect: every question Nico answers ONCE becomes a canned
answer that never needs to be asked again.

---

## Hormozi UX principles applied

1. **Search-first, browse-second.** Admins don't have time to scroll
   categories. Cmd+K anywhere → instant results.

2. **Every answer is copy-paste-ready.** A well-written answer earns
   more trust than an essay written by committee.

3. **Completed courses show a gold star + progress bar.** Gamification
   is cheap, retention is expensive.

4. **Required courses block access** to certain features (e.g., an
   admin can't open a CAO appointment until they've completed
   "HIPAA & masking"). Enforces base competency before they touch the
   sensitive flows.

5. **"Ask Nico" is always one click away** at the bottom of every page.
   Admins can't get stuck.

6. **Every escalation turns into an FAQ.** The system gets smarter
   every week — you write less, admins answer more.

7. **Show them what partners are asking.** Admin dashboard shows
   "Questions partners asked this week" as a read-only digest —
   helps them proactively prepare for the calls they'll get.

8. **Track "first call resolution" rate.** Key metric: what % of
   partner questions get answered by admin WITHOUT escalating to Nico?
   Target: 90% after 30 days.

9. **Refresh schedule.** Each FAQ has a `last_reviewed_at` — quarterly
   email to Nico listing any FAQ older than 90 days to review.

10. **Voice-note answers for complex topics.** Some things are faster
    to say than type. Support a voice note upload → auto-transcribe
    via Whisper → stamp as the answer.

---

## Gaps + nice-to-haves

### 🔴 Must-have before launch

1. **Role gating** — only `super_admin` + `office_manager` can see
   Training. Providers, phlebs, patients do NOT.
2. **FAQ version control** — when an FAQ changes, previous version
   should be archived (for audit: "we told them X in March, now we
   say Y").
3. **Org-specific FAQs filter** — when a CAO coordinator calls, admin
   should be able to filter FAQs to `partner_org_id = CAO` so only
   CAO-specific answers surface.

### 🟡 Should-have soon

4. **Bulk FAQ import** from Google Docs / Notion so Nico can draft in
   his preferred tool and sync.
5. **AI-powered answer composer** — admin pastes the partner's question
   → Claude suggests an answer drawing from our FAQs + context → admin
   reviews, edits, sends.
6. **Staff quiz** at end of each required course to validate learning
   (pass/fail threshold before certifying them).
7. **Annual refresher reminder** — 11 months after course completion,
   auto-enroll in a refresh version.

### 🟢 Nice-to-haves

8. **Partner-facing self-serve FAQ** — same FAQ database, filtered to
   published-to-partners entries, embedded on their portal. They serve
   themselves when they can.
9. **Voice/video onboarding for new staff** — Nico records 10 min
   explaining the rebuild, embeds in the Overview course.
10. **Leaderboard** — which admin has resolved the most partner
    questions without escalation? Good-natured competition.
11. **Slack/Teams integration** — Cmd+K also works in Slack via a
    `/cvlabs` slash command that pulls the same search.

### Future

12. **Partner certification** — similar structure for partners to
    learn our system (they complete a short "getting started" course
    and unlock advanced features).
13. **Continuing-education credits** — if training content is medical,
    could be CE-accredited for phlebs.

---

## Build order

### Phase 1 — Foundation (1 session):
1. Migrations: 4 new tables (`training_courses`, `training_faqs`,
   `training_progress`, `training_search_log`, `training_escalations`)
2. Seed with 4 required courses + 20 starter FAQs
3. New `TrainingTab.tsx` with sub-routes: Overview, Courses, FAQs, Ask
4. Add "Training" to `AdminSidebar.tsx` under Hormozi
5. Full-text search via PostgreSQL tsv
6. Cmd+K command palette (shadcn `CommandDialog`) wired to search

### Phase 2 — Content + feedback loops:
7. Escalation email pipeline (admin asks → Nico gets Mailgun email +
   link-click to reply inline)
8. Copy-to-clipboard + "Email to partner" on each FAQ
9. Admin-dashboard card: "Questions partners asked this week"
10. Required-course gating on CAO + HIPAA-sensitive views

### Phase 3 — Intelligence:
11. AI answer composer (Claude integration)
12. Voice-note answer flow (Whisper)
13. Leaderboard + gamification
14. Partner-facing public FAQ embed
