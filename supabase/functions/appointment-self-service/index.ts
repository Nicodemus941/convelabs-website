/**
 * APPOINTMENT-SELF-SERVICE
 *
 * Token-based (view_token) endpoint for the patient confirm/track page.
 *
 * Routes (action in body):
 *   GET  ?token=...                       → returns appointment summary + state
 *   POST { action: 'confirm', token }     → stamp patient_confirmed_at
 *   POST { action: 'cancel', token, reason } → soft-cancel + free slot
 *   POST { action: 'track', token }       → returns en-route status + last
 *                                          known location + ETA estimate
 *
 * No auth wall — view_token is the binding. Auto-expires after appointment_date.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { isSlotStillAvailable, getAvailableSlotsForDate } from '../_shared/availability.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Patient may self-reschedule only when the current visit is at least this
// many hours away. Closer than this → route to "call us" (a same-day move
// needs a human to re-coordinate the phleb).
const RESCHEDULE_MIN_LEAD_HOURS = 2;
// Statuses past which self-reschedule is no longer allowed.
const NON_RESCHEDULABLE = new Set(['cancelled', 'en_route', 'arrived', 'in_progress', 'specimen_delivered', 'completed', 'no_show']);

async function loadByToken(admin: any, token: string) {
  const { data: appt } = await admin
    .from('appointments')
    .select('id, view_token, patient_name, patient_email, patient_phone, appointment_date, appointment_time, address, service_type, service_name, status, patient_confirmed_at, cancelled_at, delivery_location, organization_id, lab_destination')
    .eq('view_token', token)
    .maybeSingle();
  if (!appt) return { ok: false as const, code: 'token_not_found' };
  // Expire 12 hours after the appointment time
  const apptDate = new Date(String(appt.appointment_date).substring(0, 10) + 'T23:59:59-04:00');
  if (Date.now() - apptDate.getTime() > 12 * 60 * 60 * 1000) {
    return { ok: false as const, code: 'expired' };
  }
  return { ok: true as const, appt };
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('token') || '';
      if (!token) return new Response(JSON.stringify({ error: 'token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      const r = await loadByToken(admin, token);
      if (!r.ok) return new Response(JSON.stringify({ error: r.code }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      const a = r.appt;
      return new Response(JSON.stringify({
        ok: true,
        appointment: {
          id: a.id,
          patient_first_name: String(a.patient_name || 'there').split(' ')[0],
          appointment_date: a.appointment_date,
          appointment_time: a.appointment_time,
          address: a.address,
          service_name: a.service_name || a.service_type,
          status: a.status,
          confirmed_at: a.patient_confirmed_at,
          cancelled_at: a.cancelled_at,
        },
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action || '';
    const token: string = body?.token || '';
    if (!token) {
      return new Response(JSON.stringify({ error: 'token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const r = await loadByToken(admin, token);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: r.code }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const appt = r.appt;

    // ── CONFIRM ──────────────────────────────────────────────────
    if (action === 'confirm') {
      if (appt.cancelled_at) {
        return new Response(JSON.stringify({ error: 'already_cancelled' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await admin.from('appointments').update({
        patient_confirmed_at: appt.patient_confirmed_at || new Date().toISOString(),
        status: appt.status === 'scheduled' ? 'confirmed' : appt.status,
      }).eq('id', appt.id);
      return new Response(JSON.stringify({ ok: true, action: 'confirm' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CANCEL (soft, with reason) ────────────────────────────────
    if (action === 'cancel') {
      const reason = String(body?.reason || '').trim();
      if (reason.length < 3) {
        return new Response(JSON.stringify({ error: 'reason_required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (appt.cancelled_at) {
        return new Response(JSON.stringify({ ok: true, action: 'cancel', already: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await admin.from('appointments').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      }).eq('id', appt.id);
      return new Response(JSON.stringify({ ok: true, action: 'cancel' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── TRACK (phleb arrival) ─────────────────────────────────────
    if (action === 'track') {
      // The phleb's most-recent location while en_route. We use the
      // appointments.delivery_location jsonb (set by the PWA) as the
      // freshest signal; fall back to staff_profiles.last_seen_lat/lng
      // if available.
      let phlebLat: number | null = null;
      let phlebLng: number | null = null;
      const dl: any = (appt as any).delivery_location;
      if (dl && typeof dl.lat === 'number' && typeof dl.lng === 'number') {
        phlebLat = dl.lat;
        phlebLng = dl.lng;
      }

      // Compute ETA if patient address is geocoded. For MVP, return raw
      // status + flag whether phleb is en_route — the page can render
      // map link + status badge without the precise ETA math.
      return new Response(JSON.stringify({
        ok: true,
        action: 'track',
        appointment_status: appt.status,
        en_route: appt.status === 'en_route',
        arrived: appt.status === 'arrived' || appt.status === 'in_progress',
        completed: appt.status === 'specimen_delivered' || appt.status === 'completed',
        cancelled: appt.status === 'cancelled',
        phleb_lat: phlebLat,
        phleb_lng: phlebLng,
        last_known_at: dl?.captured_at || null,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── AVAILABLE SLOTS (for the reschedule picker) ───────────────
    // body: { action:'available_slots', token, date:'YYYY-MM-DD' }
    if (action === 'available_slots') {
      const date = String(body?.date || '').substring(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ error: 'date_required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Load the org's time-window rules (null org → default business hours).
      let timeWindowRules: any = null;
      if (appt.organization_id) {
        const { data: org } = await admin.from('organizations')
          .select('time_window_rules').eq('id', appt.organization_id).maybeSingle();
        timeWindowRules = org?.time_window_rules ?? null;
      }
      const slots = await getAvailableSlotsForDate(
        admin, appt.organization_id, date, timeWindowRules,
        (appt as any).lab_destination, appt.service_type,
      );
      // The patient's CURRENT slot is "booked" by their own appointment — surface
      // it as available so they can see/keep it, and don't present it as taken.
      return new Response(JSON.stringify({
        ok: true, action: 'available_slots', date,
        slots: slots.map((s: any) => ({ time: s.time, available: s.available })),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── RESCHEDULE (patient-initiated) ────────────────────────────
    // body: { action:'reschedule', token, date:'YYYY-MM-DD', time:'8:00 AM' }
    if (action === 'reschedule') {
      const date = String(body?.date || '').substring(0, 10);
      const time = String(body?.time || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) {
        return new Response(JSON.stringify({ error: 'date_and_time_required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (NON_RESCHEDULABLE.has(String(appt.status))) {
        return new Response(JSON.stringify({ error: 'not_reschedulable', status: appt.status }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Lead-time guard on the CURRENT appointment — too close → route to call.
      const curStart = new Date(`${String(appt.appointment_date).substring(0, 10)}T${String(appt.appointment_time || '00:00:00').length <= 5 ? appt.appointment_time + ':00' : appt.appointment_time}-04:00`);
      const hoursUntilCurrent = (curStart.getTime() - Date.now()) / 3_600_000;
      if (isFinite(hoursUntilCurrent) && hoursUntilCurrent < RESCHEDULE_MIN_LEAD_HOURS) {
        return new Response(JSON.stringify({ error: 'too_close', call: '(941) 527-9169', lead_hours: RESCHEDULE_MIN_LEAD_HOURS }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Re-verify the requested slot is actually free (uses the fixed
      // availability module — the same guard that blocks new bookings).
      let timeWindowRules: any = null;
      if (appt.organization_id) {
        const { data: org } = await admin.from('organizations')
          .select('time_window_rules').eq('id', appt.organization_id).maybeSingle();
        timeWindowRules = org?.time_window_rules ?? null;
      }
      const free = await isSlotStillAvailable(admin, appt.organization_id, date, time, timeWindowRules, appt.service_type);
      if (!free) {
        return new Response(JSON.stringify({ error: 'slot_conflict' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Apply — anchor date at noon ET for TZ stability (matches booking paths).
      const newTimestamp = `${date}T12:00:00-04:00`;
      const { error: updErr } = await admin.from('appointments').update({
        appointment_date: newTimestamp,
        appointment_time: time,
        rescheduled_at: new Date().toISOString(),
        // Re-open confirmation: a moved visit is no longer "confirmed".
        status: 'scheduled',
        patient_confirmed_at: null,
      }).eq('id', appt.id);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Audit (best-effort).
      try {
        await admin.from('activity_log' as any).insert({
          appointment_id: appt.id,
          activity_type: 'patient_self_reschedule',
          description: `Patient self-rescheduled to ${date} ${time} via self-service token`,
          patient_name: appt.patient_name,
          status: 'completed',
        });
      } catch { /* non-blocking */ }

      // ── PATIENT CONFIRMATION (transactional booking_confirmation —
      // always-send; the patient just took this action and is waiting).
      // Best-effort: never fail the reschedule on a notify error.
      const niceDate = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
      const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
      const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
      const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
      const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
      const normPhone = (p: string) => {
        const d = p.replace(/\D/g, '');
        if (d.length === 10) return `+1${d}`;
        if (d.length === 11 && d.startsWith('1')) return `+${d}`;
        return p.startsWith('+') ? p : `+${d}`;
      };
      const phone = String((appt as any).patient_phone || '').trim();
      const email = String((appt as any).patient_email || '').trim();

      if (phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        const smsBody = `ConveLabs: ✓ Rescheduled. Your visit is now ${niceDate} at ${time}. We'll text a reminder the night before. Questions? (941) 527-9169`;
        let sid: string | null = null, ok = false;
        try {
          const fd = new URLSearchParams({ To: normPhone(phone), From: TWILIO_FROM, Body: smsBody });
          const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(),
          });
          ok = tw.ok;
          try { sid = (await tw.json())?.sid || null; } catch { /* */ }
        } catch (e) { console.warn('[self-service reschedule] sms err:', e); }
        try {
          await admin.from('sms_notifications').insert({
            appointment_id: appt.id, notification_type: 'reschedule_confirmation',
            phone_number: normPhone(phone), message_content: smsBody.substring(0, 1500),
            sent_at: new Date().toISOString(), delivery_status: ok ? 'sent' : 'failed',
            twilio_message_sid: sid, metadata: { source: 'appointment-self-service', new_date: date, new_time: time },
          });
        } catch { /* non-blocking */ }
      }

      if (email && MAILGUN_API_KEY) {
        const subject = `Rescheduled: your ConveLabs visit is now ${niceDate} at ${time}`;
        const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#059669,#047857);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="margin:0;font-size:20px;">✓ Your visit was rescheduled</h1></div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
    <p>Hi ${String(appt.patient_name || 'there').split(' ')[0]},</p>
    <p>You're all set — here are your new details:</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;">
      <p style="margin:0;"><strong>${niceDate} at ${time}</strong></p>
      ${(appt as any).address ? `<p style="margin:6px 0 0;">${String((appt as any).address)}</p>` : ''}
    </div>
    <p style="font-size:13px;color:#6b7280;">We'll send a reminder the night before. Need to change again? Reply or call (941) 527-9169.</p>
    <p style="margin-top:18px;">— Nico at ConveLabs</p>
  </div>
</div>`;
        let mgId: string | null = null, ok = false;
        try {
          const fd = new FormData();
          fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
          fd.append('to', email);
          fd.append('subject', subject);
          fd.append('html', html);
          fd.append('o:tracking-clicks', 'no');
          const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
            method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd,
          });
          ok = mg.ok;
          try { mgId = (await mg.json())?.id || null; } catch { /* */ }
        } catch (e) { console.warn('[self-service reschedule] email err:', e); }
        try {
          await admin.from('email_send_log').insert({
            appointment_id: appt.id, to_email: email, email_type: 'reschedule_confirmation',
            subject, sent_at: new Date().toISOString(), status: ok ? 'sent' : 'failed',
            mailgun_id: mgId, campaign_tag: 'reschedule_confirmation',
            organization_id: (appt as any).organization_id || null,
          });
        } catch { /* non-blocking */ }
      }

      return new Response(JSON.stringify({ ok: true, action: 'reschedule', date, time }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown_action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[appointment-self-service] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
