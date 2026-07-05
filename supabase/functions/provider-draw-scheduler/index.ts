// provider-draw-scheduler — cadence engine (Phase 2 / #114).
// Runs on a schedule (owner sets a pg_cron / scheduled trigger, e.g. daily).
// For every ACTIVE provider_plan it materializes the current + next monthly
// draw cycle into draw_schedule (idempotent), so the portal shows upcoming
// draws and the fulfillment side knows the per-cycle target. Hybrid model:
// this generates the cycle's target; the provider assigns/adjusts patients.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Add whole months to a date without drifting past month-end.
function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  try {
    const { data: plans, error } = await admin
      .from('provider_plans')
      .select('id, organization_id, draws_per_cycle, start_date, status')
      .eq('status', 'active');

    if (error) throw error;

    const now = new Date();
    let created = 0;
    const rows: any[] = [];

    for (const plan of plans || []) {
      const start = new Date(`${plan.start_date}T00:00:00Z`);
      // Find the cycle index whose window contains "now" (never before start).
      let idx = 0;
      while (addMonths(start, idx + 1) <= now && idx < 600) idx++;
      // Materialize the current cycle and the next one (look-ahead).
      for (const c of [idx, idx + 1]) {
        const cycleStart = addMonths(start, c);
        if (cycleStart < start) continue;
        const cycleEnd = addMonths(start, c + 1);
        rows.push({
          provider_plan_id: plan.id,
          organization_id: plan.organization_id,
          cycle_start: iso(cycleStart),
          cycle_end: iso(cycleEnd),
          target_draws: plan.draws_per_cycle,
          status: 'open',
        });
      }
    }

    if (rows.length) {
      // Idempotent — unique(provider_plan_id, cycle_start) means re-runs are safe.
      const { error: upErr, count } = await admin
        .from('draw_schedule')
        .upsert(rows, { onConflict: 'provider_plan_id,cycle_start', ignoreDuplicates: true, count: 'exact' });
      if (upErr) throw upErr;
      created = count ?? 0;
    }

    console.log(`[draw-scheduler] plans=${plans?.length ?? 0} cycles_upserted=${created}`);
    return new Response(JSON.stringify({ ok: true, plans: plans?.length ?? 0, cyclesUpserted: created }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[draw-scheduler] error:', e?.message);
    return new Response(JSON.stringify({ error: 'scheduler_failed', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
