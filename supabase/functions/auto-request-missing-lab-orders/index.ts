/**
 * AUTO-REQUEST-MISSING-LAB-ORDERS
 *
 * Hormozi pre-deadline cadence: every 30 min during business hours, finds
 * upcoming appointments with NO lab order on file and fires the
 * `request-appointment-lab-order` flow if we haven't already requested.
 * Three escalation rings:
 *
 *   ring A · 48h before draw — first auto-request (same friendly copy as manual)
 *   ring B · 24h before draw — re-request via opposite channel preference
 *   ring C ·  4h before draw — escalate to owner SMS (manual rescue)
 *
 * Idempotency:
 *   • One auto_request_ring_a/b/c flag per appointment via
 *     auto_lab_order_request_log table — never fire the same ring twice.
 *   • If the patient has uploaded since the row was scheduled, skip — the
 *     legacy lab_order_file_path column or any appointment_lab_orders row
 *     counts as "done."
 *
 * Quiet-hours respected: if a ring is due at 9:30 PM ET, the underlying
 * request fn defers via shouldSendNow + the cron retries at the next tick.
 *
 * verify_jwt=false (cron-triggered).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendOwnerAlert } from '../_shared/alert-recipients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

interface ApptRow {
  id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  appointment_date: string;
  appointment_time: string | null;
  lab_order_file_path: string | null;
  status: string;
  service_type: string | null;
  family_group_id: string | null;
}

function hoursUntilAppt(date: string, time: string | null): number {
  const dateOnly = String(date).substring(0, 10);
  const timeStr = time ? String(time).substring(0, 5) : '09:00';
  const apptIso = `${dateOnly}T${timeStr}:00-04:00`; // ET
  const apptMs = new Date(apptIso).getTime();
  return (apptMs - Date.now()) / (1000 * 60 * 60);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const today = new Date().toISOString().substring(0, 10);
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().substring(0, 10);

    // Pull every active appointment in the next 72h. Filter further in JS
    // because hours-until calculation is timezone-aware.
    const { data: appts } = await admin
      .from('appointments')
      .select('id, patient_name, patient_phone, patient_email, appointment_date, appointment_time, lab_order_file_path, status, service_type, family_group_id')
      .gte('appointment_date', today)
      .lte('appointment_date', in3Days)
      .not('status', 'in', '(cancelled,completed,no_show)');

    if (!appts || appts.length === 0) {
      return new Response(JSON.stringify({ ok: true, considered: 0, fired: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pre-load every existing auto-request log + every existing lab_order
    // row in one query each — avoid N+1.
    const apptIds = appts.map(a => a.id);
    const [{ data: logRows }, { data: labOrderRows }] = await Promise.all([
      admin.from('auto_lab_order_request_log').select('appointment_id, ring').in('appointment_id', apptIds),
      admin.from('appointment_lab_orders').select('appointment_id').in('appointment_id', apptIds).is('deleted_at', null),
    ]);
    const ringsByAppt = new Map<string, Set<string>>();
    for (const r of (logRows || []) as any[]) {
      const set = ringsByAppt.get(r.appointment_id) || new Set<string>();
      set.add(r.ring);
      ringsByAppt.set(r.appointment_id, set);
    }
    const labOrderApptSet = new Set<string>((labOrderRows || []).map((r: any) => r.appointment_id));

    let fired = 0;
    let escalated = 0;
    const skipped: any[] = [];

    for (const appt of appts as ApptRow[]) {
      // Already has a lab order? Skip.
      if (appt.lab_order_file_path || labOrderApptSet.has(appt.id)) {
        skipped.push({ id: appt.id, reason: 'has_lab_order' });
        continue;
      }
      // Skip in-office visits — they typically arrive WITH the requisition
      if (appt.service_type === 'in-office') {
        skipped.push({ id: appt.id, reason: 'in_office' });
        continue;
      }

      const hours = hoursUntilAppt(appt.appointment_date, appt.appointment_time);
      const fired_rings = ringsByAppt.get(appt.id) || new Set<string>();

      // Determine which ring should fire RIGHT NOW
      let targetRing: 'A' | 'B' | 'C' | null = null;
      if (hours > 24 && hours <= 48 && !fired_rings.has('A')) targetRing = 'A';
      else if (hours > 4 && hours <= 24 && !fired_rings.has('B')) targetRing = 'B';
      else if (hours > 0 && hours <= 4 && !fired_rings.has('C')) targetRing = 'C';
      else { skipped.push({ id: appt.id, hours, reason: 'no_ring_due' }); continue; }

      if (targetRing === 'C') {
        // Ring C — owner alert. Manual rescue, not another patient SMS
        await sendOwnerAlert(admin,
          `🚨 ${appt.patient_name} draw in <4h — STILL no lab order. Phone: ${appt.patient_phone || 'none'}. Email: ${appt.patient_email || 'none'}. Appt: ${appt.appointment_date} ${appt.appointment_time || ''}`
        );
        await admin.from('auto_lab_order_request_log').insert({
          appointment_id: appt.id, ring: 'C', fired_at: new Date().toISOString(),
        });
        escalated++;
        continue;
      }

      // Ring A or B — fire the existing request fn. It handles quiet hours,
      // rate limits, contact fallbacks (now via the stale-phone patch), etc.
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/request-appointment-lab-order`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: appt.id }),
          signal: AbortSignal.timeout(15000),
        });
        const body = await r.json().catch(() => ({}));
        if (r.ok && (body?.sms_sent || body?.email_sent || body?.deferred)) {
          await admin.from('auto_lab_order_request_log').insert({
            appointment_id: appt.id, ring: targetRing,
            fired_at: new Date().toISOString(),
            sms_sent: !!body?.sms_sent, email_sent: !!body?.email_sent,
            deferred: !!body?.deferred,
          });
          fired++;
        } else {
          skipped.push({ id: appt.id, ring: targetRing, reason: body?.error || `http_${r.status}` });
        }
      } catch (e: any) {
        skipped.push({ id: appt.id, ring: targetRing, reason: e?.message || 'fetch_failed' });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      considered: appts.length,
      fired_rings_a_b: fired,
      escalated_ring_c: escalated,
      skipped_count: skipped.length,
      skipped: skipped.slice(0, 30),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[auto-request-missing-lab-orders] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
