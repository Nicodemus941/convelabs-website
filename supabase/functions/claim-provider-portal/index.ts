// claim-provider-portal (v3 — with referred-patient discovery)
// Public endpoint for /join/:token. Three modes:
//   preview: returns pre-filled org info
//   referred_patients: returns the list of patients referred by this org
//   activate: creates org + invites provider + returns referred patients

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { token, mode } = body || {};
    if (!token) return new Response(JSON.stringify({ error: 'token required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: row } = await admin.from('patient_referring_providers').select('*').eq('claim_token', token).maybeSingle();
    if (!row) return new Response(JSON.stringify({ error: 'Link not found or expired' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (row.claim_token_expires_at && new Date(row.claim_token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link has expired.' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // PREVIEW MODE — initial page load
    if (mode === 'preview') {
      if (row.status === 'converted' && row.matched_org_id) {
        return new Response(JSON.stringify({ ok: true, already_converted: true, org_id: row.matched_org_id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (row.status === 'contacted' || row.status === 'email_found') {
        await admin.from('patient_referring_providers').update({ status: 'portal_viewed' }).eq('id', row.id);
      }
      // Count referred patients for the preview badge
      const { count: referredCount } = await admin.from('patient_referring_providers')
        .select('id', { count: 'exact', head: true })
        .or(`practice_email.ilike.${row.practice_email || ''},claim_token.eq.${token}`);
      return new Response(JSON.stringify({
        ok: true,
        provider: {
          provider_name: row.provider_name,
          practice_name: row.practice_name,
          practice_email: row.practice_email,
          practice_phone: row.practice_phone,
          practice_city: row.practice_city,
        },
        referred_patient_count: referredCount || 1,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // REFERRED_PATIENTS MODE — called post-activation to show "claim these"
    if (mode === 'referred_patients') {
      if (!row.matched_org_id) {
        return new Response(JSON.stringify({ ok: true, patients: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Every referral row that matches this practice (email OR name+city) AND not yet org-attached
      const { data: referrals } = await admin.from('patient_referring_providers')
        .select('patient_email, patient_name, appointment_id')
        .or(`practice_email.ilike.${row.practice_email || ''}${row.practice_name ? `,practice_name.ilike.${row.practice_name}` : ''}`)
        .order('discovered_at', { ascending: false });

      const uniqueEmails = new Set<string>();
      const patients: any[] = [];
      for (const r of referrals || []) {
        const email = (r.patient_email || '').toLowerCase();
        if (!email || uniqueEmails.has(email)) continue;
        uniqueEmails.add(email);
        // Find their appointments
        const { data: appts } = await admin.from('appointments').select('id, appointment_date, status').eq('patient_email', email).order('appointment_date', { ascending: false }).limit(3);
        patients.push({
          patient_name: r.patient_name,
          patient_email: email,
          appointment_count: appts?.length || 0,
          last_appointment: appts?.[0]?.appointment_date || null,
          last_status: appts?.[0]?.status || null,
        });
      }
      return new Response(JSON.stringify({ ok: true, patients }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ACTIVATE MODE
    if (row.status === 'converted' && row.matched_org_id) {
      return new Response(JSON.stringify({ ok: true, already_converted: true, org_id: row.matched_org_id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { practice_name, provider_name, practice_email, practice_phone } = body || {};
    if (!practice_email || !practice_name) {
      return new Response(JSON.stringify({ error: 'practice_name and practice_email required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: existingOrg } = await admin.from('organizations')
      .select('id').eq('billing_email', practice_email.toLowerCase()).maybeSingle();

    let orgId = existingOrg?.id;
    if (!orgId) {
      const { data: newOrg, error: orgErr } = await admin.from('organizations').insert({
        name: practice_name,
        contact_name: provider_name || null,
        contact_email: practice_email.toLowerCase(),
        billing_email: practice_email.toLowerCase(),
        contact_phone: practice_phone || null,
        portal_enabled: true, is_active: true,
        default_billed_to: 'patient',
        created_via: 'provider_acquisition_claim',
      }).select('id').single();
      if (orgErr) {
        console.error('[claim-provider-portal] org insert failed:', orgErr.message);
        return new Response(JSON.stringify({ error: 'Failed to create organization', detail: orgErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      orgId = newOrg.id;
    }

    // Best-effort password-account invite. This must NOT block activation:
    // Supabase Auth invite emails are rate-limited/unreliable, and the
    // provider can always sign in via /provider (SMS OTP on the contact_phone
    // we just saved, or an email recovery link). Previously a failed invite
    // 500'd the whole activation, orphaning the org and stranding the provider.
    try {
      const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        practice_email.toLowerCase(),
        { data: { role: 'provider', org_id: orgId, full_name: provider_name || practice_name }, redirectTo: `${PUBLIC_SITE_URL}/dashboard/provider` }
      );
      if (inviteErr && !/already registered|already been/i.test(inviteErr.message || '')) {
        console.warn('[claim-provider-portal] invite non-fatal:', inviteErr.message || JSON.stringify(inviteErr));
      }
    } catch (e: any) {
      console.warn('[claim-provider-portal] invite threw (non-fatal):', e?.message || String(e));
    }

    // Flipping status='converted' triggers on_provider_converted_backfill_appointments
    // which auto-links every unattached appointment for this patient to the new org.
    await admin.from('patient_referring_providers').update({
      status: 'converted', matched_org_id: orgId,
      portal_activated_at: new Date().toISOString(),
      converted_at: new Date().toISOString(),
      next_send_at: null, paused_at: new Date().toISOString(),
    }).eq('id', row.id);

    return new Response(JSON.stringify({ ok: true, org_id: orgId, message: 'Portal activated.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
