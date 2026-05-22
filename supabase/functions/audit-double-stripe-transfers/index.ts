/**
 * AUDIT-DOUBLE-STRIPE-TRANSFERS
 *
 * Read-only. Pages through stripe.transfers.list since p_since (default 2026-04-01),
 * groups by source_transaction (charge ID — canonical "same patient charge" linker),
 * and for any charge with >=2 distinct transfers returns: patient_name, transfer_ids,
 * sum_amount, v4_expected, over_pay = sum - v4_expected.
 *
 * Why source_transaction (not metadata.appointment_id): transfer_data.destination
 * auto-routes at checkout produce transfers WITHOUT custom metadata. Matching by
 * metadata misses them. Matching by source_transaction catches every transfer that
 * shares the same underlying patient charge.
 *
 * No money is moved. No DB rows are modified. This is the inventory of the
 * historical double-transfer leak now that the kill switch on
 * transfer-invoice-phleb-cut is in place.
 *
 * Auth: cron_secret. verify_jwt=false.
 */
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    const body = await req.json().catch(() => ({} as any));
    const provided = body?.cron_secret || req.headers.get('x-cron-secret') || '';
    if (cronSecret && provided !== cronSecret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const since = body?.since ? new Date(body.since) : new Date('2026-04-01T00:00:00Z');
    const sinceTs = Math.floor(since.getTime() / 1000);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const all: any[] = [];
    let starting_after: string | undefined;
    let pages = 0;
    while (pages < 50) {
      const page = await stripe.transfers.list({ limit: 100, created: { gte: sinceTs }, starting_after } as any);
      all.push(...page.data);
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1].id;
      pages++;
    }

    const byCharge = new Map<string, any[]>();
    let noSource = 0;
    for (const t of all) {
      const src = t.source_transaction;
      if (!src) { noSource++; continue; }
      if (!byCharge.has(src)) byCharge.set(src, []);
      byCharge.get(src)!.push(t);
    }

    const dupes: any[] = [];
    for (const [chargeId, ts] of byCharge.entries()) {
      if (ts.length < 2) continue;
      const sumCents = ts.reduce((s, t) => s + (t.amount || 0), 0);
      dupes.push({ charge_id: chargeId, transfer_count: ts.length, sum_cents: sumCents, transfers: ts });
    }

    const chargeIds = dupes.map(d => d.charge_id);
    const { data: ql } = await admin.from('stripe_qb_sync_log').select('appointment_id, stripe_charge_id').in('stripe_charge_id', chargeIds);
    const chargeToAppt = new Map<string, string>();
    for (const r of (ql || []) as any[]) {
      if (r.stripe_charge_id && r.appointment_id) chargeToAppt.set(r.stripe_charge_id, r.appointment_id);
    }
    const apptIds = [...new Set([...chargeToAppt.values()])];
    const { data: appts } = await admin
      .from('appointments')
      .select('id, patient_name, appointment_date, total_amount, service_type, family_group_id')
      .in('id', apptIds);
    const apptMap = new Map<string, any>();
    for (const a of (appts || [])) apptMap.set((a as any).id, a);

    const enriched: any[] = [];
    let totalOverPayCents = 0;
    for (const d of dupes) {
      const apptId = chargeToAppt.get(d.charge_id);
      const a: any = apptId ? (apptMap.get(apptId) || {}) : {};
      let v4Cents = 0;
      if (apptId) {
        try {
          const { data: takeRows } = await admin.rpc('compute_phleb_take_v2', { p_appointment_id: apptId });
          const row: any = Array.isArray(takeRows) ? takeRows[0] : takeRows;
          v4Cents = Number(row?.take_cents || 0);
        } catch {}
      }
      const overPayCents = d.sum_cents - v4Cents;
      totalOverPayCents += Math.max(0, overPayCents);
      enriched.push({
        charge_id: d.charge_id,
        appointment_id: apptId || null,
        patient_name: a.patient_name || null,
        appointment_date: a.appointment_date || null,
        service_type: a.service_type || null,
        charge_total: a.total_amount || null,
        transfer_count: d.transfer_count,
        sum_transferred: d.sum_cents / 100,
        v4_expected: v4Cents / 100,
        over_pay: overPayCents / 100,
        transfers: d.transfers.map((t: any) => ({
          id: t.id, amount: t.amount/100, created_iso: new Date(t.created*1000).toISOString(), description: t.description, destination: t.destination,
        })),
      });
    }
    enriched.sort((a, b) => b.over_pay - a.over_pay);

    return new Response(JSON.stringify({
      ok: true,
      since: since.toISOString(),
      transfers_scanned: all.length,
      transfers_without_source: noSource,
      charges_with_multiple_transfers: enriched.length,
      total_over_pay_dollars: Math.round(totalOverPayCents) / 100,
      offenders: enriched,
    }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[audit-double-stripe-transfers]', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error', stack: e?.stack }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
