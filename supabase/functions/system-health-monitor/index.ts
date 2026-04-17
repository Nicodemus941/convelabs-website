import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');

    const issues: string[] = [];
    const autoFixed: string[] = [];

    // 1. CHECK: Unresolved error_logs from last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentErrors } = await supabase
      .from('error_logs')
      .select('error_type, component, action, error_message, created_at')
      .eq('resolved', false)
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false });

    if (recentErrors && recentErrors.length > 0) {
      const grouped: Record<string, number> = {};
      recentErrors.forEach(e => {
        const key = `${e.component}.${e.action}: ${e.error_type}`;
        grouped[key] = (grouped[key] || 0) + 1;
      });
      issues.push(`${recentErrors.length} error(s) logged:`);
      Object.entries(grouped).forEach(([key, count]) => {
        issues.push(`  ${count}x ${key}`);
      });
    }

    // 2. CHECK: Stale slot holds (expired but not cleaned)
    const { data: staleHolds } = await supabase
      .from('slot_holds')
      .select('id')
      .eq('released', false)
      .lt('expires_at', new Date().toISOString());

    if (staleHolds && staleHolds.length > 0) {
      await supabase.from('slot_holds')
        .update({ released: true })
        .eq('released', false)
        .lt('expires_at', new Date().toISOString());
      autoFixed.push(`Cleaned ${staleHolds.length} stale slot hold(s)`);
    }

    // 3. CHECK: Appointments with null patient_name (data quality)
    const { data: nullNames } = await supabase
      .from('appointments')
      .select('id, notes')
      .is('patient_name', null)
      .neq('status', 'cancelled');

    if (nullNames && nullNames.length > 0) {
      // Auto-fix: extract from notes
      for (const appt of nullNames) {
        const match = appt.notes?.match(/Patient:\s*([^|]+)/);
        if (match) {
          await supabase.from('appointments')
            .update({ patient_name: match[1].trim() })
            .eq('id', appt.id);
          autoFixed.push(`Fixed null patient_name on ${appt.id}`);
        }
      }
      if (nullNames.length > autoFixed.filter(f => f.includes('null patient_name')).length) {
        issues.push(`${nullNames.length} appointment(s) with null patient_name`);
      }
    }

    // 4. CHECK: Failed webhooks in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: failedWebhooks } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('status', 'failed')
      .gte('created_at', oneHourAgo);

    if (failedWebhooks && failedWebhooks.length > 0) {
      issues.push(`${failedWebhooks.length} failed webhook(s) in last hour`);
    }

    // 5. CHECK: Appointments missing phone/email (new ones only)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: missingContact } = await supabase
      .from('appointments')
      .select('id, patient_name')
      .is('patient_phone', null)
      .is('patient_email', null)
      .gte('created_at', oneDayAgo)
      .neq('status', 'cancelled');

    if (missingContact && missingContact.length > 0) {
      issues.push(`${missingContact.length} recent appointment(s) missing both phone and email`);
    }

    // 6. CHECK: Overdue invoices > 48 hours
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: overdueInvoices } = await supabase
      .from('appointments')
      .select('id, patient_name, total_amount')
      .eq('payment_status', 'pending')
      .eq('is_vip', false)
      .lt('invoice_due_at', new Date().toISOString())
      .in('status', ['scheduled', 'confirmed']);

    if (overdueInvoices && overdueInvoices.length > 0) {
      const total = overdueInvoices.reduce((s, a) => s + (a.total_amount || 0), 0);
      issues.push(`${overdueInvoices.length} overdue invoice(s) totaling $${total}`);
    }

    // 7. CHECK: Post-visit sequences that should have sent but didn't
    const { data: stuckSequences } = await supabase
      .from('post_visit_sequences')
      .select('id, step, appointment_id')
      .eq('status', 'pending')
      .lt('scheduled_at', oneHourAgo);

    if (stuckSequences && stuckSequences.length > 0) {
      issues.push(`${stuckSequences.length} post-visit sequence step(s) stuck in pending`);
    }

    // SMS alerts removed — consolidated into daily-owner-brief (5 AM ET)
    // This function now runs silently: detects issues, auto-fixes what it can, logs results.
    if (issues.length > 0 || autoFixed.length > 0) {
      console.log('Health monitor findings:', { issues, autoFixed });
    }

    return new Response(JSON.stringify({
      success: true,
      issues: issues.length,
      autoFixed: autoFixed.length,
      details: { issues, autoFixed },
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Health monitor error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
