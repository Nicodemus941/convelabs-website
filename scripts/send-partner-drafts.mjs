// Sends 4 tailored announcement-email DRAFTS to info@convelabs.com for Nico's review.
// Intentionally sent to internal inbox — NOT to the actual partners until approved.
// Run: node scripts/send-partner-drafts.mjs

const SUPABASE_URL = 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || '';
if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY env var first');
  process.exit(1);
}

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

// Reusable "what's new on the platform" block — every org gets this.
const PLATFORM_UPGRADES = `
  <h3 style="margin:20px 0 8px;color:#B91C1C;font-size:15px;">What's new on the ConveLabs platform</h3>
  <p style="margin:0 0 10px;">We rebuilt the whole system around one question: <em>how do we save providers and patients time while making lab collection safer?</em> Every feature below is live today on our new website and provider portal.</p>
  <ul style="padding-left:20px;margin:10px 0 16px;">
    <li><strong>Online patient booking (convelabs.com)</strong> — your patients can schedule themselves in under 90 seconds. Time-of-day scarcity, your org's billing rules, and member discounts are all enforced automatically. No back-and-forth phone tag.</li>
    <li><strong>Automatic fasting &amp; urine detection</strong> — our intake form reads the requisition (OCR) and flags fasting-required or urine-required panels, so the patient gets pre-visit instructions <em>before</em> we show up. Fewer redraws, fewer invalid samples.</li>
    <li><strong>Insurance capture at booking</strong> — patients photograph front + back of their card; we store it, verify it, and attach it to the requisition. No more paper forms on the day of the draw.</li>
    <li><strong>Lab-order uploads</strong> — providers (and patients) upload the signed lab order directly into the system. Claude Vision reads it; we confirm the panel match before we draw.</li>
    <li><strong>Specimen delivery notifications with tracking IDs</strong> — every specimen gets a unique tracking ID. You get a notification at pickup, delivery to the reference lab, and result ETA — the same way FedEx tracks a package.</li>
    <li><strong>Collection status — "Collected" vs. "Not Collected"</strong> — if a patient cancels, reschedules, or something goes wrong at the lab, the portal reflects it instantly so your team never has to chase us down.</li>
    <li><strong>Transparent recollection policy</strong> — if <strong>ConveLabs makes the error</strong>, the recollection is <strong>100% free</strong>. If the <strong>reference lab makes the error</strong>, the recollection is <strong>50% off</strong>. Written. Predictable. Fair.</li>
    <li><strong>Receipts &amp; payment records</strong> — every visit has a downloadable receipt, and reconciliation to QuickBooks happens automatically on our side.</li>
  </ul>
`;

const LOGIN_BOX = (email) => `
  <h3 style="margin:20px 0 8px;color:#B91C1C;font-size:15px;">How to access your new provider portal</h3>
  <p style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin:10px 0;">
    <strong>1.</strong> Visit <a href="${portalUrlFor(email)}" style="color:#B91C1C;">convelabs.com/provider</a> — your email is pre-filled.<br>
    <strong>2.</strong> If you already have a password, log in.<br>
    <strong>3.</strong> First time? Click <em>"Send me a password setup link"</em> — you'll get an email in under a minute. One click, set your password, you're in.
  </p>
  <div style="text-align:center;margin:22px 0;">
    <a href="${portalUrlFor(email)}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Open my provider portal →</a>
  </div>
`;

const SIGNOFF = `
  <p style="margin:22px 0 6px;">Reply to this email or call me direct at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a> if anything is unclear or if you want a 10-minute walkthrough. I'd genuinely love your feedback — we're building this for you.</p>
  <p style="margin:18px 0 0;">With gratitude,<br>
  <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
  <em>Founder, ConveLabs Concierge Lab Services</em></p>
`;

