// send-partner-announcements-live
// ────────────────────────────────────────────────────────────────────────
// FIRES THE 7 ORG-SPECIFIC ANNOUNCEMENTS TO THEIR REAL EMAIL ADDRESSES.
// Same HTML bodies as send-april-update-drafts (which previews to
// info@convelabs.com), but here the "to:" field is the real partner
// recipient and the draft-preview yellow banner is stripped.
//
// Invoked by pg_cron at 15:00 UTC 2026-04-19 (= 11:00 AM EDT). Protected
// by a shared-secret token so nothing else can trigger a real send.
//
// The cron schedule self-unschedules after firing, so this cannot
// accidentally re-fire next April 19.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EXPECTED_TOKEN = 'partner-live-2026-04-19';
const CAMPAIGN_KEY = 'partner_announce_2026_04_19';
const BCC = 'info@convelabs.com'; // BCC corporate on every send for archival

// Dedup via campaign_sends table — even if this function gets invoked
// twice (cron + manual curl), each partner address only receives once.
async function hasAlreadyBeenSent(email: string): Promise<boolean> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/campaign_sends?campaign_key=eq.${encodeURIComponent(CAMPAIGN_KEY)}&recipient_email=ilike.${encodeURIComponent(email)}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!resp.ok) return false; // on lookup error, proceed — dedup fails open
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function recordSent(email: string, mailgunId: string | null) {
  await fetch(`${SUPABASE_URL}/rest/v1/campaign_sends`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      campaign_key: CAMPAIGN_KEY,
      recipient_email: email.toLowerCase(),
      mailgun_id: mailgunId,
      status: 'sent',
    }),
  }).catch(() => {});
}

const brandWrap = (title: string, body: string) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${title}</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;letter-spacing:.5px;">ConveLabs Concierge Lab Services</p>
  </div>
  <div style="padding:28px 32px;background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;color:#111827;line-height:1.6;font-size:14.5px;">
    ${body}
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;">
      ConveLabs Concierge Lab Services · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169
    </p>
  </div>
</div>`;

const portalUrlFor = (email: string) => `https://www.convelabs.com/provider?email=${encodeURIComponent(email)}`;

const TECH_POSITIONING = `
  <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:12px;padding:18px 20px;margin:18px 0;">
    <p style="margin:0;font-size:13px;color:#78350f;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">One of a kind, built by us</p>
    <p style="margin:8px 0 0;font-size:14px;color:#451a03;line-height:1.55;">
      The ConveLabs platform is the only one of its kind. The automated workflow, the <strong>ConveLabs OCR Technology</strong>, the specimen-tracking chain-of-custody, the billing isolation, and the provider portal are proprietary — built in-house for the specific problems mobile phlebotomy creates. You won't find this stack anywhere else in concierge lab services.
    </p>
  </div>
`;

const PLATFORM_STACK = `
  <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What's in the stack</h3>
  <ul style="padding-left:20px;margin:10px 0 16px;">
    <li><strong>Patient online booking</strong> — your patients self-schedule in under 90 seconds. Your org's time-of-day rules, billing rules, and member discounts all enforce automatically. No phone tag.</li>
    <li><strong>Instant payment at booking</strong> — patients (or your org, when you're the bill-payer) pay directly through Stripe the moment they schedule. No invoices chasing payments.</li>
    <li><strong>ConveLabs OCR Technology</strong> — the instant a lab order is uploaded, our system reads it, flags fasting / urine / glucose tolerance requirements, and sends the patient protocol-specific prep instructions <em>before</em> the visit. Fewer redraws, fewer invalid specimens.</li>
    <li><strong>Insurance capture at checkout</strong> — patients photograph front + back of their card during booking; we store and attach it to the requisition. Zero day-of paperwork.</li>
    <li><strong>Specimen tracking IDs</strong> — every specimen gets a unique ID. You get notifications at collection, pickup, reference-lab delivery, and result ETA — same tracking experience as a FedEx shipment.</li>
    <li><strong>Live "Collected / Not Collected" status</strong> — if a patient cancels, reschedules, or something goes sideways at the lab, your portal reflects it instantly. You never chase us.</li>
    <li><strong>Billing isolation</strong> — when your org is the bill-payer, invoices route only to your billing email. When patients are the bill-payers, each patient's billing stays scoped to them. No cross-contamination.</li>
    <li><strong>Receipts + accounting sync</strong> — every visit has a downloadable receipt; reconciliation to QuickBooks happens on our side automatically.</li>
  </ul>
`;

