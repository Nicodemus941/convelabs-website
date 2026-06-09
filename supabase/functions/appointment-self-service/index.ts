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
import { commitReschedule, isActiveMember, RESCHEDULE } from '../_shared/reschedule.ts';

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
      // FEE GATE: moving within the fee window ($25, ≥24h is free) requires a
      // fee UNLESS the patient is a member. We do NOT commit here — the patient
      // is sent to pay, and the move is committed by the Stripe webhook once the
      // fee clears (create-reschedule-fee-checkout → stripe-webhook).
      const withinFeeWindow = isFinite(hoursUntilCurrent) && hoursUntilCurrent < RESCHEDULE.FEE_WINDOW_HOURS;
      const member = await isActiveMember(admin, (appt as any).patient_email);
      if (withinFeeWindow && !member) {
        return new Response(JSON.stringify({
          ok: false, fee_required: true, fee_cents: RESCHEDULE.RESCHEDULE_FEE_CENTS,
          date, time, hours_until: Math.round(hoursUntilCurrent),
          message: `Moving within ${RESCHEDULE.FEE_WINDOW_HOURS} hours has a $${(RESCHEDULE.RESCHEDULE_FEE_CENTS / 100).toFixed(0)} fee. Members reschedule free.`,
        }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Free path (≥24h out, or an active member): commit now via the shared helper.
      const committed = await commitReschedule(admin, appt, date, time, 0);
      if (!committed.ok) {
        return new Response(JSON.stringify({ error: committed.error || 'commit_failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, action: 'reschedule', date, time, fee_charged: false }), {
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
