// send-patient-announcements-live
// ─────────────────────────────────────────────────────────────────────────
// Fires the patient portal-launch announcement with Hormozi-grade safeguards
// against cross-contamination:
//
//   LAYER A — query-level (hardest to bypass)
//     A1. Group patient rows by lowercase(email) so each unique email maps
//         to exactly ONE canonical patient row before we even think about
//         sending. One email → one send. Period.
//     A2. When multiple rows share an email, inspect their first_names:
//           - all same (or blank) → pick the "best" row (user_id > first_name
//             present > most recently updated) and send.
//           - DIFFERENT first_names → REFUSE to send. Log to
//             patient_email_conflicts with all candidate names + patient_ids.
//             Admin resolves manually, then re-fires.
//     A3. Internal / test / disposable email domains are filtered out at
//         the grouping step (info@convelabs.com, @convelabs.com, example.com,
//         '+test' pattern, etc). Never gets to the send queue.
//
//   LAYER B — render-level
//     B1. The firstName that goes into the greeting comes from the SAME
//         canonical row whose email we send to. Not from a different row.
//         Not from the "first match" of a query.
//     B2. The portal URL embeds the exact recipient email as a URL param,
//         so if a patient forwards the link, the pre-fill stays correct.
//
//   LAYER C — send-level
//     C1. campaign_sends row is inserted immediately on Mailgun 2xx, so
//         even a concurrent second invoke cannot re-send to the same email
//         (unique(campaign_key, recipient_email) index enforces this server
//         side; the in-memory skipSet enforces it within the same loop).
//     C2. DRY-RUN mode: POST {"token":"...","dryRun":true} returns the
//         complete send plan (queue + conflicts + filtered) with ZERO
//         emails sent. Use this before every live invocation.
//     C3. email_unsubscribes is joined in — anyone who opted out is never
//         re-contacted.
//
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EXPECTED_TOKEN = 'patient-live-2026-04-19';
const CAMPAIGN_KEY = 'patient_announce_2026_04_19';
const PATIENT_SUBJECT = 'Your ConveLabs portal is live — a quick note from Nico';
const PUBLIC_SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

// ─── EMAIL SAFETY HELPERS ───────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isWellFormedEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// Partner inbox addresses we already sent the PARTNER announcement to.
// Any sub-address of these (via Gmail's `+tag` trick) lands in the same
// inbox — so firing the PATIENT blast at them would flood the partner's
// inbox with copies of a message meant for patients, and the actual
// patients would never see it. Keep in sync with send-partner-
// announcements-live's emails[] list.
const PARTNER_INBOXES: ReadonlySet<string> = new Set([
  'sdean@aristotleeducation.com',
  'smartin@clinicalassociatesorlando.com',
  'elitemedicalconcierge@gmail.com',
  'jasonlittleton@jasonmd.com',
  'team@naturamed.org',
  'info@ndwellness.com',
  'schedule@trpclinic.com',
  'kristen@kristenblakewellness.com',
]);

// Specific local-part prefixes that indicate a partner's patient-handle
// bucket even when the address doesn't literally match a partner inbox.
// E.g. 'elitemediconciergel@gmail.com' (typo variant) + every
// 'elitemedicalconcierge+<patient>@gmail.com' sub-address.
const PARTNER_LOCAL_PREFIXES: ReadonlyArray<string> = [
  'elitemedicalconcierge',
  'elitemediconcierge', // typo variant seen in the data
];

// Strip Gmail-style +tag from the local part → canonical inbox form
function canonicalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const atIdx = e.indexOf('@');
  if (atIdx < 0) return e;
  const local = e.slice(0, atIdx);
  const domain = e.slice(atIdx); // includes '@'
  const plusIdx = local.indexOf('+');
  if (plusIdx < 0) return e;
  return local.slice(0, plusIdx) + domain;
}

