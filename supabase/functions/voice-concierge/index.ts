// voice-concierge — the SMS concierge brain, now on the phone.
//
// Twilio ConversationRelay (https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)
// handles speech-to-text + text-to-speech and bridges the live call to a
// WebSocket we host here. A patient CALLS the ConveLabs number and just talks:
//   • "Do I need to fast?"            → reads their lab order, answers out loud
//   • "I'd like to book a draw"       → texts them a secure booking link
//   • "Move my Tuesday appointment"   → texts them the reschedule link
//   • "Have someone call me" / risky  → escalates + pings the owner
// Every turn threads into the same chatbot_conversations Chat Inbox as SMS.
//
// TWO MODES on one URL:
//   1. HTTP POST  (Twilio Voice webhook) → returns TwiML <Connect><ConversationRelay>
//   2. WS upgrade (ConversationRelay)    → the live conversation loop
//
// Twilio Console setup (owner):
//   Phone Numbers → [number] → Voice → "A CALL COMES IN" → Webhook:
//   https://<project>.supabase.co/functions/v1/voice-concierge  (HTTP POST)
//
// verify_jwt=false (Twilio sends no JWT). The WS is guarded by VOICE_WS_SECRET
// in the URL query so randoms can't open it.

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
const WS_SECRET = Deno.env.get('VOICE_WS_SECRET') || 'cl-voice';

function last10(p: string): string { return (p || '').replace(/\D/g, '').slice(-10); }
function toE164(p: string): string { const d = (p || '').replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : `+${d}`; }
function randToken(): string {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendSms(to: string, body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN) return;
  const p = new URLSearchParams({ To: toE164(to), From: TWILIO_FROM, Body: body });
  const scb = `${SUPABASE_URL}/functions/v1/twilio-status-callback`;
  if (scb.startsWith('http')) p.append('StatusCallback', scb);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString(),
  }).catch((e) => console.warn('[voice-concierge] sendSms failed:', e?.message));
}

const SYSTEM = `You are the ConveLabs phone concierge — speaking out loud with a caller for ConveLabs, a concierge mobile-phlebotomy practice in Central Florida (a licensed phlebotomist comes to the patient's home or office for blood draws). You are warm, calm, and efficient.

THIS IS A PHONE CALL. Keep every reply to 1–2 short spoken sentences. Ask ONE question at a time. No lists, no URLs spoken aloud (you text links instead), no markdown. Sound like a friendly human receptionist.

YOU CAN ANSWER directly: what ConveLabs is, how mobile draws work, the service area (Central Florida / greater Orlando), what to expect at a visit, general prep, hours, and how booking works.

YOU MUST NOT: give medical advice or interpret results; quote or change prices; confirm/modify/cancel an appointment yourself (use an ACTION so the caller confirms via a texted link); promise anything money-related.

ACTIONS — when the caller clearly wants one, end your reply with a separate final line containing exactly the tag. Your spoken sentence should warmly say you're texting them a link or taking care of it:
- [[ACTION: book]] — wants to book/schedule a new visit. (Say: "I'll text a secure link to your phone to lock it in.")
- [[ACTION: reschedule]] — wants to move/change/cancel an existing visit. (Say: "I'm texting you a link to pick a new time.")
- [[ACTION: callback]] — wants a person to call them, or you can't help confidently. (Say: "I'll have someone from our team call you right back.")
- [[ACTION: fasting]] — asks whether they need to fast or how to prep. (Say a brief lead-in like "Let me check your order." — the system appends the exact answer.)

ESCALATE with a final line [[ESCALATE: <short reason>]] for billing/payment disputes, complaints, medical/results questions, or anything you're unsure of. Say you're connecting them with the team.

Emit at most ONE tag per reply. Never invent facts. If unsure, escalate.`;

// ───────────────────────── shared turn logic ─────────────────────────
// Resolve caller identity + appointment context once per call.
async function loadContext(admin: any, from: string) {
  const ten = last10(from);
  let patientName = '', apptLine = 'No upcoming appointment on file.';
  let apptId: string | null = null, apptFasting = false, apptUrine = false, apptHasOrder = false;
  try {
    const { data: tp } = await admin.from('tenant_patients')
      .select('first_name, last_name').filter('phone', 'ilike', `%${ten}%`).limit(1).maybeSingle();
    if (tp) patientName = [(tp as any).first_name, (tp as any).last_name].filter(Boolean).join(' ');
    const { data: appt } = await admin.from('appointments')
      .select('id, appointment_date, appointment_time, status, fasting_required, urine_required, ocr_processed_at')
      .ilike('patient_phone', `%${ten}%`).gte('appointment_date', new Date().toISOString())
      .not('status', 'eq', 'cancelled').order('appointment_date', { ascending: true }).limit(1).maybeSingle();
    if (appt) {
      apptId = (appt as any).id;
      apptFasting = !!(appt as any).fasting_required;
      apptUrine = !!(appt as any).urine_required;
      apptHasOrder = !!(appt as any).ocr_processed_at;
      apptLine = `Upcoming appointment: ${String((appt as any).appointment_date).slice(0, 10)} ${(appt as any).appointment_time || ''} (${(appt as any).status}).`;
    }
  } catch { /* best-effort */ }
  return { ten, patientName, apptLine, apptId, apptFasting, apptUrine, apptHasOrder };
}

