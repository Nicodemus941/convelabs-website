// send-patient-announcement-drafts
// ─────────────────────────────────────────────────────────────────────────
// Sends ONE patient-announcement DRAFT to info@convelabs.com for review.
// The live version (send-patient-announcements-live) uses the same HTML
// body but iterates every active non-unsubscribed patient.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const DRAFT_TO = 'info@convelabs.com';
const EXPECTED_TOKEN = 'april-drafts-2026';

// ─────────────────────────────────────────────────────────────────────────
// HORMOZI STRUCTURE for this email:
//
//   1. HOOK         — "Your ConveLabs account is live — here's what's new"
//   2. AGITATE      — the lab-testing pain they USED to have
//   3. STACK        — the 6 benefits of the portal, each as a feature→
//                     outcome pair
//   4. MEMBERSHIP   — the Grand Slam Offer: 3 tiers with concrete $ savings
//                     math (price anchor)
//   5. REFERRAL     — $25 both sides (reciprocal → viral)
//   6. REMINDERS    — trust builder: quiet hours + fasting reminders explained
//   7. GUARANTEE    — recollection in writing (risk reversal)
//   8. CTA          — ONE button, login-pre-filled
//   9. UNSUBSCRIBE  — CAN-SPAM compliance
// ─────────────────────────────────────────────────────────────────────────

const PATIENT_SUBJECT = 'Your ConveLabs account is live — here\'s what just got easier';

