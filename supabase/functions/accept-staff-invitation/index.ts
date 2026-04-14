// Accept a staff invitation.
// Public endpoint (verify_jwt=false). Called by the /accept-invite page.
// Validates token, creates auth user (or links existing), creates staff_profile,
// wires user_tenants + scope (location/territory), kicks off onboarding.
//
// Body: { token, password?, dateOfBirth?, acceptedTerms: boolean }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { token, password, acceptedTerms, preview } = await req.json();
    if (!token) return json({ error: 'token required' }, 400);

    // Preview mode: return invite details without accepting
    if (preview) {
      const { data, error } = await admin
        .from('staff_invitations')
        .select('id, email, first_name, last_name, role, pay_rate_cents, start_date, expires_at, accepted_at, revoked_at, referral_bounty_cents')
        .eq('invitation_token', token)
        .maybeSingle();
      if (error) return json({ error: 'Could not load invitation' }, 500);
      if (!data) return json({ error: 'Invitation not found' }, 404);
      if (data.revoked_at) return json({ error: 'Invitation revoked' }, 410);
      if (data.accepted_at) return json({ error: 'Already accepted', alreadyAccepted: true }, 409);
      if (new Date(data.expires_at).getTime() < Date.now()) return json({ error: 'Expired' }, 410);
      return json({ success: true, invitation: data });
    }

    if (!acceptedTerms) return json({ error: 'Terms must be accepted' }, 400);

    // Look up invitation by token
    const { data: invite, error: fetchErr } = await admin
      .from('staff_invitations')
      .select('*')
      .eq('invitation_token', token)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!invite) return json({ error: 'Invalid invitation token' }, 404);
    if (invite.revoked_at) return json({ error: 'This invitation was revoked' }, 410);
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return json({ error: 'This invitation has expired. Ask your manager to resend it.' }, 410);
    }
    if (invite.accepted_at) {
      return json({ error: 'This invitation has already been accepted' }, 409);
    }

    // Find or create the auth user
    let userId: string;
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === invite.email.toLowerCase());

    if (existing) {
      userId = existing.id;
      // If a password was supplied, update it (opt-in; empty = keep existing)
      if (password) {
        await admin.auth.admin.updateUserById(userId, { password });
      }
    } else {
      if (!password || password.length < 8) {
        return json({ error: 'Password must be at least 8 characters' }, 400);
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: invite.first_name,
          last_name: invite.last_name,
          role: invite.role,
          phone: invite.phone,
        },
      });
      if (createErr || !created.user) return json({ error: createErr?.message || 'Failed to create user' }, 500);
      userId = created.user.id;
    }

    // Create staff_profile if it doesn't exist
    const { data: profileExisting } = await admin
      .from('staff_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    let staffProfileId = profileExisting?.id;

    if (!staffProfileId) {
      const { data: newProfile, error: profileErr } = await admin
        .from('staff_profiles')
        .insert({
          user_id: userId,
          specialty: invite.role,
          phone: invite.phone,
          tenant_id: invite.tenant_id,
          pay_rate: invite.pay_rate_cents ? Math.round(invite.pay_rate_cents / 100) : null,
          hired_date: invite.start_date || new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();
      if (profileErr) throw profileErr;
      staffProfileId = newProfile.id;
    }

    // Wire up user_tenants for scoping (if tenant_id present)
    if (invite.tenant_id) {
      const { data: utExisting } = await admin
        .from('user_tenants')
        .select('id')
        .eq('user_id', userId)
        .eq('tenant_id', invite.tenant_id)
        .maybeSingle();
      if (!utExisting) {
        await admin.from('user_tenants').insert({
          user_id: userId,
          tenant_id: invite.tenant_id,
          role: invite.role,
          is_primary: true,
        });
      }
    }

    // Wire phlebotomist_locations if role is phleb-like and locationId set
    if (invite.location_id && /phleb/i.test(invite.role || '')) {
      const { data: plExisting } = await admin
        .from('phlebotomist_locations')
        .select('id')
        .eq('phlebotomist_id', staffProfileId)
        .eq('location_id', invite.location_id)
        .maybeSingle();
      if (!plExisting) {
        await admin.from('phlebotomist_locations').insert({
          phlebotomist_id: staffProfileId,
          location_id: invite.location_id,
          is_primary: true,
        });
      }
    }

    // Kick off onboarding record
    const { data: onboardingExisting } = await admin
      .from('staff_onboarding')
      .select('id')
      .eq('staff_id', staffProfileId)
      .maybeSingle();
    if (!onboardingExisting) {
      await admin.from('staff_onboarding').insert({
        staff_id: staffProfileId,
        invitation_email: invite.email,
        invitation_sent_at: invite.sent_at,
        invitation_token: invite.invitation_token,
        invitation_expires_at: invite.expires_at,
        onboarding_status: 'in_progress',
        account_setup_completed_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    // Mark invitation accepted
    await admin
      .from('staff_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        status: 'accepted',
        user_id: userId,
        staff_profile_id: staffProfileId,
      })
      .eq('id', invite.id);

    // Audit log
    await admin.from('staff_audit_logs').insert({
      change_type: 'invitation_accepted',
      new_values: { invitation_id: invite.id, role: invite.role },
      staff_id: staffProfileId,
      changed_by: userId,
    }).then(() => {}, () => {});

    return json({
      success: true,
      email: invite.email,
      role: invite.role,
      next: '/login',
    });
  } catch (e: any) {
    console.error('accept-staff-invitation error:', e);
    return json({ error: e.message || 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
