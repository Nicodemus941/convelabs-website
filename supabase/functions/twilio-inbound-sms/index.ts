// twilio-inbound-sms
// Webhook endpoint for inbound SMS from Twilio. Configure in Twilio Console:
//   Phone Numbers → [active number] → Messaging → "A MESSAGE COMES IN" →
//   Webhook: https://<project>.supabase.co/functions/v1/twilio-inbound-sms
//   Method: HTTP POST
//
// Flow:
//   1. Patient texts back "1", "2", or "3" → we look up their most recent
//      pending lab request by phone digits, resolve the slot from
//      preoffered_slots, call schedule-lab-request with that slot, and
//      confirm via SMS.
//   2. Patient texts "DATES" / "D" / "TIMES" → we send the current slot list.
//   3. Patient texts "HELP" / anything else → we reply with their booking link.
//   4. Patient texts "CANCEL" / "STOP" → we reply STOP is reserved (Twilio
//      handles opt-out automatically).
//
// Response: TwiML XML <Response><Message>...</Message></Response>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { nextAvailableSlots } from '../_shared/availability.ts';
import { formatSlotsForSms } from '../_shared/preoffered-slots.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';

/**
 * Twilio webhook signature validation. Twilio signs every webhook with
 * HMAC-SHA1 over (full URL + sorted form params concatenated). Reject any
 * POST that doesn't validate — pre-fix this endpoint was open to spoofed
 * POSTs that could attach attacker-supplied media to any open lab-order
 * request whose patient_phone_at_send last-10 the attacker guessed.
 *
 * Set SKIP_TWILIO_SIGNATURE=true in env for local dev only.
 */
async function isValidTwilioSignature(req: Request, params: URLSearchParams): Promise<boolean> {
  if (Deno.env.get('SKIP_TWILIO_SIGNATURE') === 'true') return true;
  const sigHeader = req.headers.get('X-Twilio-Signature') || '';
  if (!sigHeader || !TWILIO_AUTH_TOKEN) return false;
  // Sort form keys alphabetically and concat key+value
  const sortedKeys = [...params.keys()].sort();
  const joined = sortedKeys.map(k => k + params.get(k)).join('');
  const url = req.url;
  const payload = url + joined;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(TWILIO_AUTH_TOKEN),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  // Twilio sends base64-encoded
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === sigHeader;
}

/** Last-4-only redaction for logs — full phone is PHI under HIPAA. */
function redactPhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 4 ? `***${d.slice(-4)}` : '***';
}

function twiml(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message></Response>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}

function phoneDigits(p: string): string { return (p || '').replace(/\D/g, ''); }
function lastTen(p: string): string { return phoneDigits(p).slice(-10); }

/**
 * MMS photo upload — mirrors twilio-mms-webhook so EITHER webhook URL on the
 * Twilio number works. Returns the patient-facing reply text.
 *
 * Resolution order:
 *   1. appointment_lab_order_requests (pending/sent/opened, not expired) by
 *      patient_phone_at_send — the "text a photo" promise lives here.
 *   2. If no match, helpful fallback.
 */
