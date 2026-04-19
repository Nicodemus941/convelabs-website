// Sends 2 April 2026 partner-update DRAFTS to info@convelabs.com.
// To your internal inbox only — NOT to any partner until you approve them.
//
// What's inside:
//   1. "What's new for your patients" — the catch-all letter highlighting
//      lab-order upload + OCR, the patient-notification cascade (including
//      the brand-new 9pm-8am ET quiet hours), member tier auto-detect,
//      Google review automation, payment hardening.
//   2. "How a lab order flows now" — deep-dive on the upload → OCR →
//      patient-prep → draw → delivery pipeline. For partners who send
//      orders and want to understand what happens after they click upload.
//
// Run:
//   MAILGUN_API_KEY=key-... node scripts/send-april-update-drafts.mjs
//
// Alt runner (no env juggling) — call from inside the repo where the key
// already lives in .env:
//   node --env-file=.env scripts/send-april-update-drafts.mjs

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'mg.convelabs.com';
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || '';
if (!MAILGUN_API_KEY) {
  console.error('Set MAILGUN_API_KEY first.');
  process.exit(1);
}

const DRAFT_TO = 'info@convelabs.com';

// ─────────────────────────────────────────────────────────────────────────────
// BRAND WRAPPER — identical shell as the Feb 2026 announcement drafts so the
// visual identity is consistent
// ─────────────────────────────────────────────────────────────────────────────
const brandWrap = (title, body) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${title}</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;letter-spacing:.5px;">ConveLabs Concierge Lab Services · April 2026 Update</p>
  </div>
  <div style="padding:28px 32px;background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;color:#111827;line-height:1.6;font-size:14.5px;">
    ${body}
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;">
      ConveLabs Concierge Lab Services · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169
    </p>
  </div>
</div>`;

const SIGNOFF = `
  <p style="margin:22px 0 6px;">Questions or want a 10-minute walkthrough? Email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or call me directly at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a>. I read and answer everything myself.</p>
  <p style="margin:18px 0 0;">With gratitude,<br>
  <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
  <em>Founder, ConveLabs Concierge Lab Services</em></p>