// Internal / test / partner-subaddress addresses we MUST NEVER send the
// patient blast to even if they somehow ended up as a tenant_patients row.
function isInternalOrTestEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return true;

  // ConveLabs team / infrastructure
  if (e === 'info@convelabs.com') return true;
  if (e.endsWith('@convelabs.com')) return true;
  if (e.endsWith('@mg.convelabs.com')) return true;

  // Test patterns
  if (e.includes('+test')) return true;
  if (e.includes('+dev')) return true;
  if (e.endsWith('@example.com')) return true;
  if (e.endsWith('@example.org')) return true;
  if (e.endsWith('@test.com')) return true;
  if (e.endsWith('@localhost')) return true;
  // Mailgun bounce / spamtrap patterns (common placeholders)
  if (e.startsWith('bounce@') || e.startsWith('spam@')) return true;

  // Partner inbox (already received partner email) — including any
  // +tag sub-address that routes to the same inbox
  const canonical = canonicalizeEmail(e);
  if (PARTNER_INBOXES.has(canonical)) return true;

  // Partner-handle prefix filter (catches +tagged sub-addresses AND typo
  // variants like elitemediconciergel@gmail.com)
  const atIdx = e.indexOf('@');
  if (atIdx > 0) {
    const local = e.slice(0, atIdx);
    for (const prefix of PARTNER_LOCAL_PREFIXES) {
      if (local.startsWith(prefix)) return true;
    }
  }

  return false;
}

// Pick the "best" canonical row when multiple share an email + same name.
// Preference: has user_id (real auth) > has first_name > most recent update.
function pickCanonicalRow(rows: any[]): any {
  return [...rows].sort((a, b) => {
    const aHasUser = !!a.user_id;
    const bHasUser = !!b.user_id;
    if (aHasUser !== bHasUser) return aHasUser ? -1 : 1;
    const aName = (a.first_name || '').trim();
    const bName = (b.first_name || '').trim();
    if (!!aName !== !!bName) return aName ? -1 : 1;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  })[0];
}

// ─── EMAIL BODY (unchanged content, wrapped in safe renderer) ──────────