const buildPatientEmailHtml = (opts: {
  firstName: string;
  email: string;
  unsubscribeUrl: string;
}) => {
  const { firstName, email, unsubscribeUrl } = opts;
  const portalUrl = `https://www.convelabs.com/login?email=${encodeURIComponent(email)}`;
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:28px 32px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Your ConveLabs account is live</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;letter-spacing:.5px;">Concierge lab collection · built around you</p>
  </div>
  <div style="padding:28px 32px;background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;color:#111827;line-height:1.6;font-size:14.5px;">

    <!-- ── 1. HOOK ─────────────────────────────────────────────── -->
    <p>Hi ${firstName || 'there'},</p>
    <p>Thanks for choosing ConveLabs for your blood work. I wanted to let you know your patient portal is now live — and everything we've been building for the last few months is <strong>designed to make the lab-testing part of your life smaller</strong>, not bigger.</p>

    <!-- ── 2. AGITATE — name the pain ──────────────────────────── -->
    <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">No more of this:</h3>
    <ul style="padding-left:20px;margin:10px 0 16px;color:#374151;">
      <li>Driving to a lab + sitting in a waiting room you don't feel well in.</li>
      <li>Calling five times to schedule, then getting a random 4-hour window.</li>
      <li>Forgetting to fast because no one reminded you until morning-of.</li>
      <li>Getting billed later with no idea what the charge was for.</li>
    </ul>

    <!-- ── 3. STACK — 6 portal features → benefits ─────────────── -->
    <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Here's what your portal now gives you</h3>
    <ul style="padding-left:20px;margin:10px 0 16px;line-height:1.75;">
      <li><strong>Book in 90 seconds.</strong> Pick a day, pick a time. A real phlebotomist shows up at your door in a known window. No waiting rooms.</li>
      <li><strong>Transparent pricing, paid at booking.</strong> You see the exact price before you click confirm — never a surprise invoice in the mail two weeks later.</li>
      <li><strong>Every appointment in one place.</strong> Upcoming visits, past visits, receipts, lab order files — all in your portal. Nothing to hunt down.</li>
      <li><strong>Reschedule or cancel yourself.</strong> Life happens. Two clicks, no phone call.</li>
      <li><strong>Your results roadmap.</strong> See which panels you've run, when, and what's due for the next check-in.</li>
      <li><strong>Add your family.</strong> Household members share one account view, so managing a spouse's or parent's labs isn't a second headache.</li>
    </ul>

    <!-- ── 4. MEMBERSHIP (Grand Slam Offer) ────────────────────── -->
    <div style="background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%);border:2px solid #d97706;border-radius:14px;padding:22px;margin:22px 0;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:800;">If you run labs more than 2× a year</p>
      <h3 style="margin:0 0 12px;color:#78350f;font-size:18px;">Three membership tiers — pay once a year, save on every draw</h3>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:6px 0;">
        <tr>
          <td style="width:33%;vertical-align:top;background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;text-align:center;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:700;">Tier 1</p>
            <h4 style="margin:4px 0;color:#111827;font-size:16px;">Member</h4>
            <p style="margin:0;font-size:22px;font-weight:800;color:#111827;">$99<span style="font-size:11px;font-weight:500;color:#6b7280;"> / year</span></p>
            <p style="margin:4px 0;font-size:12px;color:#166534;font-weight:700;">$130 / visit · save $20 each</p>
            <p style="margin:8px 0 0;font-size:12px;color:#6b7280;line-height:1.4;">Weekend access · portal · 10% family add-on</p>
          </td>
          <td style="width:33%;vertical-align:top;background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);color:#fff;border:1.5px solid #7F1D1D;border-radius:12px;padding:14px;text-align:center;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#fecaca;font-weight:700;">Most popular</p>
            <h4 style="margin:4px 0;color:#fff;font-size:16px;">VIP</h4>
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;">$199<span style="font-size:11px;font-weight:500;color:#fecaca;"> / year</span></p>
            <p style="margin:4px 0;font-size:12px;color:#fef3c7;font-weight:700;">$115 / visit · save $35 each</p>
            <p style="margin:8px 0 0;font-size:12px;color:#fecaca;line-height:1.4;">Priority same-day · family $45 · extended hours</p>
          </td>
          <td style="width:33%;vertical-align:top;background:#fff;border:1.5px solid #fde68a;border-radius:12px;padding:14px;text-align:center;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#92400e;font-weight:700;">Best value</p>
            <h4 style="margin:4px 0;color:#111827;font-size:16px;">Concierge</h4>
            <p style="margin:0;font-size:22px;font-weight:800;color:#111827;">$399<span style="font-size:11px;font-weight:500;color:#6b7280;"> / year</span></p>
            <p style="margin:4px 0;font-size:12px;color:#166534;font-weight:700;">$99 / visit · save $51 each</p>
            <p style="margin:8px 0 0;font-size:12px;color:#6b7280;line-height:1.4;">Same-day guaranteed · dedicated phleb · NDA available</p>
          </td>
        </tr>
      </table>
      <p style="margin:14px 0 0;font-size:13px;color:#451a03;line-height:1.55;">
        <strong>The math:</strong> if you do <strong>6 visits a year</strong>, Member saves $120 (pays for itself at visit 5). VIP saves $210. Concierge saves $306. If you run labs more than 2× / year, membership pays for itself.
      </p>
    </div>

    <!-- ── 5. REFERRAL (reciprocal / viral) ────────────────────── -->
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0 0 4px;font-size:13px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Refer a friend — you both get $25 off</p>
      <p style="margin:6px 0 0;font-size:13px;color:#14532d;line-height:1.55;">
        Every time you send someone your referral code, <strong>they get $25 off their first visit and you get $25 credit</strong> on your next one. You'll find your personal code on your dashboard after your first login — no app download, no fine print.
      </p>
    </div>

    <!-- ── 6. REMINDERS (trust builder) ────────────────────────── -->
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

    <!-- ── 7. GUARANTEE ─────────────────────────────────────────── -->
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0 0 4px;font-size:13px;color:#7f1d1d;font-weight:700;">Our recollection guarantee — in writing</p>
      <ul style="padding-left:18px;margin:6px 0 0;font-size:13px;color:#7f1d1d;line-height:1.55;">
        <li>If <strong>ConveLabs</strong> caused the issue, recollection is <strong>100% free</strong>.</li>
        <li>If the <strong>reference lab</strong> caused the issue, recollection is <strong>50% off</strong>.</li>
      </ul>
    </div>

    <!-- ── 8. CTA — one button only ─────────────────────────────── -->
    <div style="text-align:center;margin:24px 0 10px;">
      <a href="${portalUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:15px 42px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">Open my portal →</a>
    </div>
    <p style="text-align:center;font-size:12px;color:#6b7280;margin:0 0 12px;">Your email is already on file — no password? Click the button; you'll be prompted to set one.</p>

    <p style="margin:20px 0 6px;">If you ever have a question, email <a href="mailto:info@convelabs.com" style="color:#B91C1C;">info@convelabs.com</a> or text <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a>. I read every message myself.</p>
    <p style="margin:16px 0 0;">With gratitude,<br>
    <strong>Nicodemme "Nico" Jean-Baptiste</strong><br>
    <em>Founder, ConveLabs Concierge Lab Services</em></p>

    <!-- ── 9. UNSUBSCRIBE (CAN-SPAM) ───────────────────────────── -->
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 14px;">
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;line-height:1.55;">
      You're receiving this because you have an active ConveLabs account.<br>
      ConveLabs Concierge Lab Services · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169<br>
      <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe from marketing emails</a> — transactional appointment notifications continue either way.
    </p>
  </div>
</div>`;
};

const draftBanner = () => `
<div style="font-family:sans-serif;max-width:640px;margin:16px auto;background:#fef3c7;border:2px dashed #f59e0b;border-radius:8px;padding:14px;">
  <p style="margin:0;color:#78350f;font-size:12px;"><strong>🔎 PATIENT BLAST DRAFT</strong> — preview sent to info@convelabs.com only. The live version iterates every active non-unsubscribed patient (expected recipient count: ~424). Personalized subject shown is the default; first-name token populates live.</p>
</div>`;

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

    // Single representative preview — first name shown as "there", email
    // fallback as info@convelabs.com so the CTA button goes to a valid login
    // prefill for the reviewer.
    const html = draftBanner() + buildPatientEmailHtml({
      firstName: 'there',
      email: 'info@convelabs.com',
      unsubscribeUrl: 'https://www.convelabs.com/unsubscribe?email=info@convelabs.com&campaign=patient_announce_2026_04_19',
    });

    const fd = new FormData();
    fd.append('from', `ConveLabs Drafts <noreply@${MAILGUN_DOMAIN}>`);
    fd.append('to', DRAFT_TO);
    fd.append('h:Reply-To', DRAFT_TO);
    fd.append('subject', `[DRAFT → Patients] ${PATIENT_SUBJECT}`);
    fd.append('html', html);
    fd.append('o:tracking-clicks', 'no');

    const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: fd,
    });
    const mg = await resp.text();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'mailgun error', status: resp.status, body: mg.substring(0, 400) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true, to: DRAFT_TO, subject: PATIENT_SUBJECT, mailgun: JSON.parse(mg) }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
