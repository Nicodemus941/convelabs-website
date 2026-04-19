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
import { computePreofferedSlots, formatSlotsForSms } from '../_shared/preoffered-slots.ts';

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
      .select('id, organization_id, patient_name, patient_phone, preoffered_slots, access_token, draw_by_date, status')
      .eq('status', 'pending_schedule')
      .order('created_at', { ascending: false })
      .limit(50);

    const match = (reqs || []).find(r => phoneDigits(r.patient_phone || '').endsWith(fromDigits.slice(-10)));

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
      return twiml(`We couldn't find an active lab request for this number. If you believe this is a mistake, email info@convelabs.com. Book any time at ${PUBLIC_SITE_URL}/book-now`);
    }

    // "DATES" / "D" / "TIMES" / "SLOTS" → resend fresh slot list
    if (['DATES', 'D', 'TIMES', 'T', 'SLOTS', 'OPTIONS'].includes(cmd)) {
      const fresh = computePreofferedSlots(match.draw_by_date, 3);
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

    // "1", "2", "3" → book the corresponding pre-offered slot
    const slotIndex = ['1', '2', '3'].indexOf(cmd);
    if (slotIndex >= 0) {
      const slots: any[] = Array.isArray(match.preoffered_slots) ? match.preoffered_slots : [];
      const chosen = slots[slotIndex];
      if (!chosen || !chosen.date || !chosen.time) {
        const fresh = computePreofferedSlots(match.draw_by_date, 3);
        await admin.from('patient_lab_requests').update({
          preoffered_slots: fresh, preoffered_slots_at: new Date().toISOString(),
        }).eq('id', match.id);
        return twiml(`Those slot options expired. New options — reply ${formatSlotsForSms(fresh)} · or tap ${PUBLIC_SITE_URL}/lab-request/${match.access_token}`);
      }

      // Call schedule-lab-request to book this slot.
      // For SMS reply-to-book we default to in-office (patient can reschedule
      // later if they want mobile) because we don't have their address.
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/schedule-lab-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: match.access_token,
            service_type: 'in-office',
            appointment_date: chosen.date,
            appointment_time: chosen.time,
          }),
        });
        const j = await resp.json();
        if (!resp.ok) {
          console.error('[inbound-sms] schedule failed:', j);
          return twiml(`Couldn't book that slot: ${j.error || 'unknown error'}. Try: ${PUBLIC_SITE_URL}/lab-request/${match.access_token}`);
        }
        if (j.stripe_url) {
          return twiml(`Slot held. Complete payment to confirm: ${j.stripe_url}`);
        }
        return twiml(`✓ Booked for ${chosen.label}. In-office at 1800 Pembrook Dr, Suite 300. Need mobile instead? Reschedule: ${PUBLIC_SITE_URL}/lab-request/${match.access_token}`);
      } catch (e: any) {
        console.error('[inbound-sms] schedule exception:', e);
        return twiml(`Sorry — something went wrong. Please tap: ${PUBLIC_SITE_URL}/lab-request/${match.access_token}`);
      }
    }

    // Default — send booking link
    return twiml(`Tap to pick your time: ${PUBLIC_SITE_URL}/lab-request/${match.access_token} · Reply DATES for quick-reply slots · HELP for options.`);
  } catch (error: any) {
    console.error('[inbound-sms] error:', error);
    return twiml('Message received. Email info@convelabs.com if you need help.');
  }
});
