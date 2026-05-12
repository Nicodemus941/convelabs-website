/**
 * Release notes catalog — single source of truth for the "What's New" tab.
 *
 * Add a new entry to the TOP of RELEASE_NOTES every time a customer-facing
 * change ships. Each entry self-documents:
 *   - what changed (1-line dream outcome + 2-3 sentence detail)
 *   - where to find it (clickable link to the surface)
 *   - how to use it (numbered steps)
 *   - before vs after (the gap closed)
 *
 * The Hormozi rule: the customer (you + Naquala) should never have to
 * guess what's new or how to operate it.
 */

export type ReleaseCategory = 'feature' | 'fix' | 'polish' | 'safety';

export interface ReleaseNote {
  id: string;                          // unique slug, e.g. '2026-05-12-lab-orders-pre-fill'
  date: string;                        // 'YYYY-MM-DD'
  category: ReleaseCategory;
  area: string;                        // 'Lab Orders', 'Patients', 'Confirmation', etc.
  title: string;                       // headline — under 70 chars
  oneLine: string;                     // 1-sentence dream outcome
  whatChanged: string[];               // bullets — what's actually different now
  howToUse?: string[];                 // optional numbered steps
  whereToFind?: { label: string; path: string };
  before?: string;                     // optional "before"
  after?: string;                      // optional "after"
}

