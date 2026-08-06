import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeDigits(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ ok: false, error: 'unauthorized', message: 'Please sign in again.' }, 401);

    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user) return json({ ok: false, error: 'invalid_session', message: 'Your session expired — please sign in again.' }, 401);

    const role = String(user.user_metadata?.role || '').toLowerCase();
    const callerOrgId = user.user_metadata?.org_id || user.user_metadata?.organization_id || null;
    if (!['provider', 'office_manager', 'clinical_coordinator', 'org_admin'].includes(role) || !callerOrgId) {
      return json({ ok: false, error: 'not_a_provider', message: 'This action is only available to provider accounts.' }, 403);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ ok: false, error: 'bad_form', message: 'Could not read the uploaded file.' }, 400);
    }

    const requestId = String(form.get('request_id') || '').trim();
    const replace = String(form.get('replace') || '').toLowerCase() === 'true';
    const file = form.get('file');

    if (!requestId) return json({ ok: false, error: 'missing_request_id', message: 'Missing lab request.' }, 400);
    if (!(file instanceof File)) return json({ ok: false, error: 'missing_file', message: 'Please choose a file to upload.' }, 400);
    if (file.size === 0) return json({ ok: false, error: 'empty_file', message: 'That file appears to be empty.' }, 400);
    if (file.size > MAX_BYTES) return json({ ok: false, error: 'file_too_large', message: 'Please upload a file under 20 MB.' }, 413);

    const lowerName = (file.name || 'lab-order').toLowerCase();
    const ext = (lowerName.split('.').pop() || 'pdf').replace(/[^a-z0-9]/g, '');
    if (!ALLOWED_EXT.includes(ext)) {
      return json({ ok: false, error: 'bad_type', message: `Unsupported file type. Accepted: ${ALLOWED_EXT.join(', ')}` }, 400);
    }

    const { data: requestRow } = await admin
      .from('patient_lab_requests')
      .select('id, organization_id, status, patient_name, patient_email, patient_phone, patient_dob, lab_order_file_path, fasting_required')
      .eq('id', requestId)
      .maybeSingle();

    if (!requestRow) return json({ ok: false, error: 'request_not_found', message: 'We could not find that lab request.' }, 404);
    if (String(requestRow.organization_id || '') !== String(callerOrgId)) {
      return json({ ok: false, error: 'forbidden', message: 'That lab request is not part of your organization.' }, 403);
    }
    if (['completed', 'cancelled', 'expired'].includes(String(requestRow.status || ''))) {
      return json({ ok: false, error: 'request_closed', message: 'This request is no longer active. Send a fresh request instead.' }, 409);
    }
    if (String(requestRow.status || '') === 'scheduled') {
      return json({ ok: false, error: 'already_scheduled', message: 'This patient already booked. Upload the order from the scheduled appointment row instead.' }, 409);
    }
    if (requestRow.lab_order_file_path && !replace) {
      return json({ ok: false, error: 'replace_required', message: 'This request already has an order. Check replace to swap it out.' }, 409);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    const safeName = `lab-request/${requestId.substring(0, 8)}-${Date.now()}.${ext}`;

    const { error: upErr } = await admin.storage
      .from('lab-orders')
      .upload(safeName, bytes, { contentType, upsert: false });
    if (upErr) {
      return json({ ok: false, error: 'upload_failed', message: upErr.message }, 500);
    }

    let detectedPanels: any[] = [];
    let fullText = '';
    let fasting = !!requestRow.fasting_required;
    let urine = false;
    let gtt = false;
    let ocrDob: string | null = null;

    try {
      const ocrResp = await fetch(`${SUPABASE_URL}/functions/v1/ocr-lab-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ filePath: safeName }),
      });
      if (ocrResp.ok) {
        const ocr = await ocrResp.json();
        detectedPanels = ocr.panels || [];
        fullText = ocr.fullText || '';
        fasting = !!ocr.fastingRequired || fasting;
        urine = !!ocr.urineRequired;
        gtt = !!ocr.gttRequired;
        const rawOcrDob = ocr?.patient?.dateOfBirth ? String(ocr.patient.dateOfBirth) : null;
        if (rawOcrDob && /^\d{4}-\d{2}-\d{2}$/.test(rawOcrDob)) {
          ocrDob = rawOcrDob;
        }
      }
    } catch (ocrErr) {
      console.warn('[attach-lab-order-to-request] OCR failed (non-blocking):', ocrErr);
    }

    const nextDob = requestRow.patient_dob || ocrDob || null;

    const { error: updateErr } = await admin
      .from('patient_lab_requests')
      .update({
        lab_order_file_path: safeName,
        lab_order_panels: detectedPanels,
        lab_order_full_text: fullText || null,
        fasting_required: fasting,
        urine_required: urine,
        gtt_required: gtt,
        patient_dob: nextDob,
      })
      .eq('id', requestId);

    if (updateErr) {
      try { await admin.storage.from('lab-orders').remove([safeName]); } catch { /* ignore cleanup failure */ }
      return json({ ok: false, error: 'db_update_failed', message: updateErr.message }, 500);
    }

    if (ocrDob && !requestRow.patient_dob) {
      try {
        const reqEmail = String(requestRow.patient_email || '').trim().toLowerCase();
        const reqPhoneDigits = normalizeDigits(requestRow.patient_phone);
        const reqName = normalizeName(requestRow.patient_name);
        const { data: rosterRows } = await admin
          .from('tenant_patients')
          .select('id, first_name, last_name, email, phone, date_of_birth')
          .eq('organization_id', callerOrgId)
          .eq('is_active', true)
          .limit(500);

        const rosterMatch = (rosterRows || []).find((row: any) =>
          (reqEmail && String(row.email || '').trim().toLowerCase() === reqEmail) ||
          (reqPhoneDigits && normalizeDigits(row.phone) === reqPhoneDigits) ||
          (reqName && normalizeName(`${row.first_name || ''} ${row.last_name || ''}`) === reqName)
        );

        if (rosterMatch?.id && !rosterMatch.date_of_birth) {
          await admin
            .from('tenant_patients')
            .update({ date_of_birth: ocrDob })
            .eq('id', rosterMatch.id);
        }
      } catch (syncErr) {
        console.warn('[attach-lab-order-to-request] DOB chart sync failed (non-blocking):', syncErr);
      }
    }

    return json({
      ok: true,
      file_path: safeName,
      replaced: replace,
      ocr: {
        panels: detectedPanels,
        fastingRequired: fasting,
        urineRequired: urine,
        gttRequired: gtt,
      },
    });
  } catch (e: any) {
    console.error('[attach-lab-order-to-request] unhandled:', e);
    return json({ ok: false, error: 'unexpected', message: e?.message || String(e) }, 500);
  }
});