const LAB_REQUEST_FLOW_BLOCK = `
  <div style="background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%);border:2px solid #d97706;border-radius:14px;padding:22px;margin:22px 0;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:800;">Headline feature — provider-initiated lab requests</p>
    <h3 style="margin:0 0 10px;color:#78350f;font-size:18px;">You upload the order. We handle everything that happens next.</h3>
    <p style="margin:0 0 10px;font-size:14px;color:#451a03;line-height:1.55;">
      You know the workflow: patient needs labs, you write the order, then your front desk spends the next three days on phone tag — "did you fast?", "did you book?", "did you show up?". Each follow-up steals a minute you can't bill, and a single missed fasting window burns the whole draw.
    </p>
    <p style="margin:0 0 14px;font-size:14px;color:#451a03;line-height:1.55;">
      Starting now, that entire chain is one screen in your portal.
    </p>
    <div style="background:#ffffff;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;margin:12px 0;">
      <p style="margin:0 0 10px;font-size:13px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Your four clicks, our entire workflow</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13.5px;color:#1f2937;line-height:1.55;">
        <tr><td style="padding:4px 8px 4px 0;vertical-align:top;width:28px;color:#B91C1C;font-weight:800;">1.</td><td style="padding:4px 0;"><strong>Upload the lab order.</strong> Drag-and-drop PDF, photo, or EMR export. ConveLabs OCR reads every panel, the NPI, and the fasting / urine / GTT flags automatically.</td></tr>
        <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:#B91C1C;font-weight:800;">2.</td><td style="padding:4px 0;"><strong>Register the patient.</strong> Name, phone, email. If they already exist in our system (member, prior visit, household), we merge automatically — no duplicates.</td></tr>
        <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:#B91C1C;font-weight:800;">3.</td><td style="padding:4px 0;"><strong>Set the draw-by date.</strong> "This has to be drawn before next Tuesday's consult" — enter the date and the patient can only book on or before it. After the deadline, the request auto-expires and we alert you.</td></tr>
        <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:#B91C1C;font-weight:800;">4.</td><td style="padding:4px 0;"><strong>Click send.</strong> Done. The patient gets a tokenized one-click link by SMS and email — no account, no password, just pick a slot.</td></tr>
      </table>
    </div>
    <p style="margin:16px 0 6px;font-size:13px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">What happens after you click send (with zero additional input from you)</p>
    <ul style="padding-left:20px;margin:6px 0 14px;font-size:13.5px;color:#451a03;line-height:1.7;">
      <li><strong>Patient picks a slot</strong> — only dates within your draw-by window are available.</li>
      <li><strong>If patient forgets, we nag for you</strong> — automated reminder SMS + email at day 2, day 4, and day 6 post-send. You never have to re-ask.</li>
      <li><strong>Fasting reminder fires at 8 PM the night before</strong> — calculated from the OCR-detected panels, with the exact cutoff time ("stop eating by 10 PM tonight — water is fine"). Respects our 9 PM–8 AM quiet-hours rule.</li>
      <li><strong>Morning-of confirmation</strong> — patient gets "your phlebotomist is on the way" SMS with ETA. Cuts no-shows dramatically.</li>
      <li><strong>Draw happens, specimen delivered</strong> — your portal updates live: Collected → In Transit → Delivered → Results ETA.</li>
      <li><strong>Patient closes the loop</strong> — post-visit feedback SMS at 24 h, Google review request at 48 h (quiet-hours gated, only on clean visits).</li>
    </ul>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin:10px 0 2px;">
      <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.5;">
        <strong>If the patient misses the draw-by deadline</strong> — the request auto-expires and you get an email. The ball never stays in your court without your knowledge.
      </p>
    </div>
  </div>
`;

const RISK_REVERSAL = `
  <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px 18px;margin:16px 0;">
    <p style="margin:0;font-size:13px;color:#166534;font-weight:700;">The ConveLabs Recollection Guarantee — in writing</p>
    <ul style="padding-left:18px;margin:8px 0 0;font-size:13px;color:#14532d;line-height:1.55;">
      <li>If <strong>ConveLabs</strong> caused the error, recollection is <strong>100% free</strong>.</li>
      <li>If the <strong>reference lab</strong> caused the error, recollection is <strong>50% off</strong>.</li>
    </ul>
    <p style="margin:8px 0 0;font-size:12px;color:#166534;">No other mobile-phlebotomy service in Florida puts this in writing.</p>
  </div>
`;