// NEWEST FIRST. When you ship something, add to the top — never bury.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: '2026-05-12-pdf-viewer-fix',
    date: '2026-05-12',
    category: 'fix',
    area: 'Lab Orders',
    title: 'Lab order PDFs no longer render blank on desktop',
    oneLine: 'Naquala reported blank lab order viewers on desktop — fixed with public URLs + object/iframe fallback.',
    whatChanged: [
      'Lab-orders bucket is public, so the viewers now use direct public URLs (encoded per path-segment) instead of signed URLs with ?token=... that some desktop browsers fail to render inline.',
      '<object> tag renders the PDF first, <iframe> is the fallback, and an obvious "Open PDF in new tab" recovery button shows if both fail.',
      'AppointmentLabOrdersPanel "Open" button now uses publicStorageUrl + verifies the file exists with a HEAD check — surfaces a clear error if the file path is bad.',
      'Same fix applied to the phleb-side LabOrderViewerModal.',
    ],
    whereToFind: { label: 'Lab Orders detail drawer + calendar', path: '/dashboard/super_admin/lab-orders' },
    before: 'Naquala clicked the PDF and got a blank rectangle / blank tab. Looked like the system was broken.',
    after: 'PDF renders inline; if the browser truly can\'t preview, a "Open PDF in new tab" button appears.',
  },
  {
    id: '2026-05-12-auto-link-manual-bookings',
    date: '2026-05-12',
    category: 'fix',
    area: 'Lab Orders',
    title: 'Manual bookings auto-link to provider lab orders + cron stops false-alarming',
    oneLine: 'No more "we have no lab order" SMS when the provider already uploaded one.',
    whatChanged: [
      'New BEFORE-INSERT DB trigger: when an appointment is created, if there\'s a pending lab request from any provider for the same patient (matched by email, phone last-10, or fuzzy name, within 90 days), the appointment is automatically stamped with lab_request_id + lab_order_file_path + organization_id.',
      'AFTER-INSERT companion trigger flips the linked lab request to "scheduled" + mirrors the order to appointment_lab_orders so the phleb card sees it.',
      'auto-request-missing-lab-orders cron hardened with defense-in-depth: in addition to checking appointments.lab_order_file_path + appointment_lab_orders, it now also checks patient_lab_requests joined via lab_request_id OR fuzzy-matched by email/phone/name. If a match is found, the cron opportunistically re-links the appointment row so future runs are O(1).',
      'Kandace Bennett\'s today-appointment was manually linked to her Elite Medical lab order live.',
    ],
    howToUse: [
      'Nothing to do. Book a patient manually as usual.',
      'If that patient has a pending lab order from a provider, it now auto-attaches.',
    ],
    whereToFind: { label: 'Lab Orders', path: '/dashboard/super_admin/lab-orders' },
    before: 'Manual booking didn\'t know about pending lab orders. Owner got "no lab order in <4h" SMS even when one was on file.',
    after: 'Manual + automated bookings both auto-link. Owner SMS only fires for truly missing orders.',
  },
  {
    id: '2026-05-12-send-link-prefill',
    date: '2026-05-12',
    category: 'feature',
    area: 'Lab Orders',
    title: 'Send Booking Link auto-fills the provider + lab order',
    oneLine: 'One-tap send when you click Send Booking Link from a Lab Orders row.',
    whatChanged: [
      'The modal now opens with the provider\'s office already selected.',
      'The lab order PDF is marked as attached (the uploader is hidden).',
      'The matching service button glows emerald with a "Tap to send" pill so you know exactly which one to click.',
    ],
    howToUse: [
      'Open Lab Orders tab.',
      'Click ⚡ Send Booking Link on any row.',
      'Tap the glowing emerald service button at the bottom — SMS + email fire to the patient.',
    ],
    whereToFind: { label: 'Lab Orders', path: '/dashboard/super_admin/lab-orders' },
    before: 'Modal opened blank — admin had to re-pick the org + re-upload the lab order even when both were on the row.',
    after: 'True one-tap flow with green pre-fill banner showing what was inherited.',
  },
  {
    id: '2026-05-12-auto-fulfill-global',
    date: '2026-05-12',
    category: 'feature',
    area: 'Lab Orders',
    title: 'Auto-fulfill is now ON globally for every provider',
    oneLine: 'Every new lab order from any provider fires the patient\'s booking link automatically — zero clicks.',
    whatChanged: [
      'Default flipped from per-org opt-in to per-org opt-out.',
      'All 56 existing orgs are auto-fulfill ON.',
      'Any new org auto-registered by the OCR flywheel lands with auto-fulfill ON.',
      'You still see every order land here in real-time with a toast.',
    ],
    howToUse: [
      'Nothing to do — works by default.',
      'To gate a specific provider for manual review: open Lab Orders → switch to "By provider" view → toggle Auto-fulfill OFF on that org\'s section.',
    ],
    whereToFind: { label: 'Lab Orders', path: '/dashboard/super_admin/lab-orders' },
    before: 'Every order required a manual ⚡ Send Booking Link click. 30+ orders/week × 1 click = real time.',
    after: 'Zero clicks per order. You only touch exceptions.',
  },
  {
    id: '2026-05-12-action-items-rename',
    date: '2026-05-12',
    category: 'polish',
    area: 'Action Items',
    title: '"Inbox" → "Action Items" + KPI hero + aging + safer confirm',
    oneLine: 'The triage page now points at the fire and protects you from misclicks.',
    whatChanged: [
      'Renamed "Inbox" to "Action Items" everywhere (sidebar + page title).',
      'KPI hero strip at top: Awaiting patient · Orgs to call · Stale (5+ days).',
      'Rows aged 3–4 days show orange "⏰ Aging Nd"; 5+ days show red pulsing "🚨 Stale Nd".',
      'The "Update chart" button (was "Force-update chart") now requires a second tap with a red diff confirming the before/after values.',
      'Mark Unreachable uses an inline reason picker (dropdown + note) instead of the jarring browser prompt.',
      'Per-section search appears when a list has more than 2 items.',
    ],
    whereToFind: { label: 'Action Items', path: '/dashboard/super_admin/inbox' },
  },
  {
    id: '2026-05-12-auto-complete-trigger',
    date: '2026-05-12',
    category: 'feature',
    area: 'Lab Orders',
    title: 'Lab requests auto-mark Completed when the appointment finishes',
    oneLine: 'The Roy Parker class of bug — appointment done weeks ago but lab order still showing pending — is gone forever.',
    whatChanged: [
      'New DB trigger: when an appointment\'s status flips to completed or specimen_delivered, any linked lab request auto-flips to Completed.',
      'Second trigger handles orphans — appointments not linked to a lab request will be auto-matched by patient name + org + phone (within ±60 days) and reconciled.',
      'One-shot backfill ran live: Roy Parker + 5 test orders + Westphal + Rowland + Percopo all reconciled.',
    ],
    whereToFind: { label: 'Lab Orders → Completed filter', path: '/dashboard/super_admin/lab-orders' },
    before: 'Lab requests stuck on "scheduled" or "expired" even after the visit completed.',
    after: 'Status mirrors reality in real-time, no manual sync.',
  },
  {
    id: '2026-05-12-lab-orders-mobile',
    date: '2026-05-12',
    category: 'polish',
    area: 'Lab Orders',
    title: 'Mobile experience overhaul on the Lab Orders tab',
    oneLine: 'Triage lab orders from your phone like a real mobile app.',
    whatChanged: [
      'KPI strip is now a horizontal-scroll snap-row on phones (gets the first patient row above the fold).',
      'Every tap target is now ≥36×36 (44×44 on primary actions) — meets Apple/Google minimums.',
      'Detail drawer is a bottom-sheet on phones with a drag handle and adaptive PDF height.',
      'Lab Orders tab is lazy-loaded — speeds up first paint on every other admin route.',
      'Skeleton rows replace the spinner so the page feels alive in 100ms.',
    ],
    whereToFind: { label: 'Lab Orders (phone)', path: '/dashboard/super_admin/lab-orders' },
  },
  {
    id: '2026-05-12-aging-rollup-autofulfill',
    date: '2026-05-12',
    category: 'feature',
    area: 'Lab Orders',
    title: 'Aging colors + Per-provider rollup + Auto-fulfill toggle',
    oneLine: 'See which orders are stale + see your provider relationships in one glance.',
    whatChanged: [
      'Awaiting-patient rows decay visually: amber 0-2d, orange 3-4d, red pulsing 5+d.',
      '"By provider" view toggle in the hero — each org gets a section card with status breakdown badges.',
      'Per-org auto-fulfill toggle on the section header (now defaults ON globally).',
      'Choice of List vs By provider persists across sessions (localStorage).',
    ],
    whereToFind: { label: 'Lab Orders → By provider view', path: '/dashboard/super_admin/lab-orders' },
  },
  {
    id: '2026-05-12-lab-orders-tab',
    date: '2026-05-12',
    category: 'feature',
    area: 'Lab Orders',
    title: 'Lab Orders dashboard tab (single canvas for all provider uploads)',
    oneLine: 'Every order any provider has placed for any patient — in one place, real-time.',
    whatChanged: [
      'New sidebar entry "Lab Orders" with emerald pulse badge when there are unviewed orders.',
      'Hero KPI strip: New · Awaiting patient · Scheduled · Overdue · Completed.',
      'Click any row → full-screen detail drawer with live PDF preview, OCR\'d test panels, and one-click actions (Call, Email, Send Booking Link, Patient view, View Appointment, Download).',
      'Real-time toast notification the moment a new order lands.',
      'Search across patient, provider office, email, phone.',
      'Download icon on every row + the drawer.',
    ],
    howToUse: [
      'Click "Lab Orders" in the sidebar.',
      'The default "All" filter shows every order. Tap a KPI card to narrow.',
      'Tap a row → review the PDF, see the OCR panels, then tap the contextual action button.',
    ],
    whereToFind: { label: 'Lab Orders', path: '/dashboard/super_admin/lab-orders' },
    before: 'No way to know which patients had provider-uploaded orders. Provider hit submit → silence.',
    after: 'Real-time visibility + one-click triage from anywhere.',
  },
  {
    id: '2026-05-11-comms-timeline',
    date: '2026-05-11',
    category: 'feature',
    area: 'Patients',
    title: 'Communications timeline on every patient profile',
    oneLine: 'See every SMS + email + tokenized link ever sent to (or received from) a patient — in one feed.',
    whatChanged: [
      'New card on the patient profile + the Patients tab\'s expanded detail.',
      'Aggregates from 5 sources: notification_logs, sms_messages, email_send_log, booking_prefill_tokens, patient_lab_requests.',
      'Status badge per row: sent / opened / clicked / consumed / bounced / replied.',
      'Click a row to expand: full body, tokenized URL with copy + preview buttons.',
      'Inbound replies marked with ↩ + emerald accent.',
    ],
    whereToFind: { label: 'Patients tab', path: '/dashboard/super_admin/patients' },
    before: '"Did Susan get the link?" required checking 4 different places.',
    after: 'One scroll on her profile answers it.',
  },
  {
    id: '2026-05-11-hipaa-invite',
    date: '2026-05-11',
    category: 'feature',
    area: 'Invite',
    title: 'HIPAA-safe provider → patient handoff with lab order auto-attach',
    oneLine: 'Send a patient a booking link that names the provider\'s office but never the patient.',
    whatChanged: [
      'Send Booking Link modal: provider\'s office dropdown + lab-order PDF uploader.',
      'When an org is selected, the SMS body becomes "We received a lab order from {Org} for you. Tap to schedule..." — no patient name, no test names.',
      'Lab order PDF auto-attaches to the appointment after the patient pays (via Stripe webhook).',
      'Booking page pre-fills: name, phone, email, DOB, address, gate code, insurance — from chart.',
    ],
    howToUse: [
      'Open any patient → click ⚡ Send Booking Link.',
      'Pick the provider\'s office.',
      'Upload the lab order PDF (or pick the service if no PDF).',
      'Click the service → SMS + email fire.',
    ],
    whereToFind: { label: 'Lab Orders or Patients', path: '/dashboard/super_admin/lab-orders' },
  },
  {
    id: '2026-05-11-membership-welcome',
    date: '2026-05-11',
    category: 'feature',
    area: 'Membership',
    title: 'Hormozi-structured membership welcome email',
    oneLine: 'New members get a real welcome the moment they sign up — listing every perk by dollar amount.',
    whatChanged: [
      'Fires automatically when a Member / VIP / Concierge subscription activates.',
      'Email lists per-tier perks with the actual savings: VIP mobile draw $115 (vs $150), family add-on $45 (vs $75), etc.',
      'Founding 50 members get a "★ Founding Member #N of 50" badge in the hero.',
      'Renewal date + cancel-anytime stated explicitly to reduce churn fear.',
      'CEO-signed close + service guarantees + reply-to support address.',
    ],
    whereToFind: { label: 'Stripe webhook (auto)', path: '/dashboard/super_admin/calendar' },
    before: 'No welcome email at all. The deprecated one returned 410 Gone.',
    after: 'Every new member gets a value-stacked welcome that reinforces what they paid for.',
  },
  {
    id: '2026-05-11-credits-autoapply',
    date: '2026-05-11',
    category: 'feature',
    area: 'Booking',
    title: 'Patient credits auto-apply at online checkout',
    oneLine: 'Patients with referral/goodwill credits see them automatically applied at booking — no codes to remember.',
    whatChanged: [
      'On the Checkout step, an emerald card shows "$X credit on your account" if any exist.',
      'Default ON; the patient can untoggle to save it for next time.',
      'Server re-verifies ownership + unredeemed status before subtracting.',
      'Aditya Patel\'s $25 goodwill credit is now active on his chart.',
    ],
    whereToFind: { label: '/book-now (patient view)', path: '/book-now' },
  },
  {
    id: '2026-05-11-arrival-window',
    date: '2026-05-11',
    category: 'feature',
    area: 'Confirmation',
    title: 'Arrival-window block on every appointment confirmation',
    oneLine: 'Patients know up-front the phleb may arrive ±15 min due to traffic/weather/distance.',
    whatChanged: [
      'New blue card in the confirmation email above "How to prepare".',
      'Confirmation SMS includes a one-line "Arrival window: 15 min before/after" note.',
      'Reminder email (24h out) restates the same window.',
      'Manual-booking SMS (admin-fired) carries the note too.',
    ],
    whereToFind: { label: 'Triggered on booking', path: '/dashboard/super_admin/calendar' },
    before: 'Patient sees 8:00 AM, thinks 8:00 AM sharp. Phleb shows at 8:10. Patient confused.',
    after: 'Expectation set in writing. No-show + complaint risk drops.',
  },
  {
    id: '2026-05-11-dob-hardening',
    date: '2026-05-11',
    category: 'fix',
    area: 'Booking',
    title: 'DOB required at online booking + auto-saved to chart',
    oneLine: 'No more "Shaun Chambers showed up without a DOB on file."',
    whatChanged: [
      'patientDetails.dateOfBirth schema flipped to required (was optional).',
      'Stripe webhook creates a new tenant_patients row when one doesn\'t exist for the booking email (first-time bookers).',
      'DOB stamped on the chart so the phleb\'s NIIMBOT tube label has data day-of.',
    ],
    whereToFind: { label: '/book-now (patient view)', path: '/book-now' },
  },
  {
    id: '2026-05-10-messages-tab',
    date: '2026-05-10',
    category: 'feature',
    area: 'Phleb PWA',
    title: 'Real SMS history in the phleb Messages tab',
    oneLine: 'The phleb sees every system SMS + every patient reply per patient.',
    whatChanged: [
      'List previews now show the actual last SMS body (was hardcoded "service - date" text).',
      'Per-patient chat view pulls from notification_logs, sms_messages, sms_notifications.',
      'Inbound patient replies (lab-request "1/2/3", "DATES", etc.) show as ↩ messages.',
      'Defensive coercion of jsonb message bodies so the page doesn\'t crash on legacy rows.',
    ],
    whereToFind: { label: 'Phleb PWA → Messages tab', path: '/dashboard/phlebotomist' },
  },
  {
    id: '2026-05-10-insurance-fix',
    date: '2026-05-10',
    category: 'fix',
    area: 'Patient profile',
    title: 'Insurance card recognition fix',
    oneLine: 'Patient profile no longer says "No insurance card on file" when there IS one.',
    whatChanged: [
      'PhlebAppointmentCard + AppointmentDetailModal now check the new multi-row patient_insurances table + legacy tenant_patients.insurance_card_path.',
      'View Insurance Card button auto-falls-back from insurance-cards bucket → lab-orders bucket so legacy paths still open.',
      'Readiness pre-flight pip flips green when ANY source has insurance.',
    ],
    whereToFind: { label: 'Phleb PWA → patient appointment card', path: '/dashboard/phlebotomist' },
  },
];

/**
 * Most recent release date string — used for the "X new since you last visited"
 * badge in the sidebar.
 */
export const LATEST_RELEASE_DATE = RELEASE_NOTES[0]?.date || '';

/**
 * Compute count of unread releases since the user last visited the page.
 * Stored in localStorage as ISO date string.
 */
export function getUnreadReleaseCount(): number {
  try {
    const lastSeen = localStorage.getItem('convelabs_release_notes_last_seen');
    if (!lastSeen) return RELEASE_NOTES.length;
    const lastSeenDate = new Date(lastSeen);
    if (isNaN(lastSeenDate.getTime())) return RELEASE_NOTES.length;
    return RELEASE_NOTES.filter(n => new Date(n.date) > lastSeenDate).length;
  } catch {
    return 0;
  }
}

export function markAllReleasesAsRead() {
  try { localStorage.setItem('convelabs_release_notes_last_seen', new Date().toISOString()); } catch {}
}