const buildPatientEmailHtml = (opts: {
  firstName: string;
  email: string;
  unsubscribeUrl: string;
}) => {
  const { firstName, email, unsubscribeUrl } = opts;
  const portalUrl = `${PUBLIC_SITE}/login?email=${encodeURIComponent(email)}`;
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:28px 24px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">A quick note from Nico</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;letter-spacing:.5px;">Founder, ConveLabs Concierge Lab Services</p>
  </div>
  <div style="padding:28px 24px;background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;color:#111827;line-height:1.6;font-size:14.5px;">
    <p>Hi ${firstName || 'there'},</p>
    <p>I wanted to reach out personally to say <strong>thank you</strong> for trusting ConveLabs with your blood work. We're a small, founder-owned business in Central Florida, and every patient we serve is someone we genuinely appreciate.</p>
    <p>A quick update — your patient portal is now live. Everything we've been building over the last few months is designed to make the lab-testing part of your life <strong>smaller</strong>, not bigger. No more waiting rooms, no more surprise bills, no more phone tag to schedule.</p>

    <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What your portal gives you</h3>
    <ul style="padding-left:20px;margin:10px 0 16px;line-height:1.75;">
      <li><strong>Book in 90 seconds.</strong> Pick a day, pick a time. A real phlebotomist shows up at your door in a known window. No waiting rooms.</li>
      <li><strong>Our OCR reads your lab order for you.</strong> Upload the order your doctor gave you (PDF or phone photo — either works), and within seconds our ConveLabs OCR Technology tells you <em>exactly</em> what to expect: whether fasting is required, the precise cutoff time to stop eating and drinking, whether to bring a urine sample, whether a glucose-tolerance test is ordered. No more calling your doctor's office to check. No more showing up unprepared. It's like having a lab nurse in your pocket — walking you through the prep, quietly, the night before.</li>
      <li><strong>Transparent pricing, paid at booking.</strong> You see the exact price before you click confirm — never a surprise invoice in the mail two weeks later.</li>
      <li><strong>Every appointment in one place.</strong> Upcoming visits, past visits, receipts, lab order files — all in your portal. Nothing to hunt down.</li>
      <li><strong>Reschedule or cancel yourself.</strong> Life happens. Two clicks, no phone call.</li>
      <li><strong>Your results roadmap.</strong> See which panels you've run, when, and what's due for the next check-in.</li>
      <li><strong>Add your family.</strong> Household members share one account view, so managing a spouse's or parent's labs isn't a second headache.</li>
    </ul>

    <div style="background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%);border:2px solid #d97706;border-radius:14px;padding:22px 18px;margin:22px 0;">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:800;">A thank-you to our early patients</p>
      <h3 style="margin:0 0 8px;color:#78350f;font-size:20px;line-height:1.3;">Founding-member pricing, if it fits</h3>
      <p style="margin:0 0 16px;font-size:13.5px;color:#451a03;line-height:1.55;">
        If you run labs more than once or twice a year, a membership tends to pay for itself pretty quickly. <strong>Standard mobile draw: $150.</strong> Member pricing below. These rates are our thank-you to the patients who've been with us while we built this — we wanted you to have the option first.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1.5px solid #e5e7eb;border-radius:12px;margin:0 0 10px;">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6b7280;font-weight:800;">Tier 1 · Member</p>
          <p style="margin:0 0 10px;color:#111827;font-size:28px;font-weight:800;line-height:1.1;">$99<span style="font-size:14px;font-weight:500;color:#6b7280;"> / year</span></p>
          <p style="margin:0 0 8px;background:#d1fae5;color:#065f46;display:inline-block;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;">$130 per visit · save $20 each draw</p>
          <p style="margin:10px 0 0;font-size:13.5px;color:#374151;line-height:1.5;">Weekend appointments · patient portal · 10% off family add-ons</p>
          <div style="text-align:center;margin:14px 0 0;">
            <a href="${portalUrl}&tier=member" style="display:inline-block;background:#111827;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Lock in Member — $99 →</a>
          </div>
        </td></tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);border-radius:12px;margin:0 0 10px;">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 2px;">
            <span style="background:#fde68a;color:#78350f;padding:3px 9px;border-radius:6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Most popular</span>
          </p>
          <p style="margin:6px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#fecaca;font-weight:800;">Tier 2 · VIP</p>
          <p style="margin:0 0 10px;color:#ffffff;font-size:28px;font-weight:800;line-height:1.1;">$199<span style="font-size:14px;font-weight:500;color:#fecaca;"> / year</span></p>
          <p style="margin:0 0 8px;background:#fde68a;color:#78350f;display:inline-block;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;">$115 per visit · save $35 each draw</p>
          <p style="margin:10px 0 12px;font-size:13.5px;color:#fef3c7;line-height:1.5;">Priority same-day booking · family add-ons at $45 · extended hours · everything in Member</p>
          <div style="background:rgba(255,255,255,0.12);border:1px dashed #fecaca;border-radius:10px;padding:12px 14px;margin:0 0 12px;">
            <p style="margin:0 0 6px;font-size:11px;color:#fef3c7;font-weight:800;text-transform:uppercase;letter-spacing:.5px;">Founding VIP bonuses</p>
            <p style="margin:0 0 4px;font-size:13px;color:#fef3c7;line-height:1.5;">🎁 <strong>Free family add-on (1 extra member)</strong> — bring your spouse, parent, or child to one appointment at no extra cost <span style="color:#fecaca;">(value: $75)</span></p>
            <p style="margin:0;font-size:13px;color:#fef3c7;line-height:1.5;">🔒 <strong>Founding-rate lock for life</strong> — your $199 annual rate never raises as long as you stay a member <span style="color:#fecaca;">(value: $50+/yr)</span></p>
          </div>
          <div style="text-align:center;margin:6px 0 0;">
            <a href="${portalUrl}&tier=vip" style="display:inline-block;background:#fde68a;color:#78350f;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:800;font-size:13.5px;">Claim VIP + bonuses — $199 →</a>
          </div>
        </td></tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:2px solid #fde68a;border-radius:12px;margin:0 0 10px;">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 2px;">
            <span style="background:#92400e;color:#fef3c7;padding:3px 9px;border-radius:6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Best value per visit</span>
          </p>
          <p style="margin:6px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:800;">Tier 3 · Concierge</p>
          <p style="margin:0 0 10px;color:#111827;font-size:28px;font-weight:800;line-height:1.1;">$399<span style="font-size:14px;font-weight:500;color:#6b7280;"> / year</span></p>
          <p style="margin:0 0 8px;background:#d1fae5;color:#065f46;display:inline-block;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;">$99 per visit · save $51 each draw</p>
          <p style="margin:10px 0 0;font-size:13.5px;color:#374151;line-height:1.5;">Same-day guaranteed · dedicated phlebotomist · NDA available on request · concierge support · everything in VIP <em>(including founding-rate lock)</em></p>
          <div style="text-align:center;margin:14px 0 0;">
            <a href="${portalUrl}&tier=concierge" style="display:inline-block;background:#111827;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">Lock in Concierge — $399 →</a>
          </div>
        </td></tr>
      </table>

      <div style="background:#ffffff;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin:14px 0 0;">
        <p style="margin:0 0 6px;font-size:12px;color:#92400e;font-weight:800;text-transform:uppercase;letter-spacing:.5px;">The math (at 6 visits a year)</p>
        <p style="margin:0;font-size:13.5px;color:#451a03;line-height:1.6;">
          <strong>Member</strong> saves $120 — pays for itself at visit #5<br>
          <strong>VIP</strong> saves $210 + $75 family bonus = <strong>$285 value</strong> for $199<br>
          <strong>Concierge</strong> saves $306 — pays for itself at visit #5<br>
          <span style="color:#92400e;">If you run labs more than 2×/year, membership is cheaper than paying per visit.</span>
        </p>
      </div>
    </div>

    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0 0 4px;font-size:13px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Refer a friend — you both get $25 off</p>
      <p style="margin:6px 0 0;font-size:13px;color:#14532d;line-height:1.55;">
        Every time you send someone your referral code, <strong>they get $25 off their first visit and you get $25 credit</strong> on your next one. You'll find your personal code on your dashboard after your first login — no app download, no fine print.
      </p>
    </div>

    <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">What you'll hear from us — and what you won't</h3>
    <p style="margin:0 0 8px;color:#374151;">Every booking puts you on a clean reminder cadence so you don't have to keep the lab in your head:</p>
    <ul style="padding-left:20px;margin:6px 0 10px;line-height:1.7;color:#374151;">
      <li><strong>Booking confirmation</strong> — right after you schedule.</li>
      <li><strong>"What to expect" email</strong> — 2 hours later. Short prep checklist.</li>
      <li><strong>Fasting reminder at 8 PM the night before</strong> — the exact cutoff time calculated for your draw (not a generic "fast 12 hours"). Only if fasting is actually required on your order.</li>
      <li><strong>Morning of</strong> — "your phlebotomist is on the way" with an ETA.</li>
      <li><strong>The day after</strong> — one quick "how did we do?" check-in. That's it.</li>
    </ul>
    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;margin:14px 0;">
      <p style="margin:0;font-size:13px;color:#3730a3;line-height:1.5;">
        <strong>And a promise:</strong> we never text or email patients between 9 PM and 8 AM Eastern. Ever. A reminder that would've fired at 3 AM waits until 8 AM instead. You won't get a lab-company buzz while you sleep.
      </p>
    </div>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0 0 4px;font-size:13px;color:#7f1d1d;font-weight:700;">Our recollection guarantee — in writing</p>
      <ul style="padding-left:18px;margin:6px 0 0;font-size:13px;color:#7f1d1d;line-height:1.55;">
        <li>If <strong>ConveLabs</strong> caused the issue, recollection is <strong>100% free</strong>.</li>
        <li>If the <strong>reference lab</strong> caused the issue, recollection is <strong>50% off</strong>.</li>
      </ul>
    </div>

    <div style="text-align:center;margin:24px 0 6px;">
      <a href="${portalUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:15px 38px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15.5px;line-height:1.2;">Open my portal →</a>
    </div>
    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0 0 12px;">Your email is already on file — no password? Click the button and you'll set one.</p>

    <p style="margin:20px 0 6px;">If you ever have a question, email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or text <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a>. I read every message myself.</p>
    <p style="margin:16px 0 0;">With gratitude,<br>
    <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
    <em>Founder, ConveLabs Concierge Lab Services</em></p>

    <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 14px;">
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;line-height:1.55;">
      You're receiving this because you have an active ConveLabs account.<br>
      ConveLabs Concierge Lab Services · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169<br>
      <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe from marketing emails</a> — transactional appointment notifications continue either way.
    </p>
  </div>
