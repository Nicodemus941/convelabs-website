// send-april-update-drafts (v2)
// ────────────────────────────────────────────────────────────────────────
// Sends the 7 org-customized partner DRAFTS from Feb 2026 — rewritten
// with an April 2026 UPDATE BLOCK woven into each — to info@convelabs.com
// for internal review before any real partner mailout.
//
// Every org-specific message keeps its original hook, agitate, and
// customized stack. The new WHAT-CHANGED-IN-APRIL block lists:
//   - Lab order upload + ConveLabs OCR Technology
//   - Full patient notification cascade (booking conf → prep → 24h
//     reminder → post-visit → Google review request)
//   - 9pm–8am ET quiet-hours guardrail (enforced at the code level)
//   - Auto-detect of member tier on anonymous lab-request links
//   - Reconciliation daemon, refund ledger, failed-card recovery
//
// Invoke (MAILGUN_API_KEY already on edge-function secrets):
//   curl -X POST https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/send-april-update-drafts \
//        -H 'Content-Type: application/json' \
//        -d '{"token":"april-drafts-2026"}'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const DRAFT_TO = 'info@convelabs.com';
const EXPECTED_TOKEN = 'april-drafts-2026';

// ─────────────────────────────────────────────────────────────────────────
// SHARED BLOCKS (same visual identity as Feb 2026 drafts)
// ─────────────────────────────────────────────────────────────────────────
const brandWrap = (title: string, body: string) => `
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

const portalUrlFor = (email: string) =>
  `https://www.convelabs.com/provider?email=${encodeURIComponent(email)}`;

// The NEW April block — slotted into every org-specific email below.
const APRIL_UPDATE_BLOCK = `
  <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);color:#fff;border-radius:14px;padding:20px 22px;margin:22px 0;">
    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#93c5fd;font-weight:700;">April 2026 · What shipped this month</p>
    <h3 style="margin:0 0 12px;color:#fff;font-size:17px;">Five upgrades your patients will feel — zero action on your side.</h3>

    <p style="margin:12px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">1 · Lab orders now read themselves</p>
    <p style="margin:0;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
      When you upload a lab order to your portal, <strong>ConveLabs OCR Technology</strong> extracts every panel, fasting flag, urine requirement, and the ordering-provider NPI in about 15 seconds. Your patient then gets a <strong>protocol-specific prep text</strong> — exact fasting cutoff time, not generic "fast 12 hours."
    </p>

    <p style="margin:14px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">2 · The patient notification cascade, rebuilt</p>
    <p style="margin:0;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
      Every booking now moves through: instant confirmation · 2 hr "what to expect" email · 8 pm fasting reminder · morning-of "we're on our way" SMS · 24 hr feedback SMS · 48 hr Google review request (new). All patient-facing, all automated, all in the voice we built for your patients.
    </p>

    <p style="margin:14px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">3 · Strict quiet hours — 9 pm to 8 am Eastern</p>
    <p style="margin:0;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
      <strong>No patient receives an SMS or email from ConveLabs between 9 pm and 8 am ET. Ever.</strong> Reminders queued inside that window automatically hold until 8 am. Enforced at the code level — not a setting. Only OTP codes and real-time booking confirmations pass through, because the patient is actively waiting on them. No other mobile-phleb service in Florida puts this guardrail in writing.
    </p>

    <p style="margin:14px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">4 · Member patients unlock their tier automatically</p>
    <p style="margin:0;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
      If your patient is also a ConveLabs member, when they open the link you sent them the system now <strong>auto-detects their tier from their email</strong> and shows their unlocked slots — no sign-in friction. They see "Welcome back, {name} — VIP perks unlocked automatically." Member patients used to abandon logged-out links. That's fixed.
    </p>

    <p style="margin:14px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">5 · Every payment path is double-audited</p>
    <p style="margin:0 0 2px;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
      A reconciliation daemon runs every 6 hrs and alerts me by SMS within minutes of any Stripe charge that didn't produce the expected downstream record. Refunds now write compensating entries to the QB ledger so your books and Stripe stay in lockstep. Failed cards auto-enter a 3-tier retry cascade. Webhook replays can no longer create duplicate memberships or double-credit bundles.
    </p>
  </div>
`;

