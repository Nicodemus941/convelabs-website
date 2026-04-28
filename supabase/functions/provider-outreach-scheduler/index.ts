// provider-outreach-scheduler
// Runs hourly via pg_cron. Fires the next drip email for any referring
// provider whose next_send_at has arrived. Delegates the actual send to
// send-provider-outreach so the template logic has one home.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (_req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: due } = await admin
    .from('patient_referring_providers')
    .select('id, sequence_step, next_send_at, practice_email')
    .lte('next_send_at', new Date().toISOString())
    .is('paused_at', null)
    .in('status', ['email_found', 'contacted', 'portal_viewed'])
    .lt('sequence_step', 5)
    .limit(50);

  const results: any[] = [];
  for (const row of due || []) {
    if (!row.practice_email) continue;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-provider-outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ referring_provider_id: row.id }),
      });
      const j = await resp.json().catch(() => ({}));
      results.push({ id: row.id, step: (row.sequence_step || 0) + 1, ok: resp.ok, detail: j });
    } catch (e: any) {
      results.push({ id: row.id, ok: false, error: e?.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
