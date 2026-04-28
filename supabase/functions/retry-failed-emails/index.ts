/**
 * RETRY-FAILED-EMAILS
 *
 * Audit gap #9: Mailgun transient failures (rate-limit, 4xx, network)
 * leave email_send_log rows at status='failed' with no retry. The
 * mailgun-webhook handles bounces (permanent failures), but anything
 * that fails BEFORE the message reaches Mailgun's queue (HTTP error,
 * 5xx response, timeout) just sits there forever — patient never
 * gets the invoice, dunning silently breaks.
 *
 * This function sweeps email_send_log for retryable rows and re-fires
 * the original send via the appropriate edge function. Exponential
 * backoff: attempt N waits 2^N * 5 minutes before retry (5m, 10m,
 * 20m, 40m, 80m). Capped at 5 attempts.
 *
 * Only retries rows with retry_payload populated — this is set by the
 * caller (e.g. send-appointment-invoice) when it knows how to replay.
 * One-shot announcement blasts deliberately leave it NULL so we don't
 * hammer the same patient repeatedly.
 *
 * Cron: every 15 min. Idempotent (UPDATE …RETURNING ensures one worker
 * claims each row).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Map email_type → which edge function replays it. Anything not in this
// map is non-replayable (one-shot) and stays at failed forever.
const REPLAY_FUNCTION: Record<string, string> = {
  appointment_invoice: 'send-appointment-invoice',
  invoice: 'send-appointment-invoice',
  appointment_reminder: 'send-appointment-reminder',
  fasting_reminder: 'send-fasting-reminders',
};

function backoffMinutes(retryCount: number): number {
  // 2^N * 5: 5, 10, 20, 40, 80
  return Math.pow(2, retryCount) * 5;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const startTime = Date.now();
  const stats = { eligible: 0, retried: 0, succeeded: 0, failed: 0, exhausted: 0 };

  try {
    // Find all retry-eligible failed rows
    const { data: candidates, error: fetchErr } = await admin
      .from('email_send_log')
      .select('id, email_type, to_email, subject, retry_count, last_attempt_at, retry_payload, appointment_id')
      .eq('status', 'failed')
      .lt('retry_count', 5)
      .not('retry_payload', 'is', null)
      .order('last_attempt_at', { ascending: true })
      .limit(50);

    if (fetchErr) throw fetchErr;
    stats.eligible = (candidates || []).length;

    for (const row of (candidates || [])) {
      const r: any = row;
      // Backoff gate
      const waitedMin = r.last_attempt_at
        ? (Date.now() - new Date(r.last_attempt_at).getTime()) / 60000
        : 999;
      const required = backoffMinutes(r.retry_count || 0);
      if (waitedMin < required) continue;

      const replayFn = REPLAY_FUNCTION[r.email_type];
      if (!replayFn) continue; // unmapped type — leave it

      stats.retried++;

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${replayFn}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify(r.retry_payload),
        });

        if (res.ok) {
          // The replayed function will write its OWN email_send_log row
          // on success. Mark this row as exhausted (no further retries)
          // and link it to the new attempt.
          await admin.from('email_send_log').update({
            status: 'retry_succeeded',
            retry_count: (r.retry_count || 0) + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: null,
          }).eq('id', r.id);
          stats.succeeded++;
        } else {
          const body = await res.text().catch(() => 'no body');
          const newCount = (r.retry_count || 0) + 1;
          await admin.from('email_send_log').update({
            retry_count: newCount,
            last_attempt_at: new Date().toISOString(),
            last_error: `HTTP ${res.status}: ${body.substring(0, 500)}`,
          }).eq('id', r.id);
          stats.failed++;
          if (newCount >= 5) stats.exhausted++;
        }
      } catch (e: any) {
        const newCount = (r.retry_count || 0) + 1;
        await admin.from('email_send_log').update({
          retry_count: newCount,
          last_attempt_at: new Date().toISOString(),
          last_error: `Threw: ${(e?.message || String(e)).substring(0, 500)}`,
        }).eq('id', r.id);
        stats.failed++;
        if (newCount >= 5) stats.exhausted++;
      }
    }

    // SMS owner if we have rows that just exhausted retries — those
    // are emails that genuinely won't deliver. Patient won't get the
    // invoice; admin needs to call them or use a different channel.
    if (stats.exhausted > 0) {
      try {
        const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
        const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
        const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
        const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
        if (TWILIO_SID && TWILIO_AUTH) {
          const cleanPhone = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: cleanPhone,
              Body: `📧 ${stats.exhausted} email${stats.exhausted === 1 ? '' : 's'} exhausted retries — won't deliver. Check Emails tab in admin.`,
              From: TWILIO_FROM,
            }).toString(),
          });
        }
      } catch (e) { console.warn('[retry-failed-emails] owner SMS failed:', e); }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[retry-failed-emails] ${JSON.stringify(stats)} in ${elapsed}ms`);
    return new Response(JSON.stringify({ ok: true, stats, elapsed_ms: elapsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[retry-failed-emails] unhandled:', e?.message);
    return new Response(JSON.stringify({ error: e?.message || 'unhandled' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
