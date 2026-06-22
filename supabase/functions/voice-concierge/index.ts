// voice-concierge — the SMS concierge brain, on the phone (Twilio ConversationRelay).
//
// A patient CALLS the ConveLabs number and just talks. v2 upgrades:
//   • Greeting opens with a 911 emergency disclaimer.
//   • Caller is identified by phone → known patients get a booking link with
//     their info pre-filled (name NEVER spoken aloud — HIPAA on an open line).
//   • Upbeat, human, sales-savvy; handles several questions in one natural flow.
//   • Every turn ends with a clear next step, and the agent can END the call
//     cleanly (goodbye / emergency) so the caller is never left in dead air.
//   • "Talk to a person" → live transfer to (941) 527-9169.
//   • Every call threads into the Chat Inbox; risky intents escalate to the owner.
//
// THREE request shapes on one URL:
//   1. HTTP POST (Twilio Voice webhook)        → <Connect action=...><ConversationRelay/></Connect>
//   2. HTTP POST ?handoff=1 (Connect action)   → <Dial> live agent  OR  <Hangup/>
//   3. WS upgrade (ConversationRelay)          → the live conversation loop
//
// verify_jwt=false. The WS is guarded by VOICE_WS_SECRET in the URL query.

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
const LIVE_AGENT_NUMBER = '+19415279169'; // forward "talk to a person" here
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

const SYSTEM = `You are the ConveLabs phone concierge — a warm, upbeat, genuinely excited human-sounding receptionist for ConveLabs, a concierge mobile-phlebotomy practice in Central Florida. A licensed phlebotomist comes to the patient's home or office to draw blood; results go to their doctor or the destination lab.

VOICE STYLE: This is a live phone call. Speak in 1–2 short, natural sentences. Warm, friendly, a little excited — never robotic. Ask ONE thing at a time. No lists, no spelling out URLs, no markdown. Use contractions. Sound delighted to help.

NEVER leave dead air: end EVERY reply with either a question or a clear next step ("Anything else I can help with?", "Want me to text you that link?", "You're all set — feel free to hang up whenever!"). The caller should always know what happens next.

PRIVACY: You may already know who's calling from their phone number, but NEVER say the caller's name or read back personal details out loud — someone else could be listening. Just help them; their saved info is used silently to pre-fill links.

WHAT YOU CAN DO (answer naturally, conversationally — handle several questions in one call):
- Explain what ConveLabs is, how the at-home draw works, the Central Florida service area, what to expect, hours, and pricing in general terms.
- BE GREAT AT SALES: if the caller is deciding whether to book, be genuinely enthusiastic and persuasive — emphasize the convenience (we come to you, no waiting rooms, no traffic), the licensed professional, fast results, and how easy it is. Gently invite them to book. Never pushy, always warm.

ACTIONS — when the caller clearly wants one, end your reply with a separate final line containing exactly the tag. Speak a warm, specific sentence too:
- [[ACTION: book]] — wants to book/schedule. Say you're texting a secure link to their phone that already has their details filled in, and that they can tap it now and stay on the line or hang up — their choice.
- [[ACTION: reschedule]] — wants to move/change/cancel an existing visit. Say you're texting them a link to pick a new time.
- [[ACTION: fasting]] — asks about fasting or prep. Give a brief lead-in ("Let me check your order!") — the system appends the exact answer.
- [[ACTION: transfer]] — wants to talk to a real/live person, a human, or a team member. Say "Of course — connecting you to our team right now, one moment!"
- [[ACTION: callback]] — wants someone to call them back later (not right now).
- [[ACTION: emergency]] — mentions a medical emergency, chest pain, trouble breathing, severe bleeding, etc. Say clearly: "This sounds like an emergency. Please hang up now and dial 9 1 1, or go to your nearest emergency room right away."
- [[ACTION: hangup]] — caller is finished / says goodbye / "that's all". Give a warm sign-off.

ESCALATE with a final line [[ESCALATE: <short reason>]] for billing disputes, complaints, or medical questions beyond fasting/prep that you can't confidently answer. Say you're connecting them with the team.

Emit at most ONE tag per reply. Never invent facts (hours, prices, policies you don't know) — if unsure, offer to connect them to the team. Keep it human and upbeat.`;

