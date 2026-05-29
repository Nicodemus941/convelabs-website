// backfill-missing-companions
// Finds every appointment with pricing_breakdown.additional_patients[]
// but no matching family_group_id companion rows, then creates them
// + tenant_patients stubs. Self-healing for both the online webhook
// silent-fail and the admin reschedule path that doesn't carry
// companions forward.
//
// Idempotent. Safe to cron. Can be called manually anytime.
//
// Auth: requires CRON_SECRET (or service-role JWT) — same gate as
// every other ledger backfill.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const body = await req.json().catch(() => ({}));
  const providedSecret = body.cron_secret || authHeader.replace(/^Bearer\s+/i, '');
  const isAuthorized = providedSecret === CRON_SECRET || (authHeader && authHeader.includes(SERVICE_KEY.slice(0, 20)));
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const dryRun = body.dry_run === true;
  const lookbackDays = Math.max(1, Math.min(365, parseInt(body.lookback_days, 10) || 90));
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Find primaries with pricing_breakdown.additional_patients[] populated
    const sinceIso = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data: primaries, error: primErr } = await admin
      .from('appointments')
      .select('id, patient_name, patient_email, patient_phone, family_group_id, companion_role, pricing_breakdown, appointment_date, appointment_time, address, address_street, address_city, address_state, address_zip, zipcode, service_type, duration_minutes, phlebotomist_id, status, lab_destination, member_status, tenant_id, organization_id, billed_to, created_at')
      .gte('created_at', sinceIso)
      .or('family_group_id.is.null,companion_role.eq.primary');
    if (primErr) throw primErr;

    const report: any[] = [];
    let companionsCreated = 0;
    let tpsCreated = 0;

    for (const primary of primaries || []) {
      const additional = (primary as any).pricing_breakdown?.additional_patients;
      if (!Array.isArray(additional) || additional.length === 0) continue;

      const primaryId = (primary as any).id;
      const familyGroupId = (primary as any).family_group_id || primaryId;

      // Count existing companion rows on this family group
      const { count: existingCount } = await admin
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('family_group_id', familyGroupId)
        .neq('companion_role', 'primary')
        .not('companion_role', 'is', null);

      const expectedCount = additional.length;
      if ((existingCount || 0) >= expectedCount) continue; // already fully populated

      const missingCount = expectedCount - (existingCount || 0);
      const item: any = {
        primary_id: primaryId,
        primary_name: (primary as any).patient_name,
        expected: expectedCount,
        existing: existingCount || 0,
        missing: missingCount,
        created_at: (primary as any).created_at,
      };

      if (dryRun) {
        item.action = 'dry_run_skip';
        report.push(item);
        continue;
      }

      // Ensure primary is marked as primary + family_group_id is set on itself
      await admin.from('appointments').update({
        family_group_id: familyGroupId,
        companion_role: 'primary',
      }).eq('id', primaryId).is('companion_role', null);

      // Create each missing companion + tenant_patient stub
      const createdIds: string[] = [];
      for (let i = 0; i < additional.length; i++) {
        const c = additional[i] || {};
        const cFirstName = (c.firstName || '').trim() || `Companion${i + 1}`;
        const cLastName = (c.lastName || '').trim() || '(companion)';
        const cName = `${cFirstName} ${cLastName}`.trim();

        // Skip if this companion was already created (by name match within this family group)
        const { data: existingSibling } = await admin
          .from('appointments')
          .select('id')
          .eq('family_group_id', familyGroupId)
          .ilike('patient_name', cName)
          .neq('companion_role', 'primary')
          .maybeSingle();
        if (existingSibling) continue;

        // tenant_patient stub — use a +suffix email to dodge the (tenant_id, email)
        // unique constraint when companions share the primary's email
        const primaryEmail = (primary as any).patient_email || c.email;
        const suffixedEmail = primaryEmail
          ? primaryEmail.replace('@', `+${cFirstName.toLowerCase().replace(/[^a-z]/g, '')}@`)
          : null;
        const tenantId = (primary as any).tenant_id || '00000000-0000-0000-0000-000000000001';

        let cPatientId: string | null = null;
        const { data: newTp } = await admin
          .from('tenant_patients')
          .insert({
            tenant_id: tenantId,
            first_name: cFirstName,
            last_name: cLastName,
            email: suffixedEmail,
            phone: c.phone || null,
            date_of_birth: c.dob || c.dateOfBirth || null,
            patient_notes: `Auto-created by backfill-missing-companions ${new Date().toISOString().slice(0, 10)} as companion of primary appt ${primaryId}`,
          })
          .select('id')
          .single();
        if (newTp) {
          cPatientId = (newTp as any).id;
          tpsCreated++;
        }

        // Companion appointment row
        const { data: cAppt, error: cErr } = await admin.from('appointments').insert({
          family_group_id: familyGroupId,
          companion_role: String(c.relationship || 'companion').toLowerCase(),
          patient_id: cPatientId,
          patient_name: cName,
          patient_email: c.email || null,
          patient_phone: c.phone || null,
          appointment_date: (primary as any).appointment_date,
          appointment_time: (primary as any).appointment_time,
          address: (primary as any).address,
          address_street: (primary as any).address_street,
          address_city: (primary as any).address_city,
          address_state: (primary as any).address_state,
          address_zip: (primary as any).address_zip,
          zipcode: (primary as any).zipcode,
          service_type: (primary as any).service_type,
          duration_minutes: (primary as any).duration_minutes,
          phlebotomist_id: (primary as any).phlebotomist_id,
          status: (primary as any).status,
          payment_status: 'org_billed',
          lab_destination: (primary as any).lab_destination,
          member_status: (primary as any).member_status,
          tenant_id: tenantId,
          organization_id: (primary as any).organization_id,
          billed_to: (primary as any).billed_to || 'patient',
          total_amount: 0,
          total_price: 0,
          fasting_required: !!c.fastingRequired,
          notes: `[backfill] Companion of ${(primary as any).patient_name} (primary appt ${primaryId})`,
          booking_source: 'backfill_companion',
        }).select('id').single();

        if (cErr) {
          item.errors = (item.errors || []);
          item.errors.push(`${cName}: ${cErr.message.slice(0, 200)}`);
        } else if (cAppt) {
          createdIds.push((cAppt as any).id);
          companionsCreated++;
        }
      }

      item.created_ids = createdIds;
      item.action = createdIds.length > 0 ? 'backfilled' : 'no_changes';
      report.push(item);
    }

    return new Response(JSON.stringify({
      ok: true,
      lookback_days: lookbackDays,
      dry_run: dryRun,
      primaries_scanned: (primaries || []).length,
      primaries_needing_backfill: report.length,
      companions_created: companionsCreated,
      tenant_patients_created: tpsCreated,
      report,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