const TECH_POSITIONING = `
  <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:12px;padding:18px 20px;margin:18px 0;">
    <p style="margin:0;font-size:13px;color:#78350f;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">One of a kind, built by us</p>
    <p style="margin:8px 0 0;font-size:14px;color:#451a03;line-height:1.55;">
      The ConveLabs platform is the only one of its kind. The automated workflow, the <strong>ConveLabs OCR Technology</strong>, the specimen-tracking chain-of-custody, the quiet-hours guardrail, the billing isolation, and the provider portal are proprietary — built in-house for the specific problems mobile phlebotomy creates. You won't find this stack anywhere else in concierge lab services.
    </p>
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
  <p style="margin:22px 0 6px;">Questions or want a 10-minute walkthrough? Email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or call me directly at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a>. I read and answer everything myself.</p>
  <p style="margin:18px 0 0;">With gratitude,<br>
  <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
  <em>Founder, ConveLabs Concierge Lab Services</em></p>
`;

const draftBanner = (recipient: string, portalEmail: string) => `
<div style="font-family:sans-serif;max-width:640px;margin:16px auto;background:#fef3c7;border:2px dashed #f59e0b;border-radius:8px;padding:14px;">
  <p style="margin:0;color:#78350f;font-size:12px;"><strong>🔎 APRIL UPDATE DRAFT</strong> — not sent to partner. Intended recipient: <strong>${recipient}</strong>. Portal pre-fills <code>${portalEmail}</code>. Review + reply with edits, or say "send for real" when approved.</p>
</div>`;

