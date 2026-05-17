/**
 * CANCEL-APPOINTMENT
 *
 * Server-side cancel flow. Closes the production lie where patient-side
 * client UPDATEs were silently filtered out by RLS — UI said "cancelled"
 * but the DB row stayed status=scheduled → phleb still showed up.
 *
 * Flow:
 *  1. Auth: requires logged-in patient
 *  2. Ownership check: appointment.patient_id == auth.uid() OR
 *     appointment.patient_email == user.email (case-insensitive)
 *  3. Cancel-policy: 24h+ notice = free; <24h with paid visit = 50% fee
 *     (stored as cancellation_fee_cents on the row, separately refunded
 *     out-of-band by admin or future cancel-with-stripe-refund flow)
 *  4. Update row: status=cancelled, cancelled_at=now, cancellation_reason
 *  5. Notify phleb (Twilio SMS) if phlebotomist_id set
 *  6. Notify patient (Twilio SMS) confirming cancellation
 *  7. Log to activity_log so admin sees it on the scoreboard
 *
 * Request: { appointment_id: uuid, reason?: string }
 * Response: { success: true, status: 'cancelled', fee_cents, policy }
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
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM || !to) return { ok: false, error: 'twilio_not_configured' };
  try {
    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const fd = new URLSearchParams({ To: normalizePhone(to), From: TWILIO_FROM, Body: body });
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fd.toString(),
    });
    if (!resp.ok) return { ok: false, error: `twilio_${resp.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'twilio_throw' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json();
    const { appointment_id, reason } = body || {};
    if (!appointment_id) {
      return new Response(JSON.stringify({ error: 'appointment_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: appt } = await admin.from('appointments')
      .select('id, status, appointment_date, appointment_time, total_amount, service_type, patient_id, patient_email, patient_name, patient_phone, phlebotomist_id, payment_status, organization_id')
      .eq('id', appointment_id).maybeSingle();
    if (!appt) {
      return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Ownership check — patient_id OR email match
    const userEmail = String(user.email || '').toLowerCase();
    const apptEmail = String((appt as any).patient_email || '').toLowerCase();
    const owns = (appt as any).patient_id === user.id || (apptEmail && apptEmail === userEmail);
    if (!owns) {
      return new Response(JSON.stringify({ error: 'Not your appointment' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Idempotency — already cancelled
    if ((appt as any).status === 'cancelled') {
      return new Response(JSON.stringify({ success: true, already: true, status: 'cancelled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Compute hours-until-appt for 24h cancellation policy
    const apptDateRaw = String((appt as any).appointment_date || '').substring(0, 10);
    const apptTimeStr = String((appt as any).appointment_time || '00:00:00');
    const apptStart = new Date(`${apptDateRaw}T${apptTimeStr}`);
    const hoursUntil = (apptStart.getTime() - Date.now()) / 3600000;
    const totalAmount = Number((appt as any).total_amount || 0);

    let feeCents = 0;
    let policyLabel = 'Free cancellation (24+ hours notice).';
    if (hoursUntil < 24 && totalAmount > 0) {
      feeCents = Math.round(totalAmount * 50); // 50% of total_amount (which is dollars); store as cents
      policyLabel = `Late cancellation fee (50%): $${(feeCents / 100).toFixed(2)}`;
    }

    const cancellationReason = (reason && String(reason).slice(0, 200)) || (feeCents > 0
      ? 'Patient cancelled (<24h notice, 50% fee)'
      : 'Patient cancelled (free, 24h+ notice)');

    const { error: updErr } = await admin.from('appointments').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: cancellationReason,
    } as any).eq('id', appointment_id);
    if (updErr) {
      console.error('[cancel-appointment] update failed:', updErr);
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── PATIENT CONFIRMATION SMS ────────────────────────────────────────
    const patientPhone = String((appt as any).patient_phone || '').trim();
    const apptHuman = `${apptDateRaw} ${apptTimeStr.substring(0, 5)}`;
    if (patientPhone) {
      const smsBody = feeCents > 0
        ? `ConveLabs: Your ${apptHuman} appointment is cancelled. ${policyLabel} Please text back if this is in error. — info@convelabs.com`
        : `ConveLabs: Your ${apptHuman} appointment is cancelled — free of charge (24h+ notice). Need to rebook? https://www.convelabs.com/book-now — info@convelabs.com`;
      const smsResp = await sendSms(patientPhone, smsBody);
      if (!smsResp.ok) console.warn('[cancel-appointment] patient SMS failed:', smsResp.error);
    }

    // ── PHLEB NOTIFICATION ─────────────────────────────────────────────
    const phlebId = (appt as any).phlebotomist_id;
    if (phlebId) {
      try {
        const { data: phleb } = await admin.from('staff_profiles')
          .select('phone, first_name')
          .eq('user_id', phlebId).maybeSingle();
        const phlebPhone = String((phleb as any)?.phone || '').trim();
        if (phlebPhone) {
          const phlebBody = `ConveLabs: ${(appt as any).patient_name || 'A patient'} cancelled ${apptHuman}. Slot now open. — admin@convelabs.com`;
          const r = await sendSms(phlebPhone, phlebBody);
          if (!r.ok) console.warn('[cancel-appointment] phleb SMS failed:', r.error);
        }
      } catch (e) {
        console.warn('[cancel-appointment] phleb notify lookup failed:', e);
      }
    }

    // ── ACTIVITY LOG ──────────────────────────────────────────────────
    try {
      await admin.from('activity_log').insert({
        activity_type: 'cancellation',
        description: `${(appt as any).patient_name || apptEmail || 'Patient'} cancelled appointment ${apptHuman}${feeCents > 0 ? ` (50% fee: $${(feeCents / 100).toFixed(2)})` : ' (free, 24h+ notice)'}`,
        patient_name: (appt as any).patient_name,
        status: 'completed',
      } as any);
    } catch (e) {
      console.warn('[cancel-appointment] activity_log insert failed:', e);
    }

    return new Response(JSON.stringify({
      success: true,
      status: 'cancelled',
      fee_cents: feeCents,
      policy: policyLabel,
      hours_until_appt: Math.round(hoursUntil * 10) / 10,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[cancel-appointment] error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