const emails = [
  // ──────────────────────────────────────────────────────────────────────────
  // ARISTOTLE EDUCATION — Dr. Pradip Jamnadas (cardiology/longevity/fasting)
  // ──────────────────────────────────────────────────────────────────────────
  {
    to: 'info@convelabs.com',
    subjectPrefix: '[DRAFT → Aristotle Education]',
    actualRecipient: 'bjung@aristotleeducation.com',
    subject: 'Dr. Jamnadas\'s patients now have their own scheduling portal',
    html: brandWrap('Welcome to your Aristotle × ConveLabs portal', `
      <p>Hi Barry,</p>
      <p>Dr. Jamnadas's work — the fasting protocols, the red-light and vagus-nerve interventions, the deep-dive personalized supplement panels — <strong>depends entirely on clean, correctly-timed lab data</strong>. When a 72-hour fast is wasted because a draw was missed or mistimed, the whole protocol has to restart. We've built the new ConveLabs platform specifically so that never happens on your patients again.</p>

      <p><strong>What this means for Aristotle specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>VIP unrestricted scheduling window</strong> — your patients can book <em>any time</em> Monday through Friday during business hours. No tier gates, no morning-only restriction.</li>
        <li><strong>Flat $185 per specialty-kit collection</strong> — invoiced to Aristotle Education by default (your patients see $0). You can flip individual visits to patient-pay at booking with one toggle.</li>
        <li><strong>Fasting protocol support</strong> — the system knows when Dr. Jamnadas's patients are on extended fasts and sends them pre-visit instructions that reinforce the protocol (hydration, no supplements, etc.).</li>
        <li><strong>Team logins</strong> — add as many Aristotle staff as you want. Each gets their own scheduling view.</li>
        <li><strong>Coming soon:</strong> enter a patient's next Aristotle appointment when scheduling their draw, so results land in Dr. Jamnadas's hands <em>before</em> the follow-up.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${LOGIN_BOX('bjung@aristotleeducation.com')}
      <p>Barry — Aristotle has been one of our most thoughtful partners. Everything in this rebuild reflects lessons we've learned from your team. Thank you.</p>
      ${SIGNOFF}
    `),
  },

  // ──────────────────────────────────────────────────────────────────────────
  // THE RESTORATION PLACE — Christelle Renta ARNP (BioTE BHRT clinic)
  // ──────────────────────────────────────────────────────────────────────────
  {
    to: 'info@convelabs.com',
    subjectPrefix: '[DRAFT → The Restoration Place]',
    actualRecipient: 'schedule@trpclinic.com',
    subject: 'Better HRT lab workflow for your BioTE patients — built around the consult window',
    html: brandWrap('A smarter lab system for your HRT patients', `
      <p>Hi Christelle and the Restoration Place team,</p>
      <p>Hormone replacement therapy lives or dies on two things: <strong>getting the labs drawn in the right window</strong>, and <strong>having the results in-hand before the consult</strong>. When either step slips, the BioTE pellet decision gets delayed, the patient loses a week of symptom relief, and your schedule takes the hit. We rebuilt ConveLabs to protect both of those moments.</p>

      <p><strong>What this means for The Restoration Place specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>6–9am AM-cortisol window enforced automatically</strong> — your patients literally cannot book a cortisol draw outside the biological window. The system explains why and offers the next available compliant slot.</li>
        <li><strong>HRT panel support</strong> — estradiol, free &amp; total T, SHBG, DHEA-S, TSH, CBC/CMP — the system recognizes the panel from the requisition and confirms timing rules automatically.</li>
        <li><strong>$125 patient-pay flat rate</strong> — and if your patient is also a ConveLabs member, they automatically get <em>whichever rate is lower</em>. No phone calls asking "did I get the discount?"</li>
        <li><strong>Member upsell at checkout</strong> — patients who are doing BHRT long-term often save hundreds by joining the ConveLabs membership. We show them the math at booking.</li>
        <li><strong>Your admin team can be added</strong> — give your front-desk staff their own portal logins so they can schedule on behalf of patients.</li>
        <li><strong>Coming soon:</strong> enter the patient's next BioTE consult with you when scheduling, so results are ready <em>before</em> they walk in for the pellet decision.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${LOGIN_BOX('schedule@trpclinic.com')}
      <p>Christelle — the work you and your team do in Winter Garden matters. This rebuild is our way of matching the standard you hold yourselves to.</p>
      ${SIGNOFF}
    `),
  },

  // ──────────────────────────────────────────────────────────────────────────
  // NATURAMED — Dr. Karolina Skrzypek MD (functional medicine women's hormones)
  // ──────────────────────────────────────────────────────────────────────────
  {
    to: 'info@convelabs.com',
    subjectPrefix: '[DRAFT → NaturaMed / Natura Integrative]',
    actualRecipient: 'team@naturamed.org',
    subject: 'Your Natura × ConveLabs portal is live — built for functional medicine',
    html: brandWrap('Your Natura portal is ready', `
      <p>Hi Dr. Skrzypek and the Natura team,</p>
      <p>Functional medicine protocols — the <em>Nourish to Flourish</em> program, AlignHer Foundations, gut rebalance panels, metabolic clarity work — depend on <strong>specialty kit integrity</strong>. Genova, DUTCH, GI-MAP, cortisol curves — these aren't "draw and ship" panels. They have fasting rules, collection windows, handling requirements, and the data quality varies wildly based on the person doing the collection. We've engineered the new ConveLabs around those realities.</p>

      <p><strong>What this means for Natura specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default — and you can flip any individual visit to "Natura pays" with one toggle per patient (for scholarship, special-care, or program-included patients).</li>
        <li><strong>Mon–Fri 6–9am morning window</strong> — enforced automatically, ideal for fasting-dependent panels. No accidental non-fasting draws.</li>
        <li><strong>Specialty-kit handling</strong> — our phlebotomists are trained on Genova, DUTCH, and GI-MAP protocols specifically. The system labels the visit so there's no ambiguity.</li>
        <li><strong>Urine + saliva collection support</strong> — the platform automatically flags panels that require patient self-collection (e.g., DUTCH) and sends the patient detailed timing instructions ahead of the visit.</li>
        <li><strong>Add your entire admin team</strong> — your coordinators can schedule on behalf of patients from their own login.</li>
        <li><strong>Coming soon:</strong> enter the patient's next Natura follow-up when scheduling, so results are in your hands before the review appointment.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${LOGIN_BOX('team@naturamed.org')}
      <p>Dr. Skrzypek — the data quality you demand is the entire reason this rebuild exists. Thank you for trusting us with the collection step.</p>
      ${SIGNOFF}
    `),
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ND WELLNESS — Brantley Hawkins + Justin Cobb (PT/rehab/performance + wellness)
  // ──────────────────────────────────────────────────────────────────────────
  {
    to: 'info@convelabs.com',
    subjectPrefix: '[DRAFT → ND Wellness]',
    actualRecipient: 'info@ndwellness.com',
    subject: 'Your ND Wellness × ConveLabs provider portal is live',
    html: brandWrap('ND Wellness — your portal is ready', `
      <p>Hi Brantley, Justin, and the ND Wellness team,</p>
      <p>Your members come to ND Wellness for the full stack — PT, performance, hyperbaric, infrared sauna, acupuncture, and the metabolic/hormonal lab work that ties it all together. A concierge membership deserves a concierge lab-draw experience. We rebuilt ours to match the standard you hold.</p>

      <p><strong>What this means for ND Wellness specifically:</strong></p>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Anytime-during-business-hours booking</strong> — no 6–9am restriction. Your athletes and performance clients can book around training blocks.</li>
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default — flip any individual visit to "ND Wellness pays" with one toggle for comped members, new-member onboarding panels, or anything you want on the house.</li>
        <li><strong>Performance-panel support</strong> — testosterone, thyroid full panels, vitamin D, iron/ferritin, CBC/CMP, hs-CRP, HbA1c, lipid subfractions. Our phlebs are drilled on these.</li>
        <li><strong>Team logins</strong> — add as many staff as you need, each with their own scheduling view.</li>
        <li><strong>Member linking</strong> — ND Wellness members who are also ConveLabs members auto-apply the lower price. No double-discount, no confusion.</li>
        <li><strong>Coming soon:</strong> enter a patient's next ND Wellness appointment when scheduling, so labs are back in time for the follow-up protocol adjustment.</li>
      </ul>

      ${PLATFORM_UPGRADES}
      ${LOGIN_BOX('info@ndwellness.com')}
      <p>Brantley and Justin — the word-of-mouth referrals we get from ND Wellness are the best compliment. This rebuild is us trying to earn them again.</p>
      ${SIGNOFF}
    `),
  },
];

async function send(one) {
  const subject = `${one.subjectPrefix} ${one.subject}`;
  const wrapperNote = `
<div style="font-family:sans-serif;max-width:640px;margin:16px auto;background:#fef3c7;border:2px dashed #f59e0b;border-radius:8px;padding:14px;">
  <p style="margin:0;color:#78350f;font-size:12px;"><strong>🔎 DRAFT PREVIEW</strong> — not sent to partner. Intended recipient: <strong>${one.actualRecipient}</strong>. Review + reply with edits or say "send for real" when approved.</p>
</div>
`;
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON}` },
    body: JSON.stringify({
      to: one.to,
      subject,
      html: wrapperNote + one.html,
      from: 'ConveLabs Drafts <noreply@mg.convelabs.com>',
    }),
  });
  const result = await resp.text();
  console.log(`${one.subjectPrefix}: ${resp.status} ${resp.ok ? '✓' : '✗'} ${result.substring(0, 200)}`);
}

for (const e of emails) {
  await send(e);
  await new Promise(r => setTimeout(r, 800));
}
console.log('\nAll 4 drafts sent to info@convelabs.com.');
