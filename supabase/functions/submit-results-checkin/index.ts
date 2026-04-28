/**
 * SUBMIT-RESULTS-CHECKIN
 *
 * 3-day post-visit yes/no link: did your lab results come in yet?
 * Email links to /functions/v1/submit-results-checkin?appt=ID&got=yes|no&t=TOKEN
 *
 * On "no" → SMS owner so they can intervene (lab portal lookup, call patient,
 * escalate to lab). On "yes" → silent capture for trend reporting.
 *
 * Token format: last 8 hex chars of appointment_id (matches submit-feedback).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function tokenFor(apptId: string): string {
  return apptId.replace(/-/g, '').slice(-8);
}

function htmlPage(title: string, bodyHtml: string): Response {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ConveLabs</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;background:#f4f4f5;color:#111827;}
  .wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);}
  .head{background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:28px 24px;text-align:center;}
  .head h1{margin:0;font-size:22px;}
  .body{padding:28px 24px;line-height:1.6;}
  .foot{font-size:11px;color:#9ca3af;text-align:center;padding:16px;}
</style></head><body><div class="wrap"><div class="head"><h1>${title}</h1></div><div class="body">${bodyHtml}</div><div class="foot">ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169</div></div></body></html>`;
  return new Response(html, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const apptId = url.searchParams.get('appt') || '';
  const got = (url.searchParams.get('got') || '').toLowerCase();
  const token = url.searchParams.get('t') || '';

  if (!apptId || (got !== 'yes' && got !== 'no')) {
    return htmlPage('Invalid Link', '<p>This results check-in link looks invalid. Please use the buttons from your email, or call (941) 527-9169.</p>');
  }
  if (token !== tokenFor(apptId)) {
    return htmlPage('Invalid Link', '<p>This link is missing or has expired.</p>');
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: appt } = await admin.from('appointments')
    .select('id, patient_name, patient_email').eq('id', apptId).maybeSingle();
  if (!appt) {
    return htmlPage('Visit Not Found', '<p>We couldn\'t locate that visit. Please call (941) 527-9169 if you need help.</p>');
  }

  const gotResults = got === 'yes';

  // Idempotency: only one row per appointment
  const { data: existing } = await admin.from('lab_results_checkin')
    .select('id').eq('appointment_id', apptId).maybeSingle();
  if (existing) {
    await admin.from('lab_results_checkin').update({
      got_results: gotResults,
      user_agent: req.headers.get('user-agent')?.slice(0, 250) || null,
    }).eq('id', existing.id);
  } else {
    await admin.from('lab_results_checkin').insert({
      appointment_id: apptId,
      patient_email: (appt as any).patient_email || null,
      got_results: gotResults,
      user_agent: req.headers.get('user-agent')?.slice(0, 250) || null,
    });
  }

  // SMS owner on "no" so they can intervene before the patient gets frustrated.
  if (!gotResults) {
    try {
      const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
      const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
      const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
      const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
      if (TWILIO_SID && TWILIO_AUTH) {
        const cleanPhone = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            To: cleanPhone,
            Body: `📋 Lab results MIA: ${(appt as any).patient_name || 'patient'} (appt ${apptId.slice(0,8)}) hasn't received results 3 days post-visit. Check lab portal or call them.`,
            From: TWILIO_FROM,
          }).toString(),
        });
      }
    } catch (e) { console.warn('[results-checkin] SMS failed:', e); }
  }

  const firstName = ((appt as any).patient_name || '').split(' ')[0] || 'friend';

  const body = gotResults
    ? `<p>Awesome — glad you have your results, ${firstName}!</p>
       <p>If you need help interpreting them or want to share with another provider, just reply to your visit confirmation email or call us at <strong>(941) 527-9169</strong>.</p>
       <p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Ready for your next visit? <a href="https://convelabs.com/book-now" style="color:#B91C1C;font-weight:600;">Book online →</a></p>`
    : `<p>Got it, ${firstName} — we'll look into it on our end.</p>
       <p>We've alerted our team to check with the lab portal directly. You should have your results in the next 24-48 hours, or you'll hear from us with an update.</p>
       <p style="text-align:center;margin-top:18px;">Need them faster? Call us at <strong><a href="tel:+19415279169" style="color:#B91C1C;text-decoration:none;">(941) 527-9169</a></strong></p>`;

  return htmlPage(gotResults ? 'Got it — thanks!' : 'On it', body);
});
