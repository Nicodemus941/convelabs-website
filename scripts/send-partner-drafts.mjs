// Sends 7 Hormozi-structured announcement-email DRAFTS to info@convelabs.com.
// Intentionally to internal inbox — NOT to the actual partners until approved.
// Contact names + emails pulled from the organizations table.
// Run:  SUPABASE_ANON_KEY=... node scripts/send-partner-drafts.mjs

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || '';
if (!ANON) { console.error('Set SUPABASE_ANON_KEY env var first'); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────
// HORMOZI EMAIL FRAMEWORK (applied to every draft below)
//
//   1. HOOK    — name the partner's specific pain in the FIRST sentence
//   2. AGITATE — what it costs them if nothing changes
//   3. STACK   — the solution stack, each line maps a benefit to the partner
//   4. REVERSE — risk reversal (recollection policy, guarantee in writing)
//   5. SCARCE  — founding-partner framing (early access, locked-in terms)
//   6. CTA     — one button, one action, email is pre-filled
//   7. SIGNOFF — Nico as founder, direct line, not a mass blast
//
// Every email ends with ONE CTA (portal link), not a menu of choices.
// ─────────────────────────────────────────────────────────────────────────────

const brandWrap = (title, body) => `
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

const portalUrlFor = (email) =>
  `https://www.convelabs.com/provider?email=${encodeURIComponent(email)}`;

// ─────────────────────────────────────────────────────────────────────────────
// PROPRIETARY TECH BLOCK — the "one-of-a-kind" positioning the user requested.
// ConveLabs OCR Technology (not "Claude Vision" — that's an internal detail).
// Framed as proprietary and unavailable elsewhere. Emphasizes category leadership.
// ─────────────────────────────────────────────────────────────────────────────
const TECH_POSITIONING = `
  <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:12px;padding:18px 20px;margin:18px 0;">
    <p style="margin:0;font-size:13px;color:#78350f;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">One of a kind, built by us</p>
    <p style="margin:8px 0 0;font-size:14px;color:#451a03;line-height:1.55;">
      The ConveLabs platform is the only one of its kind. The automated workflow, the <strong>ConveLabs OCR Technology</strong>, the specimen-tracking chain-of-custody, the billing isolation, and the provider portal are proprietary — built in-house for the specific problems mobile phlebotomy creates. You won't find this stack anywhere else in concierge lab services.
    </p>
  </div>
`;

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM STACK — what every provider gets. Tight bullets, no fluff.
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// RISK REVERSAL — the recollection guarantee, in writing. Hormozi Rule #1:
// the biggest value-add is lowering perceived risk.
// ─────────────────────────────────────────────────────────────────────────────
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

const loginBlock = (email) => `
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
  <p style="margin:22px 0 6px;">If you want a 10-minute walkthrough or have any questions, email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or call me directly at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a>. I read and answer everything myself. <em>(This draft comes from a no-reply address, so please use <strong>info@convelabs.com</strong> — not the "reply" button.)</em></p>
  <p style="margin:18px 0 0;">With gratitude,<br>
  <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
  <em>Founder, ConveLabs Concierge Lab Services</em></p>
`;

// ─────────────────────────────────────────────────────────────────────────────
// ORG-SPECIFIC DRAFTS
// ─────────────────────────────────────────────────────────────────────────────
const emails = [
  // ── 1. ARISTOTLE EDUCATION — Sharlene & Bri (Dr. Jamnadas's operations team) ──
  {
    subjectPrefix: '[DRAFT → Aristotle Education]',
    actualRecipient: 'sdean@aristotleeducation.com (Sharlene Dean) + Bri',
    portalEmail: 'sdean@aristotleeducation.com',
    subject: 'For Dr. Jamnadas\'s patients — a lab workflow built around his protocols',
    html: brandWrap('Aristotle × ConveLabs — your portal is ready', `
      <!-- HOOK -->
      <p>Hi Sharlene and Bri,</p>
      <p>Dr. Jamnadas's entire approach — the fasting protocols, the vagus-nerve reset, the red-light interventions, the personalized supplement panels — lives or dies on <strong>clean, correctly-timed lab data</strong>. When a 72-hour fast is burned because a draw got mistimed, the protocol restarts. Patient loses a week. You absorb the rebooking.</p>

      <!-- AGITATE -->
      <p>We rebuilt the entire ConveLabs system specifically so that failure mode never happens to one of your patients again.</p>

      <!-- STACK -->
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for Aristotle, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>VIP unrestricted window</strong> — your patients book any time Monday–Friday during business hours. No tier gates.</li>
        <li><strong>Flat $185 per specialty-kit collection</strong>, charged directly to Aristotle's Stripe the moment a visit is scheduled. Patients pay $0. You can flip any single visit to patient-pay with one toggle.</li>
        <li><strong>Extended-fast-safe intake</strong> — when a patient is on one of Dr. Jamnadas's prolonged fasts, the pre-visit instructions reinforce his protocol (hydration only, no supplements, no bulletproof coffee).</li>
        <li><strong>Team logins</strong> — you, Bri, and anyone else on the Aristotle operations team each get your own portal access under the same org.</li>
        <li><strong>Coming soon:</strong> enter a patient's next Aristotle consult when scheduling, so results land in Dr. Jamnadas's hands <em>before</em> the follow-up.</li>
      </ul>

      ${TECH_POSITIONING}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}

      <!-- SCARCITY / FOUNDING PARTNER -->
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Founding-partner pricing locked.</strong> The $185 rate and VIP unrestricted window are grandfathered for Aristotle as a founding partner. Rates go up for new partners; yours don't.</p>
      </div>

      ${loginBlock('sdean@aristotleeducation.com')}
      <p>Sharlene, Bri — Aristotle has been one of our most thoughtful partners, and the best design decisions in this rebuild came from watching how your team actually works. Thank you.</p>
      ${SIGNOFF}
    `),
  },

  // ── 2. CLINICAL ASSOCIATES OF ORLANDO — Shawna (clinical research, draw-only) ──
  // NOTE: CAO uses the DOCTOR'S office service only — we draw, they handle the rest.
  // No patient online booking (CAO coordinators schedule via provider portal).
  // No deliveries, no labeling, no OCR, no insurance capture, no tracking IDs.
  // Generic PLATFORM_STACK + TECH_POSITIONING intentionally NOT included here.
  {
    subjectPrefix: '[DRAFT → Clinical Associates of Orlando]',
    actualRecipient: 'smartin@clinicalassociatesorlando.com (Shawna Martin)',
    portalEmail: 'smartin@clinicalassociatesorlando.com',
    subject: 'Trial-grade privacy + chain-of-custody for your participants',
    html: brandWrap('CAO × ConveLabs — your portal is ready', `
      <!-- HOOK -->
      <p>Hi Shawna,</p>
      <p>Clinical research participants aren't "patients" in the normal sense. They're subjects under IRB-approved protocols, and your sponsors expect <strong>de-identification, accurate timestamps, and zero cross-participant contamination</strong> — every single visit.</p>

      <!-- AGITATE -->
      <p>Most mobile lab services aren't built for that standard. Ours is — because we built the whole platform specifically for it. And because your workflow is draw-only (we handle the venipuncture, you handle everything else), we stripped away the patient-facing layers most orgs want, keeping only what actually serves CAO.</p>

      <!-- STACK — CAO-specific only -->
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

      <!-- Tech positioning tailored for CAO (no OCR/delivery framing) -->
      <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:12px;padding:18px 20px;margin:18px 0;">
        <p style="margin:0;font-size:13px;color:#78350f;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">One of a kind, built by us</p>
        <p style="margin:8px 0 0;font-size:14px;color:#451a03;line-height:1.55;">
          The patient-name masking, the org-scoped billing isolation, the unmask audit-log, and the sponsor-ready draw chain-of-custody are all proprietary to ConveLabs — built specifically for clinical-research sites like yours. You won't find this stack anywhere else in mobile phlebotomy.
        </p>
      </div>

      ${RISK_REVERSAL}

      ${loginBlock('smartin@clinicalassociatesorlando.com')}
      <p>Shawna — clinical research is the hardest compliance environment in lab collection, and you've held us to a high bar. The whole rebuild is us trying to earn another year of your trust.</p>
      ${SIGNOFF}
    `),
  },

  // ── 3. ELITE MEDICAL CONCIERGE — Dr. Monica Sher (driving to SUBSCRIPTION) ──
  // Monthly + Annual tiers with Hormozi price anchoring: annual saves 2 months
  // via effectively a 16.7% discount, presented as "get 2 months free."
  {
    subjectPrefix: '[DRAFT → Elite Medical Concierge]',
    actualRecipient: 'elitemedicalconcierge@gmail.com (Dr. Monica Sher)',
    portalEmail: 'elitemedicalconcierge@gmail.com',
    subject: 'Three ways to stop reconciling per-visit invoices — pick the plan that fits',
    html: brandWrap('Elite Medical × ConveLabs — the subscription offer', `
      <!-- HOOK -->
      <p>Hi Dr. Sher,</p>
      <p>You and Dr. Edwards built Elite Medical Concierge so your patients never wait in a waiting room, never fill out a form twice, never see a bill at the door. You built <strong>frictionless</strong>. The lab-collection step should feel the same — for your patients <em>and</em> for your accounting.</p>

      <!-- AGITATE -->
      <p>Right now, every visit we do for Elite generates its own invoice. Fine at low volume. Painful at scale. As you grow, reconciling dozens of per-visit invoices is the exact kind of slow-bleed admin overhead that steals time from higher-value work.</p>
      <p>Three clean options below — sized for different volumes. Pick the one that fits your operation.</p>

      <!-- TIERED OFFER — STARTER 10 · MONTHLY FLEX · ANNUAL PARTNER -->
      <div style="margin:18px 0;">
        <!-- STARTER 10 -->
        <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:14px;padding:18px;margin-bottom:10px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td style="vertical-align:top;">
                <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;font-weight:700;">Option A · Starter</p>
                <h3 style="margin:0;color:#0f172a;font-size:18px;">Starter 10</h3>
                <p style="margin:6px 0 0;font-size:13px;color:#475569;">Month-to-month. Cancel anytime. Best if you do ~10 visits/month.</p>
              </td>
              <td style="vertical-align:top;text-align:right;white-space:nowrap;">
                <p style="margin:0;font-size:24px;font-weight:800;color:#0f172a;">$650<span style="font-size:13px;font-weight:500;color:#475569;"> / month</span></p>
                <p style="margin:2px 0 0;font-size:12px;color:#475569;">= $65 / visit · <strong>save $7.25 vs Flex</strong></p>
              </td>
            </tr>
          </table>
          <ul style="padding-left:18px;margin:12px 0 0;font-size:13px;color:#334155;line-height:1.55;">
            <li><strong>10 visits/month included</strong> — flat $650 charged to Elite's Stripe at month start</li>
            <li>Overage above 10 visits → $72.25 / visit (Monthly Flex rate)</li>
            <li>Unused visits expire at month-end (encourages steady utilization)</li>
            <li>Everything in the platform stack — same service, smaller bucket</li>
          </ul>
        </div>

        <!-- MONTHLY FLEX + ANNUAL PARTNER side-by-side -->
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:8px 0;">
          <tr>
            <!-- MONTHLY FLEX -->
            <td style="width:50%;vertical-align:top;background:#ffffff;border:1.5px solid #e5e7eb;border-radius:14px;padding:18px;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:700;">Option B · Flexible</p>
              <h3 style="margin:0;color:#111827;font-size:17px;">Monthly Flex</h3>
              <p style="margin:6px 0 10px;font-size:13px;color:#6b7280;">Unlimited volume. No commitment. Cancel anytime.</p>
              <p style="margin:0;font-size:26px;font-weight:800;color:#111827;">$72.25<span style="font-size:13px;font-weight:500;color:#6b7280;"> / visit</span></p>
              <p style="margin:4px 0 8px;font-size:12px;color:#6b7280;">Auto-charged at month-end, pure usage.</p>
              <div style="background:#f8fafc;border-radius:8px;padding:10px 12px;margin:0 0 12px;font-size:12px;line-height:1.5;color:#334155;">
                <strong>Typical Elite volume:</strong><br>
                10 visits/mo = <strong>$722/mo</strong><br>
                20 visits/mo = <strong>$1,445/mo</strong><br>
                40 visits/mo = <strong>$2,890/mo</strong>
              </div>
              <ul style="padding-left:18px;margin:0;font-size:13px;color:#374151;line-height:1.55;">
                <li>One consolidated monthly statement</li>
                <li>Live MTD usage dashboard</li>
                <li>Per-patient breakdown (HIPAA-scoped)</li>
                <li>No visit cap — scale freely</li>
                <li>Patients never see a bill</li>
              </ul>
            </td>

            <!-- ANNUAL PARTNER (highlighted) -->
            <td style="width:50%;vertical-align:top;background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);color:#fff;border:1.5px solid #7F1D1D;border-radius:14px;padding:18px;">
              <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#fecaca;font-weight:700;">Option C · Best value</p>
              <h3 style="margin:0;color:#fff;font-size:17px;">Annual Partner</h3>
              <p style="margin:6px 0 10px;font-size:13px;color:#fecaca;">12-month partnership, usage-based, rate locked.</p>
              <p style="margin:0;font-size:26px;font-weight:800;color:#fff;">$60.20<span style="font-size:13px;font-weight:500;color:#fecaca;"> / visit</span></p>
              <p style="margin:4px 0 8px;font-size:12px;color:#fef3c7;font-weight:600;">Save $12.05 / visit · effectively 2 months free</p>
              <div style="background:rgba(255,255,255,0.12);border-radius:8px;padding:10px 12px;margin:0 0 12px;font-size:12px;line-height:1.5;color:#fef3c7;">
                <strong>Typical Elite volume:</strong><br>
                10 visits/mo = <strong>$602/mo</strong> · $7,224/yr<br>
                20 visits/mo = <strong>$1,204/mo</strong> · $14,448/yr<br>
                40 visits/mo = <strong>$2,408/mo</strong> · $28,896/yr<br>
                <span style="opacity:.85;">Monthly minimum: $602 (≈10 visits). Billed monthly on actual use.</span>
              </div>
              <ul style="padding-left:18px;margin:0;font-size:13px;color:#fef3c7;line-height:1.55;">
                <li><strong>Priority scheduling</strong> — Elite visits slot first</li>
                <li><strong>Dedicated phleb when available</strong> — same face</li>
                <li><strong>Rush turnaround</strong> on request, no surcharge</li>
                <li>Rate locked all 12 months</li>
                <li>Cancel mid-year with 60-day notice</li>
              </ul>
            </td>
          </tr>
        </table>
      </div>

      <!-- PRICE MATH — Hormozi: show the exact dollar impact at each volume -->
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0 0 6px;font-size:13px;color:#166534;font-weight:700;">The math (real numbers)</p>
        <p style="margin:0;font-size:13px;color:#14532d;line-height:1.6;">
          At <strong>10 visits/month</strong>: Monthly Flex = $722.50/mo · Starter 10 = $650/mo → <strong>save $870/yr</strong>.<br>
          At <strong>20 visits/month</strong>: Monthly Flex = $1,445/mo · Annual Partner = $1,204/mo → <strong>save $2,892/yr</strong>.<br>
          At <strong>40 visits/month</strong>: Monthly Flex = $2,890/mo · Annual Partner = $2,408/mo → <strong>save $5,784/yr</strong>.<br>
          At <strong>80 visits/month</strong>: Monthly Flex = $5,780/mo · Annual Partner = $4,816/mo → <strong>save $11,568/yr</strong>.
        </p>
      </div>

      <!-- STACK -->
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What's in both plans</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Mon–Fri 6am–2pm scheduling window</strong> — wide open, matching your patients' schedules.</li>
        <li><strong>Full internal-medicine panel support</strong> — CBC/CMP, lipid subfractions, thyroid full, hormones, hs-CRP, HbA1c, vitamin D, iron studies, cardiac markers. Our phlebotomists are drilled on the full spectrum.</li>
        <li><strong>Team logins for you + Dr. Edwards + staff</strong> — unlimited.</li>
        <li><strong>Coming soon:</strong> enter a patient's next Elite Medical appointment when scheduling, so results are in hand before the follow-up.</li>
      </ul>

      ${TECH_POSITIONING}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}

      <!-- DUAL-PATH ENROLLMENT: email buttons + dashboard enrollment -->
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Two ways to enroll — pick what's easier</h3>

      <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Path 1 — from this email:</strong> click a plan below and it opens a pre-filled email to info@convelabs.com. I'll see it and wire up your subscription in under 5 minutes.</p>

      <!-- 3 enrollment buttons (mailto, since this email is from a no-reply address) -->
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:6px 0;margin:12px 0;">
        <tr>
          <td style="width:33%;text-align:center;">
            <a href="mailto:info@convelabs.com?subject=Enroll%20Elite%20Medical%20in%20Starter%2010&body=Hi%20Nico%2C%0A%0APlease%20enroll%20Elite%20Medical%20Concierge%20in%20the%20Starter%2010%20plan%20(%24650%2Fmo%2C%2010%20visits%20included).%0A%0AName%3A%20%0ABilling%20card%20on%20file%3A%20Yes%20%2F%20No%0A%0AThanks%2C%0ADr.%20Monica%20Sher" style="display:block;background:#f1f5f9;color:#0f172a;border:1.5px solid #cbd5e1;padding:12px 8px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Enroll in Starter 10<br><span style="font-size:11px;font-weight:500;color:#475569;">$650 / month</span></a>
          </td>
          <td style="width:33%;text-align:center;">
            <a href="mailto:info@convelabs.com?subject=Enroll%20Elite%20Medical%20in%20Monthly%20Flex&body=Hi%20Nico%2C%0A%0APlease%20enroll%20Elite%20Medical%20Concierge%20in%20the%20Monthly%20Flex%20plan%20(%2472.25%2Fvisit%2C%20unlimited%20volume%2C%20no%20commitment).%0A%0AThanks%2C%0ADr.%20Monica%20Sher" style="display:block;background:#fff;color:#111827;border:1.5px solid #e5e7eb;padding:12px 8px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Enroll in Monthly Flex<br><span style="font-size:11px;font-weight:500;color:#6b7280;">$72.25 / visit</span></a>
          </td>
          <td style="width:33%;text-align:center;">
            <a href="mailto:info@convelabs.com?subject=Enroll%20Elite%20Medical%20in%20Annual%20Partner&body=Hi%20Nico%2C%0A%0APlease%20enroll%20Elite%20Medical%20Concierge%20in%20the%20Annual%20Partner%20plan%20(%2460.20%2Fvisit%2C%2012-month%20commitment%2C%20priority%20scheduling).%0A%0AThanks%2C%0ADr.%20Monica%20Sher" style="display:block;background:#B91C1C;color:#fff;border:1.5px solid #7F1D1D;padding:12px 8px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Enroll in Annual Partner<br><span style="font-size:11px;font-weight:500;color:#fecaca;">$60.20 / visit · best value</span></a>
          </td>
        </tr>
      </table>

      <p style="margin:14px 0 8px;font-size:14px;color:#374151;"><strong>Path 2 — from your provider portal:</strong> log in with the button above, click <em>Subscription Plans</em> in your dashboard, and enroll in any tier directly. Your org's Stripe card on file gets charged automatically at the right cadence.</p>

      ${loginBlock('elitemedicalconcierge@gmail.com')}
      <p>Dr. Sher — the way you and Dr. Edwards run Elite Medical is the benchmark for concierge internal medicine. This subscription is how we match that operational standard on the billing side.</p>
      ${SIGNOFF}
    `),
  },

  // ── 4. LITTLETON CONCIERGE MEDICINE — Dr. Jason Littleton ──
  {
    subjectPrefix: '[DRAFT → Littleton Concierge Medicine]',
    actualRecipient: 'jasonlittleton@jasonmd.com (Dr. Jason Littleton)',
    portalEmail: 'jasonlittleton@jasonmd.com',
    subject: 'For the doctor who built his practice around advanced labs',
    html: brandWrap('Dr. Littleton — your portal is ready', `
      <!-- HOOK -->
      <p>Hi Dr. Littleton,</p>
      <p>You literally have a page on jasonmd.com titled <strong>"Advanced Lab Testing."</strong> You wrote <em>WellSpring: The Energy Secrets to Do the Good Life</em>. You host <em>The Concierge Doc Podcast</em>. You tell Fox35 Good Day Orlando viewers that the labs <strong>are</strong> the roadmap.</p>

      <!-- AGITATE -->
      <p>A doctor who believes labs are the roadmap deserves a lab-collection partner whose entire platform is engineered around that belief — not an afterthought. We rebuilt ConveLabs for exactly that kind of practice.</p>

      <!-- STACK -->
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for Littleton Concierge, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Advanced-panel support from day one</strong> — NMR lipid, insulin resistance panels, hormones (total + free + SHBG), thyroid full panel (TSH/Free T4/Free T3/Reverse T3/TPO/Tg), continuous-glucose-monitoring workflow, vitamin D, omega-3 index, hs-CRP, homocysteine, ApoB. Our phlebs are drilled on the full longevity panel mix.</li>
        <li><strong>$150 mobile draw</strong>, patient-pay. If they're also a ConveLabs member, they automatically get whichever price is lower — no "did I get the discount?" phone calls.</li>
        <li><strong>Membership upsell at checkout</strong> — patients running ongoing lab work (as yours do) save hundreds per year by joining the ConveLabs membership. We show them the exact savings math at booking so they convert themselves.</li>
        <li><strong>WellSpring-aligned prep</strong> — extended-fast-friendly intake reinforces the protocols you're already prescribing.</li>
        <li><strong>Team logins</strong> — add your concierge staff with one click each.</li>
        <li><strong>Podcast collaboration open door</strong> — if you'd ever like a ConveLabs segment on <em>The Concierge Doc Podcast</em>, I'd be genuinely honored. No pitch. Just open invitation.</li>
        <li><strong>Coming soon:</strong> enter the patient's next Littleton appointment when scheduling, so results are in your hands before the review consult.</li>
      </ul>

      ${TECH_POSITIONING}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}

      ${loginBlock('jasonlittleton@jasonmd.com')}
      <p>Dr. Littleton — the way you talk about labs on the podcast is the way we built this system. I'd be honored to earn a share of the collection work from your patients.</p>
      ${SIGNOFF}
    `),
  },

  // ── 5. NATURAMED — Dr. Karolina Skrzypek (removed saliva/GI-MAP/4-point) ──
  {
    subjectPrefix: '[DRAFT → NaturaMed / Natura Integrative]',
    actualRecipient: 'team@naturamed.org (Dr. Karolina Skrzypek)',
    portalEmail: 'team@naturamed.org',
    subject: 'Your NaturaMed × ConveLabs portal — built around Nourish to Flourish + AlignHer',
    html: brandWrap('Your NaturaMed portal is live', `
      <!-- HOOK -->
      <p>Hi Dr. Skrzypek,</p>
      <p>Functional medicine done well — your <em>Nourish to Flourish</em> program, the AlignHer Foundations (Gut Rebalance / Mood &amp; Hormones / Metabolic Clarity) — depends on <strong>specialty-kit integrity</strong>. Strict fasting windows, precise collection timing, careful handling — and the data quality swings wildly with who's doing the collection.</p>

      <!-- AGITATE -->
      <p>When a panel is spoiled, the whole protocol pauses. Your patient doesn't feel progress, and you don't have the data to adjust. We engineered the new ConveLabs platform to protect exactly those moments.</p>

      <!-- STACK -->
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for NaturaMed, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default. Flip any individual visit to "NaturaMed pays" with one toggle — useful for scholarship patients or program-included collections.</li>
        <li><strong>Mon–Fri 6–9am morning window</strong>, enforced automatically — ideal for fasting-dependent panels. No accidental non-fasting draws slip through.</li>
        <li><strong>Specialty-kit trained phlebotomists</strong> — our team is drilled on the specialty-kit formats your protocols use. The system labels the visit clearly so there's no ambiguity about what's being collected.</li>
        <li><strong>AlignHer-aligned intake</strong> — patients tell us which AlignHer protocol they're on, so pre-visit instructions match (Gut Rebalance has different prep than Mood &amp; Hormones).</li>
        <li><strong>Team logins</strong> — add every NaturaMed coordinator so they can schedule on behalf of patients from their own login.</li>
        <li><strong>Coming soon:</strong> enter the patient's next NaturaMed follow-up when scheduling, so results are in your hands before the review appointment.</li>
      </ul>

      ${TECH_POSITIONING}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}

      ${loginBlock('team@naturamed.org')}
      <p>Dr. Skrzypek — the data-quality standard you hold is the reason this rebuild exists. Thank you for trusting us with the collection step.</p>
      ${SIGNOFF}
    `),
  },

  // ── 6. ND WELLNESS — Justin Cobb + Brantley Hawkins ──
  {
    subjectPrefix: '[DRAFT → ND Wellness]',
    actualRecipient: 'info@ndwellness.com (Justin Cobb)',
    portalEmail: 'info@ndwellness.com',
    subject: 'Concierge lab collection for your New Dimensions members',
    html: brandWrap('ND Wellness — your portal is ready', `
      <!-- HOOK -->
      <p>Hi Justin,</p>
      <p>Your members come to New Dimensions for the full stack — PT, performance, hyperbaric, infrared sauna, acupuncture, and the metabolic / hormonal lab work that ties it all together.</p>

      <!-- AGITATE -->
      <p>A concierge wellness club deserves a concierge lab-draw partner. Patients whose recovery depends on clean data can't afford a rushed draw, a mistimed fast, or a lost specimen.</p>

      <!-- STACK -->
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for ND Wellness, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Anytime-during-business-hours booking</strong> — no 6–9am restriction. Athletes and performance clients book around training blocks, not around our schedule.</li>
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default — flip any single visit to "ND Wellness pays" with one toggle for comped members, onboarding panels, or anything you want to cover in-house.</li>
        <li><strong>Performance-panel support</strong> — total + free testosterone, thyroid full panel, estradiol, SHBG, DHEA-S, vitamin D, iron/ferritin, CBC/CMP, hs-CRP, HbA1c, lipid subfractions, cortisol AM, omega-3 index.</li>
        <li><strong>Recovery-panel integration</strong> — for members tracking training adaptation, flag a visit as "performance follow-up" and we'll send pre-visit instructions aligned with your recovery protocols.</li>
        <li><strong>Team logins</strong> — Brantley, coaches, front desk — each gets their own view.</li>
        <li><strong>Member linking</strong> — ND Wellness members who are also ConveLabs members automatically get whichever price is lower.</li>
        <li><strong>Coming soon:</strong> enter a member's next ND visit when scheduling the draw, so labs are back before the follow-up protocol adjustment.</li>
      </ul>

      ${TECH_POSITIONING}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}

      ${loginBlock('info@ndwellness.com')}
      <p>Justin, Brantley — the referrals we get from ND Wellness are the best compliment this business receives, and this rebuild is us trying to earn them again.</p>
      ${SIGNOFF}
    `),
  },

  // ── 7. THE RESTORATION PLACE — Christelle Renta ARNP (BioTE BHRT) ──
  {
    subjectPrefix: '[DRAFT → The Restoration Place]',
    actualRecipient: 'schedule@trpclinic.com (Christelle Renta ARNP)',
    portalEmail: 'schedule@trpclinic.com',
    subject: 'Smarter HRT lab workflow for your BioTE patients — built around the pellet consult',
    html: brandWrap('A better lab system for your BHRT patients', `
      <!-- HOOK -->
      <p>Hi Christelle,</p>
      <p>Hormone replacement therapy lives or dies on two things: <strong>getting labs drawn in the correct biological window</strong>, and <strong>having results in hand before the consult</strong>.</p>

      <!-- AGITATE -->
      <p>When either step slips, your BioTE pellet decision gets delayed, the patient loses a week of symptom relief, and your Winter Garden schedule absorbs the hit. We rebuilt ConveLabs to protect both of those moments.</p>

      <!-- STACK -->
      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What this means for The Restoration Place, specifically</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>6–9am biological-window enforced automatically</strong> — for AM cortisol and morning-sensitive hormone panels, your patients literally cannot book outside the right window. The system explains why and offers the next compliant slot.</li>
        <li><strong>Full BHRT panel support</strong> — estradiol, total + free T, SHBG, DHEA-S, AM cortisol, TSH + full thyroid, CBC/CMP, lipid subfractions, HbA1c, PSA for male pellet patients. Our phlebotomists are drilled on BioTE's exact panel mix.</li>
        <li><strong>$125 flat patient-pay rate</strong> — if your patient is also a ConveLabs member, they automatically get whichever rate is lower.</li>
        <li><strong>Membership upsell at checkout</strong> — BHRT patients are long-term lab users. The system shows them the exact savings math at booking so they convert themselves.</li>
        <li><strong>Your admin team can be added</strong> — unlimited front-desk logins.</li>
        <li><strong>BioTE-aligned prep</strong> — pellet-follow-up patients get protocol-specific pre-visit instructions around supplementation, hydration, and timing.</li>
        <li><strong>Coming soon:</strong> enter the patient's next pellet consult when scheduling, so results are ready before they walk in for the pellet decision.</li>
      </ul>

      ${TECH_POSITIONING}
      ${PLATFORM_STACK}
      ${RISK_REVERSAL}

      ${loginBlock('schedule@trpclinic.com')}
      <p>Christelle — the work your team does in Winter Garden matters to a lot of people. This rebuild is our way of matching the standard you hold yourselves to.</p>
      ${SIGNOFF}
    `),
  },
];

async function send(one) {
  const subject = `${one.subjectPrefix} ${one.subject}`;
  const banner = `
<div style="font-family:sans-serif;max-width:640px;margin:16px auto;background:#fef3c7;border:2px dashed #f59e0b;border-radius:8px;padding:14px;">
  <p style="margin:0;color:#78350f;font-size:12px;"><strong>🔎 DRAFT PREVIEW</strong> — not sent to partner. Intended recipient: <strong>${one.actualRecipient}</strong>. Portal URL pre-fills <code>${one.portalEmail}</code>. Review + reply with edits, or say "send for real" when approved.</p>
</div>`;
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON}` },
    body: JSON.stringify({
      to: 'info@convelabs.com',
      subject,
      html: banner + one.html,
      from: 'ConveLabs Drafts <noreply@mg.convelabs.com>',
    }),
  });
  const result = await resp.text();
  console.log(`${one.subjectPrefix}: ${resp.status} ${resp.ok ? '✓' : '✗'} ${result.substring(0, 200)}`);
}

for (const e of emails) {
  await send(e);
  await new Promise(r => setTimeout(r, 900));
}
console.log(`\nAll ${emails.length} Hormozi-structured drafts sent to info@convelabs.com.`);