async function handleMmsUpload(admin: any, from: string, formData: URLSearchParams | FormData): Promise<string> {
  const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
  const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
  const mediaUrl = String(formData.get('MediaUrl0') || '');
  const mediaType = String(formData.get('MediaContentType0') || 'image/jpeg');
  if (!mediaUrl) return "Got your text — but no photo came through. Please attach a clear photo of your lab order and send again.";
  if (!mediaType.startsWith('image/') && mediaType !== 'application/pdf') {
    return "Thanks! We can only accept photos (JPG/PNG/HEIC) or PDFs of your lab order. Please retake and resend.";
  }

  const fromTen = lastTen(from);
  // Primary match: open lab-order request the patient was asked to fulfill.
  const { data: candidates } = await admin
    .from('appointment_lab_order_requests')
    .select('id, appointment_id, patient_phone_at_send, status, expires_at, requested_at')
    .in('status', ['pending', 'sent', 'opened'])
    .gt('expires_at', new Date().toISOString())
    .order('requested_at', { ascending: false })
    .limit(20);
  const matches = (candidates || []).filter((c: any) =>
    c.patient_phone_at_send && lastTen(String(c.patient_phone_at_send)) === fromTen
  );

  // Ambiguous-match guard: if a patient has 2+ open requests, we used to
  // silently pick "the newest" — meaning the older appointment never got
  // the photo. Reply asking the patient to disambiguate by appointment date
  // instead of guessing.
  let match: any = matches[0] || null;
  if (matches.length > 1) {
    try {
      const { data: appts } = await admin
        .from('appointments')
        .select('id, appointment_date')
        .in('id', matches.map((m: any) => m.appointment_id))
        .order('appointment_date', { ascending: true });
      const lines = (appts || []).slice(0, 3).map((a: any, i: number) => {
        const d = a.appointment_date ? new Date(a.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?';
        return `${i + 1}) ${d}`;
      }).join('  ');
      return `We see ${matches.length} upcoming appointments. Reply with the number for which one this lab order is for: ${lines}`;
    } catch { /* fall through to first-match behavior below */ }
  }

  // Fallback: no open lab-order request, but the patient HAS an upcoming
  // appointment we just didn't formally ask about. Attach to the next
  // upcoming appointment so the "text a photo any time" promise doesn't
  // dead-end. Look up via tenant_patients → appointments.
  if (!match) {
    try {
      const { data: tp } = await admin
        .from('tenant_patients')
        .select('id, primary_user_id')
        .or(`phone.ilike.%${fromTen},mobile_phone.ilike.%${fromTen}`)
        .limit(1)
        .maybeSingle();
      const patientId = (tp as any)?.id || null;
      if (patientId) {
        const { data: appt } = await admin
          .from('appointments')
          .select('id, appointment_date, lab_order_file_path')
          .eq('patient_id', patientId)
          .gte('appointment_date', new Date().toISOString())
          .in('status', ['scheduled', 'confirmed'])
          .order('appointment_date', { ascending: true })
          .limit(1)
          .maybeSingle();
        if ((appt as any)?.id) {
          match = { id: null, appointment_id: (appt as any).id };
        }
      }
    } catch (e) { console.warn('[inbound-sms-mms] fallback lookup err:', (e as any)?.message); }
  }

  if (!match) {
    return "We couldn't match your number to an open lab-order request. If you got a link from us, tap that link to upload. Questions? Email info@convelabs.com or call (941) 527-9169.";
  }

  // Download via Twilio basic-auth, cap at 20 MB
  const mediaResp = await fetch(mediaUrl, {
    headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}` },
  });
  if (!mediaResp.ok) {
    console.error('[inbound-sms-mms] media fetch failed:', mediaResp.status);
    return "We had trouble downloading your photo. Please try again or use the upload link we texted you.";
  }
  const buf = new Uint8Array(await mediaResp.arrayBuffer());
  if (buf.length > 20 * 1024 * 1024) {
    return "That photo is too large. Please retake at a lower resolution, or use the upload link we texted you.";
  }

  const ext = mediaType === 'application/pdf' ? 'pdf'
    : mediaType.includes('png') ? 'png'
    : mediaType.includes('heic') ? 'heic'
    : 'jpg';
  const safeName = `mms_${String(match.appointment_id).substring(0, 8)}_${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from('lab-orders')
    .upload(safeName, buf, { contentType: mediaType, upsert: false });
  if (upErr) {
    console.error('[inbound-sms-mms] upload err:', upErr);
    return "We hit an issue saving your photo. Please tap the upload link in our text instead.";
  }

  const { data: lo } = await admin
    .from('appointment_lab_orders')
    .insert({
      appointment_id: match.appointment_id,
      file_path: safeName,
      original_filename: `mms-upload.${ext}`,
      file_size: buf.length,
      mime_type: mediaType,
      ocr_status: 'pending',
    })
    .select('id')
    .single();

  // Stamp legacy column so admin appointment card still shows the badge
  try {
    const { data: appt } = await admin
      .from('appointments')
      .select('lab_order_file_path')
      .eq('id', match.appointment_id)
      .maybeSingle();
    const existing = (appt as any)?.lab_order_file_path
      ? String((appt as any).lab_order_file_path).split('\n').filter(Boolean)
      : [];
    if (!existing.includes(safeName)) existing.push(safeName);
    await admin.from('appointments')
      .update({ lab_order_file_path: existing.join('\n') })
      .eq('id', match.appointment_id);
  } catch (e) { console.warn('[inbound-sms-mms] legacy stamp failed:', e); }

  // match.id is null when the fallback path attached to a next-upcoming
  // appointment without a formal request — skip the request-row update.
  if (match.id) {
    await admin.from('appointment_lab_order_requests')
      .update({
        status: 'uploaded',
        uploaded_at: new Date().toISOString(),
        uploaded_file_path: safeName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id);
  }

  if (lo?.id) {
    try { admin.functions.invoke('ocr-lab-order', { body: { labOrderId: lo.id } }).catch(() => {}); } catch {}
  }
  return "Got it ✓ Your lab order is on file. We'll see you at your appointment. — ConveLabs";
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    // Twilio signature validation — read raw body first so we can validate
    // before parsing. formData() consumes the stream, so we clone the
    // request and parse from the raw text.
    const rawText = await req.text();
    const params = new URLSearchParams(rawText);
    const reqForSig = new Request(req.url, { method: 'POST' });
    if (!(await isValidTwilioSignature(reqForSig, params))) {
      console.warn('[inbound-sms] signature validation failed — rejected');
      return new Response('Forbidden', { status: 403 });
    }
    const formData = params;
    const from = String(formData.get('From') || '');
    const body = String(formData.get('Body') || '').trim();
    const fromDigits = phoneDigits(from);
    const numMedia = parseInt(String(formData.get('NumMedia') || '0'), 10) || 0;

    // HIPAA: redact phone to last-4, never log MediaUrl0 (Twilio media URLs
    // are bearer-equivalent for 24h before SID auth expires).
    console.log(`[inbound-sms] from=${redactPhone(from)} bodyLen=${body.length} numMedia=${numMedia}`);

    if (!fromDigits) return twiml('Message received.');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const messageSid = String(formData.get('MessageSid') || '') || null;

    // ─── OWNER FORWARDING ──────────────────────────────────────────
    // Forward every inbound to OWNER_PHONE so the user actually sees
    // patient replies. Best-effort, non-blocking. Pre-fix: inbound
    // landed in sms_messages for the Messages tab but no live
    // notification reached the owner's phone.
    try {
      const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '+19415279169';
      const preview = numMedia > 0
        ? `[MMS ${numMedia}× photo] ${body ? body.substring(0, 80) : ''}`.trim()
        : body.substring(0, 140);
      admin.functions.invoke('send-sms-notification', {
        body: {
          to: OWNER_PHONE,
          message: `[Patient SMS from ${from}] ${preview}`,
          category: 'admin_alert', // bypasses quiet hours — owner asked to see these
        },
      }).catch(() => {});
    } catch { /* never block patient reply */ }

    // ─── MMS PHOTO UPLOAD PATH ─────────────────────────────────────
    // Twilio sends ONE webhook per number. Pre-fix the inbound-sms
    // webhook silently returned "Message received." when a patient
    // texted a photo (Body empty + NumMedia>0). Now we dispatch into
    // the lab-order upload flow when media is present, matching the
    // promise in the lab-order request SMS template:
    //   "just text a photo back to this number"
    if (numMedia > 0) {
      const mmsResult = await handleMmsUpload(admin, from, formData);
      return twiml(mmsResult);
    }

    if (!body) return twiml('Message received.');

    // ─── TWO-WAY SMS THREADING ─────────────────────────────────────
    // Every inbound message lands in sms_messages tied to a per-phone
    // sms_conversations row. This is what the admin Messages tab reads
    // + what the AdminSidebar bell subscription wakes on. Best-effort —
    // never block patient response on logging failure.
    try {
      // Try to resolve the patient_id from tenant_patients (helps the
      // Messages tab join the conversation to a known patient).
      const { data: tp } = await admin
        .from('tenant_patients')
        .select('id')
        .filter('phone', 'ilike', `%${fromDigits.slice(-10)}%`)
        .limit(1)
        .maybeSingle();
      const { data: convId } = await admin.rpc('get_or_create_sms_conversation' as any, {
        p_patient_phone: from,
        p_patient_id: tp?.id || null,
      });
      if (convId) {
        await admin.from('sms_messages').insert({
          conversation_id: convId,
          direction: 'inbound',
          body: body.substring(0, 1500),
          twilio_message_sid: messageSid,
          status: 'received',
        } as any);
      }
    } catch (logErr) {
      console.warn('[inbound-sms] thread log failed (non-blocking):', logErr);
    }

    // Find the most recent pending lab request for this phone
    const { data: reqs } = await admin
      .from('patient_lab_requests')
      .select('id, organization_id, patient_name, patient_phone, preoffered_slots, access_token, draw_by_date, status, appointment_id')
      .order('created_at', { ascending: false })
      .limit(100);
    const forThisPhone = (reqs || []).filter(r => phoneDigits(r.patient_phone || '').endsWith(fromDigits.slice(-10)));
    const match = forThisPhone.find(r => r.status === 'pending_schedule') || null;
    // BOOKED-PATIENT FALLBACK: if no pending request but they have a recently
    // scheduled/completed one, we still recognize them for HELP replies.
    const alreadyBooked = !match ? forThisPhone.find(r => r.status === 'scheduled' || r.status === 'completed') : null;

    // Log the inbound regardless
    if (match) {
      await admin.from('patient_lab_requests').update({
        last_inbound_sms_at: new Date().toISOString(),
        last_inbound_sms_body: body.substring(0, 200),
      }).eq('id', match.id);
    }

    const cmd = body.toUpperCase().trim();

    // STOP / START are Twilio-reserved — don't respond, Twilio handles opt-out
    if (cmd === 'STOP' || cmd === 'UNSUBSCRIBE' || cmd === 'CANCEL' || cmd === 'START' || cmd === 'UNSTOP') {
      return new Response('', { status: 200 });
    }

    if (!match) {
      // If they're a booked patient, give them useful info instead of a brick-wall reply
      if (alreadyBooked && alreadyBooked.appointment_id) {
        const { data: appt } = await admin
          .from('appointments')
          .select('appointment_date, appointment_time, address, status')
          .eq('id', alreadyBooked.appointment_id)
          .maybeSingle();
        if (appt) {
          const d = appt.appointment_date?.substring(0, 10) || '';
          const prettyDate = d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'your scheduled date';
          return twiml(`Your ConveLabs appointment: ${prettyDate} at ${appt.appointment_time || ''} · ${appt.address?.substring(0, 40) || ''}. Need to reschedule or cancel? Email info@convelabs.com or call (941) 527-9169.`);
        }
      }
      return twiml(`We couldn't find an active lab request for this number. If you believe this is a mistake, email info@convelabs.com. Book any time at ${PUBLIC_SITE_URL}/book-now`);
    }

    // "DATES" / "D" / "TIMES" / "SLOTS" → resend fresh LIVE-AVAILABILITY slot list
    if (['DATES', 'D', 'TIMES', 'T', 'SLOTS', 'OPTIONS'].includes(cmd)) {
      const { data: org } = await admin.from('organizations').select('time_window_rules').eq('id', match.organization_id).maybeSingle();
      const fresh = await nextAvailableSlots(admin, match.organization_id, match.draw_by_date, org?.time_window_rules, 3);
      await admin.from('patient_lab_requests').update({
        preoffered_slots: fresh, preoffered_slots_at: new Date().toISOString(),
      }).eq('id', match.id);
      if (fresh.length === 0) {
        return twiml(`No available slots before your deadline. Tap: ${PUBLIC_SITE_URL}/lab-request/${match.access_token}`);
      }
      return twiml(`Reply ${formatSlotsForSms(fresh)} to book · or tap: ${PUBLIC_SITE_URL}/lab-request/${match.access_token}`);
    }

    // "HELP" → short help message
    if (cmd === 'HELP' || cmd === '?') {
      return twiml(`ConveLabs reply options: 1/2/3 to book a pre-offered slot · DATES for fresh options · or tap ${PUBLIC_SITE_URL}/lab-request/${match.access_token}`);
    }

    // "1", "2", "3" → confirm slot + send link to finalize (we need the
    // patient's address to actually book — ConveLabs is mobile-only).
    // Rather than pre-commit to an appointment without an address, we
    // deep-link to the booking page with the chosen slot pre-selected.
    const slotIndex = ['1', '2', '3'].indexOf(cmd);
    if (slotIndex >= 0) {
      const slots: any[] = Array.isArray(match.preoffered_slots) ? match.preoffered_slots : [];
      let chosen = slots[slotIndex];

      // Slot list may have expired or been booked by someone else — re-check live availability
      const { data: org } = await admin.from('organizations').select('time_window_rules').eq('id', match.organization_id).maybeSingle();
      const fresh = await nextAvailableSlots(admin, match.organization_id, match.draw_by_date, org?.time_window_rules, 3);
      const stillAvailable = chosen && fresh.some(f => f.date === chosen.date && f.time === chosen.time);

      if (!chosen || !stillAvailable) {
        await admin.from('patient_lab_requests').update({
          preoffered_slots: fresh, preoffered_slots_at: new Date().toISOString(),
        }).eq('id', match.id);
        if (fresh.length === 0) {
          return twiml(`No slots left before your deadline. Tap ${PUBLIC_SITE_URL}/lab-request/${match.access_token} to see all options.`);
        }
        return twiml(`That slot just got taken. New options — reply ${formatSlotsForSms(fresh)} · or tap ${PUBLIC_SITE_URL}/lab-request/${match.access_token}`);
      }

      // Build a pre-selected URL so the web page opens with the slot already picked.
      // Patient only has to enter their address + submit.
      const preselectedUrl = `${PUBLIC_SITE_URL}/lab-request/${match.access_token}?d=${encodeURIComponent(chosen.date)}&t=${encodeURIComponent(chosen.time)}`;
      return twiml(`Great — ${chosen.label} is available. Tap here to confirm your home address and lock it in: ${preselectedUrl}`);
    }

    // Default — send booking link
    return twiml(`Tap to pick your time: ${PUBLIC_SITE_URL}/lab-request/${match.access_token} · Reply DATES for quick-reply slots · HELP for options.`);
  } catch (error: any) {
    console.error('[inbound-sms] error:', error);
    return twiml('Message received. Email info@convelabs.com if you need help.');
  }
});
