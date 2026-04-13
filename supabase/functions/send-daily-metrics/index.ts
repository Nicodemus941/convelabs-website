import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
    const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
    const OWNER_EMAIL = 'nicodemmebaptiste@convelabs.com';

    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];
    const lastWeekStr = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const prevWeekStr = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];

    // Yesterday's metrics
    const { data: yesterdayAppts } = await supabase.from('appointments').select('*').gte('appointment_date', `${yesterdayStr}T00:00:00`).lt('appointment_date', `${todayStr}T00:00:00`);
    const completed = (yesterdayAppts || []).filter(a => a.status === 'completed').length;
    const cancelled = (yesterdayAppts || []).filter(a => a.status === 'cancelled').length;
    const revenue = (yesterdayAppts || []).filter(a => a.payment_status === 'completed').reduce((s, a) => s + (a.total_amount || 0), 0);
    const tips = (yesterdayAppts || []).filter(a => a.payment_status === 'completed').reduce((s, a) => s + (a.tip_amount || 0), 0);

    // New patients yesterday
    const { count: newPatients } = await supabase.from('tenant_patients').select('*', { count: 'exact', head: true }).gte('created_at', `${yesterdayStr}T00:00:00`).lt('created_at', `${todayStr}T00:00:00`);

    // Outstanding invoices
    const { count: overdueInvoices } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).in('invoice_status', ['sent', 'reminded']);

    // Today's schedule
    const { data: todayAppts } = await supabase.from('appointments').select('*').gte('appointment_date', `${todayStr}T00:00:00`).lt('appointment_date', `${todayStr}T23:59:59`).not('status', 'eq', 'cancelled').order('appointment_time', { ascending: true });

    // Week over week
    const { data: thisWeekAppts } = await supabase.from('appointments').select('total_amount').gte('appointment_date', lastWeekStr).eq('payment_status', 'completed');
    const { data: prevWeekAppts } = await supabase.from('appointments').select('total_amount').gte('appointment_date', prevWeekStr).lt('appointment_date', lastWeekStr).eq('payment_status', 'completed');
    const thisWeekRev = (thisWeekAppts || []).reduce((s, a) => s + (a.total_amount || 0), 0);
    const prevWeekRev = (prevWeekAppts || []).reduce((s, a) => s + (a.total_amount || 0), 0);
    const weekChange = prevWeekRev > 0 ? Math.round(((thisWeekRev - prevWeekRev) / prevWeekRev) * 100) : 0;

    // Referral activity
    const { count: referralCount } = await supabase.from('referral_redemptions').select('*', { count: 'exact', head: true }).gte('created_at', `${yesterdayStr}T00:00:00`);

    const dateLabel = yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const todayScheduleHtml = (todayAppts || []).map((a: any) => {
      const name = a.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim() || a.patient_email || 'Unknown';
      return `<tr><td style="padding:6px 8px;font-size:12px;">${a.appointment_time || '—'}</td><td style="padding:6px 8px;font-size:12px;">${name}</td><td style="padding:6px 8px;font-size:12px;text-transform:capitalize;">${(a.service_type || '').replace(/_/g,' ')}</td></tr>`;
    }).join('') || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af;">No appointments today</td></tr>';

    const emailHtml = `
      <div style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:28px;border-radius:16px 16px 0 0;text-align:center;">
          <h1 style="margin:0;font-size:22px;">Daily Business Report</h1>
          <p style="margin:6px 0 0;opacity:0.9;">${dateLabel}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 16px 16px;">
          <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
            <div style="flex:1;min-width:120px;background:#fef2f2;border-radius:10px;padding:14px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:700;color:#B91C1C;">$${revenue.toFixed(0)}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Revenue</p>
            </div>
            <div style="flex:1;min-width:120px;background:#f0fdf4;border-radius:10px;padding:14px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:700;color:#059669;">${completed}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Completed</p>
            </div>
            <div style="flex:1;min-width:120px;background:#eff6ff;border-radius:10px;padding:14px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:700;color:#2563eb;">$${tips.toFixed(0)}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Tips</p>
            </div>
          </div>

          <table style="width:100%;font-size:13px;margin-bottom:16px;">
            <tr><td style="padding:4px 0;color:#6b7280;">Cancelled</td><td style="text-align:right;font-weight:600;${cancelled > 0 ? 'color:#DC2626' : ''}">${cancelled}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">New Patients</td><td style="text-align:right;font-weight:600;">${newPatients || 0}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Outstanding Invoices</td><td style="text-align:right;font-weight:600;${(overdueInvoices || 0) > 0 ? 'color:#D97706' : ''}">${overdueInvoices || 0}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Referrals Yesterday</td><td style="text-align:right;font-weight:600;">${referralCount || 0}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Week-over-Week</td><td style="text-align:right;font-weight:600;color:${weekChange >= 0 ? '#059669' : '#DC2626'}">${weekChange >= 0 ? '+' : ''}${weekChange}%</td></tr>
          </table>

          <h3 style="font-size:14px;margin:20px 0 8px;color:#B91C1C;">Today's Schedule (${(todayAppts || []).length} appointments)</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#f9fafb;"><th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Time</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Patient</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;">Service</th></tr>
            ${todayScheduleHtml}
          </table>

          <div style="margin-top:24px;text-align:center;">
            <a href="https://convelabs.com/dashboard/super_admin" style="display:inline-block;background:#B91C1C;color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Open Dashboard</a>
          </div>
          <p style="font-size:10px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
        </div>
      </div>
    `;

    if (MAILGUN_API_KEY) {
      const formData = new FormData();
      formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
      formData.append('to', OWNER_EMAIL);
      formData.append('subject', `ConveLabs Daily Report: $${revenue.toFixed(0)} revenue, ${completed} completed (${dateLabel})`);
      formData.append('html', emailHtml);
      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: formData,
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Daily metrics error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
