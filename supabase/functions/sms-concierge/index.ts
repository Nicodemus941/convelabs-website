// sms-concierge — Phase 1 of the intelligent SMS concierge.
//
// The "brain" for general inbound patient texts. twilio-inbound-sms keeps its
// precise deterministic handlers (1/2/3 booking, DATES, PAID, STOP, MMS photo,
// handed-off mirror) and fires THIS function fire-and-forget for everything
// else — so a slow Claude call can never time out the Twilio webhook.
//
// What it does (Phase 1 — answers + escalation only, NO money/medical actions):
//   1. Find-or-create a chatbot_conversation keyed to the phone → every text
//      threads into the same Chat Inbox the owner reviews.
//   2. Store the inbound message.
//   3. Load light patient context (name + next appointment).
//   4. Ask Claude for a concise, HIPAA-safe reply. The model flags
//      [[ESCALATE: reason]] for anything action-y or risky (reschedule,
//      billing, complaint, medical, lab results, urgency, or uncertainty).
//   5. On escalate → hand off to a human (status=escalated, staff_unread,
//      ping owner with the /c/<token> link) and send the patient a calm
//      "someone will follow up" note instead of an AI guess.
//   6. Otherwise → send the AI answer back via Twilio REST + store it.
//
// Phases 2/3 (reschedule/book/callback actions, photo→OCR fasting) layer on top
// of this router later.
//
// Body: { from: string, body: string }   (called by twilio-inbound-sms)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const MODEL = 'claude-sonnet-4-6';
const PUBLIC = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function last10(p: string): string { return (p || '').replace(/\D/g, '').slice(-10); }
function toE164(p: string): string { const d = (p || '').replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : `+${d}`; }
function randToken(): string {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendSms(to: string, bodyText: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN) return;
  const p = new URLSearchParams({ To: toE164(to), From: TWILIO_FROM, Body: bodyText });
  const scb = `${SUPABASE_URL}/functions/v1/twilio-status-callback`;
  if (scb.startsWith('http')) p.append('StatusCallback', scb);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString(),
  }).catch((e) => console.warn('[sms-concierge] sendSms failed:', e?.message));
}

