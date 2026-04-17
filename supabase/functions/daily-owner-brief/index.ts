import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * DAILY OWNER BRIEF — Hormozi-Style Morning Standup
 *
 * Runs once at 5 AM ET. Sends ONE text with everything the owner
 * needs to know. No noise, no repeated alerts, just the numbers.
 *
 * Structure:
 * 1. Yesterday's results (revenue, completed, cancelled, tips, new patients)
 * 2. Today's readiness (scheduled, unassigned, missing labs)
 * 3. Needs attention (overdue invoices, failed SMS, stuck sequences)
 * 4. System health (all-clear or specific issues)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function dateET(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function shortDate(): string {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  });
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

    const yesterday = dateET(-1);
    const today = dateET(0);
    const tomorrow = dateET(1);

    // ── YESTERDAY'S RESULTS ─────────────────────────────────────────────
    const { data: yesterdayAppts } = await supabase
      .from('appointments')
      .select('status, payment_status, total_amount, tip_amount')
      .gte('appointment_date', `${yesterday}T00:00:00`)
      .lt('appointment_date', `${today}T00:00:00`);

    const yAll = yesterdayAppts || [];
    const yCompleted = yAll.filter(a => a.status === 'completed').length;
    const yCancelled = yAll.filter(a => a.status === 'cancelled').length;
    const yRevenue = yAll
      .filter(a => a.payment_status === 'completed')
      .reduce((s, a) => s + (a.total_amount || 0), 0);
    const yTips = yAll
      .filter(a => a.payment_status === 'completed')
      .reduce((s, a) => s + (a.tip_amount || 0), 0);

    // New patients yesterday
    const { count: newPatients } = await supabase
      .from('tenant_patients')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${yesterday}T00:00:00`)
      .lt('created_at', `${today}T00:00:00`);

    // ── TODAY'S READINESS ───────────────────────────────────────────────
    const { data: todayAppts } = await supabase
      .from('appointments')
      .select('id, phlebotomist_id, service_type, lab_order_url, address, status')
      .gte('appointment_date', `${today}T00:00:00`)
      .lt('appointment_date', `${today}T23:59:59`)
      .not('status', 'in', '("cancelled","rescheduled")');

    const tAll = todayAppts || [];
    const tUnassigned = tAll.filter(a => !a.phlebotomist_id).length;
    const tMissingLabs = tAll.filter(a => a.service_type === 'mobile' && !a.lab_order_url).length;
    const tMissingAddr = tAll.filter(a => a.service_type === 'mobile' && !a.address).length;

    // ── TOMORROW'S PREVIEW ──────────────────────────────────────────────
    const { count: tomorrowCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('appointment_date', `${tomorrow}T00:00:00`)
      .lt('appointment_date', `${tomorrow}T23:59:59`)
      .not('status', 'in', '("cancelled","rescheduled")');

    // ── NEEDS ATTENTION ─────────────────────────────────────────────────
    const attention: string[] = [];

    // Overdue invoices (sent but unpaid)
    const { data: overdueInvoices } = await supabase
      .from('appointments')
      .select('id, patient_name, total_price')
      .in('invoice_status', ['sent', 'reminded', 'final_warning'])
      .not('status', 'in', '("cancelled","rescheduled")');

    if (overdueInvoices && overdueInvoices.length > 0) {
      const total = overdueInvoices.reduce((s, a) => s + (a.total_price || 0), 0);
      attention.push(`${overdueInvoices.length} unpaid invoice${overdueInvoices.length > 1 ? 's' : ''} ($${total})`);
    }

    // Failed SMS in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: failedSms } = await supabase
      .from('sms_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('sent_at', oneDayAgo);

    if (failedSms && failedSms > 0) {
      attention.push(`${failedSms} failed SMS (24h)`);
    }

    // Stuck post-visit sequences
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: stuckSteps } = await supabase
      .from('post_visit_sequences')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('scheduled_at', oneHourAgo);

    if (stuckSteps && stuckSteps > 0) {
      attention.push(`${stuckSteps} stuck post-visit step${stuckSteps > 1 ? 's' : ''}`);
    }

    // Unresolved errors in last 24h
    const { count: errorCount } = await supabase
      .from('error_logs')
      .select('*', { count: 'exact', head: true })
      .eq('resolved', false)
      .gte('created_at', oneDayAgo);

    if (errorCount && errorCount > 0) {
      attention.push(`${errorCount} unresolved error${errorCount > 1 ? 's' : ''}`);
    }

    // Today readiness issues
    if (tUnassigned > 0) attention.push(`${tUnassigned} today unassigned`);
    if (tMissingLabs > 0) attention.push(`${tMissingLabs} missing lab orders`);
    if (tMissingAddr > 0) attention.push(`${tMissingAddr} missing addresses`);

    // ── BUILD THE TEXT ──────────────────────────────────────────────────
    const lines: string[] = [];
    lines.push(`ConveLabs Brief — ${shortDate()}`);
    lines.push('');

    // Yesterday
    if (yAll.length > 0) {
      lines.push('YESTERDAY');
      lines.push(`$${yRevenue} rev | ${yCompleted} done | ${yCancelled} cancelled`);
      const extras: string[] = [];
      if (yTips > 0) extras.push(`$${yTips} tips`);
      extras.push(`${newPatients || 0} new patients`);
      lines.push(extras.join(' | '));
    } else {
      lines.push('YESTERDAY: No appointments');
    }

    lines.push('');

    // Today
    lines.push('TODAY');
    lines.push(`${tAll.length} scheduled${tomorrowCount ? ` | ${tomorrowCount} tomorrow` : ''}`);

    // Attention
    if (attention.length > 0) {
      lines.push('');
      lines.push('NEEDS ATTENTION');
      attention.forEach(a => lines.push(`• ${a}`));
    }

    // All clear
    if (attention.length === 0) {
      lines.push('');
      lines.push('All systems clear ✓');
    }

    const message = lines.join('\n');

    // ── SEND SMS ────────────────────────────────────────────────────────
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
          Body: message.substring(0, 1500),
          ...(TWILIO_MESSAGING_SERVICE_SID
            ? { MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }
            : { From: Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939' }),
        }).toString(),
      });
    }

    console.log('Daily brief sent:', message);

    return new Response(
      JSON.stringify({ success: true, message, attention: attention.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Daily brief error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
