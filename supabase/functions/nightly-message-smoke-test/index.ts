/**
 * NIGHTLY-MESSAGE-SMOKE-TEST
 *
 * Hormozi Layer-3 prevention surface: detect customer-facing message bugs
 * automatically, before a partner emails about a confused patient.
 *
 * Every night this cron iterates:
 *   for each registered template (e.g. appointment_confirmation)
 *     for each scenario (org-billed, patient-billed, fasting-AM, waived, …)
 *       render the message
 *       for each invariant (no $X.XX in org-billed copy, no unrendered
 *         template syntax, sms < 1600 chars, etc.)
 *           assert it holds
 *
 * Failures are logged to `message_smoke_test_runs` and SMS-alerted to the
 * owner-tier recipients (DB-driven via the alert-recipients helper).
 *
 * Adding new tests is free: drop a template into customer-templates.ts +
 * add an invariant. The cron picks them up automatically.
 *
 * verify_jwt=false (cron-triggered).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  TEMPLATES,
  INVARIANTS,
  SCENARIOS,
  type TemplateKey,
  type MessageContext,
  type RenderedMessage,
} from '../_shared/customer-templates.ts';
import { sendOwnerAlert } from '../_shared/alert-recipients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

interface Failure {
  template: string;
  scenario: string;
  invariant: string;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const failures: Failure[] = [];
    let totalAssertions = 0;

    const templateEntries = Object.entries(TEMPLATES) as Array<[TemplateKey, (c: MessageContext) => RenderedMessage]>;

    for (const [templateKey, renderFn] of templateEntries) {
      for (const scenario of SCENARIOS) {
        let rendered: RenderedMessage;
        try {
          rendered = renderFn(scenario.ctx);
        } catch (e: any) {
          // Template threw — that's its own kind of failure
          failures.push({
            template: templateKey,
            scenario: scenario.id,
            invariant: 'template_render',
            message: `template threw: ${e?.message || String(e)}`,
          });
          continue;
        }

        for (const inv of INVARIANTS) {
          totalAssertions++;
          let violation: string | null;
          try {
            violation = inv.check(scenario.ctx, rendered);
          } catch (e: any) {
            violation = `invariant check threw: ${e?.message || String(e)}`;
          }
          if (violation) {
            failures.push({
              template: templateKey,
              scenario: scenario.id,
              invariant: inv.id,
              message: violation,
            });
          }
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    let alertedOwner = false;

    // Insert run record (always, even on success — we want a heartbeat too)
    const { data: runRow } = await admin
      .from('message_smoke_test_runs' as any)
      .insert({
        templates_count: templateEntries.length,
        scenarios_count: SCENARIOS.length,
        invariants_count: INVARIANTS.length,
        total_assertions: totalAssertions,
        failures_count: failures.length,
        failures: failures.length > 0 ? failures : null,
        duration_ms: durationMs,
      })
      .select('id')
      .maybeSingle();

    // Alert owner on any failure
    if (failures.length > 0) {
      const summary = failures.slice(0, 5).map(f => `• ${f.template}/${f.scenario}: ${f.invariant} — ${f.message}`).join('\n');
      const more = failures.length > 5 ? `\n+ ${failures.length - 5} more` : '';
      const body = `🚨 ConveLabs message smoke test FAILED\n${failures.length} of ${totalAssertions} assertions broke.\n\n${summary}${more}\n\nRun ID: ${(runRow as any)?.id || 'unknown'}`;
      const result = await sendOwnerAlert(admin, body);
      alertedOwner = result.sent > 0;

      if (runRow) {
        await admin.from('message_smoke_test_runs' as any)
          .update({ alerted_owner: alertedOwner })
          .eq('id', (runRow as any).id);
      }
    }

    return new Response(JSON.stringify({
      ok: failures.length === 0,
      templates: templateEntries.length,
      scenarios: SCENARIOS.length,
      invariants: INVARIANTS.length,
      total_assertions: totalAssertions,
      failures_count: failures.length,
      failures: failures.slice(0, 20),
      duration_ms: durationMs,
      alerted_owner: alertedOwner,
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[nightly-message-smoke-test] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
