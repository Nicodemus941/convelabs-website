/**
 * chat-thread — human side of the Nicobot two-way chat.
 *
 *   GET  ?token=<t>                      → load conversation + messages (token page)
 *   POST { token, body }                 → staff reply via the secure token page
 *   POST { conversationId, body } + admin JWT → staff reply from the admin dashboard
 *
 * A staff reply is stored as a role='human' message and delivered to the
 * visitor on every channel we have: live in the widget (realtime insert),
 * SMS (if a phone was captured) and email (if an email was captured). The
 * conversation flips to handoff_state='human' so the AI stops auto-replying.
 *
 * Deployed --no-verify-jwt: the token page has no Supabase session. Auth is
 * enforced in-function (valid unexpired token, OR a valid super_admin JWT).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
function normPhone(p: string) {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p?.startsWith('+') ? p : (d ? `+${d}` : '');
}

async function loadConvByToken(admin: any, token: string) {
  const { data } = await admin.from('chatbot_conversations')
    .select('id, captured_name, captured_email, captured_phone, captured_zip, lead_path, status, handoff_state, token_expires_at, started_at')
    .eq('access_token', token).maybeSingle();
  if (!data) return { ok: false as const, code: 'not_found' };
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return { ok: false as const, code: 'expired' };
  return { ok: true as const, conv: data };
}

async function isAdminJWT(req: Request): Promise<boolean> {
  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!jwt || jwt === ANON_KEY) return false;
    const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user } } = await anon.auth.getUser(jwt);
    if (!user) return false;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    return ['super_admin', 'office_manager'].includes((prof as any)?.role || '');
  } catch { return false; }
}

async function messagesFor(admin: any, conversationId: string) {
  const { data } = await admin.from('chatbot_messages')
    .select('id, role, content, created_at, delivered_via, escalation_triggered')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);
  return data || [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);

  try {
    // ── GET: load a conversation for the token page ──
    if (req.method === 'GET') {
      const token = url.searchParams.get('token') || '';
      if (!token) return j({ error: 'token required' }, 400);
      const res = await loadConvByToken(admin, token);
      if (!res.ok) return j({ error: res.code }, 410);
      // Opening the thread = staff has seen it.
      await admin.from('chatbot_conversations').update({ staff_unread: false }).eq('id', res.conv.id);
      const messages = await messagesFor(admin, res.conv.id);
      return j({ ok: true, conversation: res.conv, messages });
    }

    if (req.method !== 'POST') return j({ error: 'method_not_allowed' }, 405);

    const body = await req.json().catch(() => ({}));
    const text = String(body?.body || '').trim();
    if (!text) return j({ error: 'empty_message' }, 400);

    // ── Authorize: token page OR admin JWT ──
    let conv: any = null;
    if (body?.token) {
      const res = await loadConvByToken(admin, String(body.token));
      if (!res.ok) return j({ error: res.code }, 410);
      conv = res.conv;
    } else if (body?.conversationId) {
      if (!(await isAdminJWT(req))) return j({ error: 'unauthorized' }, 401);
      const { data } = await admin.from('chatbot_conversations')
        .select('id, captured_name, captured_email, captured_phone, lead_path, status, handoff_state')
        .eq('id', String(body.conversationId)).maybeSingle();
      if (!data) return j({ error: 'not_found' }, 404);
      conv = data;
    } else {
      return j({ error: 'token_or_conversationId_required' }, 400);
    }

    const channels: string[] = ['widget']; // realtime insert below always reaches an open widget
    let twilioSid: string | null = null;

    // ── Deliver via SMS (if a phone was captured) ──
    const phone = normPhone(conv.captured_phone || '');
    if (phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      try {
        const fd = new URLSearchParams({
          To: phone, From: TWILIO_FROM,
          Body: `ConveLabs (Nico): ${text}\n\nReply here and I'll see it.`,
        });
        const scb = `${SUPABASE_URL}/functions/v1/twilio-status-callback`;
        if (scb.startsWith('http')) fd.append('StatusCallback', scb);
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd.toString(),
        });
        if (r.ok) { channels.push('sms'); try { twilioSid = (await r.json())?.sid || null; } catch { /* */ } }
        // Bridge to sms_conversations so the visitor's texted reply threads back + shows in the SMS inbox.
        try {
          const { data: existing } = await admin.from('sms_conversations').select('id').eq('patient_phone', phone).maybeSingle();
          let smsConvId = (existing as any)?.id;
          if (!smsConvId) {
            const { data: created } = await admin.from('sms_conversations')
              .insert({ patient_phone: phone, last_message_at: new Date().toISOString() }).select('id').single();
            smsConvId = (created as any)?.id;
          }
          if (smsConvId) {
            await admin.from('sms_messages').insert({ conversation_id: smsConvId, body: text, direction: 'outbound', twilio_message_sid: twilioSid, status: 'sent' });
            await admin.from('chatbot_conversations').update({ sms_conversation_id: smsConvId }).eq('id', conv.id);
          }
        } catch (e) { console.warn('[chat-thread] sms bridge failed:', e); }
      } catch (e) { console.warn('[chat-thread] sms send failed:', e); }
    }

    // ── Deliver via email (if an email was captured) ──
    const email = String(conv.captured_email || '').trim();
    if (email && MAILGUN_API_KEY) {
      try {
        const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;"><strong>A message from Nico at ConveLabs</strong></div>
  <div style="padding:22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;color:#111827;line-height:1.6;">
    <p>${text.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>
    <p style="font-size:13px;color:#6b7280;">Just reply to this email or text us at (941) 527-9169 and we'll get right back to you.</p>
    <p style="margin-top:14px;">— Nicodemme Jean-Baptiste · ConveLabs</p>
  </div></div>`;
        const fd = new FormData();
        fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
        fd.append('to', email);
        fd.append('subject', 'Nico from ConveLabs replied to your message');
        fd.append('html', html);
        fd.append('h:Reply-To', 'info@convelabs.com');
        const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd,
        });
        if (mg.ok) channels.push('email');
      } catch (e) { console.warn('[chat-thread] email send failed:', e); }
    }

    // ── Store the human reply + flip to human handoff ──
    const { data: msg, error: msgErr } = await admin.from('chatbot_messages').insert({
      conversation_id: conv.id,
      role: 'human',
      content: text,
      delivered_via: channels.join('+'),
      delivery_status: 'sent',
      twilio_message_sid: twilioSid,
      escalation_triggered: false,
    }).select('id, role, content, created_at, delivered_via').single();
    if (msgErr) {
      // Don't report success if we couldn't persist the message (it would
      // vanish from the thread even though it was delivered).
      return j({ error: 'message_not_saved', detail: msgErr.message, delivered_via: channels }, 500);
    }

    await admin.from('chatbot_conversations').update({
      handoff_state: 'human',
      staff_unread: false,
      status: 'escalated',
      last_message_at: new Date().toISOString(),
      last_message_role: 'human',
      updated_at: new Date().toISOString(),
    }).eq('id', conv.id);

    return j({ ok: true, message: msg, delivered_via: channels });
  } catch (e: any) {
    return j({ error: e?.message || String(e) }, 500);
  }
});
