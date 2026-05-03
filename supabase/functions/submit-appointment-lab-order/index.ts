/**
 * SUBMIT-APPOINTMENT-LAB-ORDER
 *
 * Patient-facing: token-only upload of a lab order via the
 * /appt/<token>/upload-order page. No auth wall — every extra click
 * is a lost conversion. The token IS the binding between this upload
 * and one specific appointment.
 *
 * Endpoints:
 *   GET  ?token=<t>          → returns { appointment_summary } for the upload page
 *   POST { token, file_b64, content_type, original_filename }
 *        → uploads to lab-orders/, stamps appointments.lab_order_file_path
 *          + appointment_lab_orders row + fires OCR. Returns confirmation.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB hard cap; client should resize

function decodeB64ToUint8(b64: string): Uint8Array {
  // Strip data URI prefix if present
  const cleaned = b64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(cleaned);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function loadRequestRow(admin: any, token: string) {
  const { data: row } = await admin
    .from('appointment_lab_order_requests')
    .select('id, appointment_id, status, expires_at, opened_at')
    .eq('access_token', token)
    .maybeSingle();
  if (!row) return { ok: false as const, code: 'token_not_found' };
  if (row.status === 'uploaded') return { ok: false as const, code: 'already_uploaded' };
  if (row.status === 'cancelled') return { ok: false as const, code: 'cancelled' };
  if (new Date(row.expires_at) < new Date()) return { ok: false as const, code: 'expired' };
  return { ok: true as const, row };
}

async function loadAppointmentSummary(admin: any, appointmentId: string) {
  const { data: appt } = await admin
    .from('appointments')
    .select('id, patient_name, appointment_date, appointment_time, address, service_type, service_name, lab_destination, fasting_required, organization_id')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appt) return null;
  let orgName: string | null = null;
  if (appt.organization_id) {
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', appt.organization_id)
      .maybeSingle();
    orgName = (org as any)?.name || null;
  }
  return {
    patient_first_name: String(appt.patient_name || 'there').split(' ')[0],
    appointment_date: appt.appointment_date,
    appointment_time: appt.appointment_time,
    address: appt.address,
    service_name: appt.service_name || appt.service_type,
    lab_destination: appt.lab_destination,
    fasting_required: appt.fasting_required,
    org_name: orgName,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);

  try {
    // GET — fetch appointment summary for the upload page
    if (req.method === 'GET') {
      const token = url.searchParams.get('token') || '';
      if (!token) return new Response(JSON.stringify({ error: 'token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

      const result = await loadRequestRow(admin, token);
      if (!result.ok) {
        return new Response(JSON.stringify({ error: result.code }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Stamp opened_at on first GET — gives admin "patient is on the page" signal
      if (!result.row.opened_at) {
        await admin.from('appointment_lab_order_requests')
          .update({ opened_at: new Date().toISOString(), status: 'opened' })
          .eq('id', result.row.id);
      }

      const summary = await loadAppointmentSummary(admin, result.row.appointment_id);
      return new Response(JSON.stringify({ ok: true, appointment: summary }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST — receive the upload
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const token: string = body?.token || '';
    const fileB64: string = body?.file_b64 || '';
    const contentType: string = body?.content_type || 'application/pdf';
    const origName: string = body?.original_filename || 'lab-order';

    if (!token || !fileB64) {
      return new Response(JSON.stringify({ error: 'token + file_b64 required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await loadRequestRow(admin, token);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.code }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const requestRow = result.row;

    const bytes = decodeB64ToUint8(fileB64);
    if (bytes.length > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'file_too_large', message: 'Please upload a file under 20 MB.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build a safe filename
    const ext = (origName.split('.').pop() || (contentType.includes('pdf') ? 'pdf' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeName = `patient_${requestRow.appointment_id.substring(0, 8)}_${Date.now()}.${ext}`;

    // Upload to storage
    const { error: upErr } = await admin.storage
      .from('lab-orders')
      .upload(safeName, bytes, {
        contentType,
        upsert: false,
      });
    if (upErr) {
      return new Response(JSON.stringify({ error: 'upload_failed', message: upErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stamp the appointment_lab_orders row + the appointments legacy column
    const { data: lo } = await admin
      .from('appointment_lab_orders')
      .insert({
        appointment_id: requestRow.appointment_id,
        file_path: safeName,
        original_filename: origName,
        file_size: bytes.length,
        mime_type: contentType,
        ocr_status: 'pending',
      })
      .select('id')
      .single();

    try {
      const { data: appt } = await admin
        .from('appointments')
        .select('lab_order_file_path, patient_name, appointment_date, appointment_time')
        .eq('id', requestRow.appointment_id)
        .maybeSingle();
      const existing = (appt as any)?.lab_order_file_path
        ? String((appt as any).lab_order_file_path).split('\n').filter(Boolean)
        : [];
      if (!existing.includes(safeName)) existing.push(safeName);
      await admin.from('appointments')
        .update({ lab_order_file_path: existing.join('\n') })
        .eq('id', requestRow.appointment_id);

      // Owner ping for next-24h visits — phleb wants to know the prep landed
      try {
        const apptIso = (appt as any)?.appointment_date as string;
        if (apptIso && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
          const apptDate = new Date(String(apptIso).substring(0, 10) + 'T12:00:00');
          const hoursAway = (apptDate.getTime() - Date.now()) / (1000 * 60 * 60);
          if (hoursAway >= 0 && hoursAway <= 26) {
            const fd = new URLSearchParams({
              To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
              From: TWILIO_FROM,
              Body: `Lab order received from ${(appt as any)?.patient_name || 'patient'} — ${(appt as any)?.appointment_time || 'soon'}. Review on your way.`,
            });
            await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: fd.toString(),
            });
          }
        }
      } catch (e) { console.warn('[submit-lab-order] owner ping skipped:', e); }
    } catch (e) { console.warn('[submit-lab-order] legacy stamp failed:', e); }

    // Mark the request complete
    await admin.from('appointment_lab_order_requests')
      .update({
        status: 'uploaded',
        uploaded_at: new Date().toISOString(),
        uploaded_file_path: safeName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestRow.id);

    // Fire OCR (non-blocking)
    if (lo?.id) {
      try {
        admin.functions.invoke('ocr-lab-order', { body: { labOrderId: lo.id } }).catch(() => {});
      } catch (e) { console.warn('[submit-lab-order] OCR invoke skipped:', e); }
    }

    return new Response(JSON.stringify({
      ok: true,
      file_path: safeName,
      message: 'Got it ✓',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[submit-lab-order] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