</div>`;
};

// ─── MAIN HANDLER ──────────────────────────────────────────────────────

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
    const dryRun: boolean = Boolean(body?.dryRun);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ─── PULL SOURCES ────────────────────────────────────────────────
    const { data: patients, error } = await supabase
      .from('tenant_patients')
      .select('id, first_name, last_name, email, user_id, updated_at')
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('email', 'is', null)
      .neq('email', '');
    if (error) throw error;

    const [{ data: alreadySent }, { data: unsubs }] = await Promise.all([
      supabase.from('campaign_sends').select('recipient_email').eq('campaign_key', CAMPAIGN_KEY),
      supabase.from('email_unsubscribes').select('email'),
    ]);
    const alreadySentSet = new Set<string>((alreadySent || []).map((r: any) => String(r.recipient_email).toLowerCase()));
    const unsubSet = new Set<string>((unsubs || []).map((r: any) => String(r.email).toLowerCase()));

    // ─── LAYER A: group + resolve conflicts ─────────────────────────
    const byEmail = new Map<string, any[]>();
    const filtered: Array<{ email: string; reason: string }> = [];

    for (const p of (patients || [])) {
      const raw = String(p.email || '').trim();
      const key = raw.toLowerCase();
      if (!raw) continue;
      if (!isWellFormedEmail(raw)) {
        filtered.push({ email: raw, reason: 'malformed_email' });
        continue;
      }
      if (isInternalOrTestEmail(raw)) {
        filtered.push({ email: raw, reason: 'internal_or_test_email' });
        continue;
      }
      const arr = byEmail.get(key) || [];
      arr.push(p);
      byEmail.set(key, arr);
    }

    interface QueueItem { email: string; firstName: string; patient_id: string; row_count: number }
    const queue: QueueItem[] = [];
    const conflicts: Array<{ email: string; reason: string; row_count: number; candidate_names: string[]; patient_ids: string[] }> = [];

    for (const [email, rows] of byEmail.entries()) {
      if (rows.length === 1) {
        const r = rows[0];
        queue.push({ email, firstName: (r.first_name || '').trim(), patient_id: r.id, row_count: 1 });
        continue;
      }
      // Multiple rows — check name consistency
      const distinctNames = new Set(
        rows.map(r => (r.first_name || '').trim().toLowerCase()).filter(Boolean)
      );
      if (distinctNames.size > 1) {
        conflicts.push({
          email,
          reason: 'different_first_names',
          row_count: rows.length,
          candidate_names: Array.from(distinctNames),
          patient_ids: rows.map(r => r.id),
        });
        continue;
      }
      // All names agree (or all blank) — pick canonical row
      const best = pickCanonicalRow(rows);
      queue.push({ email, firstName: (best.first_name || '').trim(), patient_id: best.id, row_count: rows.length });
    }

    // Strip out already-sent + unsubscribed from the queue
    const sendQueue = queue.filter(q => {
      if (alreadySentSet.has(q.email.toLowerCase())) return false;
      if (unsubSet.has(q.email.toLowerCase())) return false;
      return true;
    });
    const skipped_already_sent = queue.length - sendQueue.length - queue.filter(q => unsubSet.has(q.email.toLowerCase())).length;
    const skipped_unsubscribed = queue.filter(q => unsubSet.has(q.email.toLowerCase())).length;

    // ─── LAYER C2: DRY-RUN EXIT ─────────────────────────────────────
    if (dryRun) {
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        campaign_key: CAMPAIGN_KEY,
        totals: {
          patient_rows_considered: patients?.length || 0,
          unique_email_groups: byEmail.size,
          filtered_out: filtered.length,
          conflicts_blocked: conflicts.length,
          skipped_already_sent,
          skipped_unsubscribed,
          would_send: sendQueue.length,
        },
        // Keep samples small but complete enough for visual audit
        queue_sample: sendQueue.slice(0, 50).map(q => ({ email: q.email, firstName: q.firstName, row_count: q.row_count })),
        conflicts,
        filtered_sample: filtered.slice(0, 20),
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── RECORD CONFLICTS (so admin can audit/resolve) ───────────────
    if (conflicts.length > 0) {
      await supabase.from('patient_email_conflicts' as any).insert(
        conflicts.map(c => ({
          campaign_key: CAMPAIGN_KEY,
          email: c.email,
          reason: c.reason,
          row_count: c.row_count,
          candidate_names: c.candidate_names,
          patient_ids: c.patient_ids,
        }))
      ).then(() => { /* non-blocking */ }).catch((e: any) => {
        console.warn('[conflicts] insert failed (non-blocking):', e?.message || e);
      });
    }

    // ─── LIVE SEND ───────────────────────────────────────────────────
    const stats = {
      eligible: sendQueue.length,
      sent: 0,
      failed: 0,
      skipped_race: 0,
    };
    const failed_samples: any[] = [];
    const inMemoryClaimed = new Set<string>();

    for (const item of sendQueue) {
      const emailKey = item.email.toLowerCase();

      if (inMemoryClaimed.has(emailKey)) { stats.skipped_race++; continue; }

      // ── RESERVE-FIRST PATTERN ────────────────────────────────────
      // Insert campaign_sends row with status='sending' BEFORE firing
      // Mailgun. The uniq_campaign_sends_key_email index guarantees
      // atomicity — if a concurrent invoke is also trying to claim
      // this email, exactly ONE of us gets the row. The loser skips.
      // This is the only pattern that makes concurrent invocations
      // safe against sending the same email twice to the same address.
      const { data: claim, error: claimErr } = await supabase
        .from('campaign_sends')
        .insert({
          campaign_key: CAMPAIGN_KEY,
          recipient_email: emailKey,
          status: 'sending',
          metadata: {
            patient_id: item.patient_id,
            first_name: item.firstName || null,
            source_row_count: item.row_count,
          },
        })
        .select('id')
        .maybeSingle();

      if (claimErr) {
        const code = String((claimErr as any).code || '');
        const msg = String((claimErr as any).message || '');
        if (code === '23505' || /duplicate|unique/i.test(msg)) {
          // Someone else already claimed this email. Do NOT send.
          stats.skipped_race++;
          continue;
        }
        // Real database error — don't risk sending without audit trail
        stats.failed++;
        if (failed_samples.length < 5) {
          failed_samples.push({ email: item.email, status: 0, err: `claim_failed: ${msg}` });
        }
        continue;
      }

      inMemoryClaimed.add(emailKey);

      // Build + fire Mailgun
      const unsubscribeUrl = `${PUBLIC_SITE}/unsubscribe?email=${encodeURIComponent(item.email)}&campaign=${encodeURIComponent(CAMPAIGN_KEY)}`;
      const html = buildPatientEmailHtml({
        firstName: item.firstName || 'there',
        email: item.email,
        unsubscribeUrl,
      });

      const fd = new FormData();
      fd.append('from', `Nico at ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
      fd.append('to', item.email);
      fd.append('h:Reply-To', 'info@convelabs.com');
      fd.append('subject', PATIENT_SUBJECT);
      fd.append('html', html);
      fd.append('o:tracking-clicks', 'no');

      const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: fd,
      });
      const mgBody = await resp.text();

      if (resp.ok) {
        let mgId: string | null = null;
        try { mgId = JSON.parse(mgBody).id; } catch { /* non-blocking */ }
        await supabase.from('campaign_sends')
          .update({ status: 'sent', mailgun_id: mgId })
          .eq('id', claim!.id);
        stats.sent++;
      } else {
        // Mailgun rejected → flip status to 'failed' so we can retry safely
        await supabase.from('campaign_sends')
          .update({ status: 'failed', metadata: { patient_id: item.patient_id, first_name: item.firstName || null, error: mgBody.substring(0, 200) } })
          .eq('id', claim!.id);
        stats.failed++;
        if (failed_samples.length < 5) {
          failed_samples.push({ email: item.email, status: resp.status, err: mgBody.substring(0, 200) });
        }
      }
      // ~5 sends/sec throttle
      await new Promise(r => setTimeout(r, 200));
    }

    return new Response(JSON.stringify({
      success: true,
      campaign_key: CAMPAIGN_KEY,
      fired_at: new Date().toISOString(),
      totals: {
        patient_rows_considered: patients?.length || 0,
        unique_email_groups: byEmail.size,
        filtered_out: filtered.length,
        conflicts_blocked: conflicts.length,
        skipped_already_sent,
        skipped_unsubscribed,
        eligible: stats.eligible,
        sent: stats.sent,
        failed: stats.failed,
        skipped_race: stats.skipped_race,
      },
      conflicts_written_to_table: conflicts.length,
      failed_samples,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
