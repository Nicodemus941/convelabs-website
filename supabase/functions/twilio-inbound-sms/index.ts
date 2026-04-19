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

function twiml(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message></Response>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}

function phoneDigits(p: string): string { return (p || '').replace(/\D/g, ''); }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const formData = await req.formData();
    const from = String(formData.get('From') || '');
    const body = String(formData.get('Body') || '').trim();
    const fromDigits = phoneDigits(from);

    console.log(`[inbound-sms] from=${from} body="${body}"`);

    if (!fromDigits || !body) return twiml('Message received.');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

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
