import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function splitName(fullName: string) {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ').filter(Boolean);
  return {
    fullName: trimmed,
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { organizationId, targetUserId, fullName } = await req.json();
    const normalizedOrgId = String(organizationId || '').trim();
    const normalizedTargetUserId = String(targetUserId || '').trim();
    const normalizedFullName = String(fullName || '').trim().replace(/\s+/g, ' ');

    if (!normalizedOrgId || !normalizedTargetUserId || !normalizedFullName) {
      return new Response(JSON.stringify({ error: 'organizationId, targetUserId, and fullName are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: callerData } = await supabase.auth.getUser(token);
    const caller = callerData?.user;
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerRole = String(caller.user_metadata?.role || '').toLowerCase();
    const callerOrg = String(
      caller.user_metadata?.organization_id ||
      caller.user_metadata?.org_id ||
      caller.app_metadata?.organization_id ||
      '',
    );
    const isPlatform = ['super_admin', 'admin', 'owner'].includes(callerRole);
    const isOrgSelfServe = ['office_manager', 'provider'].includes(callerRole) && callerOrg === normalizedOrgId;

    if (!isPlatform && !isOrgSelfServe) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: targetData, error: targetError } = await supabase.auth.admin.getUserById(normalizedTargetUserId);
    const targetUser = targetData?.user;
    if (targetError || !targetUser) {
      return new Response(JSON.stringify({ error: 'Staff user not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetRole = String(targetUser.user_metadata?.role || '').toLowerCase();
    const targetOrg = String(targetUser.user_metadata?.organization_id || targetUser.user_metadata?.org_id || '');
    if (!['office_manager', 'provider'].includes(targetRole) || targetOrg !== normalizedOrgId) {
      return new Response(JSON.stringify({ error: 'Target user is not staff for this organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isPlatform && normalizedTargetUserId !== caller.id) {
      return new Response(JSON.stringify({ error: 'Org staff can only edit their own name' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fullName, firstName, lastName } = splitName(normalizedFullName);
    const userMetadata = {
      ...targetUser.user_metadata,
      full_name: fullName,
      firstName,
      lastName,
    };

    const { error: updateError } = await supabase.auth.admin.updateUserById(normalizedTargetUserId, {
      user_metadata: userMetadata,
    });
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message || 'Could not update staff profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetEmail = String(targetUser.email || '').trim().toLowerCase();
    if (targetEmail) {
      await supabase
        .from('organizations')
        .update({ contact_name: fullName })
        .eq('id', normalizedOrgId)
        .ilike('contact_email', targetEmail);
    }

    return new Response(JSON.stringify({
      ok: true,
      fullName,
      firstName,
      lastName,
      userId: normalizedTargetUserId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