const SYSTEM = `You are the ConveLabs SMS concierge — texting on behalf of ConveLabs, a concierge mobile-phlebotomy practice in Central Florida (licensed phlebotomist comes to the patient's home/office for blood draws; results via the destination lab). You are warm, concise, and professional. This is SMS: keep replies under ~320 characters, no markdown, no emojis spam (one tasteful emoji max).

YOU CAN ANSWER directly: what ConveLabs is, how mobile draws work, service area (Central Florida / greater Orlando), what to expect at a visit, general prep, hours, how to book (point to ${PUBLIC}/book-now), and simple status-style reassurance.

YOU MUST NOT: give medical advice or interpret lab results; quote or change prices; confirm/modify/cancel appointments yourself; promise anything money-related. ConveLabs is not a medical provider for advice purposes.

ESCALATE to a human (end your message with a separate final line exactly: [[ESCALATE: <short reason>]]) when the patient: wants to reschedule/cancel/book a specific time, has a billing/payment question or dispute, has a complaint or bad experience, asks anything medical or about their results, mentions urgency (today/tomorrow/ASAP), asks whether their lab order requires fasting, or asks anything you are not confident you can answer correctly. When you escalate, your visible message to the patient should be a brief, calm acknowledgement that you're connecting them with the team who will follow up shortly — do NOT guess at the answer.

Never invent facts. If unsure, escalate.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { from, body } = await req.json();
    if (!from || !body) return j({ error: 'from + body required' }, 400);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const ten = last10(from);

    // Patient context — name + next appointment (best-effort).
    let patientName = '';
    let apptLine = '';
    try {
      const { data: tp } = await admin.from('tenant_patients')
        .select('first_name, last_name')
        .filter('phone', 'ilike', `%${ten}%`).limit(1).maybeSingle();
      if (tp) patientName = [(tp as any).first_name, (tp as any).last_name].filter(Boolean).join(' ');
      const { data: appt } = await admin.from('appointments')
        .select('appointment_date, appointment_time, status')
        .ilike('patient_phone', `%${ten}%`)
        .gte('appointment_date', new Date().toISOString())
        .not('status', 'eq', 'cancelled')
        .order('appointment_date', { ascending: true }).limit(1).maybeSingle();
      if (appt) apptLine = `Upcoming appointment: ${String((appt as any).appointment_date).slice(0,10)} ${(appt as any).appointment_time || ''} (${(appt as any).status}).`;
    } catch { /* context is best-effort */ }

    // Find-or-create the chatbot conversation for this phone (threads into Chat Inbox).
    let conv: any = null;
    const { data: existing } = await admin.from('chatbot_conversations')
      .select('id, access_token, handoff_state, captured_name, message_count')
      .ilike('captured_phone', `%${ten}%`)
      .not('status', 'eq', 'closed')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      conv = existing;
    } else {
      const { data: created } = await admin.from('chatbot_conversations').insert({
        visitor_id: `sms-${ten}`, lead_path: 'patient', captured_phone: from,
        captured_name: patientName || null, status: 'active', handoff_state: 'ai',
        started_at: new Date().toISOString(), last_message_at: new Date().toISOString(),
        access_token: randToken(), token_expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
      }).select('id, access_token, handoff_state, captured_name, message_count').single();
      conv = created;
    }
    if (!conv?.id) return j({ error: 'no_conversation' }, 500);

    // Store the inbound message.
    await admin.from('chatbot_messages').insert({ conversation_id: conv.id, role: 'user', content: String(body).slice(0, 2000) });

    // If a human already took this thread over, don't auto-reply — just flag + ping owner.
    if (conv.handoff_state === 'human') {
      await admin.from('chatbot_conversations').update({
        staff_unread: true, last_message_at: new Date().toISOString(), last_message_role: 'user', updated_at: new Date().toISOString(),
      }).eq('id', conv.id);
      if (conv.access_token) await sendSms(OWNER_PHONE, `💬 Patient texted (you're handling this one)\n"${String(body).slice(0,120)}"\nReply: ${PUBLIC}/c/${conv.access_token}`);
      return j({ ok: true, mode: 'human_handoff_ping' });
    }

    // Recent thread history for context (last 10).
    const { data: history } = await admin.from('chatbot_messages')
      .select('role, content').eq('conversation_id', conv.id)
      .order('created_at', { ascending: false }).limit(10);
    const msgs = (history || []).reverse()
      .filter((m: any) => m.role === 'user' || m.role === 'assistant' || m.role === 'human')
      .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    // Ask Claude.
    let aiText = '';
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, max_tokens: 400,
          system: `${SYSTEM}\n\nPATIENT CONTEXT: ${patientName ? `Name: ${patientName}. ` : ''}${apptLine || 'No upcoming appointment on file.'}`,
          messages: msgs.length ? msgs : [{ role: 'user', content: String(body).slice(0, 2000) }],
        }),
      });
      const data = await resp.json();
      aiText = data?.content?.[0]?.text || '';
    } catch (e) {
      console.warn('[sms-concierge] anthropic failed:', (e as any)?.message);
    }

    // Parse escalation signal.
    const escMatch = aiText.match(/\[\[ESCALATE:\s*([^\]]*)\]\]/i);
    const escalate = !!escMatch || !aiText;
    const reason = escMatch?.[1]?.trim() || (!aiText ? 'AI unavailable' : '');
    let visible = aiText.replace(/\[\[ESCALATE:[^\]]*\]\]/i, '').trim();
    if (escalate && (!visible || visible.length < 4)) {
      visible = `Thanks for reaching out${patientName ? `, ${patientName.split(' ')[0]}` : ''} — I'm connecting you with our team and someone will follow up shortly. For anything urgent, call (941) 527-9169.`;
    }

    // Store assistant reply + update conversation.
    await admin.from('chatbot_messages').insert({ conversation_id: conv.id, role: 'assistant', content: visible, escalation_triggered: escalate });
    await admin.from('chatbot_conversations').update({
      last_message_at: new Date().toISOString(), last_message_role: 'assistant',
      updated_at: new Date().toISOString(),
      ...(escalate ? { status: 'escalated', escalated_at: new Date().toISOString(), escalation_reason: reason, staff_unread: true, handoff_state: 'human' } : {}),
    }).eq('id', conv.id);

    // Send the reply to the patient.
    await sendSms(from, visible);

    // On escalation, ping the owner with the thread link.
    if (escalate && conv.access_token) {
      await sendSms(OWNER_PHONE, `🔥 SMS concierge escalation${patientName ? ` — ${patientName}` : ''}\nReason: ${reason}\n"${String(body).slice(0,110)}"\nReply: ${PUBLIC}/c/${conv.access_token}`);
    }

    return j({ ok: true, escalated: escalate, conversation_id: conv.id });
  } catch (e) {
    console.error('[sms-concierge] error:', e);
    return j({ error: (e as Error).message }, 500);
  }
});