async function ensureConversation(admin: any, from: string, ten: string, patientName: string) {
  const { data: existing } = await admin.from('chatbot_conversations')
    .select('id, access_token, handoff_state').ilike('captured_phone', `%${ten}%`)
    .not('status', 'eq', 'closed').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (existing) return existing;
  const { data: created } = await admin.from('chatbot_conversations').insert({
    visitor_id: `voice-${ten}`, lead_path: 'voice', captured_phone: from, captured_name: patientName || null,
    status: 'active', handoff_state: 'ai', started_at: new Date().toISOString(), last_message_at: new Date().toISOString(),
    access_token: randToken(), token_expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
  }).select('id, access_token, handoff_state').single();
  return created;
}

// Run one caller turn → returns the sentence to speak. Side-effects (texting a
// link, escalation) happen here so the call stays conversational.
async function runTurn(admin: any, ctx: any, conv: any, history: any[], userText: string): Promise<string> {
  await admin.from('chatbot_messages').insert({ conversation_id: conv.id, role: 'user', content: userText.slice(0, 2000), delivered_via: 'voice' });

  let aiText = '';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 300,
        system: `${SYSTEM}\n\nCALLER CONTEXT: ${ctx.patientName ? `Name: ${ctx.patientName}. ` : ''}${ctx.apptLine}`,
        messages: [...history, { role: 'user', content: userText }],
      }),
    });
    const data = await resp.json();
    aiText = data?.content?.[0]?.text || '';
  } catch (e) { console.warn('[voice-concierge] anthropic failed:', (e as any)?.message); }

  const actMatch = aiText.match(/\[\[ACTION:\s*(reschedule|book|callback|fasting)\s*\]\]/i);
  let action: string | null = actMatch ? actMatch[1].toLowerCase() : null;
  const escMatch = aiText.match(/\[\[ESCALATE:\s*([^\]]*)\]\]/i);
  let escalate = (!!escMatch && !action) || !aiText;
  let reason = escMatch?.[1]?.trim() || (!aiText ? 'AI unavailable' : '');
  let spoken = aiText.replace(/\[\[ACTION:[^\]]*\]\]/i, '').replace(/\[\[ESCALATE:[^\]]*\]\]/i, '').trim();

  // Deterministic fasting net (mirrors sms-concierge) — voice STT is noisy, so
  // catch the intent even when the model doesn't tag it.
  if (!action && /fasting|\b(do i|should i|need to|have to)\s+fast\b|empty stomach|can i eat|eat before|drink before/i.test(userText)) {
    action = 'fasting'; escalate = !aiText ? escalate : false; reason = escalate ? reason : '';
  }

  const first = (ctx.patientName || '').split(' ')[0];

  if (action === 'reschedule') {
    if (ctx.apptId) {
      const { data: rr, error: rerr } = await admin.functions.invoke('send-reschedule-link', { body: { appointment_id: ctx.apptId } });
      if (rerr || !(rr && (rr as any).ok)) { escalate = true; reason = 'reschedule link failed'; }
      else if (!spoken) spoken = "I'm texting you a secure link to pick a new time. Anything else I can help with?";
    } else { action = 'book'; }
  }
  if (action === 'book') {
    try {
      const [fn, ...rest] = (ctx.patientName || '').split(' ');
      const bookToken = randToken();
      await admin.from('booking_prefill_tokens').insert({
        token: bookToken, patient_first_name: fn || null, patient_last_name: rest.join(' ') || null,
        patient_phone: ctx.from, service_type: 'mobile', service_name: 'Mobile Blood Draw', service_price_cents: 15000, billed_to: 'patient',
      });
      await sendSms(ctx.from, `Tap to book your mobile blood draw — about 90 seconds: ${PUBLIC}/book-now?prefill=${bookToken}`);
      if (!spoken) spoken = "I just texted a secure booking link to your phone. Is there anything else?";
    } catch (e) { console.warn('[voice-concierge] book failed:', (e as any)?.message); escalate = true; reason = 'booking link failed'; }
  }
  if (action === 'fasting') {
    const urineTip = ctx.apptUrine ? " You'll also give a urine sample, so please hold off on the restroom right before we arrive." : '';
    if (ctx.apptHasOrder) {
      spoken = ctx.apptFasting
        ? `Based on your lab order, please fast for 8 to 12 hours before your draw — water and prescribed medications are fine.${urineTip}`
        : `Good news — your lab order doesn't require fasting, so eat and drink normally before your visit.${urineTip}`;
    } else if (ctx.apptId) {
      spoken = "I don't see your lab order on file yet. If you text a photo of it to this number, I can tell you right away whether you need to fast.";
    } else {
      spoken = "I'd be happy to check. Text a photo of your lab order to this number and I'll let you know if you need to fast.";
    }
  }
  if (action === 'callback') { escalate = true; if (!reason) reason = 'Caller requested a callback'; }

  if (escalate && (!spoken || spoken.length < 4)) {
    spoken = `Thanks${first ? `, ${first}` : ''} — I'm connecting you with our team and someone will follow up shortly. For anything urgent you can also call during business hours.`;
  }
  if (!spoken) spoken = "I'm sorry, could you say that one more time?";

  // Persist assistant turn + update conversation + (on escalation) ping owner.
  await admin.from('chatbot_messages').insert({ conversation_id: conv.id, role: 'assistant', content: spoken, escalation_triggered: escalate, delivered_via: 'voice' });
  await admin.from('chatbot_conversations').update({
    last_message_at: new Date().toISOString(), last_message_role: 'assistant', updated_at: new Date().toISOString(),
    ...(escalate ? { status: 'escalated', escalated_at: new Date().toISOString(), escalation_reason: reason, staff_unread: true, handoff_state: 'human' } : {}),
  }).eq('id', conv.id);
  if (escalate && conv.access_token) {
    await sendSms(OWNER_PHONE, `📞 Voice concierge${action === 'callback' ? ' callback' : ' escalation'}${ctx.patientName ? ` — ${ctx.patientName}` : ''}\nReason: ${reason}\n"${userText.slice(0, 110)}"\nReply: ${PUBLIC}/c/${conv.access_token}`);
  }

  history.push({ role: 'user', content: userText }, { role: 'assistant', content: spoken });
  if (history.length > 16) history.splice(0, history.length - 16); // keep last 8 turns
  return spoken;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── WS MODE: the live ConversationRelay conversation loop ──
  if ((req.headers.get('upgrade') || '').toLowerCase() === 'websocket') {
    if (url.searchParams.get('k') !== WS_SECRET) return new Response('forbidden', { status: 403 });
    const { socket, response } = Deno.upgradeWebSocket(req);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let ctx: any = null, conv: any = null;
    const history: any[] = [];
    let busy = false;

    socket.onmessage = async (ev) => {
      let msg: any; try { msg = JSON.parse(ev.data as string); } catch { return; }
      try {
        if (msg.type === 'setup') {
          const from = msg.from || msg.From || '';
          ctx = await loadContext(admin, from); ctx.from = from;
          conv = await ensureConversation(admin, from, ctx.ten, ctx.patientName);
          // If a human already took this thread over, hand off to a callback.
          if (conv?.handoff_state === 'human') {
            socket.send(JSON.stringify({ type: 'text', token: "Thanks for calling — someone from our team is already helping you and will follow up shortly. Goodbye for now.", last: true }));
            if (conv.access_token) await sendSms(OWNER_PHONE, `📞 Patient called (you're handling this thread)\nReply: ${PUBLIC}/c/${conv.access_token}`);
            setTimeout(() => { try { socket.send(JSON.stringify({ type: 'end' })); } catch { /* */ } }, 1500);
          }
          return;
        }
        if (msg.type === 'prompt' && conv && !busy) {
          const userText = String(msg.voicePrompt || '').trim();
          if (!userText) return;
          busy = true;
          const reply = await runTurn(admin, ctx, conv, history, userText);
          socket.send(JSON.stringify({ type: 'text', token: reply, last: true }));
          busy = false;
        }
      } catch (e) {
        console.error('[voice-concierge] ws turn error:', (e as any)?.message);
        try { socket.send(JSON.stringify({ type: 'text', token: "I'm sorry, I hit a snag. Let me have someone call you back.", last: true })); } catch { /* */ }
        busy = false;
      }
    };
    socket.onerror = (e) => console.warn('[voice-concierge] ws error:', (e as any)?.message);
    return response;
  }

  // ── HTTP MODE: Twilio Voice webhook → start ConversationRelay ──
  // (Twilio posts here when a call comes in.)
  // Inside the edge runtime url.pathname is stripped to "/voice-concierge"
  // (no "/functions/v1" prefix), so build the WS URL explicitly — otherwise
  // Twilio connects to a path that doesn't exist.
  const wsUrl = `wss://${url.host}/functions/v1/voice-concierge?k=${encodeURIComponent(WS_SECRET)}`;
  const greeting = "Hi, thanks for calling ConveLabs, your mobile lab. I can help you book a visit, reschedule, or answer questions about your blood draw. What can I do for you?";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${xmlEscape(wsUrl)}" welcomeGreeting="${xmlEscape(greeting)}" ttsProvider="Google" voice="en-US-Neural2-F" />
  </Connect>
</Response>`;
  return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
});
