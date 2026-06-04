/**
 * SUBMIT-REFERRING-PROVIDER
 *
 * Token-based "keep my doctor in the loop" capture for the branded
 * /pay/:token success screen (V2 embedded checkout stays on our page, so the
 * patient never reaches /welcome where the modal normally lives).
 *
 * Resolves the appointment + patient from the pay token server-side (no PHI
 * to the client), then calls capture_referring_provider — same path the
 * /welcome modal uses, which feeds the consented delivery-receipt + outreach.
 *
 * Body: { token, provider_name?, practice_name?, practice_phone?,
 *         practice_email?, practice_city?, consent? }
 * → { ok }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const b = await req.json().catch(() => ({}));
    const token: string = b?.token || '';
    if (!token) return json({ error: 'token_required' }, 400);
    if (!String(b?.provider_name || '').trim() && !String(b?.practice_name || '').trim()) {
      return json({ error: 'provider_or_practice_required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve appointment + patient from the pay token (server-side; no PHI client-side).
    const { data: tok } = await admin
      .from('appointment_pay_tokens')
      .select('appointment_id')
      .eq('access_token', token)
      .maybeSingle();
    if (!tok) return json({ error: 'token_not_found' }, 404);

    const { data: appt } = await admin
      .from('appointments')
      .select('id, patient_email, patient_name, appointment_date, service_name, service_type')
      .eq('id', tok.appointment_id)
      .maybeSingle();
    if (!appt) return json({ error: 'appointment_not_found' }, 404);

    const consent = b?.consent === true;
    const practiceEmail = String(b?.practice_email || '').trim().toLowerCase() || null;
    const providerName = String(b?.provider_name || '').trim() || null;
    const practiceName = String(b?.practice_name || '').trim() || null;

    // Bookkeeping (acquisition loop / dedup) — unchanged.
    const { data: refId, error } = await admin.rpc('capture_referring_provider' as any, {
      p_appointment_id: appt.id,
      p_patient_email: String(appt.patient_email || '').toLowerCase(),
      p_patient_name: appt.patient_name || '',
      p_provider_name: providerName,
      p_practice_name: practiceName,
      p_practice_phone: String(b?.practice_phone || '').trim() || null,
      p_practice_email: practiceEmail,
      p_practice_city: String(b?.practice_city || '').trim() || null,
      p_consent: consent,
    });
    if (error) return json({ error: error.message }, 500);

    // ── IMMEDIATE COURTESY HEADS-UP ────────────────────────────────
    // The patient just opted in ("keep my doctor in the loop"). Honor that
    // promise NOW with a courtesy heads-up to the practice — independent of
    // the acquisition drip (which is a separate recruitment track). Gated on
    // consent + a practice email; first name + visit date only (HIPAA
    // minimum-necessary). A delivery receipt follows when the specimen lands.
    let headsUpSent = false;
    if (consent && practiceEmail && MAILGUN_API_KEY) {
      try {
        const firstName = String(appt.patient_name || 'your patient').split(' ')[0];
        const greet = providerName || practiceName || 'Doctor';
        const visitDate = appt.appointment_date
          ? new Date(String(appt.appointment_date).substring(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
          : 'soon';
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0f766e;color:white;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
    <h2 style="margin:0;font-size:20px;">Your patient booked a mobile blood draw</h2>
    <p style="margin:4px 0 0;opacity:0.9;font-size:13px;">Courtesy heads-up at your patient's request</p>
  </div>
  <div style="background:white;border:1px solid #e5e7eb;padding:22px;border-radius:0 0 10px 10px;line-height:1.5;">
    <p>Hi ${greet},</p>
    <p>Your patient <strong>${firstName}</strong> scheduled an at-home blood draw with ConveLabs and asked us to keep you in the loop.</p>
    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:14px;margin:14px 0;font-size:14px;">
      <p style="margin:0;"><strong>Visit date:</strong> ${visitDate}</p>
      <p style="margin:6px 0 0;"><strong>Service:</strong> ${appt.service_name || appt.service_type || 'Mobile blood draw'}</p>
    </div>
    <p style="font-size:13px;color:#6b7280;">We'll send you a delivery receipt the moment the specimen reaches the lab. Results arrive through the destination lab's standard pipeline — no change to how you receive them.</p>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;border-top:1px solid #f3f4f6;padding-top:12px;">
      Sent at the patient's request (first name + visit date only, per HIPAA minimum-necessary).<br/>
      ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169
    </p>
  </div>
</div>`;
        const fd = new FormData();
        fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
        fd.append('to', practiceEmail);
        fd.append('subject', `Your patient ${firstName} booked a mobile blood draw with ConveLabs`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        fd.append('o:tag', 'referring-provider-heads-up');
        const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST', headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd,
        });
        headsUpSent = mg.ok;
        try {
          await admin.from('email_send_log').insert({
            appointment_id: appt.id, to_email: practiceEmail, email_type: 'referring_provider_heads_up',
            subject: `Your patient ${firstName} booked a mobile blood draw with ConveLabs`,
            sent_at: new Date().toISOString(), status: mg.ok ? 'sent' : 'failed',
            campaign_tag: 'referring_provider_heads_up',
          });
        } catch { /* non-blocking */ }
      } catch (e) { console.warn('[submit-referring-provider] heads-up email failed:', e); }
    }

    return json({ ok: true, referral_id: refId || null, heads_up_sent: headsUpSent });
  } catch (e: any) {
    console.error('[submit-referring-provider] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
