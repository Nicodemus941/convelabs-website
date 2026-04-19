// snapshot-daily-kpis
// ────────────────────────────────────────────────────────────────────────
// Computes the full KPI snapshot for ET-today and upserts into
// daily_kpi_snapshots. Designed to run at 6 AM ET via pg_cron. Idempotent —
// running twice in one day just overwrites.
//
// Also callable ad-hoc with ?date=YYYY-MM-DD to backfill a specific day's
// snapshot from whatever live data exists (useful to seed history).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Resolve "today in ET" — returns YYYY-MM-DD from the admin's timezone
function etDateIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // en-CA locale gives YYYY-MM-DD naturally
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const url = new URL(req.url);
    const targetDate = url.searchParams.get('date') || etDateIso();

    // Date range bounds for "today" in ET
    const dayStart = `${targetDate}T00:00:00-04:00`; // EDT offset — fine for April 2026
    const dayEnd = `${targetDate}T23:59:59-04:00`;
    const monthStart = `${targetDate.substring(0, 7)}-01T00:00:00-04:00`;
    const thirtyDaysAgo = new Date(Date.parse(dayEnd) - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── Revenue (stripe_qb_sync_log) ───────────────────────────────
    const [{ data: revToday }, { data: revMtd }, { data: rev30 }, { data: refundsToday }, { data: refundsMtd }] =
      await Promise.all([
        admin.from('stripe_qb_sync_log').select('amount_gross_cents')
          .gte('charge_date', dayStart).lte('charge_date', dayEnd).gte('amount_gross_cents', 0),
        admin.from('stripe_qb_sync_log').select('amount_gross_cents')
          .gte('charge_date', monthStart).lte('charge_date', dayEnd).gte('amount_gross_cents', 0),
        admin.from('stripe_qb_sync_log').select('amount_gross_cents')
          .gte('charge_date', thirtyDaysAgo).lte('charge_date', dayEnd).gte('amount_gross_cents', 0),
        admin.from('stripe_qb_sync_log').select('amount_gross_cents')
          .gte('charge_date', dayStart).lte('charge_date', dayEnd).lt('amount_gross_cents', 0),
        admin.from('stripe_qb_sync_log').select('amount_gross_cents')
          .gte('charge_date', monthStart).lte('charge_date', dayEnd).lt('amount_gross_cents', 0),
      ]);
    const sumAbs = (rows: any[] | null | undefined) =>
      (rows || []).reduce((s, r) => s + Math.abs(r.amount_gross_cents || 0), 0);

    const revenue_today_cents = (revToday || []).reduce((s, r) => s + (r.amount_gross_cents || 0), 0);
    const revenue_mtd_cents = (revMtd || []).reduce((s, r) => s + (r.amount_gross_cents || 0), 0);
    const revenue_last_30d_cents = (rev30 || []).reduce((s, r) => s + (r.amount_gross_cents || 0), 0);
    const refunds_today_cents = sumAbs(refundsToday);
    const refunds_mtd_cents = sumAbs(refundsMtd);

    // ── Visits (appointments) ──────────────────────────────────────
    const [{ data: vToday }, { data: vMtd }, { data: v30 }, { data: vCompleted }] = await Promise.all([
      admin.from('appointments').select('id, status').gte('appointment_date', dayStart).lte('appointment_date', dayEnd).neq('status', 'cancelled'),
      admin.from('appointments').select('id, status').gte('appointment_date', monthStart).lte('appointment_date', dayEnd).neq('status', 'cancelled'),
      admin.from('appointments').select('id').gte('appointment_date', thirtyDaysAgo).lte('appointment_date', dayEnd).neq('status', 'cancelled'),
      admin.from('appointments').select('id').gte('appointment_date', monthStart).lte('appointment_date', dayEnd).eq('status', 'completed'),
    ]);
    const visits_today = (vToday || []).length;
    const visits_mtd = (vMtd || []).length;
    const visits_last_30d = (v30 || []).length;
    const completed_visits_mtd = (vCompleted || []).length;

    // ── Patients ───────────────────────────────────────────────────
    const [{ data: newToday }, { data: newMtd }, { count: totalActive }] = await Promise.all([
      admin.from('tenant_patients').select('id').gte('created_at', dayStart).lte('created_at', dayEnd).is('deleted_at', null),
      admin.from('tenant_patients').select('id').gte('created_at', monthStart).lte('created_at', dayEnd).is('deleted_at', null),
      admin.from('tenant_patients').select('*', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null),
    ]);
    const new_patients_today = (newToday || []).length;
    const new_patients_mtd = (newMtd || []).length;
    const total_active_patients = totalActive || 0;

    // ── Memberships ────────────────────────────────────────────────
    const [{ count: activeMems }, { count: newMemsMtd }, { count: canceledMtd }] = await Promise.all([
      admin.from('user_memberships').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('user_memberships').select('*', { count: 'exact', head: true }).gte('created_at', monthStart).lte('created_at', dayEnd),
      admin.from('user_memberships').select('*', { count: 'exact', head: true })
        .eq('status', 'canceled').gte('updated_at', monthStart).lte('updated_at', dayEnd),
    ]);

    // ── Retention (reuse get_90d_repeat_rate RPC) ──────────────────
    const { data: repeatRateRow } = await admin.rpc('get_90d_repeat_rate');
    const repeat_rate_90d_pct = (repeatRateRow as any)?.repeat_rate_pct
      ? Number((repeatRateRow as any).repeat_rate_pct)
      : null;

    // ── Unpaid invoices / AR ───────────────────────────────────────
    const { data: unpaid } = await admin.from('appointments')
      .select('id, total_amount, appointment_date, invoice_status, invoice_sent_at')
      .eq('invoice_status', 'sent')
      .is('payment_status', 'failed')
      .order('invoice_sent_at', { ascending: true })
      .limit(500);
    const unpaid_invoices_count = (unpaid || []).length;
    const unpaid_invoices_cents = Math.round(
      (unpaid || []).reduce((s, r: any) => s + ((r.total_amount || 0) * 100), 0)
    );
    const oldestUnpaid = unpaid?.[0];
    const oldest_unpaid_days = oldestUnpaid?.invoice_sent_at
      ? Math.floor((Date.parse(dayEnd) - Date.parse(oldestUnpaid.invoice_sent_at)) / 86400000)
      : null;

    // ── Google reviews (manual entry mirror) ───────────────────────
    const { data: metrics } = await admin.from('business_metrics').select('metric_key, value_numeric');
    const metricMap = new Map((metrics || []).map((m: any) => [m.metric_key, Number(m.value_numeric)]));
    const google_rating = metricMap.get('google_rating') ?? null;
    const google_review_count = metricMap.get('google_review_count') ?? null;

    // ── Ad spend + CAC (this month) ────────────────────────────────
    const { data: spendRows } = await admin.from('ad_spend_log')
      .select('spend_cents').eq('period_month', `${targetDate.substring(0, 7)}-01`);
    const ad_spend_mtd_cents = (spendRows || []).reduce((s, r: any) => s + (r.spend_cents || 0), 0);
    const cac_blended_mtd_cents = (new_patients_mtd > 0 && ad_spend_mtd_cents > 0)
      ? Math.round(ad_spend_mtd_cents / new_patients_mtd)
      : null;

    // ── Level 0 gate status (reuse RPC) ────────────────────────────
    const { data: level0 } = await admin.rpc('get_level0_progress');
    const l0 = (level0 as any) || {};
    const level0_visits_met = !!l0.visits?.met;
    const level0_rating_met = !!l0.google_rating?.met;
    const level0_repeat_met = !!l0.repeat_rate?.met;
    const level0_sop_met = !!l0.sop_coverage?.met;
    const level0_gates_met = [level0_visits_met, level0_rating_met, level0_repeat_met, level0_sop_met].filter(Boolean).length;

    // ── UPSERT snapshot ────────────────────────────────────────────
    const payload = {
      snapshot_date: targetDate,
      revenue_today_cents,
      revenue_mtd_cents,
      revenue_last_30d_cents,
      refunds_today_cents,
      refunds_mtd_cents,
      visits_today,
      visits_mtd,
      visits_last_30d,
      completed_visits_mtd,
      new_patients_today,
      new_patients_mtd,
      total_active_patients,
      active_memberships: activeMems || 0,
      new_memberships_mtd: newMemsMtd || 0,
      canceled_memberships_mtd: canceledMtd || 0,
      repeat_rate_90d_pct,
      unpaid_invoices_count,
      unpaid_invoices_cents,
      oldest_unpaid_days,
      google_rating,
      google_review_count,
      ad_spend_mtd_cents,
      cac_blended_mtd_cents,
      level0_visits_met,
      level0_rating_met,
      level0_repeat_met,
      level0_sop_met,
      level0_gates_met,
    };

    const { error: upsertErr } = await admin
      .from('daily_kpi_snapshots')
      .upsert(payload, { onConflict: 'snapshot_date' });

    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({
      success: true,
      snapshot_date: targetDate,
      fired_at: new Date().toISOString(),
      data: payload,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[snapshot-daily-kpis]', error);
    await admin.from('error_logs').insert({
      component: 'snapshot-daily-kpis',
      action: 'top_level',
      error_type: 'unhandled',
      error_message: (error?.message || String(error)).substring(0, 2000),
      error_stack: (error?.stack || '').substring(0, 4000),
    }).then(() => {}, () => {});
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