`;

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL 1 — "What's new for your patients"
// Catch-all update letter. Intended for every partner org.
// Leads with the patient-experience improvements because that's what the
// partner actually feels (they hear about it from their patients).
// ─────────────────────────────────────────────────────────────────────────────
const EMAIL_1 = {
  subject: '[DRAFT → All partners] What your patients will notice this month',
  html: brandWrap('What your patients will notice this month', `
    <p>Hi team,</p>
    <p>Quick update on what we shipped in April — all of it patient-facing, all of it requiring <strong>zero action on your side</strong>. I wanted you to see it in one place so if a patient says <em>"that ConveLabs text was nice"</em>, you know what they're talking about.</p>

    <!-- ── Lab order upload + OCR ───────────────────────────────────────── -->
    <h3 style="margin:24px 0 8px;color:#B91C1C;font-size:15px;">1 · Lab orders now read themselves</h3>
    <p>When you upload a lab order PDF or photo on the provider portal, our <strong>ConveLabs OCR Technology</strong> now reads it in real time. Within seconds, we've extracted:</p>
    <ul style="padding-left:20px;margin:10px 0 16px;">
      <li>Every panel ordered (CBC, CMP, lipid, TSH, etc.) — no manual entry on our side</li>
      <li>Fasting, urine, and glucose-tolerance flags</li>
      <li>The ordering provider's name + NPI, auto-matched to your org</li>
    </ul>
    <p>Your patient then receives a <strong>protocol-specific prep text</strong> the night before: exact fasting cutoff time, hydration reminder, whether they need a urine cup. No more generic "fast 12 hours" copy-paste.</p>

    <!-- ── Patient notification system ──────────────────────────────────── -->
    <h3 style="margin:24px 0 8px;color:#B91C1C;font-size:15px;">2 · The patient notification cascade, rebuilt</h3>
    <p>Every patient now moves through this timeline automatically after booking:</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin:12px 0;">
      <table style="width:100%;font-size:13px;color:#374151;line-height:1.7;">
        <tr><td style="padding:3px 0;width:130px;color:#6b7280;">Instantly</td><td><strong>Booking confirmation</strong> — SMS + email with time, address, prep checklist</td></tr>
        <tr><td style="padding:3px 0;color:#6b7280;">2 hrs after</td><td><strong>"What to expect"</strong> email — our 7-point prep guide</td></tr>
        <tr><td style="padding:3px 0;color:#6b7280;">8 PM night before</td><td><strong>Fasting reminder</strong> (only if required by the lab order)</td></tr>
        <tr><td style="padding:3px 0;color:#6b7280;">Morning of</td><td><strong>"We're on our way"</strong> SMS with phleb's ETA</td></tr>
        <tr><td style="padding:3px 0;color:#6b7280;">24 hrs after visit</td><td><strong>"How did we do?"</strong> feedback SMS — catches issues <em>before</em> a public review</td></tr>
        <tr><td style="padding:3px 0;color:#6b7280;">48 hrs after visit</td><td><strong>Google review request</strong> (NEW — only for patients who had a clean visit)</td></tr>
      </table>
    </div>

    <!-- ── Quiet hours — the HIPAA/TCPA headliner ───────────────────────── -->
    <div style="background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border:1px solid #6ee7b7;border-radius:12px;padding:16px 20px;margin:18px 0;">
      <p style="margin:0;font-size:13px;color:#065f46;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">New this month: strict quiet hours</p>
      <p style="margin:8px 0 0;font-size:14px;color:#064e3b;line-height:1.55;">
        <strong>No patient receives an SMS or email from ConveLabs between 9:00 PM and 8:00 AM Eastern Time.</strong> Ever. Reminders queued during that window automatically hold until 8 AM. This is enforced at the code level — not a setting — so a cron job firing at 3 AM can't accidentally wake your patient up. The only exceptions are real-time booking confirmations and OTP codes (because a patient is actively waiting for them). We're the only mobile-phleb service in Florida with this guardrail in writing.
      </p>
    </div>

    <!-- ── Member tier auto-detect ──────────────────────────────────────── -->
    <h3 style="margin:24px 0 8px;color:#B91C1C;font-size:15px;">3 · Member patients see their discount automatically</h3>
    <p>If one of your patients is also a ConveLabs member (Regular / VIP / Concierge), when they open the lab-request link you sent them, our system now <strong>auto-detects their tier from their email</strong> and unlocks their member-tier slots — no sign-in required. They see a <em>"Welcome back, {name} — VIP perks unlocked automatically"</em> banner. After booking, a trophy appears: <em>"You've saved $340 this year as a VIP."</em></p>
    <p>Why it matters to you: <strong>zero friction means member patients don't abandon the link</strong>. Previously a logged-out member would see locked slots and bounce. That's fixed.</p>

    <!-- ── Payment hardening ────────────────────────────────────────────── -->
    <h3 style="margin:24px 0 8px;color:#B91C1C;font-size:15px;">4 · Every payment path is now double-audited</h3>
    <ul style="padding-left:20px;margin:10px 0 16px;">
      <li><strong>Reconciliation daemon</strong> runs every 6 hours — detects any Stripe charge that didn't produce the expected downstream record (appointment, membership, bundle) and alerts me by SMS within minutes</li>
      <li><strong>Refund ledger</strong> now writes a compensating entry to our QB sync log — your books and Stripe stay in lockstep even after cancellations</li>
      <li><strong>Failed-card recovery</strong> — if a patient's card declines, they automatically enter a 3-tier follow-up cascade (3h → 12h → 24h) with a fresh payment link. Your billable visits no longer slip through because of a single declined charge</li>
      <li><strong>Duplicate-prevention</strong> — webhook replays (which Stripe does on every transient error) can no longer create duplicate memberships or double-credit bundles. Belt-and-suspenders at the database level.</li>
    </ul>

    <!-- ── Risk reversal unchanged ──────────────────────────────────────── -->
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#166534;font-weight:700;">Still in writing — the ConveLabs Recollection Guarantee</p>
      <ul style="padding-left:18px;margin:8px 0 0;font-size:13px;color:#14532d;line-height:1.55;">
        <li>If <strong>ConveLabs</strong> caused the error, recollection is <strong>100% free</strong>.</li>
        <li>If the <strong>reference lab</strong> caused the error, recollection is <strong>50% off</strong>.</li>
      </ul>
    </div>

    <p style="margin:22px 0 0;">Nothing to click, nothing to do — all of the above is already live in your portal. I just wanted you to see it so when your patients tell you <em>"that lab company actually texts me at a reasonable hour"</em>, you know what they mean.</p>
    ${SIGNOFF}
  `),
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL 2 — "How a lab order flows through ConveLabs now"
// Operational deep-dive. Intended for partners who actually upload orders
// (i.e., provider clinics, not Aristotle / CAO). Spells out what happens
// between their upload click and the patient's draw.
// ─────────────────────────────────────────────────────────────────────────────
const EMAIL_2 = {
  subject: '[DRAFT → Order-senders] What happens the moment you upload a lab order',
  html: brandWrap('From upload to draw — the invisible seven steps', `
    <p>Hi team,</p>
    <p>If you've uploaded a lab order on your ConveLabs provider portal recently, you probably noticed the page asks for <em>less</em> than it used to. That's because our system now does most of the work automatically. Here's exactly what happens between the moment you click <strong>Upload</strong> and the moment your patient's blood is in a tube.</p>

    <h3 style="margin:22px 0 10px;color:#B91C1C;font-size:15px;">The seven invisible steps</h3>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:12px 0;">
      <p style="margin:0 0 6px;"><strong style="color:#B91C1C;">Step 1 — You upload the order (5 sec)</strong></p>
      <p style="margin:0;font-size:13.5px;color:#374151;">Drag-and-drop PDF, photo, or scan. Accepts anything your EMR exports or anything you photograph from a paper form.</p>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:12px 0;">
      <p style="margin:0 0 6px;"><strong style="color:#B91C1C;">Step 2 — ConveLabs OCR Technology reads it (15 sec)</strong></p>
      <p style="margin:0;font-size:13.5px;color:#374151;">Our proprietary OCR pulls out every panel code (CBC, CMP, A1C, lipid panel, TSH, etc.), the ordering provider's name + NPI, and flags for fasting, urine collection, or glucose tolerance. You don't type any of this.</p>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:12px 0;">
      <p style="margin:0 0 6px;"><strong style="color:#B91C1C;">Step 3 — Tokenized link goes to the patient (instant)</strong></p>
      <p style="margin:0;font-size:13.5px;color:#374151;">SMS + email. Link is single-use, expires when the patient books. No account or password — they pick a time, confirm their address, and they're done. Members see their discount auto-applied.</p>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:12px 0;">
      <p style="margin:0 0 6px;"><strong style="color:#B91C1C;">Step 4 — Protocol-specific prep SMS (scheduled)</strong></p>
      <p style="margin:0;font-size:13.5px;color:#374151;">Fires at 8 PM the night before — exact fasting-stop time calculated per the order. Patient sees "<em>Stop eating by 10:00 PM tonight. Water is fine.</em>", not generic "fast 12 hours." Respects the 9 PM quiet-hours ceiling.</p>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:12px 0;">
      <p style="margin:0 0 6px;"><strong style="color:#B91C1C;">Step 5 — Phleb arrives with the kit pre-built (morning of)</strong></p>
      <p style="margin:0;font-size:13.5px;color:#374151;">Because OCR already identified every panel, the phlebotomist's dashboard shows the exact tube set needed. No guessing, no extra trips. Collection timestamp + GPS captured automatically for chain of custody.</p>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:12px 0;">
      <p style="margin:0 0 6px;"><strong style="color:#B91C1C;">Step 6 — Specimens delivered, status visible to you (same day)</strong></p>
      <p style="margin:0;font-size:13.5px;color:#374151;">Every specimen gets a ConveLabs tracking ID. You see <em>Collected → In Transit → Delivered → Results ETA</em> in your portal. No phone calls to check status.</p>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:12px 0;">
      <p style="margin:0 0 6px;"><strong style="color:#B91C1C;">Step 7 — Patient loops closed (48 hrs)</strong></p>
      <p style="margin:0;font-size:13.5px;color:#374151;">"How did we do?" feedback SMS at 24h catches issues before they become public reviews. "Would you leave us a Google review?" follow-up at 48h for clean visits only. Both quiet-hours gated.</p>
    </div>

    <h3 style="margin:24px 0 8px;color:#B91C1C;font-size:15px;">Why this changes your day</h3>
    <ul style="padding-left:20px;margin:10px 0 16px;">
      <li><strong>Less redraws.</strong> Protocol-specific prep text beats a photocopied handout. Invalid-specimen rate has dropped materially.</li>
      <li><strong>Zero phone tag.</strong> Patients book themselves, pay at booking (or your org is billed — your choice per-visit), confirm details all in one flow.</li>
      <li><strong>Audit trail by default.</strong> Every step above timestamps a row. When a payer disputes a billable event, you have the full chain in one export.</li>
    </ul>

    <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:12px;padding:16px 20px;margin:18px 0;">
      <p style="margin:0;font-size:13px;color:#78350f;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Why nobody else has this</p>
      <p style="margin:8px 0 0;font-size:14px;color:#451a03;line-height:1.55;">
        The OCR, the notification cascade, the chain-of-custody log, the quiet-hours guardrail — we built them in-house for the specific problems mobile phlebotomy creates. You won't find this stack anywhere else in concierge lab services. If a competitor ever pitches you, ask them to show you their fasting-reminder system. They don't have one.
      </p>
    </div>

    <p style="margin:22px 0 0;">If you want a screen-share walkthrough to see it live — 10 minutes, on your schedule — just reply.</p>
    ${SIGNOFF}
  `),
};

// ─────────────────────────────────────────────────────────────────────────────
// SENDER
// ─────────────────────────────────────────────────────────────────────────────
async function sendOne(draft) {
  const fd = new FormData();
  fd.append('from', `ConveLabs Drafts <noreply@${MAILGUN_DOMAIN}>`);
  fd.append('to', DRAFT_TO);
  fd.append('h:Reply-To', DRAFT_TO);
  fd.append('subject', draft.subject);
  fd.append('html', draft.html);
  fd.append('o:tracking-clicks', 'no');

  const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}` },
    body: fd,
  });

  const body = await resp.text();
  if (!resp.ok) {
    console.error(`❌ ${draft.subject}\n   status=${resp.status}\n   body=${body.substring(0, 300)}`);
    return false;
  }
  console.log(`✉  ${draft.subject}`);
  return true;
}

(async () => {
  console.log(`Sending 2 April-update drafts to ${DRAFT_TO} only…`);
  let ok = 0;
  for (const draft of [EMAIL_1, EMAIL_2]) {
    if (await sendOne(draft)) ok++;
  }
  console.log(`\nDone — ${ok}/2 delivered to Mailgun. Check ${DRAFT_TO}.`);
})();
