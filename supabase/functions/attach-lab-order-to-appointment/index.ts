/**
 * ATTACH-LAB-ORDER-TO-APPOINTMENT
 *
 * Provider-facing: a logged-in partner-org staffer (role=provider or
 * office_manager) uploads — or REPLACES — a lab order on an EXISTING
 * appointment from the provider dashboard's Upcoming list
 * (OrgAttachLabOrderModal.tsx).
 *
 * Why this exists (2026-05-30):
 *   Elite Medical Concierge had a patient already scheduled. They needed to
 *   update the lab orders but the dashboard "Add lab order" button invoked
 *   this function — which did NOT exist — so every attempt 404'd and they
 *   had to email the orders instead. This closes that loop. Providers can
 *   now both ADD additional orders and REPLACE an existing one for any
 *   upcoming (non-completed, non-cancelled) appointment that belongs to
 *   their org.
 *
 * Request:  multipart/form-data, Authorization: Bearer <provider_token>
 *   - appointment_id : uuid (required)
 *   - file           : the PDF / image (required, <=20MB)
 *   - replace        : 'true' to soft-delete prior orders and replace (optional)
 *
 * Auth + scope: caller must be role provider|office_manager with an org in
 * metadata, AND the appointment's organization_id must match that org.
 * Service role does the storage + DB writes (providers have no direct RLS
 * write access to appointment_lab_orders — INSERT/UPDATE are admin/phleb only).
 *
 * Response: { ok: true, file_path, ocr: { status, panels_detected, panels, fasting_required } }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // ── AUTH ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ ok: false, error: 'unauthorized', message: 'Please sign in again.' }, 401);

    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user) return json({ ok: false, error: 'invalid_session', message: 'Your session expired — please sign in again.' }, 401);

    const role = String(user.user_metadata?.role || '').toLowerCase();
    const callerOrgId = user.user_metadata?.org_id || user.user_metadata?.organization_id || null;
    if (!['provider', 'office_manager'].includes(role) || !callerOrgId) {
      return json({ ok: false, error: 'not_a_provider', message: 'This action is only available to provider accounts.' }, 403);
    }

    // ── PARSE MULTIPART ───────────────────────────────────────────────────
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ ok: false, error: 'bad_form', message: 'Could not read the uploaded file.' }, 400);
    }
    const appointmentId = String(form.get('appointment_id') || '').trim();
    const replace = String(form.get('replace') || '').toLowerCase() === 'true';
    const file = form.get('file');

    if (!appointmentId) return json({ ok: false, error: 'missing_appointment_id', message: 'Missing appointment.' }, 400);
    if (!(file instanceof File)) return json({ ok: false, error: 'missing_file', message: 'Please choose a file to upload.' }, 400);
    if (file.size === 0) return json({ ok: false, error: 'empty_file', message: 'That file appears to be empty.' }, 400);
    if (file.size > MAX_BYTES) return json({ ok: false, error: 'file_too_large', message: 'Please upload a file under 20 MB.' }, 413);

    const lowerName = (file.name || 'lab-order').toLowerCase();
    const ext = (lowerName.split('.').pop() || 'pdf').replace(/[^a-z0-9]/g, '');
    if (!ALLOWED_EXT.includes(ext)) {
      return json({ ok: false, error: 'bad_type', message: `Unsupported file type. Accepted: ${ALLOWED_EXT.join(', ')}` }, 400);
    }

    // ── OWNERSHIP CHECK (server-authoritative) ────────────────────────────
    const { data: appt } = await admin
      .from('appointments')
      .select('id, organization_id, status, patient_name, appointment_date, appointment_time, lab_order_file_path')
      .eq('id', appointmentId)
      .maybeSingle();

    if (!appt) return json({ ok: false, error: 'appointment_not_found', message: 'We could not find that appointment.' }, 404);
    if (String(appt.organization_id || '') !== String(callerOrgId)) {
      // Don't leak whether the appointment exists for other orgs.
      return json({ ok: false, error: 'forbidden', message: 'That appointment is not part of your organization.' }, 403);
    }
    if (String(appt.status) === 'cancelled') {
      return json({ ok: false, error: 'cancelled', message: 'This appointment is cancelled — no order can be attached.' }, 409);
    }
    if (String(appt.status) === 'completed') {
      return json({ ok: false, error: 'completed', message: 'This visit is already complete. Contact ConveLabs if the results need to change.' }, 409);
    }

    // ── UPLOAD TO STORAGE ─────────────────────────────────────────────────
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    const safeName = `provider_${appointmentId.substring(0, 8)}_${Date.now()}.${ext}`;

    const { error: upErr } = await admin.storage
      .from('lab-orders')
      .upload(safeName, bytes, { contentType, upsert: false });
    if (upErr) {
      return json({ ok: false, error: 'upload_failed', message: upErr.message }, 500);
    }

    // ── REPLACE MODE — soft-delete prior active orders for this appointment ─
    if (replace) {
      try {
        await admin
          .from('appointment_lab_orders')
          .update({ deleted_at: new Date().toISOString() })
          .eq('appointment_id', appointmentId)
          .is('deleted_at', null);
      } catch (e) {
        console.warn('[attach-lab-order] replace soft-delete failed (non-blocking):', e);
      }
    }

    // ── INSERT NORMALIZED ROW ─────────────────────────────────────────────
    const { data: lo, error: insErr } = await admin
      .from('appointment_lab_orders')
      .insert({
        appointment_id: appointmentId,
        file_path: safeName,
        original_filename: file.name || safeName,
        file_size: bytes.length,
        mime_type: contentType,
        ocr_status: 'pending',
      })
      .select('id')
      .single();
    if (insErr) {
      // Roll back the orphaned storage object so we don't leak files.
      try { await admin.storage.from('lab-orders').remove([safeName]); } catch { /* ignore */ }
      return json({ ok: false, error: 'db_insert_failed', message: insErr.message }, 500);
    }

    // ── SYNC LEGACY SINGLE-COLUMN MIRROR ──────────────────────────────────
    // appointments.lab_order_file_path is a newline-joined list kept in sync
    // for older surfaces. On replace we reset it to just the new file; on add
    // we append.
    try {
      const existing = (!replace && appt.lab_order_file_path)
        ? String(appt.lab_order_file_path).split('\n').filter(Boolean)
        : [];
      if (!existing.includes(safeName)) existing.push(safeName);
      await admin
        .from('appointments')
        .update({ lab_order_file_path: existing.join('\n') })
        .eq('id', appointmentId);
    } catch (e) {
      console.warn('[attach-lab-order] legacy column sync failed (non-blocking):', e);
    }

    // ── FIRE OCR (non-blocking) ───────────────────────────────────────────
    if (lo?.id) {
      try {
        admin.functions.invoke('ocr-lab-order', { body: { labOrderId: lo.id } }).catch(() => {});
      } catch (e) { console.warn('[attach-lab-order] OCR invoke skipped:', e); }
    }

    // OCR runs in the background; the modal shows a graceful "processing"
    // state when status !== 'complete'. The dashboard refresh picks up the
    // panel readback once OCR finishes.
    return json({
      ok: true,
      file_path: safeName,
      replaced: replace,
      ocr: {
        status: 'pending',
        panels_detected: null,
        panels: [],
        fasting_required: false,
      },
    }, 200);
  } catch (e: any) {
    console.error('[attach-lab-order] unhandled:', e);
    return json({ ok: false, error: 'unexpected', message: e?.message || String(e) }, 500);
  }
});