// ─────────────────────────────────────────────────────────────────────────
// THE 7 ORG-SPECIFIC DRAFTS
// Each one:  HOOK → AGITATE → ORG-SPECIFIC STACK → APRIL_UPDATE_BLOCK →
//            TECH_POSITIONING → RISK_REVERSAL → LOGIN → SIGNOFF
// (CAO intentionally omits OCR/PLATFORM framing — draw-only service)
// ─────────────────────────────────────────────────────────────────────────
const emails = [
  // ── 1. ARISTOTLE EDUCATION ─────────────────────────────────────────────
  {
    subjectPrefix: '[DRAFT → Aristotle Education]',
    actualRecipient: 'sdean@aristotleeducation.com (Sharlene Dean) + Bri',
    portalEmail: 'sdean@aristotleeducation.com',
    subject: 'April update — what your Aristotle patients will notice this month',
    html: brandWrap('Aristotle × ConveLabs — April 2026 update', `
      <p>Hi Sharlene and Bri,</p>
      <p>Dr. Jamnadas's entire approach — the fasting protocols, the vagus-nerve reset, the red-light interventions, the personalized supplement panels — lives or dies on <strong>clean, correctly-timed lab data</strong>. Everything we shipped this month reinforces that.</p>

      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What's still true for Aristotle</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>VIP unrestricted window</strong> — patients book any time Mon–Fri during business hours.</li>
        <li><strong>Flat $185 per specialty-kit collection</strong> charged to Aristotle's Stripe at booking. Patients pay $0.</li>
        <li><strong>Extended-fast-safe intake</strong> that reinforces Dr. Jamnadas's protocols.</li>
        <li><strong>Founding-partner rate locked</strong> — grandfathered even as rates rise for new partners.</li>
      </ul>

      ${APRIL_UPDATE_BLOCK}

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Aristotle-specific:</strong> the new OCR + protocol-specific prep matters most for extended-fast patients. When Dr. Jamnadas orders a 72-hour-fast panel, the fasting cutoff in the patient SMS is calculated from <em>his</em> prescribed window, not a generic 12-hour default. Less burned fasts. Less rebooking.</p>
      </div>

      ${TECH_POSITIONING}
      ${RISK_REVERSAL}
      ${loginBlock('sdean@aristotleeducation.com')}
      <p>Sharlene, Bri — the best design decisions in this rebuild came from watching how your team actually works. Thank you.</p>
      ${SIGNOFF}
    `),
  },

  // ── 2. CLINICAL ASSOCIATES OF ORLANDO (draw-only — omit OCR / PLATFORM) ─
  {
    subjectPrefix: '[DRAFT → Clinical Associates of Orlando]',
    actualRecipient: 'smartin@clinicalassociatesorlando.com (Shawna Martin)',
    portalEmail: 'smartin@clinicalassociatesorlando.com',
    subject: 'April update — CAO draw-only service, tighter now',
    html: brandWrap('CAO × ConveLabs — April 2026 update', `
      <p>Hi Shawna,</p>
      <p>CAO is a draw-only partner — your coordinators schedule, we draw, you handle everything after. Our April rebuild stripped away more of the patient-facing layers that never applied to you, and tightened the compliance layers that do.</p>

      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Still true for CAO</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Coordinators schedule via the provider portal</strong>; participants do NOT self-schedule.</li>
        <li><strong>Patient-name masking everywhere</strong> — calendar, phleb dashboard, notifications — reference ID only. Unmask is audit-logged.</li>
        <li><strong>$55 per in-office draw</strong>, billed instantly to CAO's Stripe at scheduling. Participants pay $0.</li>
        <li><strong>Billing walled off</strong> — CAO's Stripe history isolated from any patient-billing history.</li>
        <li><strong>Chain-of-custody on every draw</strong>: timestamp, phleb initials, GPS of the office.</li>
      </ul>

      <!-- Tighter, CAO-specific April block — no OCR framing, no patient-notification
           emphasis since participants don't receive patient-facing SMS -->
      <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);color:#fff;border-radius:14px;padding:20px 22px;margin:22px 0;">
        <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#93c5fd;font-weight:700;">April 2026 · What changed for CAO specifically</p>

        <p style="margin:12px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">1 · Every payment path is double-audited</p>
        <p style="margin:0;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
          A reconciliation daemon runs every 6 hours. Any Stripe charge to CAO that didn't produce the expected appointment record alerts me within minutes. Matters for sponsor audits: the ledger between your CAO Stripe statement and our appointment log is now proven consistent, not trusted.
        </p>

        <p style="margin:14px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">2 · Refund ledger stays in lockstep</p>
        <p style="margin:0;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
          If a CAO visit is refunded for any reason (participant withdrew, protocol amended), the refund writes a compensating entry to the accounting ledger automatically. Your audit export for any sponsor shows the full trail without manual reconciliation.
        </p>

        <p style="margin:14px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">3 · Idempotent webhooks</p>
        <p style="margin:0;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
          Stripe retries webhooks on every transient error. Our system now rejects duplicates at the database level — no risk of a single charge producing two CAO appointment rows, no matter how Stripe delivers the event.
        </p>

        <p style="margin:14px 0 4px;color:#fef3c7;font-weight:700;font-size:14px;">4 · Quiet hours (for completeness)</p>
        <p style="margin:0;color:#e2e8f0;font-size:13.5px;line-height:1.55;">
          Participants don't receive patient-facing SMS from our system (by CAO design), but the 9 pm–8 am ET gate is still enforced globally — if anything ever goes sideways with a mis-tagged visit, a participant will not wake up at 3 am to an accidental text. Guardrail is structural, not configurable.
        </p>
      </div>

      <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:12px;padding:18px 20px;margin:18px 0;">
        <p style="margin:0;font-size:13px;color:#78350f;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">One of a kind, built by us</p>
        <p style="margin:8px 0 0;font-size:14px;color:#451a03;line-height:1.55;">
          The patient-name masking, org-scoped billing isolation, unmask audit-log, and sponsor-ready draw chain-of-custody are all proprietary to ConveLabs — built specifically for clinical-research sites like yours.
        </p>
      </div>

      ${RISK_REVERSAL}
      ${loginBlock('smartin@clinicalassociatesorlando.com')}
      <p>Shawna — clinical research is the hardest compliance environment in lab collection. The whole rebuild is us earning another year of your trust.</p>
      ${SIGNOFF}
    `),
  },

  // ── 3. ELITE MEDICAL CONCIERGE ─────────────────────────────────────────
  {
    subjectPrefix: '[DRAFT → Elite Medical Concierge]',
    actualRecipient: 'elitemedicalconcierge@gmail.com (Dr. Monica Sher)',
    portalEmail: 'elitemedicalconcierge@gmail.com',
    subject: 'April update — the subscription offer, now with automated patient care',
    html: brandWrap('Elite Medical × ConveLabs — April 2026 update', `
      <p>Hi Dr. Sher,</p>
      <p>Two months ago I sent you the three-tier subscription structure (Starter 10 / Monthly Flex / Annual Partner). That pricing stands. What's new this month is what your patients actually experience between booking and draw — the part that matters when Dr. Edwards asks you how the "lab thing" is going.</p>

      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Quick reminder of the subscription options</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Starter 10</strong> — $650/mo, 10 visits included, month-to-month.</li>
        <li><strong>Monthly Flex</strong> — $72.25/visit, unlimited volume, no commitment.</li>
        <li><strong>Annual Partner</strong> — $60.20/visit, 12-month commitment, priority scheduling. <em>Effectively 2 months free vs Monthly Flex.</em></li>
      </ul>

      ${APRIL_UPDATE_BLOCK}

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Elite-specific:</strong> for concierge patients who see you every 4–8 weeks, the new notification cascade means they never wonder where their results are. The post-visit feedback SMS at 24 hrs catches issues before they become complaints to your front desk. We're the quiet guardrail behind your already-excellent experience.</p>
      </div>

      <p style="margin:14px 0 8px;font-size:14px;color:#374151;"><strong>To enroll in a plan</strong>, log in with the button below and click <em>Subscription Plans</em> in your dashboard — or reply to this email and I'll wire it up in under 5 minutes.</p>

      ${TECH_POSITIONING}
      ${RISK_REVERSAL}
      ${loginBlock('elitemedicalconcierge@gmail.com')}
      <p>Dr. Sher — the way you and Dr. Edwards run Elite Medical is the benchmark. This rebuild is us matching that operational standard on our side.</p>
      ${SIGNOFF}
    `),
  },

  // ── 4. LITTLETON CONCIERGE MEDICINE ────────────────────────────────────
  {
    subjectPrefix: '[DRAFT → Littleton Concierge Medicine]',
    actualRecipient: 'jasonlittleton@jasonmd.com (Dr. Jason Littleton)',
    portalEmail: 'jasonlittleton@jasonmd.com',
    subject: 'April update — labs as roadmap, now on autopilot',
    html: brandWrap('Dr. Littleton — April 2026 update', `
      <p>Hi Dr. Littleton,</p>
      <p>You tell Fox35 Good Day Orlando viewers the labs <strong>are</strong> the roadmap. This month's update is about making sure the roadmap data arrives clean, on time, and with the patient already prepared — no phone tag with your concierge staff.</p>

      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Still true for Littleton Concierge</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Advanced-panel support</strong> — NMR lipid, insulin resistance, hormones (total + free + SHBG), thyroid full (TSH/Free T4/Free T3/Reverse T3/TPO/Tg), vitamin D, omega-3 index, hs-CRP, homocysteine, ApoB.</li>
        <li><strong>$150 patient-pay mobile draw</strong>. Member patients auto-get whichever price is lower.</li>
        <li><strong>WellSpring-aligned prep</strong>; extended-fast-friendly intake.</li>
        <li><strong>Podcast collaboration open door</strong> if you'd ever like a ConveLabs segment on <em>The Concierge Doc Podcast</em>.</li>
      </ul>

      ${APRIL_UPDATE_BLOCK}

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>Littleton-specific:</strong> your patients order the longevity-panel mix that demands exact fasting + timing. The new OCR-driven prep texts make "did they fast correctly?" one less thing you have to verify at consult. The morning-of <em>"phleb is en route"</em> SMS also reduces the "did they come?" calls into your practice.</p>
      </div>

      ${TECH_POSITIONING}
      ${RISK_REVERSAL}
      ${loginBlock('jasonlittleton@jasonmd.com')}
      <p>Dr. Littleton — the way you talk about labs on the podcast is the way we built this system. I'd be honored to earn more of your patients' collection work.</p>
      ${SIGNOFF}
    `),
  },

  // ── 5. NATURAMED / Natura Integrative ──────────────────────────────────
  {
    subjectPrefix: '[DRAFT → NaturaMed / Natura Integrative]',
    actualRecipient: 'team@naturamed.org (Dr. Karolina Skrzypek)',
    portalEmail: 'team@naturamed.org',
    subject: 'April update — your Nourish to Flourish patients now get protocol-specific prep',
    html: brandWrap('NaturaMed × ConveLabs — April 2026 update', `
      <p>Hi Dr. Skrzypek,</p>
      <p>The AlignHer Foundations (Gut Rebalance / Mood &amp; Hormones / Metabolic Clarity) each demand different pre-visit prep. April's update puts that difference into the patient's hand — automatically — before the draw.</p>

      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Still true for NaturaMed</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default. Toggle any single visit to "NaturaMed pays" in-portal.</li>
        <li><strong>Mon–Fri 6–9 am morning window</strong> enforced automatically — no accidental non-fasting draws.</li>
        <li><strong>Specialty-kit trained phlebotomists</strong>, drilled on your panel formats.</li>
        <li><strong>Team logins</strong> for every coordinator.</li>
      </ul>

      ${APRIL_UPDATE_BLOCK}

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>NaturaMed-specific:</strong> when a patient is flagged as Gut Rebalance or Mood &amp; Hormones, the OCR-driven prep text now pulls the right AlignHer pre-visit instructions. No more "did they avoid supplements 48 hours prior?" surprises. Cleaner data → faster protocol adjustments → better patient feel of progress.</p>
      </div>

      ${TECH_POSITIONING}
      ${RISK_REVERSAL}
      ${loginBlock('team@naturamed.org')}
      <p>Dr. Skrzypek — the data-quality standard you hold is the reason this rebuild exists. Thank you for trusting us with the collection step.</p>
      ${SIGNOFF}
    `),
  },

  // ── 6. ND WELLNESS ────────────────────────────────────────────────────
  {
    subjectPrefix: '[DRAFT → ND Wellness]',
    actualRecipient: 'info@ndwellness.com (Justin Cobb)',
    portalEmail: 'info@ndwellness.com',
    subject: 'April update — better lab workflow for your New Dimensions members',
    html: brandWrap('ND Wellness × ConveLabs — April 2026 update', `
      <p>Hi Justin,</p>
      <p>ND Wellness members sign up for the full stack — PT, performance, hyperbaric, infrared, acupuncture, and the metabolic + hormonal lab work that ties it together. April's upgrades make the lab piece as hands-off as the rest.</p>

      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Still true for ND Wellness</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>Anytime business-hours booking</strong> — no 6–9 am restriction. Athletes book around training blocks.</li>
        <li><strong>$85 per specialty-kit collection</strong>, patient-pay by default. Flip to "ND Wellness pays" in one toggle.</li>
        <li><strong>Performance-panel support</strong> (total + free T, thyroid full, estradiol, SHBG, DHEA-S, vitamin D, iron/ferritin, CBC/CMP, hs-CRP, HbA1c, lipid subfractions, cortisol AM, omega-3).</li>
        <li><strong>Member linking</strong> — ND members who are also ConveLabs members auto-get whichever rate is lower.</li>
      </ul>

      ${APRIL_UPDATE_BLOCK}

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>ND-specific:</strong> the new 48 hr Google review request is a quiet compounding force for a referrals-heavy business like yours. Patients who had a clean visit get asked once (never spam), quiet-hours gated. Over six months, that's a flywheel of public social proof your ads don't have to buy.</p>
      </div>

      ${TECH_POSITIONING}
      ${RISK_REVERSAL}
      ${loginBlock('info@ndwellness.com')}
      <p>Justin, Brantley — the referrals from ND Wellness are the best compliment this business gets. Thank you.</p>
      ${SIGNOFF}
    `),
  },

  // ── 7. THE RESTORATION PLACE ──────────────────────────────────────────
  {
    subjectPrefix: '[DRAFT → The Restoration Place]',
    actualRecipient: 'schedule@trpclinic.com (Christelle Renta ARNP)',
    portalEmail: 'schedule@trpclinic.com',
    subject: 'April update — smarter BHRT lab workflow, now with protocol-specific prep',
    html: brandWrap('TRP × ConveLabs — April 2026 update', `
      <p>Hi Christelle,</p>
      <p>BHRT lives or dies on collection timing — AM cortisol, morning-sensitive hormones, fasting accuracy. April's upgrades tighten every one of those moments.</p>

      <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Still true for The Restoration Place</h3>
      <ul style="padding-left:20px;margin:10px 0 16px;">
        <li><strong>6–9 am biological-window enforced automatically</strong> — patients can't book outside the right window for AM cortisol / hormone panels.</li>
        <li><strong>Full BHRT panel support</strong> — estradiol, total + free T, SHBG, DHEA-S, AM cortisol, TSH + full thyroid, CBC/CMP, lipid subfractions, HbA1c, PSA for male pellet patients.</li>
        <li><strong>$125 patient-pay rate</strong>. Member patients auto-get whichever price is lower.</li>
        <li><strong>Admin-team logins</strong> — unlimited.</li>
      </ul>

      ${APRIL_UPDATE_BLOCK}

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:14px 0;">
        <p style="margin:0;font-size:13px;color:#7f1d1d;"><strong>TRP-specific:</strong> when a BioTE pellet-follow-up patient books, the new OCR-driven prep text reinforces pellet-specific protocols (supplementation pause, hydration, morning-before timing). Cleaner morning-hormone data → faster pellet decisions → less Winter Garden schedule pressure.</p>
      </div>

      ${TECH_POSITIONING}
      ${RISK_REVERSAL}
      ${loginBlock('schedule@trpclinic.com')}
      <p>Christelle — the work your team does matters to a lot of people. This rebuild is matching the standard you hold yourselves to.</p>
      ${SIGNOFF}
    `),
  },
];

