// Sends 7 tailored announcement-email DRAFTS to info@convelabs.com for Nico's review.
// Intentionally sent to internal inbox — NOT to the actual partners until approved.
// Contact names + emails pulled from the organizations table (source of truth).
// Run:  SUPABASE_ANON_KEY=... node scripts/send-partner-drafts.mjs

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || '';
if (!ANON) { console.error('Set SUPABASE_ANON_KEY env var first'); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────
// BRAND WRAPPER — every email uses this shell, signed by Nico.
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
// PLATFORM UPGRADES — the "what's new" block every org gets. Each org-specific
// email describes WHY it matters for them specifically (above this block), and
// this block lists the actual features.
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORM_UPGRADES = `
  <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What's new on the ConveLabs platform</h3>
  <p style="margin:0 0 10px;">We rebuilt the entire system around one question: <em>how do we save providers and patients time while making lab collection measurably safer?</em> Everything below is live today at <a href="https://www.convelabs.com" style="color:#B91C1C;">convelabs.com</a> and inside your provider portal.</p>
  <ul style="padding-left:20px;margin:10px 0 16px;">
    <li><strong>Patient online booking (convelabs.com)</strong> — your patients schedule themselves in under 90 seconds. Time-of-day windows, your org's billing rules, and any member discounts are all enforced automatically. No phone tag.</li>
    <li><strong>AI-powered fasting &amp; urine detection</strong> — our intake uses Claude Vision OCR to read the lab requisition at upload. Fasting-required or urine-required panels are flagged automatically and the patient gets protocol-specific prep instructions <em>before</em> the visit. Fewer redraws, fewer invalid specimens.</li>
    <li><strong>Insurance capture at booking</strong> — patients photograph front + back of their card during checkout; we store it, attach it to the requisition, and eliminate day-of paperwork.</li>
    <li><strong>Lab-order uploads</strong> — providers (and patients) upload the signed lab order directly into the portal. Claude Vision reads it and confirms panel match before our phleb arrives.</li>
    <li><strong>Specimen delivery notifications with tracking IDs</strong> — every specimen gets a unique tracking ID. You receive notifications at collection, pickup, reference-lab delivery, and result ETA — the same tracking experience as a FedEx shipment.</li>
    <li><strong>Real-time "Collected" vs. "Not Collected" status</strong> — if a patient cancels, reschedules, or something goes sideways at the lab, your portal reflects it instantly. Your team never has to chase us.</li>
    <li><strong>Transparent recollection policy — in writing</strong>
      <ul style="padding-left:20px;margin:6px 0;">
        <li>If <strong>ConveLabs</strong> caused the error, recollection is <strong>100% free</strong>.</li>
        <li>If the <strong>reference lab</strong> caused the error, recollection is <strong>50% off</strong>.</li>
      </ul>
    </li>
    <li><strong>Receipts + accounting sync</strong> — every visit has a downloadable receipt; reconciliation to QuickBooks happens on our side automatically.</li>
    <li><strong>Billing isolation</strong> — if your org is the bill-payer, invoices go only to your billing email. If patients are the bill-payers, each patient's invoice stays scoped to them. No cross-contamination of billing history between patients.</li>
  </ul>
`;

const loginBox = (email) => `
  <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">How to access your provider portal</h3>
  <p style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin:10px 0;">
    <strong>1.</strong> Go to <a href="${portalUrlFor(email)}" style="color:#B91C1C;">convelabs.com/provider</a> — your email is already pre-filled.<br>
    <strong>2.</strong> If you already have a password, log in directly.<br>
    <strong>3.</strong> First time here? Click <em>"Send me a password setup link"</em> and you'll get an email in under a minute. One click, set your password, you're in.
  </p>
  <div style="text-align:center;margin:22px 0;">
    <a href="${portalUrlFor(email)}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Open my provider portal →</a>
  </div>
`;

const SIGNOFF = `
  <p style="margin:22px 0 6px;">If anything is unclear or you'd like a 10-minute walkthrough, reply to this email or call me directly at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a>. I'd genuinely love your feedback — this rebuild was designed for the way you already work.</p>
  <p style="margin:18px 0 0;">With gratitude,<br>
  <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
  <em>Founder, ConveLabs Concierge Lab Services</em></p>
`;

// ─────────────────────────────────────────────────────────────────────────────
// ORGS — contact info from DB; personalization body is hand-authored per org.
// ─────────────────────────────────────────────────────────────────────────────
const emails = [
  // ── 1. ARISTOTLE EDUCATION — Dr. Pradip Jamnadas (cardiology / longevity / fasting) ──
  {
    subjectPrefix: '[DRAFT → Aristotle Education]',
    actualRecipient: 'sdean@aristotleeducation.com (Sharlene Dean, billing) + bjung@aristotleeducation.com (Barry Jung, contact)',
    portalEmail: 'sdean@aristotleeducation.com',
    subject: 'Dr. Jamnadas\'s patients now have a scheduling system built around his protocols',
    html: brandWrap('Welcome to your Aristotle × ConveLabs portal', `
      <p>Hi Sharlene,</p>
      <p>Dr. Jamnadas's work — the fasting protocols, the vagus-nerve reset, red-light therapy, personalized supplement panels, the gut biome interventions — <strong>depends entirely on clean, correctly-timed lab data</strong>. When a 72-hour fast is wasted because a draw was missed or mistimed, the whole protocol has to restart. We rebuilt the new ConveLabs platform specifically so that never happens to one of your patients again.</p>

      <p><strong>What this means for Aristotle Education specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>VIP unrestricted scheduling window</strong> — your patients can book <em>any time</em> Monday through Friday during business hours. No tier gates, no morning-only restriction.</li>
        <li><strong>Flat $185 per specialty-kit collection</strong>, invoiced directly to Aristotle Education (Net 30). Your patients see $0. You can flip individual visits to patient-pay at booking with one toggle.</li>
        <li><strong>Extended-fast friendly workflow</strong> — the system flags when Dr. Jamnadas's patients are on a prolonged fast and reinforces his protocol (hydration, no supplements, no bulletproof coffee, etc.) in the pre-visit instructions.</li>
        <li><strong>Team logins for the whole Aristotle office</strong> — Barry, you, and anyone else on the scheduling team gets their own portal login under the organization.</li>
        <li><strong>Coming soon:</strong> enter a patient's next Aristotle appointment when scheduling their draw, so the lab results land in Dr. Jamnadas's hands <em>before</em> the follow-up consult.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${loginBox('sdean@aristotleeducation.com')}
      <p>Sharlene, Barry — Aristotle has been one of our most thoughtful partners. Every design decision in this rebuild reflects something your team taught us along the way. Thank you.</p>
      ${SIGNOFF}
    `),
  },

  // ── 2. CLINICAL ASSOCIATES OF ORLANDO — Shawna Martin (clinical research site) ──
  {
    subjectPrefix: '[DRAFT → Clinical Associates of Orlando]',
    actualRecipient: 'smartin@clinicalassociatesorlando.com (Shawna Martin)',
    portalEmail: 'smartin@clinicalassociatesorlando.com',
    subject: 'Trial-grade privacy + chain-of-custody for your participants — your new CAO portal is live',
    html: brandWrap('Your CAO × ConveLabs portal is ready', `
      <p>Hi Shawna,</p>
      <p>Clinical research participants aren't "patients" in the normal sense — they're subjects under IRB-approved protocols, and your sponsors demand specific handling: <strong>de-identification, chain-of-custody, accurate timestamps, and zero cross-patient contamination.</strong> We rebuilt our platform with CAO's exact requirements in mind.</p>

      <p><strong>What this means for Clinical Associates of Orlando specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Patient-name masking on EVERY surface</strong> — our calendar, phleb dashboard, admin views, and all outbound notifications show a reference ID (not the participant's name) for CAO appointments. Only the super-admin can unmask, and every unmask is audit-logged.</li>
        <li><strong>$55 per in-office visit</strong>, invoiced directly to CAO with Net 30 terms. Participants see $0. No billing paperwork on their end, ever.</li>
        <li><strong>Org-scoped billing isolation</strong> — CAO's invoices are routed only to <em>your</em> billing email (smartin@…). Your invoice history is completely walled off from patient-billing history. No cross-contamination, ever.</li>
        <li><strong>Business-hours Mon–Fri scheduling window</strong> — flexibility for trial protocol windows without weekend complications.</li>
        <li><strong>Specimen chain-of-custody stamps</strong> — every specimen gets a timestamp, phleb initials, GPS collection point, delivery timestamp, and tracking ID. Sponsor-ready audit trail, automatically.</li>
        <li><strong>Team logins</strong> — add as many CAO coordinators as you need. Each has their own view.</li>
        <li><strong>Coming soon:</strong> visit-schedule linking to trial-protocol visit windows, so no participant ever drifts outside their protocol window.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${loginBox('smartin@clinicalassociatesorlando.com')}
      <p>Shawna — clinical research is the hardest compliance environment in lab-collection work, and you've held us to a high bar. Everything above is us trying to earn another year of your trust.</p>
      ${SIGNOFF}
    `),
  },

  // ── 3. ELITE MEDICAL CONCIERGE — Dr. Monica Sher + Dr. Richard Edwards (internal med / concierge) ──
  {
    subjectPrefix: '[DRAFT → Elite Medical Concierge]',
    actualRecipient: 'elitemedicalconcierge@gmail.com (Dr. Monica Sher)',
    portalEmail: 'elitemedicalconcierge@gmail.com',
    subject: 'Concierge-grade lab collection for your concierge patients — your portal is ready',
    html: brandWrap('Welcome to your Elite Medical × ConveLabs portal', `
      <p>Hi Dr. Sher,</p>
      <p>You and Dr. Edwards built Elite Medical Concierge around a simple idea: <strong>your patients deserve medicine that comes to them, on their time, with zero friction.</strong> A concierge internal-medicine practice deserves a concierge lab-collection experience. We rebuilt ours to match.</p>

      <p><strong>What this means for Elite Medical Concierge specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>$72.25 per mobile visit</strong>, invoiced directly to Elite Medical Concierge (Net 30). Your patients never see a bill at the door.</li>
        <li><strong>Monthly subscription billing available</strong> — we can also roll your visits into a predictable monthly subscription so there's one invoice to reconcile instead of many. Let me know if you'd like that configured.</li>
        <li><strong>Mon–Fri 6am–2pm scheduling window</strong> — wide-open for concierge-level flexibility, matching your patients' schedules.</li>
        <li><strong>Comprehensive panel support</strong> — CBC/CMP, lipid subfractions, thyroid full panel, hormones, hs-CRP, HbA1c, vitamin D, iron studies, cardiac markers. Our phlebotomists are trained on internal-medicine's full spectrum.</li>
        <li><strong>Team logins</strong> — add your staff plus Dr. Edwards with one click each.</li>
        <li><strong>Coming soon:</strong> enter the patient's next Elite Medical appointment with you when scheduling, so results are in hand <em>before</em> their follow-up.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${loginBox('elitemedicalconcierge@gmail.com')}
      <p>Dr. Sher — the way you and Dr. Edwards run Elite Medical is the benchmark for how concierge internal medicine should look. This rebuild is our way of matching the standard you hold.</p>
      ${SIGNOFF}
    `),
  },

  // ── 4. LITTLETON CONCIERGE MEDICINE — Dr. Jason Littleton (longevity, wellness, lab-heavy) ──
  {
    subjectPrefix: '[DRAFT → Littleton Concierge Medicine]',
    actualRecipient: 'jasonlittleton@jasonmd.com (Dr. Jason Littleton)',
    portalEmail: 'jasonlittleton@jasonmd.com',
    subject: 'For the doctor who built his practice around advanced labs — meet your new lab partner',
    html: brandWrap('Dr. Littleton — your portal is ready', `
      <p>Hi Dr. Littleton,</p>
      <p>You literally have a page on jasonmd.com titled <strong>"Advanced Lab Testing."</strong> You wrote <em>WellSpring: The Energy Secrets to Do the Good Life</em>. You host <em>The Concierge Doc Podcast</em>. You tell Fox35 Good Day Orlando viewers that the labs <strong>are</strong> the roadmap. We built the new ConveLabs platform for the doctor who believes exactly that.</p>

      <p><strong>What this means for Littleton Concierge Medicine specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Advanced-panel support from day one</strong> — NMR lipid, insulin resistance panels, hormones (total + free + SHBG), thyroid full panel (TSH/Free T4/Free T3/Reverse T3/TPO/Tg), continuous glucose-monitoring workflow integration, vitamin D, omega-3 index, hs-CRP, homocysteine, ApoB. Our phlebs are drilled on the full longevity/prevention panel mix.</li>
        <li><strong>Patient-pay at $150 mobile / $55 in-office</strong> by default — your patients get a transparent rate, and if they're also ConveLabs members the system auto-applies whichever rate is lower. No "did I get the discount?" phone calls.</li>
        <li><strong>Membership upsell at booking</strong> — patients doing ongoing lab work (as yours do) save hundreds per year by joining the ConveLabs membership. We show them the math at checkout so they convert themselves.</li>
        <li><strong>WellSpring-aligned prep protocol</strong> — extended-fast friendly intake reinforces the lifestyle protocols you're already prescribing.</li>
        <li><strong>Team logins</strong> — add your concierge staff with one click.</li>
        <li><strong>Content collaboration invite</strong> — if you'd ever like a ConveLabs segment on the podcast (for instance, "what a mobile lab-draw should actually feel like for a concierge patient"), I'd be honored. No pitch, just open invitation.</li>
        <li><strong>Coming soon:</strong> enter the patient's next Littleton appointment when scheduling, so results are in your hands <em>before</em> the review consult.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${loginBox('jasonlittleton@jasonmd.com')}
      <p>Dr. Littleton — the way you talk about labs on the podcast is the way we built this system. I'd be genuinely honored to earn a share of the collection work from your patients.</p>
      ${SIGNOFF}
    `),
  },

  // ── 5. NATURAMED — Dr. Karolina Skrzypek (functional medicine, women's hormones) ──
  {
    subjectPrefix: '[DRAFT → NaturaMed / Natura Integrative]',
    actualRecipient: 'team@naturamed.org (Dr. Karolina Skrzypek)',
    portalEmail: 'team@naturamed.org',
    subject: 'Your NaturaMed × ConveLabs portal — built around Nourish to Flourish + AlignHer',
    html: brandWrap('Your NaturaMed portal is live', `
      <p>Hi Dr. Skrzypek,</p>
      <p>Functional medicine done well — your <em>Nourish to Flourish</em> program, the AlignHer Foundations (Gut Rebalance / Mood &amp; Hormones / Metabolic Clarity) — depends on <strong>specialty-kit integrity</strong>. DUTCH, GI-MAP, Genova, cortisol curves, organic acids — these aren't "draw and ship" panels. They have strict fasting windows, collection timing, handling requirements, and the data quality varies wildly based on who's doing the collection. We engineered the new ConveLabs platform around those realities.</p>

      <p><strong>What this means for NaturaMed specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default. You can flip any individual visit to "NaturaMed pays" with one toggle — useful for scholarship patients, program-included collections, or anyone on a special-care plan.</li>
        <li><strong>Mon–Fri 6–9am morning window</strong>, enforced automatically — ideal for fasting-dependent panels. No accidental non-fasting draws will ever slip through.</li>
        <li><strong>Specialty-kit trained phlebotomists</strong> — our team is specifically drilled on Genova, DUTCH (including 4-point saliva collection coaching), and GI-MAP protocols. The system labels the visit as a specialty-kit so there's no ambiguity.</li>
        <li><strong>Urine + saliva + blood collection support</strong> — the platform flags panels requiring patient self-collection (like DUTCH) and pre-schedules the patient's at-home collection timing so it's integrated with the blood draw.</li>
        <li><strong>AlignHer-aligned intake</strong> — patients tell us which AlignHer protocol they're on so pre-visit instructions match (Gut Rebalance has different prep than Mood &amp; Hormones).</li>
        <li><strong>Team logins</strong> — add every NaturaMed coordinator so they can schedule on behalf of patients from their own login.</li>
        <li><strong>Coming soon:</strong> enter the patient's next NaturaMed follow-up when scheduling, so results are in your hands <em>before</em> the review appointment.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${loginBox('team@naturamed.org')}
      <p>Dr. Skrzypek — the data-quality standard you hold is the entire reason this rebuild exists. Thank you for trusting us with the collection step of your patients' care.</p>
      ${SIGNOFF}
    `),
  },

  // ── 6. ND WELLNESS — Justin Cobb + Brantley Hawkins (PT / performance / wellness club) ──
  {
    subjectPrefix: '[DRAFT → ND Wellness]',
    actualRecipient: 'info@ndwellness.com (Justin Cobb)',
    portalEmail: 'info@ndwellness.com',
    subject: 'Concierge lab collection for New Dimensions members — your portal is ready',
    html: brandWrap('ND Wellness — your portal is ready', `
      <p>Hi Justin,</p>
      <p>Your members come to New Dimensions for the full performance stack — PT, recovery, hyperbaric, infrared sauna, acupuncture, and the metabolic/hormonal lab work that ties it all together. A concierge wellness club deserves a concierge lab-draw partner. We rebuilt ours to match the standard you and Brantley hold.</p>

      <p><strong>What this means for ND Wellness specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Anytime-during-business-hours booking</strong> — no 6–9am restriction. Your athletes and performance members book around training blocks, not around our schedule.</li>
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default — flip any individual visit to "ND Wellness pays" with one toggle for comped members, onboarding panels, or anything you want to cover in-house.</li>
        <li><strong>Performance-panel support</strong> — total + free testosterone, thyroid full panel, estradiol, SHBG, DHEA-S, vitamin D, iron/ferritin, CBC/CMP, hs-CRP, HbA1c, lipid subfractions, cortisol AM, omega-3 index. Our phlebs know these.</li>
        <li><strong>Recovery-panel integration</strong> — for members tracking training adaptation, we can flag a visit as "performance follow-up" with pre-visit instructions that align with your recovery protocols.</li>
        <li><strong>Team logins for the ND team</strong> — Brantley, coaches, and front-desk can all have their own views.</li>
        <li><strong>Member linking</strong> — ND Wellness members who are also ConveLabs members automatically get whichever price is lower. No double-counting, no confusion.</li>
        <li><strong>Coming soon:</strong> enter a member's next ND Wellness visit when scheduling their draw, so their labs are back <em>before</em> the follow-up protocol adjustment.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${loginBox('info@ndwellness.com')}
      <p>Justin, Brantley — the referrals we get from ND Wellness are the best compliment, and this rebuild is us trying to earn them again.</p>
      ${SIGNOFF}
    `),
  },

  // ── 7. THE RESTORATION PLACE — Christelle Renta ARNP (BioTE BHRT clinic) ──
  {
    subjectPrefix: '[DRAFT → The Restoration Place]',
    actualRecipient: 'schedule@trpclinic.com (Christelle Renta ARNP)',
    portalEmail: 'schedule@trpclinic.com',
    subject: 'Smarter HRT lab workflow for your BioTE patients — built around the pellet consult',
    html: brandWrap('A better lab system for your BHRT patients', `
      <p>Hi Christelle,</p>
      <p>Hormone replacement therapy lives or dies on two things: <strong>getting the labs drawn in the correct biological window</strong>, and <strong>having the results in hand before the consult.</strong> When either step slips, your BioTE pellet decision gets delayed, the patient loses a week of symptom relief, and your Winter Garden schedule absorbs the hit. We rebuilt ConveLabs to protect both of those moments.</p>

      <p><strong>What this means for The Restoration Place specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>6–9am biological-window enforced automatically</strong> — for AM cortisol and morning-sensitive hormone panels, your patients literally cannot book outside the right window. The system explains why and offers the next compliant slot.</li>
        <li><strong>Full HRT panel support</strong> — estradiol, total + free T, SHBG, DHEA-S, AM cortisol, TSH + full thyroid, CBC/CMP, lipid subfractions, HbA1c, PSA for male pellet patients. Our phlebotomists are trained on BHRT's exact panel mix.</li>
        <li><strong>$125 flat patient-pay rate</strong> — and if your patient is also a ConveLabs member, they automatically get whichever rate is lower. No phone calls asking "did I get the discount?"</li>
        <li><strong>Membership upsell at checkout</strong> — BHRT patients are long-term lab users. The system shows them the exact membership savings math at booking so they convert themselves and save money on ongoing labs.</li>
        <li><strong>Your admin team can be added</strong> — give your front-desk staff their own portal logins so they can schedule on behalf of patients.</li>
        <li><strong>BioTE-aligned prep</strong> — pellet-follow-up patients get protocol-specific pre-visit instructions around supplementation, hydration, and timing.</li>
        <li><strong>Coming soon:</strong> enter the patient's next pellet consult with you when scheduling, so results are ready <em>before</em> they walk in for the pellet decision.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${loginBox('schedule@trpclinic.com')}
      <p>Christelle — the work your team does in Winter Garden matters to a lot of people. This rebuild is our way of matching the standard you hold yourselves to.</p>
      ${SIGNOFF}
    `),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Send each draft to info@convelabs.com wrapped with a DRAFT PREVIEW banner
// ─────────────────────────────────────────────────────────────────────────────
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
console.log(`\nAll ${emails.length} drafts sent to info@convelabs.com.`);
