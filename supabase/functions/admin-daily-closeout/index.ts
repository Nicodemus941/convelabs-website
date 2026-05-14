/**
 * ADMIN-DAILY-CLOSEOUT
 *
 * 4:55 PM ET (20:55 UTC EDT) cron. Aggregates today's admin activity
 * from activity_log and emails the owner (info@convelabs.com) a Hormozi-
 * structured close-out brief.
 *
 * Builds: total touches vs 50 goal · per-category breakdown · top
 * complaints/inquiries logged today · open tasks rolling to tomorrow ·
 * recovered no-shows · invoices touched.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Use ET day boundaries (UTC-4 EDT or UTC-5 EST). Quick approximation:
    // anchor to today's date in ET via toLocaleString with America/New_York.
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayET = nowET.toISOString().substring(0, 10);

    // Pull every activity_log row created today in ET
    const { data: rows } = await admin
      .from('activity_log')
      .select('id, activity_type, description, patient_name, priority, status, assignee_user_id, created_at, completed_at')
      .gte('created_at', `${todayET}T00:00:00-04:00`)
      .order('created_at', { ascending: true });

    const activities = (rows as any[]) || [];
    const total = activities.length;
    const countByType: Record<string, number> = {};
    for (const a of activities) countByType[a.activity_type] = (countByType[a.activity_type] || 0) + 1;

    const goalPct = Math.round((total / 50) * 100);
    const status = total >= 50 ? '🟢 ON TARGET' : total >= 35 ? '🟡 BEHIND' : '🔴 SIGNIFICANTLY BEHIND';

    // Highlight categories
    const complaintsToday = activities.filter(a => a.activity_type === 'complaint');
    const inquiriesToday = activities.filter(a => a.activity_type === 'inquiry');
    const resultsRequestsToday = activities.filter(a => a.activity_type === 'results_request');
    const openTasks = activities.filter(a => a.activity_type === 'task' && a.status !== 'completed');

    // Build HTML email
    const subject = `Daily admin close-out · ${total}/50 touches · ${status}`;
    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; padding: 24px; color: #111;">
        <h1 style="margin-top: 0; font-size: 22px;">📋 Admin close-out · ${todayET}</h1>
        <div style="padding: 16px; background: ${total >= 50 ? '#ecfdf5' : total >= 35 ? '#fffbeb' : '#fef2f2'}; border-radius: 12px; border: 2px solid ${total >= 50 ? '#10b981' : total >= 35 ? '#f59e0b' : '#ef4444'};">
          <div style="font-size: 36px; font-weight: bold; line-height: 1;">${total} / 50</div>
          <div style="font-size: 13px; margin-top: 4px;">${status} · ${goalPct}% of daily goal</div>
        </div>

        <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-top: 24px;">Touches by category</h2>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          ${[
            ['📞 Calls', countByType.call || 0],
            ['💬 SMS', countByType.sms || 0],
            ['✉️ Emails', countByType.email || 0],
            ['🎙️ Voicemails left', countByType.voicemail || 0],
            ['✅ Appts confirmed', countByType.appointment_confirmed || 0],
            ['❓ Inquiries', countByType.inquiry || 0],
            ['⚠️ Complaints', countByType.complaint || 0],
            ['📋 Results requests', countByType.results_request || 0],
            ['👤 Owner calls fielded', countByType.owner_call || 0],
            ['🧪 Specimen requests', countByType.specimen_request || 0],
            ['🔁 Reschedules', countByType.reschedule || 0],
            ['❌ Cancellations', countByType.cancellation || 0],
          ].filter(([_, n]) => (n as number) > 0).map(([lbl, n]) => `
            <tr><td style="padding: 4px 0;">${lbl}</td><td style="text-align: right; font-weight: 600;">${n}</td></tr>
          `).join('')}
        </table>

        ${complaintsToday.length > 0 ? `
          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #b91c1c; margin-top: 24px;">⚠️ Complaints today (${complaintsToday.length})</h2>
          <ul style="font-size: 13px; padding-left: 20px;">
            ${complaintsToday.slice(0, 5).map(c => `<li>${(c.patient_name || 'unspecified')}: ${(c.description || '').substring(0, 200)}</li>`).join('')}
          </ul>
        ` : ''}

        ${inquiriesToday.length > 0 ? `
          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #0369a1; margin-top: 24px;">❓ New patient inquiries (${inquiriesToday.length})</h2>
          <ul style="font-size: 13px; padding-left: 20px;">
            ${inquiriesToday.slice(0, 5).map(c => `<li>${(c.patient_name || 'unspecified')}: ${(c.description || '').substring(0, 200)}</li>`).join('')}
          </ul>
        ` : ''}

        ${openTasks.length > 0 ? `
          <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-top: 24px;">↩️ Open tasks rolling to tomorrow (${openTasks.length})</h2>
          <ul style="font-size: 13px; padding-left: 20px;">
            ${openTasks.slice(0, 8).map(c => `<li>${(c.priority === 'urgent' ? '🚨 ' : '')}${(c.description || '').substring(0, 200)}</li>`).join('')}
          </ul>
        ` : ''}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="font-size: 11px; color: #6b7280;">
          Auto-generated by ConveLabs admin scoreboard · ${todayET} 4:55 PM ET<br>
          Open the live activity log: <a href="https://convelabs.com/dashboard/super_admin/notes">convelabs.com/dashboard/super_admin/notes</a>
        </p>
      </div>
    `;

    if (MAILGUN_API_KEY) {
      const form = new FormData();
      form.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
      form.append('to', 'info@convelabs.com');
      form.append('subject', subject);
      form.append('html', html);
      const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: form,
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('[closeout] mailgun fail:', resp.status, txt);
      }
    }

    // Log it for audit
    await admin.from('activity_alerts_log').insert({
      alert_type: 'heartbeat',
      summary: `Admin close-out · ${total}/50 touches · ${status}`,
      channel: 'email',
      details: { date: todayET, total, by_type: countByType, complaints: complaintsToday.length, inquiries: inquiriesToday.length },
    });

    return new Response(JSON.stringify({ ok: true, total, status, by_type: countByType }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[admin-daily-closeout]', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