// ─────────────────────────────────────────────────────────────────────────
// SENDER
// ─────────────────────────────────────────────────────────────────────────
async function sendOne(draft: typeof emails[0]): Promise<{ ok: boolean; status: number; id?: string; error?: string }> {
  const subject = `${draft.subjectPrefix} ${draft.subject}`;
  const fullHtml = draftBanner(draft.actualRecipient, draft.portalEmail) + draft.html;

  const fd = new FormData();
  fd.append('from', `ConveLabs Drafts <noreply@${MAILGUN_DOMAIN}>`);
  fd.append('to', DRAFT_TO);
  fd.append('h:Reply-To', DRAFT_TO);
  fd.append('subject', subject);
  fd.append('html', fullHtml);
  fd.append('o:tracking-clicks', 'no');

  const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  const body = await resp.text();
  if (!resp.ok) return { ok: false, status: resp.status, error: body.substring(0, 400) };
  try {
    const parsed = JSON.parse(body);
    return { ok: true, status: resp.status, id: parsed.id };
  } catch {
    return { ok: true, status: resp.status };
  }
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
      const r = await sendOne(draft);
      results.push({ org: draft.subjectPrefix, to: draft.actualRecipient, ...r });
      // small gap so Mailgun doesn't rate-limit on a burst
      await new Promise(r => setTimeout(r, 400));
    }

    return new Response(JSON.stringify({
      success: results.every(r => r.ok),
      to: DRAFT_TO,
      sent: results.length,
      results,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
