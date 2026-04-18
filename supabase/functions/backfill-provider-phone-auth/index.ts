// backfill-provider-phone-auth
// One-shot: for every portal-enabled, active organization, ensure an auth.users
// row exists with both the contact email and the contact_phone attached +
// email_confirm + phone_confirm = true. Idempotent — safe to re-run.
//
// Usage: POST (no body needed). Service-role only (no public access required).
//
// This makes `supabase.auth.signInWithOtp({ phone, shouldCreateUser: false })`
// work for each provider contact, because the phone is now a known identifier
// on a real auth user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: orgs, error: orgsErr } = await supabase
      .from('organizations')
      .select('id, name, contact_email, billing_email, contact_phone')
      .eq('portal_enabled', true)
      .eq('is_active', true);
    if (orgsErr) throw orgsErr;

    // Fetch ALL auth users across pages (Supabase caps perPage at ~1000)
    const allUsers: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data: pageData } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      const u = pageData?.users || [];
      allUsers.push(...u);
      if (u.length < 1000) break;
    }

    const report: Array<{ org: string; email: string | null; action: string; detail?: string }> = [];

    for (const o of orgs || []) {
      const email = (o.contact_email || o.billing_email || '').toLowerCase();
      if (!email || !o.contact_phone) {
        report.push({ org: o.name, email: email || null, action: 'skipped', detail: 'missing email or phone' });
        continue;
      }
      const phone = normalizePhone(o.contact_phone);
      const existing = allUsers.find((u: any) => u.email?.toLowerCase() === email);

      // Standard metadata block for every portal user — role is explicit + deterministic
      const userMetadata = {
        role: 'provider',
        org_id: o.id,
        org_name: o.name,
        source: 'portal_backfill',
      };

      if (!existing) {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          phone,
          email_confirm: true,
          phone_confirm: true,
          user_metadata: userMetadata,
        });
        if (createErr) {
          report.push({ org: o.name, email, action: 'create_failed', detail: createErr.message });
        } else {
          report.push({ org: o.name, email, action: 'created', detail: `user_id=${created?.user?.id}` });
        }
      } else {
        // Ensure phone linked + role stamped
        const currentPhone = (existing as any).phone || '';
        const currentPhoneDigits = currentPhone.replace(/\D/g, '');
        const targetDigits = phone.replace(/\D/g, '');
        const currentRole = (existing as any).user_metadata?.role;

        const phoneOK = currentPhoneDigits === targetDigits && (existing as any).phone_confirmed_at;
        const roleOK = currentRole === 'provider';

        if (phoneOK && roleOK) {
          report.push({ org: o.name, email, action: 'already_linked' });
        } else {
          const updatePayload: any = {
            // Merge existing metadata so we don't blow away other fields
            user_metadata: { ...(existing as any).user_metadata, ...userMetadata },
          };
          if (!phoneOK) {
            updatePayload.phone = phone;
            updatePayload.phone_confirm = true;
          }
          const { error: updErr } = await supabase.auth.admin.updateUserById(existing.id, updatePayload);
          if (updErr) {
            report.push({ org: o.name, email, action: 'update_failed', detail: updErr.message });
          } else {
            report.push({
              org: o.name, email,
              action: phoneOK ? 'role_set' : (roleOK ? 'phone_linked' : 'phone+role_set'),
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, report }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('backfill error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
