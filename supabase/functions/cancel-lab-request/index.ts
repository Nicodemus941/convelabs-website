// cancel-lab-request
// Provider cancels a lab request from their dashboard. Flips status →
// cancelled + notifies the patient (no reply-to-book SMS will be processed
// after this) + writes audit timestamp.
//
// Request: { request_id, reason? }
// Auth: caller must be role='provider' AND belong to the request's org.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user || user.user_metadata?.role !== 'provider') {
      return new Response(JSON.stringify({ error: 'Not a provider' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { request_id, reason } = await req.json();
    if (!request_id) return new Response(JSON.stringify({ error: 'request_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: request } = await admin.from('patient_lab_requests').select('*').eq('id', request_id).maybeSingle();
    if (!request) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (request.organization_id !== user.user_metadata?.org_id) {
      return new Response(JSON.stringify({ error: 'You can only cancel requests for your own org' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (request.status !== 'pending_schedule' && request.status !== 'scheduled') {
      return new Response(JSON.stringify({ error: `Cannot cancel a request with status '${request.status}'` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Flip status + stamp audit
    await admin.from('patient_lab_requests').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      admin_notes: [request.admin_notes, `[Cancelled by provider: ${reason || '(no reason given)'}]`].filter(Boolean).join('\n'),
    }).eq('id', request_id);

    // If an appointment was already created, cancel it too
    if (request.appointment_id) {
      await admin.from('appointments').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: `Provider cancelled lab request${reason ? `: ${reason}` : ''}`,
      }).eq('id', request.appointment_id);
    }

    // Notify the patient (whatever channel we have)
    const { data: org } = await admin.from('organizations').select('name').eq('id', request.organization_id).maybeSingle();
    const orgName = org?.name || 'Your provider';

    if (request.patient_email && MAILGUN_API_KEY) {
      try {
        const html = `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
          <div style="background:#6b7280;color:#fff;padding:18px;border-radius:10px 10px 0 0;text-align:center;"><h2 style="margin:0;font-size:18px;">Your lab request was cancelled</h2></div>
          <div style="padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;line-height:1.5;">
            <p>Hi ${request.patient_name.split(' ')[0]},</p>
            <p>${orgName} has cancelled the lab request they sent you. You no longer need to book.</p>
            ${reason ? `<p style="background:#f3f4f6;padding:10px;border-radius:6px;font-size:13px;"><strong>Reason:</strong> ${reason}</p>` : ''}
            <p style="font-size:13px;color:#6b7280;">Questions? Contact your provider directly, or email info@convelabs.com.</p>
          </div>
        </div>`;
        const fd = new FormData();
        fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', request.patient_email);
        fd.append('subject', `${orgName} cancelled your lab request`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, { method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd });
      } catch (e) { console.warn('cancel email failed:', e); }
    }

    if (request.patient_phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      try {
        const smsBody = `ConveLabs: ${orgName} cancelled your lab request${reason ? ' (' + reason + ')' : ''}. You don't need to book. Questions? info@convelabs.com`;
        const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
        const fd = new URLSearchParams({ To: normalizePhone(request.patient_phone), From: TWILIO_FROM, Body: smsBody });
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd.toString(),
        });
      } catch (e) { console.warn('cancel SMS failed:', e); }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('cancel-lab-request error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
