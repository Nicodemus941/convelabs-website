/**
 * SUBMIT-INSURANCE-CARD
 *
 * Companion to submit-appointment-lab-order. Patient lands on
 * /appt/:token/upload-order and uploads BOTH lab order + insurance card.
 *
 * ConveLabs doesn't bill insurance — but the LAB (Quest, LabCorp,
 * AdventHealth) bills the patient's plan directly using this info. Without
 * the card the lab either rejects the specimen or sends the patient a
 * surprise self-pay bill. So this fn captures the card to:
 *   1. Upload the image/PDF to storage (insurance-cards bucket)
 *   2. Stamp tenant_patients.insurance_card_path so the chart has it
 *   3. (Future) run OCR to auto-fill insurance_provider/_member_id/_group
 *
 * Token-gated (same access_token used by lab-order upload), so the
 * unauthenticated patient can hit this from an SMS deep-link without a
 * password.
 *
 * Request:  { token, file_b64, content_type, original_filename? }
 * Response: { ok: true, file_path } | { ok: false, error }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function extFromContentType(ct: string): string {
  const t = (ct || '').toLowerCase();
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('png')) return 'png';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('heic')) return 'heic';
  return 'bin';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const { token, file_b64, content_type, original_filename } = body || {};

    if (!token || !file_b64) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_fields', message: 'token and file_b64 required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Look up the appointment via the lab-order request token. Same access
    // token gates both lab-order + insurance uploads to keep the deep-link
    // simple for the patient.
    const { data: requestRow } = await admin.from('appointment_lab_order_requests')
      .select('id, appointment_id, expires_at, status')
      .eq('access_token', token).maybeSingle();
    if (!requestRow) {
      return new Response(JSON.stringify({ ok: false, error: 'token_not_found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if ((requestRow as any).expires_at && new Date((requestRow as any).expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ ok: false, error: 'expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pull appointment + patient_id so we can stamp the chart
    const { data: appt } = await admin.from('appointments')
      .select('id, patient_id, patient_email')
      .eq('id', (requestRow as any).appointment_id).maybeSingle();
    if (!appt) {
      return new Response(JSON.stringify({ ok: false, error: 'appointment_not_found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Decode base64 → Uint8Array
    let binary: Uint8Array;
    try {
      const raw = atob(file_b64);
      binary = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) binary[i] = raw.charCodeAt(i);
    } catch (decodeErr: any) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_base64', message: String(decodeErr?.message || decodeErr) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cap at 8MB to match storage policy + protect the bucket
    if (binary.byteLength > 8 * 1024 * 1024) {
      return new Response(JSON.stringify({ ok: false, error: 'file_too_large', message: 'Insurance card must be under 8MB. Try a photo instead of a scan.' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ext = extFromContentType(content_type || '');
    const fileName = `insurance_${(appt as any).patient_id || (appt as any).id}_${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from('insurance-cards').upload(fileName, binary, {
      contentType: content_type || 'application/octet-stream',
      upsert: false,
    });
    if (upErr) {
      console.error('[submit-insurance-card] storage upload failed:', upErr);
      return new Response(JSON.stringify({ ok: false, error: 'upload_failed', message: upErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // OCR the card via the existing extract-insurance-ocr edge fn (front only —
    // back contains member-services phone + claims address but we get that
    // off the front 95% of the time and the patient experience is faster
    // without a second photo). Back-side capture stays available behind the
    // admin UI when needed for claim verification. Non-blocking — if OCR
    // fails we still save the image and stamp the path; the phleb can read
    // the card at the visit.
    let ocrExtracted: any = null;
    try {
      const ocrResp = await fetch(`${SUPABASE_URL}/functions/v1/extract-insurance-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          filePath: fileName,
          patientId: (appt as any).patient_id || null,
          appointmentId: (appt as any).id,
          rank: 'primary',
          side: 'front',
        }),
      });
      if (ocrResp.ok) {
        const j = await ocrResp.json().catch(() => null);
        if (j && j.ok !== false) ocrExtracted = j.extracted || j.parsed || j;
      } else {
        console.warn('[submit-insurance-card] OCR non-200:', ocrResp.status);
      }
    } catch (ocrErr: any) {
      console.warn('[submit-insurance-card] OCR threw (non-blocking):', ocrErr?.message || ocrErr);
    }

    // Stamp tenant_patients.insurance_card_path + structured OCR fields so the
    // chart has everything it needs for THIS visit + every future visit
    // (auto-prefill on next /book-now). The lab needs provider + memberId +
    // groupNumber to bill — without those they reject the kit or self-bill
    // the patient.
    const patchPayload: Record<string, any> = {
      insurance_card_path: fileName,
      updated_at: new Date().toISOString(),
    };
    if (ocrExtracted?.provider) patchPayload.insurance_provider = String(ocrExtracted.provider).slice(0, 200);
    if (ocrExtracted?.memberId) patchPayload.insurance_member_id = String(ocrExtracted.memberId).slice(0, 100);
    if (ocrExtracted?.groupNumber) patchPayload.insurance_group_number = String(ocrExtracted.groupNumber).slice(0, 100);

    if ((appt as any).patient_id) {
      try {
        await admin.from('tenant_patients').update(patchPayload).eq('user_id', (appt as any).patient_id);
      } catch (chartErr: any) {
        console.warn('[submit-insurance-card] chart stamp failed (non-blocking):', chartErr?.message);
      }
    }
    if (!(appt as any).patient_id && (appt as any).patient_email) {
      try {
        await admin.from('tenant_patients').update(patchPayload).ilike('email', (appt as any).patient_email);
      } catch { /* non-blocking */ }
    }

    return new Response(JSON.stringify({
      ok: true,
      file_path: fileName,
      ocr_extracted: ocrExtracted ? {
        provider: ocrExtracted.provider || null,
        memberId: ocrExtracted.memberId || null,
        groupNumber: ocrExtracted.groupNumber || null,
      } : null,
      message: 'Insurance card on file — your lab will bill your insurance directly.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[submit-insurance-card] error:', e);
    return new Response(JSON.stringify({ ok: false, error: 'unknown', message: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
