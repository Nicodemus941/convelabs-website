/**
 * audit-org-invoices — catches the org-billing revenue gap.
 *
 * Two failure modes this surfaces (the Elite Medical Concierge case):
 *   1. UNINVOICED: an org-billed (organizations.default_billed_to='org') visit
 *      that has happened (completed, or past-dated) but has NO org_invoices row.
 *      Root cause: there is no auto-generation — invoices are created by hand.
 *   2. UNSENT: an org_invoices row that was created but never sent (sent_at IS
 *      NULL) and is aging. Root cause: create + send are two manual steps and
 *      the send step gets skipped, so it never bills and never enters dunning.
 *
 * Run daily by cron. Texts the owner a summary + dollar exposure when the gap
 * is non-zero, and logs to error_logs. Pass { dryRun: true } to get the JSON
 * without sending the alert.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendOwnerAlert } from '../_shared/alert-recipients.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const UNSENT_AGE_DAYS = 2;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let dryRun = false;
  try { if (req.method === 'POST') { const b = await req.json().catch(() => ({})); dryRun = !!b?.dryRun; } } catch { /* */ }

  try {
    // 1) UNINVOICED — org-billed visits that happened but have no invoice.
    //    Amount = the appointment total, else the org's configured rate.
    //    (Embedded-resource filters are unreliable here, so resolve the
    //     org-billed org set first, then query appointments by organization_id.)
    const { data: orgs } = await admin
      .from('organizations')
      .select('id, name, org_invoice_price_cents')
      .eq('default_billed_to', 'org');
    const orgMap = new Map<string, { name: string; rate: number }>();
    for (const o of (orgs || [])) orgMap.set((o as any).id, { name: (o as any).name, rate: (Number((o as any).org_invoice_price_cents) || 0) / 100 });
    const orgIds = Array.from(orgMap.keys());

    let uninvoicedRows: any[] = [];
    if (orgIds.length) {
      const { data: appts } = await admin
        .from('appointments')
        .select('id, patient_name, appointment_date, total_amount, organization_id, status')
        .in('organization_id', orgIds)
        .lte('appointment_date', new Date().toISOString())
        .neq('status', 'cancelled')
        .limit(1000);
      const apptIds = (appts || []).map((a: any) => a.id);
      let invoicedIds = new Set<string>();
      for (let i = 0; i < apptIds.length; i += 200) {
        const { data: inv } = await admin.from('org_invoices').select('appointment_id').in('appointment_id', apptIds.slice(i, i + 200));
        for (const r of (inv || [])) if ((r as any).appointment_id) invoicedIds.add((r as any).appointment_id);
      }
      uninvoicedRows = (appts || []).filter((a: any) => !invoicedIds.has(a.id));
    }

    const byOrg: Record<string, { count: number; amount: number }> = {};
    let uninvoicedAmount = 0;
    for (const a of uninvoicedRows) {
      const org = orgMap.get(a.organization_id);
      const amt = Number(a.total_amount) > 0 ? Number(a.total_amount) : (org?.rate || 0);
      uninvoicedAmount += amt;
      const k = org?.name || 'Unknown';
      byOrg[k] = byOrg[k] || { count: 0, amount: 0 };
      byOrg[k].count++; byOrg[k].amount += amt;
    }

    // 2) UNSENT — invoices created but never sent, aging past the threshold.
    const cutoff = new Date(Date.now() - UNSENT_AGE_DAYS * 864e5).toISOString();
    const { data: unsent } = await admin
      .from('org_invoices')
      .select('id, patient_name, amount, created_at, org_id, organizations(name)')
      .is('sent_at', null)
      .in('status', ['pending', 'draft'])
      .lte('created_at', cutoff)
      .limit(500);
    const unsentAmount = (unsent || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const summary = {
      uninvoiced_visits: uninvoicedRows.length,
      uninvoiced_amount: Math.round(uninvoicedAmount * 100) / 100,
      uninvoiced_by_org: byOrg,
      unsent_invoices: (unsent || []).length,
      unsent_amount: Math.round(unsentAmount * 100) / 100,
      total_exposure: Math.round((uninvoicedAmount + unsentAmount) * 100) / 100,
    };

    const hasGap = summary.uninvoiced_visits > 0 || summary.unsent_invoices > 0;

    if (hasGap && !dryRun) {
      const topOrg = Object.entries(byOrg).sort((a, b) => b[1].amount - a[1].amount)[0];
      const lines = [
        '🧾 Org-billing gap (ConveLabs)',
        `${summary.uninvoiced_visits} visit(s) uninvoiced · $${summary.uninvoiced_amount}`,
        `${summary.unsent_invoices} invoice(s) created-but-unsent · $${summary.unsent_amount}`,
        topOrg ? `Top: ${topOrg[0]} (${topOrg[1].count} · $${Math.round(topOrg[1].amount * 100) / 100})` : '',
        `≈ $${summary.total_exposure} uncollected. Review: admin → Organizations.`,
      ].filter(Boolean);
      await sendOwnerAlert(admin, lines.join('\n'));
      try {
        await admin.from('error_logs').insert({
          error_type: 'org_invoice_gap',
          error_message: `Org-billing gap: ${summary.uninvoiced_visits} uninvoiced ($${summary.uninvoiced_amount}), ${summary.unsent_invoices} unsent ($${summary.unsent_amount})`,
          context: summary as any,
        } as any);
      } catch { /* */ }
    }

    return new Response(JSON.stringify({ ok: true, dryRun, ...summary }, null, 2), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
