/**
 * INVITE-ORG-MANAGER — admin-side onboarding for a new manager / front-desk
 * staffer at a partner practice. Creates an auth.users row stamped with
 * { organization_id, role:'office_manager' } in user_metadata so RPCs that
 * read auth.jwt()->'user_metadata'->>'organization_id' (e.g. the provider
 * dashboard's get_org_linked_patients) Just Work for them.
 *
 * Body: { email, organizationId, fullName?, redirectTo? (default /dashboard/provider) }
 * Returns: { ok, user_id, action_link }
 *
 * Sends a branded Mailgun invite email with a "Set My Password" CTA.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const organizationId = String(body?.organizationId || '');
    const fullName = String(body?.fullName || '').trim() || null;
    const redirectTo = String(body?.redirectTo || '/dashboard/provider');
    if (!email || !organizationId) {
      return new Response(JSON.stringify({ error: 'email and organizationId are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Confirm the org exists
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, contact_email, manager_email')
      .eq('id', organizationId)
      .maybeSingle();
    if (orgErr || !org) {
      return new Response(JSON.stringify({ error: 'organization not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fullRedirect = `https://www.convelabs.com${redirectTo.startsWith('/') ? redirectTo : '/' + redirectTo}`;

    // Generate the invite link (creates auth.users if not exists, stamps metadata)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: fullRedirect,
        data: {
          organization_id: organizationId,
          role: 'office_manager',
          full_name: fullName,
          firstName: fullName ? fullName.split(' ')[0] : null,
          lastName: fullName ? fullName.split(' ').slice(1).join(' ') : null,
        },
      },
    });
    let actionLink: string | null = (linkData as any)?.properties?.action_link || null;
    let userId: string | null = (linkData as any)?.user?.id || null;
    let mode: 'invite' | 'recovery' = 'invite';

    // If user already exists, fall back to recovery link
    if (linkErr && String(linkErr.message || '').toLowerCase().includes('already')) {
      const { data: rec, error: recErr } = await supabase.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo: fullRedirect },
      });
      if (recErr) {
        return new Response(JSON.stringify({ error: recErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      actionLink = (rec as any)?.properties?.action_link || null;
      userId = (rec as any)?.user?.id || null;
      mode = 'recovery';
    } else if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stamp manager_email on the org if it's empty
    if (!org.manager_email) {
      try {
        await supabase.from('organizations').update({ manager_email: email }).eq('id', organizationId);
      } catch (e) { console.warn('[invite-org-manager] org manager_email update failed:', e); }
    }

    return new Response(JSON.stringify({
      ok: true,
      mode,
      user_id: userId,
      action_link: actionLink,
      organization_id: organizationId,
      organization_name: org.name,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