const loginBlock = (email: string) => `
  <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Your portal is ready — 30 seconds to log in</h3>
  <ol style="padding-left:20px;margin:10px 0 14px;">
    <li>Visit <a href="${portalUrlFor(email)}" style="color:#B91C1C;">convelabs.com/provider</a> — your email is already filled in.</li>
    <li>If you have a password, log in.</li>
    <li>If you don't, click <em>"Send me a password setup link"</em> and you're in within a minute.</li>
  </ol>
  <div style="text-align:center;margin:18px 0 6px;">
    <a href="${portalUrlFor(email)}" style="display:inline-block;background:#B91C1C;color:#fff;padding:15px 38px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Open my provider portal →</a>
  </div>
`;

const SIGNOFF = `
  <p style="margin:22px 0 6px;">If you want a 10-minute walkthrough or have any questions, email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or call me directly at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a>. I read and answer everything myself. <em>(This email comes from a no-reply address, so please use <strong>info@convelabs.com</strong> — not the "reply" button.)</em></p>
  <p style="margin:18px 0 0;">With gratitude,<br>
  <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
  <em>Founder, ConveLabs Concierge Lab Services</em></p>
`;

// ── Real recipient addresses (these are the ones pulled tonight from
// organizations table and confirmed in the draft-review inbox) ──
const emails = [
  {
    to: 'sdean@aristotleeducation.com',
    portalEmail: 'sdean@aristotleeducation.com',
    subject: "For Dr. Jamnadas's patients — a lab workflow built around his protocols",
    html: brandWrap('Aristotle × ConveLabs — your portal is ready', `
      <p>Hi Sharlene and Bri,</p>
      <p>Dr. Jamnadas's entire approach — the fasting protocols, the vagus-nerve reset, the red-light interventions, the personalized supplement panels — lives or dies on <strong>clean, correctly-timed lab data</strong>. When a 72-hour fast is burned because a draw got mistimed, the protocol restarts. Patient loses a week. You absorb the rebooking.</p>
      <p>We rebuilt the entire ConveLabs system specifically so that failure mode never happens to one of your patients again.</p>
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for Aristotle, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>VIP unrestricted window</strong> — your patients book any time Monday–Friday during business hours. No tier gates.</li>
        <li><strong>Flat $185 per specialty-kit collection</strong>, charged directly to Aristotle's Stripe the moment a visit is scheduled. Patients pay $0. You can flip any single visit to patient-pay with one toggle.</li>
        <li><strong>Extended-fast-safe intake</strong> — when a patient is on one of Dr. Jamnadas's prolonged fasts, the pre-visit instructions reinforce his protocol (hydration only, no supplements, no bulletproof coffee).</li>
        <li><strong>Team logins</strong> — you, Bri, and anyone else on the Aristotle operations team each get your own portal access under the same org.</li>
        <li><strong>Coming soon:</strong> enter a patient's next Aristotle consult when scheduling, so results land in Dr. Jamnadas's hands <em>before</em> the follow-up.</li>
      </ul>
      ${TECH_POSITIONING}
      ${LAB_REQUEST_FLOW_BLOCK}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Founding-partner pricing locked.</strong> The $185 rate and VIP unrestricted window are grandfathered for Aristotle as a founding partner. Rates go up for new partners; yours don't.</p>
      </div>
      ${loginBlock('sdean@aristotleeducation.com')}
      <p>Sharlene, Bri — Aristotle has been one of our most thoughtful partners, and the best design decisions in this rebuild came from watching how your team actually works. Thank you.</p>
      ${SIGNOFF}
    `),
  },
  {
    to: 'smartin@clinicalassociatesorlando.com',
    portalEmail: 'smartin@clinicalassociatesorlando.com',
    subject: 'Trial-grade privacy + chain-of-custody for your participants',
    html: brandWrap('CAO × ConveLabs — your portal is ready', `
      <p>Hi Shawna,</p>
      <p>Clinical research participants aren't "patients" in the normal sense. They're subjects under IRB-approved protocols, and your sponsors expect <strong>de-identification, accurate timestamps, and zero cross-participant contamination</strong> — every single visit.</p>
      <p>Most mobile lab services aren't built for that standard. Ours is — because we built the whole platform specifically for it. And because your workflow is draw-only (we handle the venipuncture, you handle everything else), we stripped away the patient-facing layers most orgs want, keeping only what actually serves CAO.</p>
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What's in your stack (draw-only service)</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>CAO coordinators schedule via your provider portal</strong> — participants do NOT self-schedule. You control every appointment: date, time, participant, reference ID. Patient-facing online booking is disabled for CAO by design.</li>
        <li><strong>Patient-name masking on every surface</strong> — calendar, phleb dashboard, admin views, notifications — all show a reference ID instead of the participant's name. Only super-admin can unmask, and every unmask is audit-logged for HIPAA + sponsor compliance.</li>
        <li><strong>$55 per in-office draw</strong>, charged instantly to CAO's Stripe the moment you schedule. Participants pay $0, ever. No invoices, no receivables, no chasing — paid at booking.</li>
        <li><strong>Billing walled off</strong> — CAO's billing history in Stripe is completely isolated from any patient-billing history. A CAO invoice can never accidentally reveal a different CAO participant's info, and patient customers can never see CAO's invoices.</li>
        <li><strong>Draw chain-of-custody</strong> — every draw gets a collection timestamp, phleb initials, and the GPS point of the office where it was drawn. You get a sponsor-ready audit log automatically — no deliveries, no pickup tracking, just the clean draw record CAO needs.</li>
        <li><strong>Business-hours Mon–Fri scheduling</strong> — protocol-window flexibility, no weekend complications.</li>
        <li><strong>Team logins for every coordinator</strong> — each has their own portal view scoped only to CAO data.</li>
      </ul>
      <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:12px;padding:18px 20px;margin:18px 0;">
        <p style="margin:0;font-size:13px;color:#78350f;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">One of a kind, built by us</p>
        <p style="margin:8px 0 0;font-size:14px;color:#451a03;line-height:1.55;">
          The patient-name masking, the org-scoped billing isolation, the unmask audit-log, and the sponsor-ready draw chain-of-custody are all proprietary to ConveLabs — built specifically for clinical-research sites like yours. You won't find this stack anywhere else in mobile phlebotomy.
        </p>
      </div>
      <div style="background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%);border:2px solid #d97706;border-radius:14px;padding:22px;margin:22px 0;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:800;">Headline feature — coordinator-initiated draws (CAO variant)</p>
        <h3 style="margin:0 0 10px;color:#78350f;font-size:18px;">Your coordinator registers the participant. We confirm the slot.</h3>
        <p style="margin:0 0 10px;font-size:14px;color:#451a03;line-height:1.55;">
          Because CAO is coordinator-scheduled (participants don't self-book), the flow is tighter: coordinator uploads the IRB-approved order, registers the participant under a reference ID (name stays masked), sets the collection-window date, and confirms the draw slot. The participant gets zero public-facing messaging.
        </p>
        <div style="background:#ffffff;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;margin:12px 0;">
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13.5px;color:#1f2937;line-height:1.55;">
            <tr><td style="padding:4px 8px 4px 0;vertical-align:top;width:28px;color:#B91C1C;font-weight:800;">1.</td><td style="padding:4px 0;"><strong>Coordinator uploads the order.</strong> IRB-approved form in PDF. OCR pulls every required analyte so the phleb arrives with the exact tube set.</td></tr>
            <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:#B91C1C;font-weight:800;">2.</td><td style="padding:4px 0;"><strong>Register the participant by reference ID.</strong> Name masked on every downstream surface; unmask requires super-admin and is audit-logged for the sponsor.</td></tr>
            <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:#B91C1C;font-weight:800;">3.</td><td style="padding:4px 0;"><strong>Set the protocol collection window.</strong> "Must draw between Day 7 and Day 10 post-dose." The system will NOT let a slot be scheduled outside that window.</td></tr>
            <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:#B91C1C;font-weight:800;">4.</td><td style="padding:4px 0;"><strong>Coordinator picks a slot.</strong> No patient-facing SMS. No tokenized link. All scheduling stays inside your portal — per CAO design.</td></tr>
          </table>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin:10px 0 2px;">
          <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.5;">
            <strong>If the collection window closes unfulfilled</strong> — the request auto-expires and your coordinator gets an email with the missed-window timestamp for the sponsor trail.
          </p>
        </div>
      </div>
      ${RISK_REVERSAL}
      ${loginBlock('smartin@clinicalassociatesorlando.com')}
      <p>Shawna — clinical research is the hardest compliance environment in lab collection, and you've held us to a high bar. The whole rebuild is us trying to earn another year of your trust.</p>
      ${SIGNOFF}
    `),
  },
  {
    to: 'elitemedicalconcierge@gmail.com',
    portalEmail: 'elitemedicalconcierge@gmail.com',
    subject: 'Three ways to stop reconciling per-visit invoices — pick the plan that fits',
    html: brandWrap('Elite Medical × ConveLabs — the subscription offer', `
      <p>Hi Dr. Sher,</p>
      <p>You and Dr. Edwards built Elite Medical Concierge so your patients never wait in a waiting room, never fill out a form twice, never see a bill at the door. You built <strong>frictionless</strong>. The lab-collection step should feel the same — for your patients <em>and</em> for your accounting.</p>
      <p>Right now, every visit we do for Elite generates its own invoice. Fine at low volume. Painful at scale. As you grow, reconciling dozens of per-visit invoices is the exact kind of slow-bleed admin overhead that steals time from higher-value work.</p>
      <p>Three clean options below — sized for different volumes. Pick the one that fits your operation.</p>
      <div style="margin:18px 0;">
        <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:14px;padding:18px;margin-bottom:10px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;"><tr>
            <td style="vertical-align:top;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;font-weight:700;">Option A · Starter</p>
              <h3 style="margin:0;color:#0f172a;font-size:18px;">Starter 10</h3>
              <p style="margin:6px 0 0;font-size:13px;color:#475569;">Month-to-month. Cancel anytime. Best if you do ~10 visits/month.</p>
            </td>
            <td style="vertical-align:top;text-align:right;white-space:nowrap;">
              <p style="margin:0;font-size:24px;font-weight:800;color:#0f172a;">$650<span style="font-size:13px;font-weight:500;color:#475569;"> / month</span></p>
              <p style="margin:2px 0 0;font-size:12px;color:#475569;">= $65 / visit · <strong>save $7.25 vs Flex</strong></p>
            </td>
          </tr></table>
          <ul style="padding-left:18px;margin:12px 0 0;font-size:13px;color:#334155;line-height:1.55;">
            <li><strong>10 visits/month included</strong> — flat $650 charged to Elite's Stripe at month start</li>
            <li>Overage above 10 visits → $72.25 / visit (Monthly Flex rate)</li>
            <li>Unused visits expire at month-end (encourages steady utilization)</li>
            <li>Everything in the platform stack — same service, smaller bucket</li>
          </ul>
        </div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:8px 0;"><tr>
          <td style="width:50%;vertical-align:top;background:#ffffff;border:1.5px solid #e5e7eb;border-radius:14px;padding:18px;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:700;">Option B · Flexible</p>
            <h3 style="margin:0;color:#111827;font-size:17px;">Monthly Flex</h3>
            <p style="margin:6px 0 10px;font-size:13px;color:#6b7280;">Unlimited volume. No commitment. Cancel anytime.</p>
            <p style="margin:0;font-size:26px;font-weight:800;color:#111827;">$72.25<span style="font-size:13px;font-weight:500;color:#6b7280;"> / visit</span></p>
            <p style="margin:4px 0 8px;font-size:12px;color:#6b7280;">Auto-charged at month-end, pure usage.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:10px 12px;margin:0 0 12px;font-size:12px;line-height:1.5;color:#334155;">
              <strong>Typical Elite volume:</strong><br>10 visits/mo = <strong>$722/mo</strong><br>20 visits/mo = <strong>$1,445/mo</strong><br>40 visits/mo = <strong>$2,890/mo</strong>
            </div>
            <ul style="padding-left:18px;margin:0;font-size:13px;color:#374151;line-height:1.55;">
              <li>One consolidated monthly statement</li><li>Live MTD usage dashboard</li><li>Per-patient breakdown (HIPAA-scoped)</li><li>No visit cap — scale freely</li><li>Patients never see a bill</li>
            </ul>
          </td>
          <td style="width:50%;vertical-align:top;background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);color:#fff;border:1.5px solid #7F1D1D;border-radius:14px;padding:18px;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#fecaca;font-weight:700;">Option C · Best value</p>
            <h3 style="margin:0;color:#fff;font-size:17px;">Annual Partner</h3>
            <p style="margin:6px 0 10px;font-size:13px;color:#fecaca;">12-month partnership, usage-based, rate locked.</p>
            <p style="margin:0;font-size:26px;font-weight:800;color:#fff;">$60.20<span style="font-size:13px;font-weight:500;color:#fecaca;"> / visit</span></p>
            <p style="margin:4px 0 8px;font-size:12px;color:#fef3c7;font-weight:600;">Save $12.05 / visit · effectively 2 months free</p>
            <div style="background:rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;margin:0 0 12px;font-size:12px;line-height:1.5;color:#fef3c7;">
              <strong>Typical Elite volume:</strong><br>10 visits/mo = <strong>$602/mo</strong> · $7,224/yr<br>20 visits/mo = <strong>$1,204/mo</strong> · $14,448/yr<br>40 visits/mo = <strong>$2,408/mo</strong> · $28,896/yr<br><span style="opacity:.85;">Monthly minimum: $602 (≈10 visits). Billed monthly on actual use.</span>
            </div>
            <ul style="padding-left:18px;margin:0;font-size:13px;color:#fef3c7;line-height:1.55;">
              <li><strong>Priority scheduling</strong> — Elite visits slot first</li><li><strong>Dedicated phleb when available</strong> — same face</li><li><strong>Rush turnaround</strong> on request, no surcharge</li><li>Rate locked all 12 months</li><li>Cancel mid-year with 60-day notice</li>
            </ul>
          </td>
        </tr></table>
      </div>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0 0 6px;font-size:13px;color:#166534;font-weight:700;">The math (real numbers)</p>
        <p style="margin:0;font-size:13px;color:#14532d;line-height:1.6;">At <strong>10 visits/month</strong>: Monthly Flex = $722.50/mo · Starter 10 = $650/mo → <strong>save $870/yr</strong>.<br>At <strong>20 visits/month</strong>: Monthly Flex = $1,445/mo · Annual Partner = $1,204/mo → <strong>save $2,892/yr</strong>.<br>At <strong>40 visits/month</strong>: Monthly Flex = $2,890/mo · Annual Partner = $2,408/mo → <strong>save $5,784/yr</strong>.<br>At <strong>80 visits/month</strong>: Monthly Flex = $5,780/mo · Annual Partner = $4,816/mo → <strong>save $11,568/yr</strong>.</p>
      </div>
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What's in both plans</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Mon–Fri 6am–2pm scheduling window</strong> — wide open, matching your patients' schedules.</li>
        <li><strong>Full internal-medicine panel support</strong> — CBC/CMP, lipid subfractions, thyroid full, hormones, hs-CRP, HbA1c, vitamin D, iron studies, cardiac markers.</li>
        <li><strong>Team logins for you + Dr. Edwards + staff</strong> — unlimited.</li>
      </ul>
      ${TECH_POSITIONING}
      ${LAB_REQUEST_FLOW_BLOCK}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Two ways to enroll — pick what's easier</h3>
      <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Path 1 — from this email:</strong> click a plan below and it opens a pre-filled email to info@convelabs.com. I'll see it and wire up your subscription in under 5 minutes.</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:6px 0;margin:12px 0;"><tr>
        <td style="width:33%;text-align:center;"><a href="mailto:info@convelabs.com?subject=Enroll%20Elite%20Medical%20in%20Starter%2010" style="display:block;background:#f1f5f9;color:#0f172a;border:1.5px solid #cbd5e1;padding:12px 8px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Enroll in Starter 10<br><span style="font-size:11px;font-weight:500;color:#475569;">$650 / month</span></a></td>
        <td style="width:33%;text-align:center;"><a href="mailto:info@convelabs.com?subject=Enroll%20Elite%20Medical%20in%20Monthly%20Flex" style="display:block;background:#fff;color:#111827;border:1.5px solid #e5e7eb;padding:12px 8px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Enroll in Monthly Flex<br><span style="font-size:11px;font-weight:500;color:#6b7280;">$72.25 / visit</span></a></td>
        <td style="width:33%;text-align:center;"><a href="mailto:info@convelabs.com?subject=Enroll%20Elite%20Medical%20in%20Annual%20Partner" style="display:block;background:#B91C1C;color:#fff;border:1.5px solid #7F1D1D;padding:12px 8px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Enroll in Annual Partner<br><span style="font-size:11px;font-weight:500;color:#fecaca;">$60.20 / visit · best value</span></a></td>
      </tr></table>
      <p style="margin:14px 0 8px;font-size:14px;color:#374151;"><strong>Path 2 — from your provider portal:</strong> log in with the button above, click <em>Subscription Plans</em> in your dashboard, and enroll directly.</p>
      ${loginBlock('elitemedicalconcierge@gmail.com')}
      <p>Dr. Sher — the way you and Dr. Edwards run Elite Medical is the benchmark. This subscription is how we match that operational standard on the billing side.</p>
      ${SIGNOFF}
    `),
  },
  {
    to: 'jasonlittleton@jasonmd.com',
    portalEmail: 'jasonlittleton@jasonmd.com',
    subject: 'For the doctor who built his practice around advanced labs',
    html: brandWrap('Dr. Littleton — your portal is ready', `
      <p>Hi Dr. Littleton,</p>
      <p>You literally have a page on jasonmd.com titled <strong>"Advanced Lab Testing."</strong> You wrote <em>WellSpring: The Energy Secrets to Do the Good Life</em>. You host <em>The Concierge Doc Podcast</em>. You tell Fox35 Good Day Orlando viewers that the labs <strong>are</strong> the roadmap.</p>
      <p>A doctor who believes labs are the roadmap deserves a lab-collection partner whose entire platform is engineered around that belief — not an afterthought. We rebuilt ConveLabs for exactly that kind of practice.</p>
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for Littleton Concierge, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Advanced-panel support from day one</strong> — NMR lipid, insulin resistance panels, hormones (total + free + SHBG), thyroid full panel, CGM workflow, vitamin D, omega-3 index, hs-CRP, homocysteine, ApoB.</li>
        <li><strong>$150 mobile draw</strong>, patient-pay. Member patients auto-get whichever price is lower — no "did I get the discount?" phone calls.</li>
        <li><strong>Membership upsell at checkout</strong> — patients running ongoing lab work save hundreds per year by joining the ConveLabs membership.</li>
        <li><strong>WellSpring-aligned prep</strong> — extended-fast-friendly intake reinforces the protocols you're already prescribing.</li>
        <li><strong>Team logins</strong> — add your concierge staff with one click each.</li>
        <li><strong>Podcast collaboration open door</strong> — if you'd ever like a ConveLabs segment on <em>The Concierge Doc Podcast</em>, I'd be genuinely honored.</li>
        <li><strong>Coming soon:</strong> enter the patient's next Littleton appointment when scheduling, so results are in your hands before the review consult.</li>
      </ul>
      ${TECH_POSITIONING}
      ${LAB_REQUEST_FLOW_BLOCK}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}
      ${loginBlock('jasonlittleton@jasonmd.com')}
      <p>Dr. Littleton — the way you talk about labs on the podcast is the way we built this system. I'd be honored to earn a share of the collection work from your patients.</p>
      ${SIGNOFF}
    `),
  },
  {
    to: 'team@naturamed.org',
    portalEmail: 'team@naturamed.org',
    subject: 'Your NaturaMed × ConveLabs portal — built around Nourish to Flourish + AlignHer',
    html: brandWrap('Your NaturaMed portal is live', `
      <p>Hi Dr. Skrzypek,</p>
      <p>Functional medicine done well — your <em>Nourish to Flourish</em> program, the AlignHer Foundations (Gut Rebalance / Mood &amp; Hormones / Metabolic Clarity) — depends on <strong>specialty-kit integrity</strong>. Strict fasting windows, precise collection timing, careful handling — and the data quality swings wildly with who's doing the collection.</p>
      <p>When a panel is spoiled, the whole protocol pauses. Your patient doesn't feel progress, and you don't have the data to adjust. We engineered the new ConveLabs platform to protect exactly those moments.</p>
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for NaturaMed, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default. Flip any individual visit to "NaturaMed pays" with one toggle.</li>
        <li><strong>Mon–Fri 6–9am morning window</strong>, enforced automatically — ideal for fasting-dependent panels.</li>
        <li><strong>Specialty-kit trained phlebotomists</strong> — our team is drilled on the specialty-kit formats your protocols use.</li>
        <li><strong>AlignHer-aligned intake</strong> — patients tell us which AlignHer protocol they're on, so pre-visit instructions match.</li>
        <li><strong>Team logins</strong> — add every NaturaMed coordinator.</li>
        <li><strong>Coming soon:</strong> enter the patient's next NaturaMed follow-up when scheduling, so results are in your hands before the review appointment.</li>
      </ul>
      ${TECH_POSITIONING}
      ${LAB_REQUEST_FLOW_BLOCK}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}
      ${loginBlock('team@naturamed.org')}
      <p>Dr. Skrzypek — the data-quality standard you hold is the reason this rebuild exists. Thank you for trusting us with the collection step.</p>
      ${SIGNOFF}
    `),
  },
  {
    to: 'info@ndwellness.com',
    portalEmail: 'info@ndwellness.com',
    subject: 'Concierge lab collection for your New Dimensions members',
    html: brandWrap('ND Wellness — your portal is ready', `
      <p>Hi Justin,</p>
      <p>Your members come to New Dimensions for the full stack — PT, performance, hyperbaric, infrared sauna, acupuncture, and the metabolic / hormonal lab work that ties it all together.</p>
      <p>A concierge wellness club deserves a concierge lab-draw partner. Patients whose recovery depends on clean data can't afford a rushed draw, a mistimed fast, or a lost specimen.</p>
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for ND Wellness, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Anytime-during-business-hours booking</strong> — no 6–9am restriction. Athletes book around training blocks.</li>
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default — flip to "ND Wellness pays" with one toggle.</li>
        <li><strong>Performance-panel support</strong> — total + free T, thyroid full, estradiol, SHBG, DHEA-S, vitamin D, iron/ferritin, CBC/CMP, hs-CRP, HbA1c, lipid subfractions, cortisol AM, omega-3 index.</li>
        <li><strong>Recovery-panel integration</strong> — flag a visit as "performance follow-up" and we send pre-visit instructions aligned with your recovery protocols.</li>
        <li><strong>Team logins</strong> — Brantley, coaches, front desk — each their own view.</li>
        <li><strong>Member linking</strong> — ND Wellness members who are also ConveLabs members auto-get whichever price is lower.</li>
        <li><strong>Coming soon:</strong> enter a member's next ND visit when scheduling the draw, so labs are back before the follow-up protocol adjustment.</li>
      </ul>
      ${TECH_POSITIONING}
      ${LAB_REQUEST_FLOW_BLOCK}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}
      ${loginBlock('info@ndwellness.com')}
      <p>Justin, Brantley — the referrals we get from ND Wellness are the best compliment this business receives, and this rebuild is us trying to earn them again.</p>
      ${SIGNOFF}
    `),
  },
  {
    to: 'schedule@trpclinic.com',
    portalEmail: 'schedule@trpclinic.com',
    subject: 'Smarter HRT lab workflow for your BioTE patients — built around the pellet consult',
    html: brandWrap('A better lab system for your BHRT patients', `
      <p>Hi Christelle,</p>
      <p>Hormone replacement therapy lives or dies on two things: <strong>getting labs drawn in the correct biological window</strong>, and <strong>having results in hand before the consult</strong>.</p>
      <p>When either step slips, your BioTE pellet decision gets delayed, the patient loses a week of symptom relief, and your Winter Garden schedule absorbs the hit. We rebuilt ConveLabs to protect both of those moments.</p>
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for The Restoration Place, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>6–9am biological-window enforced automatically</strong> — patients literally cannot book outside the right window for AM cortisol and morning-sensitive hormone panels.</li>
        <li><strong>Full BHRT panel support</strong> — estradiol, total + free T, SHBG, DHEA-S, AM cortisol, TSH + full thyroid, CBC/CMP, lipid subfractions, HbA1c, PSA for male pellet patients.</li>
        <li><strong>$125 flat patient-pay rate</strong> — member patients auto-get whichever rate is lower.</li>
        <li><strong>Membership upsell at checkout</strong> — BHRT patients are long-term lab users; the system shows them the savings math at booking so they convert themselves.</li>
        <li><strong>Your admin team can be added</strong> — unlimited front-desk logins.</li>
        <li><strong>BioTE-aligned prep</strong> — pellet-follow-up patients get protocol-specific pre-visit instructions around supplementation, hydration, and timing.</li>
        <li><strong>Coming soon:</strong> enter the patient's next pellet consult when scheduling, so results are ready before they walk in for the pellet decision.</li>
      </ul>
      ${TECH_POSITIONING}
      ${LAB_REQUEST_FLOW_BLOCK}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}
      ${loginBlock('schedule@trpclinic.com')}
      <p>Christelle — the work your team does in Winter Garden matters to a lot of people. This rebuild is our way of matching the standard you hold yourselves to.</p>
      ${SIGNOFF}
    `),
  },
];