// Resolve caller identity + appointment context once per call.
async function loadContext(admin: any, from: string) {
  const ten = last10(from);
  let patientName = '', apptLine = 'No upcoming appointment on file.';
  let patientId: string | null = null, apptId: string | null = null;
  let apptFasting = false, apptUrine = false, apptHasOrder = false, isKnown = false;
  try {
    const { data: tp } = await admin.from('tenant_patients')
      .select('id, first_name, last_name').filter('phone', 'ilike', `%${ten}%`).limit(1).maybeSingle();
    if (tp) {
      patientId = (tp as any).id;
      patientName = [(tp as any).first_name, (tp as any).last_name].filter(Boolean).join(' ');
      isKnown = true;
    }
    const { data: appt } = await admin.from('appointments')
      .select('id, appointment_date, appointment_time, status, fasting_required, urine_required, ocr_processed_at')
      .ilike('patient_phone', `%${ten}%`).gte('appointment_date', new Date().toISOString())
      .not('status', 'eq', 'cancelled').order('appointment_date', { ascending: true }).limit(1).maybeSingle();
    if (appt) {
      apptId = (appt as any).id;
      apptFasting = !!(appt as any).fasting_required;
      apptUrine = !!(appt as any).urine_required;
      apptHasOrder = !!(appt as any).ocr_processed_at;
      isKnown = true;
      apptLine = `Caller HAS an upcoming appointment on ${String((appt as any).appointment_date).slice(0, 10)} at ${(appt as any).appointment_time || ''} (${(appt as any).status}).`;
    }
  } catch { /* best-effort */ }
  return { ten, patientName, patientId, apptLine, apptId, apptFasting, apptUrine, apptHasOrder, isKnown };
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

// Run one caller turn → { spoken, end, handoffData }.
// `session` persists for the whole call so we never text the same link twice
// (the "multiple booking links" bug — each booking-ish utterance re-fired SMS).
async function runTurn(admin: any, ctx: any, conv: any, history: any[], userText: string, session: any) {
  await admin.from('chatbot_messages').insert({ conversation_id: conv.id, role: 'user', content: userText.slice(0, 2000), delivered_via: 'voice' });

  let aiText = '';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 320,
        system: `${SYSTEM}\n\nCALLER CONTEXT (never read aloud): ${ctx.isKnown ? 'This is a KNOWN patient — their details are on file, so a booking link will be pre-filled. ' : 'Caller is not recognized — collect nothing sensitive aloud; the link will let them enter details. '}${ctx.apptLine}`,
        messages: [...history, { role: 'user', content: userText }],
      }),
    });
    const data = await resp.json();
    aiText = data?.content?.[0]?.text || '';
  } catch (e) { console.warn('[voice-concierge] anthropic failed:', (e as any)?.message); }

  const actMatch = aiText.match(/\[\[ACTION:\s*(reschedule|book|callback|fasting|transfer|emergency|hangup)\s*\]\]/i);
  let action: string | null = actMatch ? actMatch[1].toLowerCase() : null;
  const escMatch = aiText.match(/\[\[ESCALATE:\s*([^\]]*)\]\]/i);
  let escalate = (!!escMatch && !action) || !aiText;
  let reason = escMatch?.[1]?.trim() || (!aiText ? 'AI unavailable' : '');
  let spoken = aiText.replace(/\[\[ACTION:[^\]]*\]\]/i, '').replace(/\[\[ESCALATE:[^\]]*\]\]/i, '').trim();

  // Deterministic safety/intent nets — voice STT is noisy; never miss these.
  const t = userText.toLowerCase();
  if (/\b(9-?1-?1|emergency|chest pain|can'?t breathe|cannot breathe|heart attack|stroke|bleeding (a lot|badly|out)|passed out|unconscious|overdose|suicidal)\b/.test(t)) {
    action = 'emergency';
  } else if (!action && /\b(talk|speak|connect)\b.*\b(person|human|someone|agent|representative|rep|staff|team|nico)\b|live (person|agent)|real person|customer service/.test(t)) {
    action = 'transfer';
  } else if (!action && /fasting|\b(do i|should i|need to|have to)\s+fast\b|empty stomach|can i eat|eat before|drink before/.test(t)) {
    action = 'fasting'; escalate = false;
  } else if (!action && !escMatch && /\b(that'?s all|that is all|nothing else|no thanks|no thank you|i'?m good|im good|all set|good ?bye|bye now)\b/.test(t)) {
    action = 'hangup';
  }

  let end = false;
  let handoffData = JSON.stringify({ intent: 'hangup' });

  if (action === 'emergency') {
    spoken = 'This sounds like it could be an emergency. Please hang up now and dial 9 1 1, or go straight to your nearest emergency room. Take care of yourself.';
    end = true;
  } else if (action === 'transfer') {
    if (!spoken) spoken = 'Of course — connecting you to our team right now. One moment!';
    end = true; handoffData = JSON.stringify({ intent: 'transfer' });
  } else if (action === 'hangup') {
    if (!spoken) spoken = "You're all set! Thanks so much for calling ConveLabs — have a wonderful day.";
    end = true;
  } else if (action === 'reschedule') {
    if (ctx.apptId) {
      if (session.rescheduleLinkSent) {
        // Already texted this call — don't send another. Just point them to it.
        spoken = "I already texted you that reschedule link — just tap it to pick a new time. Anything else I can help with?";
      } else {
        const { data: rr, error: rerr } = await admin.functions.invoke('send-reschedule-link', { body: { appointment_id: ctx.apptId } });
        if (rerr || !(rr && (rr as any).ok)) { escalate = true; reason = 'reschedule link failed'; }
        else { session.rescheduleLinkSent = true; if (!spoken) spoken = "Done — I just texted you a secure link to pick a new time. Is there anything else I can help with?"; }
      }
    } else { action = 'book'; }
  }

  if (action === 'book') {
    if (session.bookingLinkSent) {
      // ONE link per call — re-asking just points them back to the one we sent.
      spoken = "I've already sent that booking link to your phone — just tap it whenever you're ready, your info's already filled in. Anything else I can help with?";
    } else {
      try {
        const [fn, ...rest] = (ctx.patientName || '').split(' ');
        const bookToken = randToken();
        // patient_id makes resolve-booking-prefill hydrate their saved address +
        // insurance + DOB, so a known caller's link is fully pre-filled.
        await admin.from('booking_prefill_tokens').insert({
          token: bookToken,
          patient_id: ctx.patientId || null,
          patient_first_name: fn || null,
          patient_last_name: rest.join(' ') || null,
          patient_phone: ctx.from,
          service_type: 'mobile', service_name: 'Mobile Blood Draw', service_price_cents: 15000, billed_to: 'patient',
        });
        await sendSms(ctx.from, `Here's your ConveLabs booking link — your details are already filled in, so it's about a minute: ${PUBLIC}/book-now?prefill=${bookToken}`);
        session.bookingLinkSent = true;
        if (!spoken) spoken = ctx.isKnown
          ? "Perfect — I just texted a secure link to this number with your info already filled in, so it'll just take a minute. You can tap it now and stay on with me, or hang up whenever you're ready. Anything else?"
          : "Perfect — I just texted a secure booking link to this number. Tap it whenever you're ready; you can stay on with me or hang up. Anything else I can help with?";
      } catch (e) { console.warn('[voice-concierge] book failed:', (e as any)?.message); escalate = true; reason = 'booking link failed'; }
    }
  }

  if (action === 'fasting') {
    const urineTip = ctx.apptUrine ? " You'll also give a urine sample, so please hold off on the restroom right before we arrive." : '';
    if (ctx.apptHasOrder) {
      spoken = ctx.apptFasting
        ? `Based on your lab order, please fast for 8 to 12 hours before your draw — water and prescribed meds are totally fine.${urineTip} Anything else I can help with?`
        : `Good news — your lab order doesn't require fasting, so eat and drink normally beforehand.${urineTip} Anything else?`;
    } else {
      spoken = "I'd be happy to check! If you text a photo of your lab order to this number, I'll tell you right away whether you need to fast. Anything else I can help with?";
    }
  }

  if (action === 'callback') { escalate = true; if (!reason) reason = 'Caller requested a callback'; }

  if (escalate && (!spoken || spoken.length < 4)) {
    spoken = "I want to make sure you get the right answer — let me connect you with our team and someone will follow up shortly. Is there anything else in the meantime?";
  }
  if (!spoken) spoken = "I'm sorry, I didn't quite catch that — could you say it once more?";

  // Persist assistant turn + update conversation + (on escalation/callback) ping owner.
  await admin.from('chatbot_messages').insert({ conversation_id: conv.id, role: 'assistant', content: spoken, escalation_triggered: escalate, delivered_via: 'voice' });
  await admin.from('chatbot_conversations').update({
    last_message_at: new Date().toISOString(), last_message_role: 'assistant', updated_at: new Date().toISOString(),
    ...(escalate ? { status: 'escalated', escalated_at: new Date().toISOString(), escalation_reason: reason, staff_unread: true, handoff_state: 'human' } : {}),
  }).eq('id', conv.id);
  if ((escalate || action === 'transfer') && conv.access_token) {
    const head = action === 'transfer' ? '📞 Voice call transferred to you live'
      : action === 'callback' ? `📞 Voice callback requested${ctx.patientName ? ` — ${ctx.patientName}` : ''}`
      : `📞 Voice concierge escalation${ctx.patientName ? ` — ${ctx.patientName}` : ''}`;
    await sendSms(OWNER_PHONE, `${head}\n${reason ? `Reason: ${reason}\n` : ''}"${userText.slice(0, 110)}"\n${PUBLIC}/c/${conv.access_token}`);
  }

  history.push({ role: 'user', content: userText }, { role: 'assistant', content: spoken });
  if (history.length > 16) history.splice(0, history.length - 16);
  return { spoken, end, handoffData };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── WS MODE: live ConversationRelay conversation loop ──
  if ((req.headers.get('upgrade') || '').toLowerCase() === 'websocket') {
    if (url.searchParams.get('k') !== WS_SECRET) return new Response('forbidden', { status: 403 });
    const { socket, response } = Deno.upgradeWebSocket(req);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let ctx: any = null, conv: any = null;
    const history: any[] = [];
    // Per-call state — guards against re-sending the same link on repeat asks.
    const session = { bookingLinkSent: false, rescheduleLinkSent: false };
    let busy = false;

    socket.onmessage = async (ev) => {
      let msg: any; try { msg = JSON.parse(ev.data as string); } catch { return; }
      try {
        if (msg.type === 'setup') {
          const from = msg.from || msg.From || '';
          ctx = await loadContext(admin, from); ctx.from = from;
          conv = await ensureConversation(admin, from, ctx.ten, ctx.patientName);
          if (conv?.handoff_state === 'human') {
            socket.send(JSON.stringify({ type: 'text', token: "Thanks for calling — someone from our team is already helping you and will follow up shortly. Connecting you now.", last: true }));
            await new Promise((r) => setTimeout(r, 4000));
            socket.send(JSON.stringify({ type: 'end', handoffData: JSON.stringify({ intent: 'transfer' }) }));
          }
          return;
        }
        if (msg.type === 'prompt' && conv && !busy) {
          const userText = String(msg.voicePrompt || '').trim();
          if (!userText) return;
          busy = true;
          const res = await runTurn(admin, ctx, conv, history, userText, session);
          socket.send(JSON.stringify({ type: 'text', token: res.spoken, last: true }));
          if (res.end) {
            // Let TTS finish the sentence before ending the session / handing off.
            await new Promise((r) => setTimeout(r, 6000));
            socket.send(JSON.stringify({ type: 'end', handoffData: res.handoffData }));
          }
          busy = false;
        }
      } catch (e) {
        console.error('[voice-concierge] ws turn error:', (e as any)?.message);
        try { socket.send(JSON.stringify({ type: 'text', token: "I'm so sorry, I hit a snag. Let me connect you with our team.", last: true })); } catch { /* */ }
        busy = false;
      }
    };
    socket.onerror = (e) => console.warn('[voice-concierge] ws error:', (e as any)?.message);
    return response;
  }

  // ── HANDOFF MODE: ConversationRelay ended → dial live agent or hang up ──
  if (url.searchParams.get('handoff') === '1') {
    let intent = 'hangup';
    try {
      const form = new URLSearchParams(await req.text());
      const hd = form.get('HandoffData') || form.get('handoffData') || '';
      if (hd) { try { intent = JSON.parse(hd)?.intent || 'hangup'; } catch { /* */ } }
    } catch { /* */ }
    const twiml = intent === 'transfer'
      ? `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say><Dial callerId="${TWILIO_FROM}">${LIVE_AGENT_NUMBER}</Dial></Response>`
      : `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // ── HTTP MODE: Twilio Voice webhook → start ConversationRelay ──
  const host = url.host;
  const wsUrl = `wss://${host}/functions/v1/voice-concierge?k=${encodeURIComponent(WS_SECRET)}`;
  const actionUrl = `https://${host}/functions/v1/voice-concierge?handoff=1`;
  const greeting = "Hi, thanks for calling ConveLabs, your concierge mobile lab! Quick note: if this is a medical emergency, please hang up and dial 9 1 1 or go to your nearest emergency room. Otherwise, I'd love to help — I can book a visit, answer questions, or connect you with our team. What can I do for you today?";
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="${xmlEscape(actionUrl)}">
    <ConversationRelay url="${xmlEscape(wsUrl)}" welcomeGreeting="${xmlEscape(greeting)}" ttsProvider="Google" voice="en-US-Neural2-F" interruptible="true" />
  </Connect>
</Response>`;
  return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
});
