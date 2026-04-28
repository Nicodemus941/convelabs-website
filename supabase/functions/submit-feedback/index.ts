/**
 * SUBMIT-FEEDBACK
 *
 * Captures post-visit star ratings from patients. Called via GET from
 * 1-click email links: /functions/v1/submit-feedback?appt=ID&rating=N&t=TOKEN
 *
 * Returns a styled HTML thank-you page (no JS, just CSS) that asks for an
 * optional comment and POSTs back to upgrade the rating row.
 *
 * Security: token = last 8 hex chars of appointment_id. Trivial integrity
 * check (anyone with the appointment ID can submit) but prevents drive-by
 * scrapers from spraying ratings at random IDs. RLS lets only admins read.
 *
 * SMS owner immediately on rating <= 2 — real-time bad-experience alert
 * so admin can call the patient before bad reviews show up online.
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

function htmlPage(opts: { title: string; body: string; }): Response {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${opts.title} · ConveLabs</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;background:#f4f4f5;color:#111827;}
  .wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);}
  .head{background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:28px 24px;text-align:center;}
  .head h1{margin:0;font-size:22px;}
  .body{padding:28px 24px;line-height:1.6;}
  .stars{font-size:32px;letter-spacing:6px;text-align:center;margin:18px 0;}
  textarea{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:12px;font-size:14px;font-family:inherit;box-sizing:border-box;}
  button{background:#B91C1C;color:#fff;padding:12px 28px;border:0;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;}
  .foot{font-size:11px;color:#9ca3af;text-align:center;padding:16px;}
</style></head><body><div class="wrap"><div class="head"><h1>${opts.title}</h1></div><div class="body">${opts.body}</div><div class="foot">ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169</div></div></body></html>`;
  return new Response(html, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const apptId = url.searchParams.get('appt') || '';
  const ratingStr = url.searchParams.get('rating') || '';
  const token = url.searchParams.get('t') || '';
  const rating = parseInt(ratingStr, 10);

  if (!apptId || !rating || rating < 1 || rating > 5) {
    return htmlPage({ title: 'Invalid Link', body: '<p>This feedback link looks invalid. Please use the button from your email, or call us at (941) 527-9169.</p>' });
  }
  if (token !== tokenFor(apptId)) {
    return htmlPage({ title: 'Invalid Link', body: '<p>This feedback link is missing or has expired.</p>' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Look up the appointment to capture patient details
  const { data: appt } = await admin.from('appointments')
    .select('id, patient_name, patient_email').eq('id', apptId).maybeSingle();

  if (!appt) {
    return htmlPage({ title: 'Visit Not Found', body: '<p>We couldn\'t find that visit. Please call us at (941) 527-9169 if you\'d like to share feedback.</p>' });
  }

  // Handle POST (comment submission upgrades the latest row)
  if (req.method === 'POST') {
    let comment = '';
    try {
      const body = await req.json();
      comment = String(body?.comment || '').slice(0, 1500);
    } catch { /* form submit may also work */ }

    const { data: existing } = await admin.from('feedback_responses')
      .select('id').eq('appointment_id', apptId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      await admin.from('feedback_responses').update({ comment }).eq('id', existing.id);
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // GET: capture the rating row
  // Idempotency: if same appt already has a response in last 24h, treat as
  // an update (keep latest rating).
  const { data: recent } = await admin.from('feedback_responses')
    .select('id').eq('appointment_id', apptId)
    .gt('created_at', new Date(Date.now() - 86400_000).toISOString())
    .maybeSingle();

  if (recent) {
    await admin.from('feedback_responses').update({ rating }).eq('id', recent.id);
  } else {
    await admin.from('feedback_responses').insert({
      appointment_id: apptId,
      patient_email: (appt as any).patient_email || null,
      patient_name: (appt as any).patient_name || null,
      rating,
      source: 'post_visit_email',
      user_agent: req.headers.get('user-agent')?.slice(0, 250) || null,
    });
  }

  // Real-time bad-rating alert — admin SMS so they can call the patient
  // before a 1-star Google review lands.
  if (rating <= 2) {
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
            Body: `⚠️ ${rating}/5 rating from ${(appt as any).patient_name || (appt as any).patient_email || 'patient'} (appt ${apptId.slice(0,8)}). Call them before they post.`,
            From: TWILIO_FROM,
          }).toString(),
        });
      }
    } catch (e) { console.warn('[submit-feedback] SMS failed:', e); }
  }

  // Render thank-you page with rating-specific follow-up
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const isHappy = rating >= 4;

  const body = isHappy
    ? `<p>Thanks, ${(appt as any).patient_name?.split(' ')[0] || 'friend'} — we\'re glad your visit went well.</p>
       <div class="stars" style="color:#f59e0b;">${stars}</div>
       <p>If you have a moment, would you share that on Google? It helps other patients find us.</p>
       <div style="text-align:center;margin:24px 0;"><a href="https://g.page/r/CQYNAuLgDPeiEAI/review" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;">Leave a Google Review ⭐</a></div>
       <p style="text-align:center;color:#6b7280;font-size:13px;">Anything else you\'d like us to know? <em>(optional)</em></p>
       <form method="POST" action="" id="cmt"><textarea name="comment" rows="4" placeholder="What went especially well?"></textarea><div style="text-align:center;margin-top:12px;"><button type="submit">Send</button></div></form>
       <script>document.getElementById('cmt').addEventListener('submit',async e=>{e.preventDefault();const c=e.target.comment.value;await fetch('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:c})});e.target.outerHTML='<p style=\\'text-align:center;color:#16a34a\\'>Thank you!</p>';});</script>`
    : `<p>Thanks for the honest rating, ${(appt as any).patient_name?.split(' ')[0] || 'friend'}. We\'d like to make this right.</p>
       <div class="stars" style="color:#dc2626;">${stars}</div>
       <p>Tell us what happened — Nico (the founder) reads every one of these directly.</p>
       <form method="POST" action="" id="cmt"><textarea name="comment" rows="5" placeholder="What went wrong? What can we fix?" required></textarea><div style="text-align:center;margin-top:12px;"><button type="submit">Send to Nico</button></div></form>
       <p style="text-align:center;font-size:13px;color:#6b7280;margin-top:18px;">Or call us directly: <strong>(941) 527-9169</strong></p>
       <script>document.getElementById('cmt').addEventListener('submit',async e=>{e.preventDefault();const c=e.target.comment.value;if(!c.trim()){return;}await fetch('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment:c})});e.target.outerHTML='<p style=\\'text-align:center;color:#16a34a\\'>Thank you. We\\'ll be in touch within 24 hours.</p>';});</script>`;

  return htmlPage({ title: isHappy ? 'Thanks for the feedback!' : 'We hear you', body });
});