async function sendOne(draft: typeof emails[0]) {
  // Hard dedup guard — never send to the same org twice for this campaign,
  // regardless of why this function got called.
  if (await hasAlreadyBeenSent(draft.to)) {
    return { ok: true, status: 0, to: draft.to, skipped: 'already_sent' };
  }
  const fd = new FormData();
  fd.append('from', `Nico at ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
  fd.append('to', draft.to);
  fd.append('bcc', BCC);
  fd.append('h:Reply-To', 'info@convelabs.com');
  fd.append('subject', draft.subject);
  fd.append('html', draft.html);
  fd.append('o:tracking-clicks', 'no');
  const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  const body = await resp.text();
  if (!resp.ok) return { ok: false, status: resp.status, to: draft.to, error: body.substring(0, 400) };
  let mgId: string | null = null;
  try { mgId = JSON.parse(body).id; } catch { /* non-blocking */ }
  await recordSent(draft.to, mgId);
  return { ok: true, status: resp.status, to: draft.to, id: mgId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ error: 'MAILGUN_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json().catch(() => ({}));
    if (body?.token !== EXPECTED_TOKEN) {
      return new Response(JSON.stringify({ error: 'bad token' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const results = [];
    for (const draft of emails) {
      results.push(await sendOne(draft));
      await new Promise(r => setTimeout(r, 400));
    }
    return new Response(JSON.stringify({
      success: results.every(r => r.ok),
      sent: results.length,
      results,
      fired_at: new Date().toISOString(),
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
