/**
 * ENRICH-DISCOVERED-ORG-NPI
 *
 * Calls the free CMS NPI Registry API to auto-fill practice taxonomy,
 * credentials, and registration date for discovered organizations that
 * have an NPI on file but haven't been enriched yet.
 *
 * Two modes:
 *   1. { orgId: "..." } → enrich that one org immediately
 *   2. {} (no body, or cron trigger) → sweep up to 50 unenriched orgs
 *
 * NPI Registry: https://npiregistry.cms.hhs.gov/api-page
 * Free, no auth, 200 req/min limit (we're nowhere near that).
 *
 * Hormozi: enriched data = better segmentation = sharper outreach.
 * A Family Medicine practice with 5+ patients referred is a HIGHER
 * priority than an Endocrinology specialist (they draw more labs on
 * average). This data makes those calls automatic.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

interface NpiEnrichment {
  taxonomy?: string;      // primary taxonomy description (e.g. "Internal Medicine")
  credentials?: string;   // MD, DO, NP, etc.
  registeredDate?: string; // YYYY-MM-DD
  practitionerName?: string; // "Last, First M" format
  officialPracticeName?: string; // organization_name from NPI (may differ from OCR'd name)
}

async function fetchNpi(npi: string): Promise<NpiEnrichment | null> {
  try {
    const url = `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(npi)}&version=2.1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[npi] API returned ${res.status} for NPI ${npi}`);
      return null;
    }
    const data = await res.json();
    if (!data?.results || data.results.length === 0) {
      console.warn(`[npi] no results for NPI ${npi}`);
      return null;
    }
    const r = data.results[0];
    const basic = r.basic || {};
    // Find the primary taxonomy (has primary:true, otherwise first)
    const taxArray = Array.isArray(r.taxonomies) ? r.taxonomies : [];
    const primaryTax = taxArray.find((t: any) => t.primary) || taxArray[0] || null;

    // Enumeration type: 1 = individual, 2 = organization
    const isOrg = r.enumeration_type === 'NPI-2';
    const practitionerName = !isOrg && basic.last_name
      ? `${basic.last_name}, ${basic.first_name || ''}${basic.middle_name ? ' ' + basic.middle_name[0] : ''}`.trim()
      : undefined;

    return {
      taxonomy: primaryTax?.desc || undefined,
      credentials: basic.credential || undefined,
      registeredDate: basic.enumeration_date || undefined,
      practitionerName,
      officialPracticeName: isOrg ? (basic.organization_name || undefined) : undefined,
    };
  } catch (e) {
    console.warn(`[npi] fetch failed for ${npi}:`, e);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const singleOrgId: string | undefined = body?.orgId;

    // Load target org(s)
    let query = supabase.from('organizations')
      .select('id, name, npi, ordering_physician, npi_taxonomy, npi_enriched_at')
      .not('npi', 'is', null);

    if (singleOrgId) {
      query = query.eq('id', singleOrgId);
    } else {
      // Sweep mode: unenriched only (npi_enriched_at IS NULL)
      query = query.is('npi_enriched_at', null).limit(50);
    }

    const { data: orgs, error } = await query;
    if (error) throw error;

    const targets = (orgs as any[]) || [];
    if (targets.length === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0, enriched: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let enriched = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const org of targets) {
      const npi = String(org.npi || '').replace(/\D/g, '');
      if (npi.length !== 10) {
        console.warn(`[npi] invalid NPI ${org.npi} on org ${org.id}`);
        skipped++;
        continue;
      }

      const result = await fetchNpi(npi);
      if (!result) {
        failures.push(`${org.name} (${npi})`);
        skipped++;
        // Still stamp enriched_at so we don't re-try every cron run. Admin
        // can manually re-enrich if they fix the NPI.
        await supabase.from('organizations').update({
          npi_enriched_at: new Date().toISOString(),
        }).eq('id', org.id);
        continue;
      }

      // Use COALESCE semantics: only overwrite fields if they're currently null/empty
      const updates: Record<string, any> = {
        npi_enriched_at: new Date().toISOString(),
      };
      if (result.taxonomy) updates.npi_taxonomy = result.taxonomy;
      if (result.registeredDate) updates.npi_registered_date = result.registeredDate;
      // Only fill ordering_physician from NPI if OCR didn't capture it
      if (result.practitionerName && !org.ordering_physician) {
        updates.ordering_physician = result.practitionerName;
      }

      await supabase.from('organizations').update(updates).eq('id', org.id);
      enriched++;
      console.log(`[npi] enriched ${org.name}: ${result.taxonomy || '?'} · registered ${result.registeredDate || '?'}`);

      // Light rate-limit: 50ms between NPI Registry calls. Well under their
      // 200/min limit. Keeps the sweep sub-3s for 50 orgs.
      await new Promise(r => setTimeout(r, 50));
    }

    return new Response(JSON.stringify({
      ok: true,
      checked: targets.length,
      enriched,
      skipped,
      failures,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[npi] top-level:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
