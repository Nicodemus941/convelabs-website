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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function loadByToken(admin: any, token: string) {
  const { data: appt } = await admin
    .from('appointments')
    .select('id, view_token, patient_name, appointment_date, appointment_time, address, service_type, service_name, status, patient_confirmed_at, cancelled_at, delivery_location')
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
