/**
 * TWILIO-MMS-WEBHOOK
 *
 * Patient texts a photo (or PDF) to the ConveLabs Twilio number.
 * Twilio POSTs here with form-encoded body including:
 *   From, To, Body, NumMedia, MediaUrl0, MediaContentType0, ...
 *
 * We:
 *   1. Find the most-recent OPEN lab-order request whose
 *      patient_phone_at_send matches the From number.
 *   2. Download MediaUrl0 (Twilio basic-auth required), decode bytes.
 *   3. Upload to lab-orders storage bucket.
 *   4. Stamp appointments.lab_order_file_path + insert appointment_lab_orders.
 *   5. Mark request uploaded; fire OCR.
 *   6. Reply to patient with a friendly confirmation TwiML.
 *
 * If we can't match a request, reply asking them to use the link
 * instead — never silently swallow.
 *
 * Twilio webhook URL: https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/twilio-mms-webhook
 * Configure on the phone number: Messaging → A message comes in → Webhook → POST.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';

function twiml(message: string): string {
  // Twilio expects XML response
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}
function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c));
}
function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

function lastTen(p: string): string {
  return p.replace(/\D/g, '').slice(-10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Twilio sends application/x-www-form-urlencoded
    const formText = await req.text();
    const params = new URLSearchParams(formText);
    const from = params.get('From') || '';
    const numMedia = parseInt(params.get('NumMedia') || '0', 10);
    const mediaUrl = params.get('MediaUrl0') || '';
    const mediaType = params.get('MediaContentType0') || 'image/jpeg';

    console.log(`[mms-webhook] From=${from} NumMedia=${numMedia}`);

    if (!from) {
      return new Response(emptyTwiml(), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }
    if (numMedia === 0 || !mediaUrl) {
      return new Response(twiml(
        "Hi! It looks like your message didn't have a photo attached. To upload your lab order, tap the link we texted you — or attach the photo to a reply here and send.",
      ), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }
    if (!mediaType.startsWith('image/') && mediaType !== 'application/pdf') {
      return new Response(twiml(
        "Thanks! We can only accept photos (JPG/PNG) or PDFs of your lab order. Please retake or resend.",
      ), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find the most-recent open request for this patient phone.
    const fromTen = lastTen(from);
    const { data: candidates } = await admin
      .from('appointment_lab_order_requests')
      .select('id, appointment_id, access_token, status, expires_at, patient_phone_at_send')
      .in('status', ['pending', 'sent', 'opened'])
      .gt('expires_at', new Date().toISOString())
      .order('requested_at', { ascending: false })
      .limit(20);

    const match = (candidates || []).find((c: any) =>
      c.patient_phone_at_send && lastTen(String(c.patient_phone_at_send)) === fromTen,
    ) as any;

    if (!match) {
      return new Response(twiml(
        "We couldn't match your number to a pending lab order request. If you got a link from us, tap that link to upload — or call (941) 527-9169 and we'll help.",
      ), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    // Twilio media URLs require basic auth with account SID/token
    const mediaResp = await fetch(mediaUrl, {
      headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}` },
    });
    if (!mediaResp.ok) {
      console.error('[mms-webhook] media fetch failed:', mediaResp.status);
      return new Response(twiml(
        "We had trouble downloading your photo. Please try again or use the link in our text.",
      ), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }
    const buf = new Uint8Array(await mediaResp.arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) {
      return new Response(twiml(
        "That photo is too large. Please retake at a lower resolution or use the upload link we texted you.",
      ), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    const ext = mediaType === 'application/pdf' ? 'pdf'
      : mediaType.includes('png') ? 'png'
      : mediaType.includes('heic') ? 'heic'
      : 'jpg';
    const safeName = `mms_${match.appointment_id.substring(0, 8)}_${Date.now()}.${ext}`;

    const { error: upErr } = await admin.storage
      .from('lab-orders')
      .upload(safeName, buf, { contentType: mediaType, upsert: false });
    if (upErr) {
      console.error('[mms-webhook] upload err:', upErr);
      return new Response(twiml(
        "We hit an issue saving your photo. Please tap the upload link in our text instead.",
      ), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    // Insert appointment_lab_orders row + stamp legacy column
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

    try {
      const { data: appt } = await admin
        .from('appointments')
        .select('lab_order_file_path, patient_name')
        .eq('id', match.appointment_id)
        .maybeSingle();
      const existing = (appt as any)?.lab_order_file_path
        ? String((appt as any).lab_order_file_path).split('\n').filter(Boolean)
        : [];
      if (!existing.includes(safeName)) existing.push(safeName);
      await admin.from('appointments')
        .update({ lab_order_file_path: existing.join('\n') })
        .eq('id', match.appointment_id);
    } catch (e) { console.warn('[mms-webhook] legacy stamp failed:', e); }

    await admin.from('appointment_lab_order_requests')
      .update({
        status: 'uploaded',
        uploaded_at: new Date().toISOString(),
        uploaded_file_path: safeName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id);

    if (lo?.id) {
      try { admin.functions.invoke('ocr-lab-order', { body: { labOrderId: lo.id } }).catch(() => {}); } catch {}
    }

    return new Response(twiml(
      "Got it ✓ Your lab order is on file. We'll see you at your appointment. — ConveLabs",
    ), { status: 200, headers: { 'Content-Type': 'text/xml' } });
  } catch (e: any) {
    console.error('[twilio-mms-webhook] unhandled:', e);
    // Always reply with valid TwiML so Twilio doesn't show an error to user
    return new Response(twiml(
      "Sorry — something went wrong on our end. Please use the link we texted you, or call (941) 527-9169.",
    ), { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }
});
