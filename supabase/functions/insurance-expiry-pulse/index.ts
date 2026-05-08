// insurance-expiry-pulse — daily cron that nudges patients whose
// insurance on file is going stale. Hormozi: most plans renew Jan 1; by
// late December ~30% of cards on file are about to be invalid. Catching
// it BEFORE the visit prevents the patient-shows-up + claim-rejects
// trust collapse.
//
// Logic:
//   - active patient_insurances where rank='primary'
//   - AND (expiry_pulse_sent_at IS NULL OR expiry_pulse_sent_at < now() - 365 days)
//   - AND (verified_at IS NULL OR verified_at < now() - 11 months)
//   - AND patient has email or phone
//   - throttle: max 50 sends per cron run
//
// Body: { dry?: bool, force?: bool, limit?: number }
//   - dry=true → return candidates list without sending
//   - force=true → ignore the verified_at cutoff (annual Dec 28 blast)
//   - limit defaults to 50, capped at 200

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry === true || url.searchParams.get('dry') === 'true';
    const force = body?.force === true;
    const limit = Math.min(parseInt(String(body?.limit || '50'), 10) || 50, 200);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    let query = supabase
      .from('patient_insurances')
      .select('id, patient_id, provider, expiry_pulse_sent_at, verified_at')
      .eq('rank', 'primary')
      .eq('is_active', true);

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    query = query.or(`expiry_pulse_sent_at.is.null,expiry_pulse_sent_at.lt.${oneYearAgo}`);

    if (!force) {
      const elevenMonthsAgo = new Date(Date.now() - 335 * 24 * 60 * 60 * 1000).toISOString();
      query = query.or(`verified_at.is.null,verified_at.lt.${elevenMonthsAgo}`);
    }

    const { data: candidates, error: candErr } = await query.limit(limit);
    if (candErr) {
      return new Response(JSON.stringify({ ok: false, error: candErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const sent: any[] = [];
    const failed: any[] = [];
    const skipped: any[] = [];

    for (const ins of (candidates || [])) {
      const patientId = (ins as any).patient_id;
      const { data: tp } = await supabase
        .from('tenant_patients')
        .select('id, first_name, email, phone')
        .eq('id', patientId)
        .maybeSingle();

      if (!tp || (!(tp as any).email && !(tp as any).phone)) {
        skipped.push({ insurance_id: (ins as any).id, reason: 'no contact' });
        continue;
      }

      const firstName = (tp as any).first_name || 'there';

      // Mint a single-use 14-day token so the SMS/email link goes
      // straight to a self-serve upload page (no login required).
      // Without this, the link 404s / lands on the homepage.
      let tokenUrl = `${PUBLIC_SITE_URL}/insurance/update`;
      try {
        const { data: tk } = await supabase
          .from('insurance_upload_tokens')
          .insert({
            patient_id: (tp as any).id,
            token: crypto.randomUUID() + '-' + crypto.randomUUID().split('-')[0],
            source: 'expiry_pulse',
          })
          .select('token')
          .single();
        if (tk) tokenUrl = `${PUBLIC_SITE_URL}/insurance/update/${(tk as any).token}`;
      } catch (e) { console.warn('[expiry-pulse] token mint failed (non-fatal):', e); }
      const updateUrl = tokenUrl;

      if (dryRun) {
        sent.push({ insurance_id: (ins as any).id, would_send_to: { email: (tp as any).email, phone: (tp as any).phone } });
        continue;
      }

      let smsOk = false;
      if ((tp as any).phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        try {
          const smsBody = `Hi ${firstName} — quick check from ConveLabs. We want to make sure the insurance we have on file for you is still active for your next lab visit. Reply YES if it's unchanged, or NEW to upload an updated card: ${updateUrl}`;
          const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              To: normalizePhone((tp as any).phone),
              From: TWILIO_FROM,
              Body: smsBody,
            }).toString(),
          });
          smsOk = r.ok;
        } catch (e) { console.warn('[expiry-pulse] sms failed:', e); }
      }

      let emailOk = false;
      if ((tp as any).email && MAILGUN_KEY) {
        try {
          const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="margin:0;font-size:20px;">Quick insurance check</h1>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 12px 12px;line-height:1.6;">
    <p>Hi ${firstName},</p>
    <p>We're getting your chart ready for your next lab visit. We want to make sure the insurance we have on file is still active — most plans renew Jan 1, and using a stale card causes claims to bounce.</p>
    <p style="margin:24px 0;">Two ways to confirm:</p>
    <div style="text-align:center;margin:18px 0;">
      <a href="${updateUrl}" style="display:inline-block;background:#B91C1C;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Upload my updated card</a>
    </div>
    <p style="font-size:13px;color:#6b7280;text-align:center;">Or reply YES to this email if your insurance hasn't changed.</p>
    <p style="font-size:12px;color:#9ca3af;margin-top:18px;">Takes 30 seconds. Saves a lot of paperwork later.</p>
    <p style="margin:18px 0 0;font-size:13px;">— Nicodemme "Nico" Jean-Baptiste<br><em>Founder, ConveLabs</em></p>
  </div>
</div>`;
          const fd = new FormData();
          fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
          fd.append('to', (tp as any).email);
          fd.append('subject', 'Quick check — is your insurance still active?');
          fd.append('html', html);
          fd.append('o:tag', 'insurance-expiry-pulse');
          const r = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_KEY}`)}` },
            body: fd,
          });
          emailOk = r.ok;
        } catch (e) { console.warn('[expiry-pulse] email failed:', e); }
      }

      if (smsOk || emailOk) {
        await supabase.from('patient_insurances')
          .update({ expiry_pulse_sent_at: new Date().toISOString() })
          .eq('id', (ins as any).id);
        sent.push({ insurance_id: (ins as any).id, sms: smsOk, email: emailOk });
      } else {
        failed.push({ insurance_id: (ins as any).id });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      dry_run: dryRun,
      candidates: (candidates || []).length,
      sent_count: sent.length,
      skipped_count: skipped.length,
      failed_count: failed.length,
      sent: sent.slice(0, 10),
      skipped: skipped.slice(0, 5),
      failed: failed.slice(0, 5),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[insurance-expiry-pulse] crash:', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
