import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * AUTO-HEAL CRON — Tier 3 Self-Healing System
 *
 * Runs every 30 minutes. Detects and fixes problems automatically:
 *
 * 1. RETRY FAILED SMS — Resend any SMS that failed in the last 2 hours (max 1 retry)
 * 2. TOMORROW'S READINESS — At 6 PM+ ET, alert owner if tomorrow has unassigned phlebs
 *    or missing lab orders
 * 3. UNSTICK POST-VISIT SEQUENCES — Re-trigger any sequence steps stuck in pending > 1h
 * 4. ORPHANED APPOINTMENTS — Flag appointments with no contact info
 * 5. AUTO-CONFIRM UNCONFIRMED — Auto-confirm appointments within 24h if still 'scheduled'
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function nowET(): Date {
  // Get current time in ET
  const str = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(str);
}

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function tomorrowET(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Respect kill switch
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    return new Response(JSON.stringify({ success: true, suspended: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');

    const healed: string[] = [];
    const alerts: string[] = [];
    const now = new Date();
    const etNow = nowET();
    const etHour = etNow.getHours();

    // ── 1. RETRY FAILED SMS ──────────────────────────────────────────────
    // Find SMS that failed in the last 2 hours and haven't been retried
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const { data: failedSms } = await supabase
      .from('sms_notifications')
      .select('id, appointment_id, notification_type, phone_number, status, retry_count, created_at')
      .eq('status', 'failed')
      .gte('created_at', twoHoursAgo)
      .or('retry_count.is.null,retry_count.lt.1');

    if (failedSms && failedSms.length > 0) {
      for (const sms of failedSms) {
        try {
          // Mark as retrying
          await supabase
            .from('sms_notifications')
            .update({ retry_count: (sms.retry_count || 0) + 1, status: 'retrying' })
            .eq('id', sms.id);

          // Resend via the SMS function
          if (sms.phone_number) {
            const resp = await fetch(`${supabaseUrl}/functions/v1/send-sms-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                to: sms.phone_number,
                message: `[Auto-retry] ConveLabs notification for your upcoming appointment. Questions? Call (941) 527-9169`,
              }),
            });

            const result = await resp.json();
            if (result.success) {
              await supabase
                .from('sms_notifications')
                .update({ status: 'retried_success' })
                .eq('id', sms.id);
              healed.push(`Retried failed SMS to ${sms.phone_number.slice(-4)} — success`);
            } else {
              await supabase
                .from('sms_notifications')
                .update({ status: 'retry_failed' })
                .eq('id', sms.id);
              healed.push(`Retried failed SMS to ${sms.phone_number.slice(-4)} — still failing`);
            }
          }
        } catch (e) {
          console.error('SMS retry error:', e);
        }
      }
    }

    // ── 2. TOMORROW'S READINESS CHECK (6 PM - 10 PM ET only) ────────────
    if (etHour >= 18 && etHour <= 22) {
      const tomorrow = tomorrowET();
      const { data: tomorrowAppts } = await supabase
        .from('appointments')
        .select('id, patient_name, appointment_time, phlebotomist_id, service_type, lab_order_url, address')
        .gte('appointment_date', tomorrow)
        .lt('appointment_date', tomorrow + 'T23:59:59')
        .not('status', 'in', '("cancelled","rescheduled")');

      if (tomorrowAppts && tomorrowAppts.length > 0) {
        const unassigned = tomorrowAppts.filter(a => !a.phlebotomist_id);
        const missingLabs = tomorrowAppts.filter(
          a => a.service_type === 'mobile' && !a.lab_order_url
        );
        const missingAddress = tomorrowAppts.filter(
          a => a.service_type === 'mobile' && !a.address
        );

        if (unassigned.length > 0) {
          alerts.push(
            `${unassigned.length} tomorrow's appointment(s) UNASSIGNED: ${unassigned.map(a => a.patient_name).join(', ')}`
          );
        }
        if (missingLabs.length > 0) {
          alerts.push(
            `${missingLabs.length} tomorrow's mobile visit(s) MISSING LAB ORDERS: ${missingLabs.map(a => a.patient_name).join(', ')}`
          );
        }
        if (missingAddress.length > 0) {
          alerts.push(
            `${missingAddress.length} tomorrow's mobile visit(s) MISSING ADDRESS: ${missingAddress.map(a => a.patient_name).join(', ')}`
          );
        }
      }
    }

    // ── 3. UNSTICK POST-VISIT SEQUENCES ─────────────────────────────────
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { data: stuckSteps } = await supabase
      .from('post_visit_sequences')
      .select('id, appointment_id, step, scheduled_at')
      .eq('status', 'pending')
      .lt('scheduled_at', oneHourAgo)
      .limit(10);

    if (stuckSteps && stuckSteps.length > 0) {
      // Trigger the processor to pick these up
      try {
        await fetch(`${supabaseUrl}/functions/v1/process-post-visit-sequences`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({}),
        });
        healed.push(`Kicked post-visit processor for ${stuckSteps.length} stuck step(s)`);
      } catch (e) {
        console.error('Post-visit kick error:', e);
      }
    }

    // ── 4. AUTO-CONFIRM UNCONFIRMED (within 24h) ────────────────────────
    // If an appointment is within 24h and still "scheduled" (not confirmed),
    // auto-confirm it so the phlebotomist sees it on their schedule
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: unconfirmed } = await supabase
      .from('appointments')
      .select('id, patient_name')
      .eq('status', 'scheduled')
      .gte('appointment_date', todayET())
      .lte('appointment_date', in24h)
      .limit(20);

    if (unconfirmed && unconfirmed.length > 0) {
      const { count } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('status', 'scheduled')
        .gte('appointment_date', todayET())
        .lte('appointment_date', in24h);

      healed.push(`Auto-confirmed ${unconfirmed.length} appointment(s) within 24h`);
    }

    // ── 5. VOID STALE INVOICES (>7 days unpaid, not VIP) ────────────────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleInvoices } = await supabase
      .from('appointments')
      .select('id, patient_name, invoice_status, total_price')
      .in('invoice_status', ['sent', 'reminded'])
      .lt('created_at', sevenDaysAgo)
      .not('status', 'in', '("cancelled","completed")')
      .limit(10);

    if (staleInvoices && staleInvoices.length > 0) {
      // Don't auto-void — just alert. Voiding should be manual.
      alerts.push(
        `${staleInvoices.length} invoice(s) unpaid for 7+ days: ${staleInvoices.map(a => `${a.patient_name} ($${a.total_price})`).join(', ')}`
      );
    }

    // SMS alerts removed — consolidated into daily-owner-brief (5 AM ET)
    // Auto-heal now runs silently: fixes problems, logs results, no owner interruption.

    // Log to console for Supabase logs
    if (healed.length > 0 || alerts.length > 0) {
      console.log('Auto-heal results:', { healed, alerts });
    }

    return new Response(
      JSON.stringify({
        success: true,
        healed: healed.length,
        alerts: alerts.length,
        details: { healed, alerts },
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Auto-heal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
