/**
 * SUBMIT RECORDING CONSENT -- public (called from checkout, before payment).
 *
 *   GET  -> the current release: { version, title, sections, scopes }
 *   POST -> record the patient's answer; returns { consentId }
 *
 * POST body:
 *   { decision: 'accepted' | 'declined',
 *     releaseVersion, scope, signerName, attestAdultPatient,
 *     signaturePng: 'data:image/png;base64,...',
 *     patientEmail, patientName, patientDob, appointmentDate }
 *
 * The answer is not tied to an appointment yet -- there is none until Stripe
 * says the visit is paid. create-appointment-checkout stamps the Stripe
 * session on this row, and stripe-webhook / verify-appointment-checkout link
 * it to the appointment. Unlinked rows are purged after 7 days.
 *
 * Deployed with --no-verify-jwt: guests check out without an account.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import {
  RELEASE_SECTIONS, RELEASE_TITLE, RELEASE_VERSION, SCOPE_LABEL,
  isKnownMinor, releasePlainText, sha256Hex, type RecordingScope,
} from '../_shared/recording-release.ts';
import { buildConsentPdf } from '../_shared/recording-consent-pdf.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_SIGNATURE_BYTES = 300_000;
// A public endpoint that stores a file: bounded per address.
const MAX_PER_IP_PER_HOUR = 20;

function toHexBytea(bytes: Uint8Array): string {
  return '\\x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodePng(dataUrl: unknown): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length < 100 || bytes.length > MAX_SIGNATURE_BYTES) return null;
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return null;
  return bytes;
}

const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method === 'GET') {
    return json({
      version: RELEASE_VERSION,
      title: RELEASE_TITLE,
      sections: RELEASE_SECTIONS,
      scopes: SCOPE_LABEL,
    });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const decision = body?.decision;
  if (decision !== 'accepted' && decision !== 'declined') return json({ error: 'invalid_decision' }, 400);

  const patientEmail = cleanText(body.patientEmail, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) return json({ error: 'invalid_email' }, 400);
  const patientName = cleanText(body.patientName, 120);
  const patientDob = /^\d{4}-\d{2}-\d{2}$/.test(String(body.patientDob || '')) ? String(body.patientDob) : null;
  const ipAddress = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 64);
  const userAgent = cleanText(req.headers.get('user-agent'), 400);

  if (ipAddress) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from('recording_consents')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('created_at', since);
    if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) return json({ error: 'rate_limited' }, 429);
  }

  if (decision === 'declined') {
    const { data, error } = await admin
      .from('recording_consents')
      .insert({
        decision: 'declined',
        patient_email: patientEmail,
        patient_name: patientName || null,
        patient_dob: patientDob,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[recording-consent] decline insert failed:', error.message);
      return json({ error: 'save_failed' }, 500);
    }
    return json({ consentId: data.id, decision: 'declined' });
  }

  // ── accepted ────────────────────────────────────────────────────────
  if (body.releaseVersion !== RELEASE_VERSION) {
    // The patient read an older text than the one we would store. Make them
    // read the current one rather than signing something they did not see.
    return json({ error: 'release_changed', version: RELEASE_VERSION }, 409);
  }
  const scope = body.scope as RecordingScope;
  if (scope !== 'arm_hands_only' && scope !== 'face_and_testimonial') return json({ error: 'invalid_scope' }, 400);
  const signerName = cleanText(body.signerName, 120);
  if (signerName.length < 3) return json({ error: 'signer_name_required' }, 400);
  if (body.attestAdultPatient !== true) return json({ error: 'attestation_required' }, 400);

  // Minors are never recorded. Checked on the visit date, not today.
  const visitDay = /^\d{4}-\d{2}-\d{2}/.test(String(body.appointmentDate || ''))
    ? new Date(String(body.appointmentDate).slice(0, 10) + 'T12:00:00Z')
    : new Date();
  if (isKnownMinor(patientDob, visitDay)) return json({ error: 'minor_not_eligible' }, 400);

  const signature = decodePng(body.signaturePng);
  if (!signature) return json({ error: 'invalid_signature' }, 400);

  const releaseText = releasePlainText();
  const releaseSha256 = await sha256Hex(releaseText);
  const consentId = crypto.randomUUID();
  const signedAt = new Date();

  let pdf: Uint8Array;
  try {
    pdf = await buildConsentPdf({
      consentId, releaseVersion: RELEASE_VERSION, releaseSha256, scope, signerName,
      patientEmail, signedAt, ipAddress, userAgent, signaturePng: signature,
    });
  } catch (e: any) {
    console.error('[recording-consent] pdf build failed:', e?.message);
    return json({ error: 'pdf_failed' }, 500);
  }

  const { error } = await admin.from('recording_consents').insert({
    id: consentId,
    created_at: signedAt.toISOString(),
    decision: 'accepted',
    scope,
    release_version: RELEASE_VERSION,
    release_text: releaseText,
    release_sha256: releaseSha256,
    signer_name: signerName,
    attested_adult_patient: true,
    patient_name: patientName || null,
    patient_email: patientEmail,
    patient_dob: patientDob,
    signature_png: toHexBytea(signature),
    consent_pdf: toHexBytea(pdf),
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
  });
  if (error) {
    console.error('[recording-consent] accept insert failed:', error.message);
    return json({ error: 'save_failed' }, 500);
  }

  return json({ consentId, decision: 'accepted', scope });
});
