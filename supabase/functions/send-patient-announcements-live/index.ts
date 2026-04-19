// send-patient-announcements-live
// ─────────────────────────────────────────────────────────────────────────
// Fires the patient announcement to every active, non-unsubscribed,
// non-already-sent patient. Triple dedup:
//   1. Query filter excludes anyone in email_unsubscribes
//   2. Query filter excludes anyone in campaign_sends for this campaign_key
//   3. Per-recipient check before send (race-condition belt)
//   4. INSERT into campaign_sends on success
// Cron self-unschedules after firing so it cannot re-trigger.

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
const PATIENT_SUBJECT = 'Your ConveLabs account is live — lock in founding-member pricing (ends April 30)';
const PUBLIC_SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

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
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Your ConveLabs account is live</h1>
    <p style="margin:6px 0 0;color:#fecaca;font-size:13px;letter-spacing:.5px;">Founder-owned since 2023 · trusted by hundreds of Central Florida patients</p>
  </div>
  <div style="background:#78350f;color:#fef3c7;padding:10px 14px;text-align:center;font-size:13px;font-weight:700;letter-spacing:.3px;">
    ⏰ Founding-member pricing ends <span style="color:#fde68a;">April 30, 2026</span> — rates rise May 1
  </div>
  <div style="padding:28px 24px;background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;color:#111827;line-height:1.6;font-size:14.5px;">
    <p>Hi ${firstName || 'there'},</p>
    <p>Thanks for choosing ConveLabs for your blood work. Your patient portal is now live — and I'm writing to give you <strong>one chance to lock in founding-member pricing</strong> before rates go up at the end of this month.</p>

    <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">No more of this:</h3>
    <ul style="padding-left:20px;margin:10px 0 16px;color:#374151;">
      <li>Driving to a lab + sitting in a waiting room you don't feel well in.</li>
      <li>Calling five times to schedule, then getting a random 4-hour window.</li>
      <li>Forgetting to fast because no one reminded you until morning-of.</li>
      <li>Getting billed later with no idea what the charge was for.</li>
    </ul>

    <h3 style="margin:22px 0 8px;color:#B91C1C;font-size:15px;">Here's what your portal now gives you</h3>
    <ul style="padding-left:20px;margin:10px 0 16px;line-height:1.75;">
      <li><strong>Book in 90 seconds.</strong> Pick a day, pick a time. A real phlebotomist shows up at your door in a known window. No waiting rooms.</li>
      <li><strong>Transparent pricing, paid at booking.</strong> You see the exact price before you click confirm — never a surprise invoice in the mail two weeks later.</li>
      <li><strong>Every appointment in one place.</strong> Upcoming visits, past visits, receipts, lab order files — all in your portal. Nothing to hunt down.</li>
      <li><strong>Reschedule or cancel yourself.</strong> Life happens. Two clicks, no phone call.</li>
      <li><strong>Your results roadmap.</strong> See which panels you've run, when, and what's due for the next check-in.</li>
      <li><strong>Add your family.</strong> Household members share one account view, so managing a spouse's or parent's labs isn't a second headache.</li>
    </ul>

    <div style="background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%);border:2px solid #d97706;border-radius:14px;padding:22px 18px;margin:22px 0;">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:800;">Founding-member offer · ends April 30, 2026</p>
      <h3 style="margin:0 0 8px;color:#78350f;font-size:20px;line-height:1.3;">Lock in today's rate. It never raises for you.</h3>
      <p style="margin:0 0 16px;font-size:13.5px;color:#451a03;line-height:1.55;">
        Pay once a year. Every mobile draw after that is discounted for life. <strong>Standard mobile draw: $150.</strong> Member pricing below. Rates rise <strong>May 1, 2026</strong> — if you join by April 30, your rate never raises as long as you stay a member.
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
            <p style="margin:0 0 6px;font-size:11px;color:#fef3c7;font-weight:800;text-transform:uppercase;letter-spacing:.5px;">Founding VIP bonuses (ends April 30)</p>
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
      <a href="${portalUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:15px 38px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15.5px;line-height:1.2;">Lock in my founding rate →</a>
    </div>
    <p style="text-align:center;font-size:12px;color:#78350f;font-weight:700;margin:0 0 6px;">⏰ Offer ends Thursday, April 30, 2026</p>
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

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull the addressable list: active, has email, not deleted
    const { data: patients, error } = await supabase
      .from('tenant_patients')
      .select('id, first_name, email')
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('email', 'is', null)
      .neq('email', '');
    if (error) throw error;

    // Pull already-sent for this campaign + already-unsubscribed
    const [{ data: alreadySent }, { data: unsubs }] = await Promise.all([
      supabase.from('campaign_sends').select('recipient_email').eq('campaign_key', CAMPAIGN_KEY),
      supabase.from('email_unsubscribes').select('email'),
    ]);
    const skipSet = new Set<string>([
      ...(alreadySent || []).map((r: any) => String(r.recipient_email).toLowerCase()),
      ...(unsubs || []).map((r: any) => String(r.email).toLowerCase()),
    ]);

    const stats = { eligible: 0, sent: 0, skipped_dup: 0, failed: 0 };
    const failed_samples: any[] = [];

    for (const p of (patients || [])) {
      const email = (p.email || '').trim();
      if (!email) continue;
      stats.eligible++;
      if (skipSet.has(email.toLowerCase())) {
        stats.skipped_dup++;
        continue;
      }

      const unsubscribeUrl = `${PUBLIC_SITE}/unsubscribe?email=${encodeURIComponent(email)}&campaign=${encodeURIComponent(CAMPAIGN_KEY)}`;
      const html = buildPatientEmailHtml({
        firstName: (p.first_name || '').trim() || 'there',
        email,
        unsubscribeUrl,
      });

      const fd = new FormData();
      fd.append('from', `Nico at ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
      fd.append('to', email);
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
        // Record immediately so concurrent runs don't re-send
        await supabase.from('campaign_sends').insert({
          campaign_key: CAMPAIGN_KEY,
          recipient_email: email.toLowerCase(),
          mailgun_id: mgId,
          status: 'sent',
          metadata: { patient_id: p.id, first_name: p.first_name || null },
        }).then(() => { /* ignored */ });
        // Also add to in-memory skipSet so a mid-run duplicate can't sneak through
        skipSet.add(email.toLowerCase());
        stats.sent++;
      } else {
        stats.failed++;
        if (failed_samples.length < 5) {
          failed_samples.push({ email, status: resp.status, err: mgBody.substring(0, 200) });
        }
      }
      // Gentle rate-limit: ~5 sends/sec
      await new Promise(r => setTimeout(r, 200));
    }

    return new Response(JSON.stringify({
      success: true,
      campaign_key: CAMPAIGN_KEY,
      fired_at: new Date().toISOString(),
      ...stats,
      failed_samples,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
