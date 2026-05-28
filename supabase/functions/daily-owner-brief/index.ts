import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendOwnerAlert } from '../_shared/alert-recipients.ts';

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

    // OWNER_PHONE is now resolved at send-time via sendOwnerAlert (DB-first, env fallback).

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
    const yTips = yAll
      .filter(a => a.payment_status === 'completed')
      .reduce((s, a) => s + (a.tip_amount || 0), 0);
    // 2026-05-28: Revenue source switched from appointments.total_amount to
    // stripe_qb_sync_log so membership signups, credit packs, bundles, and
    // lab-request unlocks all count — not just appointment charges. The
    // old query missed Nicholas Chaillan's $399 Concierge from yesterday
    // (a substantial silent under-report).
    let yRevenue = 0;
    try {
      const isDST = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT');
      const tzOffset = isDST ? '-04:00' : '-05:00';
      const { data: yRevRows } = await supabase
        .from('stripe_qb_sync_log')
        .select('amount_gross_cents')
        .gte('charge_date', `${yesterday}T00:00:00${tzOffset}`)
        .lt('charge_date', `${today}T00:00:00${tzOffset}`);
      yRevenue = ((yRevRows || []).reduce((s: number, r: any) => s + (r.amount_gross_cents || 0), 0)) / 100;
    } catch (e) {
      console.warn('[brief] yesterday-revenue ledger query failed, falling back to appointments:', e);
      yRevenue = yAll.filter(a => a.payment_status === 'completed').reduce((s, a) => s + (a.total_amount || 0), 0);
    }

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

    // ── TODAY REVENUE (REAL-TIME) ───────────────────────────────────────
    // 2026-05-28: brief sent without a today-revenue figure. Owner gets
    // the SMS at end of day and has no idea what landed. Pull from
    // stripe_qb_sync_log — single source of truth for ALL revenue streams
    // (appointment_payment, membership_signup, credit_pack, bundle_payment,
    // org_subscription, lab_request_unlock). Real-time as soon as Stripe
    // webhook fires (or reconcile-stripe-payments backfills within 6h).
    try {
      // ET midnight as UTC offset (EDT = -04, EST = -05). Use ET-aware
      // window so the bucket aligns with the owner's calendar day.
      const isDST = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT');
      const tzOffset = isDST ? '-04:00' : '-05:00';
      const todayStartIsoET = `${today}T00:00:00${tzOffset}`;

      const { data: todayRevRows } = await supabase
        .from('stripe_qb_sync_log')
        .select('amount_net_cents, amount_gross_cents, qb_class_name')
        .gte('charge_date', todayStartIsoET);

      const rows = todayRevRows || [];
      const todayGross = rows.reduce((s: number, r: any) => s + (r.amount_gross_cents || 0), 0) / 100;
      const todayNet = rows.reduce((s: number, r: any) => s + (r.amount_net_cents || 0), 0) / 100;
      const byType: Record<string, number> = {};
      for (const r of rows) {
        const k = r.qb_class_name || 'other';
        byType[k] = (byType[k] || 0) + (r.amount_gross_cents || 0) / 100;
      }
      if (rows.length > 0) {
        lines.push(`💰 $${todayGross.toFixed(0)} gross | $${todayNet.toFixed(0)} net (${rows.length} txn)`);
        // One-line breakdown when revenue spans multiple streams
        const breakdown = Object.entries(byType)
          .filter(([_, v]) => v > 0)
          .map(([k, v]) => `${k.replace('_signup', '').replace('_payment', '').replace('membership', 'mbr').replace('appointment', 'appt').replace('bundle', 'bnd').replace('credit_pack', 'pack')}:$${Math.round(v)}`)
          .join(' ');
        if (breakdown) lines.push(breakdown);
      } else {
        lines.push(`💰 $0 today (no charges yet)`);
      }
    } catch (e) {
      console.warn('[brief] today-revenue line skipped:', e);
    }

    // ── BREAK-EVEN TRACKER ──────────────────────────────────────────────
    // One-line "where am I this month?" against the $5K/mo phleb-pay goal
    // and the ~14-visit fixed-cost break-even. Mirrors the dashboard tile.
    try {
      const monthStartIso = `${today.substring(0, 7)}-01T00:00:00`;
      const nextMonthIso = (() => {
        const [y, m] = today.split('-').map(Number);
        const next = new Date(Date.UTC(y, m, 1));
        return next.toISOString().substring(0, 10) + 'T00:00:00';
      })();
      const { count: visitsMtd } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .gte('appointment_date', monthStartIso)
        .lt('appointment_date', nextMonthIso)
        .in('status', ['scheduled', 'confirmed', 'specimen_delivered', 'completed'])
        .in('payment_status', ['completed', 'paid', 'org_billed', 'not_required']);

      const v = visitsMtd || 0;
      const phlebPay = v * 63;
      const dayOfMonth = parseInt(today.substring(8, 10), 10);
      const totalDays = new Date(parseInt(today.substring(0, 4), 10), parseInt(today.substring(5, 7), 10), 0).getDate();
      const projected = Math.round((v / Math.max(dayOfMonth, 1)) * totalDays);

      lines.push('');
      lines.push('MTD');
      if (v >= 80) {
        lines.push(`✓ ${v} visits | $${phlebPay} earned | $5K goal HIT (pace ${projected})`);
      } else if (v >= 14) {
        lines.push(`✓ ${v} visits | $${phlebPay} earned | ${80 - v} more for $5K (pace ${projected})`);
      } else {
        lines.push(`⚠ ${v} visits | $${phlebPay} earned | ${14 - v} to break even (pace ${projected})`);
      }
    } catch (e) {
      console.warn('[brief] break-even line skipped:', e);
    }

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
    await sendOwnerAlert(supabase, message.substring(0, 1500));

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
