/**
 * RECORDING CONSENT -- signed-in staff only.
 *
 * POST { action: 'view',   appointmentId }            -> { pdfBase64, scope, signedAt, signerName }
 * POST { action: 'revoke', appointmentId, reason? }   -> { ok: true }
 *
 * Who may call it: a super_admin (the business admin), or the phlebotomist
 * assigned to that appointment (appointments.phlebotomist_id is the auth
 * user id). The signed release is PHI-adjacent -- it names the patient -- so
 * it is never exposed through RLS to other staff, and never stored in a
 * Storage bucket (see the recording_consents migration for why).
 *
 * Revoking is what the phleb's "Patient changed their mind" button does:
 * the consent is marked withdrawn and the appointment flips to 'declined',
 * so the card stops saying yes immediately.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function hexByteaToBase64(v: unknown): string | null {
  const s = String(v ?? '');
  if (!s.startsWith('\\x')) return null;
  const hex = s.slice(2);
  let bin = '';
  for (let i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (userErr || !uid) return json({ error: 'unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const appointmentId = String(body?.appointmentId || '');
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) return json({ error: 'invalid_appointment' }, 400);

  const { data: appt } = await admin
    .from('appointments')
    .select('id, phlebotomist_id, recording_preference, recording_consent_id')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appt) return json({ error: 'not_found' }, 404);

  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', uid);
  const isSuperAdmin = (roles || []).some((r: any) => String(r.role) === 'super_admin');
  const isAssignedPhleb = appt.phlebotomist_id === uid && (roles || []).some((r: any) => String(r.role) === 'phlebotomist');
  if (!isSuperAdmin && !isAssignedPhleb) return json({ error: 'forbidden' }, 403);

  if (body.action === 'view') {
    if (!appt.recording_consent_id) return json({ error: 'no_consent' }, 404);
    const { data: c } = await admin
      .from('recording_consents')
      .select('decision, scope, created_at, signer_name, revoked_at, consent_pdf')
      .eq('id', appt.recording_consent_id)
      .maybeSingle();
    if (!c || c.decision !== 'accepted') return json({ error: 'no_signed_release' }, 404);
    const pdfBase64 = hexByteaToBase64(c.consent_pdf);
    if (!pdfBase64) return json({ error: 'no_pdf' }, 404);
    console.log(`[recording-consent] view by ${isSuperAdmin ? 'super_admin' : 'phleb'} ${uid} for ${appointmentId}`);
    return json({ pdfBase64, scope: c.scope, signedAt: c.created_at, signerName: c.signer_name, revokedAt: c.revoked_at });
  }

  if (body.action === 'revoke') {
    const reason = String(body.reason || '').trim().slice(0, 300) || null;
    if (appt.recording_consent_id) {
      await admin
        .from('recording_consents')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: uid,
          revoke_source: isAssignedPhleb && !isSuperAdmin ? 'phlebotomist' : 'admin',
          revoke_reason: reason,
        })
        .eq('id', appt.recording_consent_id)
        .is('revoked_at', null);
    }
    const { error } = await admin
      .from('appointments')
      .update({ recording_preference: 'declined', recording_scope: null })
      .eq('id', appointmentId);
    if (error) return json({ error: 'update_failed' }, 500);
    console.log(`[recording-consent] revoked for ${appointmentId} by ${uid}`);
    return json({ ok: true });
  }

  return json({ error: 'invalid_action' }, 400);
});
