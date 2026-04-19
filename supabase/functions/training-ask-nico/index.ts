// training-ask-nico
// Admin can't find the answer in FAQs — escalates to Nico. Creates an
// escalation row + emails Nico. Every Nico answer can later be converted
// to a public FAQ (training_escalations.converted_to_faq_id).
//
// Request:  { question, context?, partner_org_id? }
// Response: { success: true, escalation_id }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const role = user.user_metadata?.role;
    if (role !== 'super_admin' && role !== 'office_manager') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { question, context, partner_org_id } = await req.json();
    if (!question || String(question).trim().length < 5) {
      return new Response(JSON.stringify({ error: 'Question too short' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: escalation, error: esErr } = await admin
      .from('training_escalations')
      .insert({
        user_id: user.id,
        question: String(question).trim(),
        context: context ? String(context).trim() : null,
        partner_org_id: partner_org_id || null,
      })
      .select('id')
      .single();
    if (esErr) throw esErr;

    // Email Nico
    if (MAILGUN_API_KEY) {
      try {
        const adminName = user.user_metadata?.full_name || user.email;
        const orgContext = partner_org_id ? ` (partner: ${partner_org_id.substring(0, 8)}...)` : '';
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:600px;">
  <div style="background:#B91C1C;color:#fff;padding:18px;border-radius:10px 10px 0 0;">
    <h2 style="margin:0;font-size:18px;">💬 Admin escalation from ${adminName}${orgContext}</h2>
  </div>
  <div style="padding:22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;line-height:1.6;">
    <p style="font-size:12px;color:#6b7280;margin:0 0 6px;">QUESTION</p>
    <p style="font-size:15px;margin:0 0 16px;padding:12px;background:#f9fafb;border-radius:6px;">${question.replace(/\n/g, '<br>')}</p>
    ${context ? `<p style="font-size:12px;color:#6b7280;margin:0 0 6px;">CONTEXT</p><p style="font-size:13px;margin:0 0 16px;padding:10px;background:#f9fafb;border-radius:6px;color:#374151;">${context.replace(/\n/g, '<br>')}</p>` : ''}
    <p style="font-size:12px;color:#6b7280;">Reply to ${adminName} directly, then consider converting this answer to a public FAQ in the admin Training tab.</p>
  </div>
</div>`;
        const fd = new FormData();
        fd.append('from', `ConveLabs Ops <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', 'info@convelabs.com');
        fd.append('h:Reply-To', user.email || 'info@convelabs.com');
        fd.append('subject', `💬 Admin asks: ${String(question).substring(0, 60)}...`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });
      } catch (e) { console.warn('escalation email failed:', e); }
    }

    return new Response(JSON.stringify({ success: true, escalation_id: escalation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('training-ask-nico error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
