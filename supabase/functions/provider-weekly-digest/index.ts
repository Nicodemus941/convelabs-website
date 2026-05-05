/**
 * PROVIDER-WEEKLY-DIGEST
 *
 * Monday 8:30 AM ET cron. For every organization that had at least one
 * lab request OR completed appointment in the last 7 days, send a one-screen
 * Monday-morning digest:
 *
 *   "Last week with ConveLabs: 8 patients drawn, 0 missed deadlines,
 *    ~$680 of program revenue retained."
 *
 * This is the "wrap the result around them" Hormozi pattern — every Monday
 * the provider opens an email that proves we saved them money. Renewing-
 * by-default vendor relationship, not a transactional one.
 *
 * Idempotent: writes to provider_weekly_digest_log with unique
 * (organization_id, week_start_date) — re-running same week skips dupes.
 *
 * verify_jwt=false (cron-triggered).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const FROM_EMAIL = `Nicodemme Jean-Baptiste <info@convelabs.com>`;

// Estimated program revenue per patient who actually got their draw on time.
// Based on Medi-Weightloss / TRT / hormone clinic LTV: a patient who skips
// labs typically drops out of the program; keeping them in = ~$300 in next-
// phase or refill revenue retained for the provider.
const REVENUE_RETAINED_PER_DRAW_CENTS = 30000;

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function startOfLastWeek(): { weekStart: string; weekEnd: string } {
  // Monday 00:00 ET → previous Monday 00:00 ET
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon
  const daysSinceMon = (day + 6) % 7; // 0 if Mon
  const thisMonUtc = new Date(now);
  thisMonUtc.setUTCDate(now.getUTCDate() - daysSinceMon);
  thisMonUtc.setUTCHours(0, 0, 0, 0);
  const lastMon = new Date(thisMonUtc);
  lastMon.setUTCDate(thisMonUtc.getUTCDate() - 7);
  return {
    weekStart: lastMon.toISOString().substring(0, 10),
    weekEnd: thisMonUtc.toISOString().substring(0, 10),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { weekStart, weekEnd } = startOfLastWeek();

    // Find every org that had activity in the window
    const { data: orgs } = await admin
      .from('organizations')
      .select('id, name, contact_name, contact_email, billing_email')
      .order('created_at', { ascending: true });

    let digestsSent = 0;
    const skipped: any[] = [];

    for (const org of orgs || []) {
      const recipient = (org as any).contact_email || (org as any).billing_email;
      if (!recipient) {
        skipped.push({ org_id: org.id, reason: 'no_recipient' });
        continue;
      }

      // Idempotency: skip if already sent for this week
      const { data: existing } = await admin
        .from('provider_weekly_digest_log')
        .select('id')
        .eq('organization_id', org.id)
        .eq('week_start_date', weekStart)
        .maybeSingle();
      if (existing) { skipped.push({ org_id: org.id, reason: 'already_sent' }); continue; }

      // Pull lab requests created/active in window
      const { data: requests } = await admin
        .from('patient_lab_requests')
        .select('id, patient_name, status, draw_by_date, created_at, completed_at, cancelled_at, patient_scheduled_at, specimen_delivered_at, appointment_id')
        .eq('organization_id', org.id)
        .or(`created_at.gte.${weekStart},completed_at.gte.${weekStart},specimen_delivered_at.gte.${weekStart}`)
        .lt('created_at', weekEnd + 'T23:59:59');

      // Pull completed appointments tied to this org from the window
      const { data: completedAppts } = await admin
        .from('appointments')
        .select('id, patient_name, status, completed_at, actual_draw_time, scheduled_date')
        .eq('organization_id', org.id)
        .eq('status', 'completed')
        .gte('completed_at', weekStart)
        .lt('completed_at', weekEnd + 'T23:59:59');

      const drawnCount = (completedAppts || []).length;
      const deliveredCount = (requests || []).filter((r: any) => r.specimen_delivered_at && r.specimen_delivered_at >= weekStart && r.specimen_delivered_at < weekEnd + 'T23:59:59').length;
      const pendingCount = (requests || []).filter((r: any) => r.status === 'pending_schedule').length;
      const sentCount = (requests || []).filter((r: any) => r.created_at >= weekStart && r.created_at < weekEnd + 'T23:59:59').length;
      const expiredCount = (requests || []).filter((r: any) => r.status === 'expired').length;
      const retainedCents = drawnCount * REVENUE_RETAINED_PER_DRAW_CENTS;

      // Skip orgs with zero activity in the window — don't spam
      if (drawnCount === 0 && deliveredCount === 0 && sentCount === 0) {
        skipped.push({ org_id: org.id, reason: 'no_activity' });
        continue;
      }

      const drawnList = (completedAppts || [])
        .slice(0, 10)
        .map((a: any) => `<li style="padding:4px 0;font-size:13px;">✓ ${a.patient_name} — drawn ${fmtDate((a.completed_at || a.scheduled_date || '').substring(0, 10))}</li>`)
        .join('');

      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
    <h2 style="margin:0;font-size:20px;font-weight:700;">Your week with ConveLabs</h2>
    <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">${fmtDate(weekStart)} — ${fmtDate(new Date(new Date(weekEnd).getTime() - 86400000).toISOString().substring(0, 10))}</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.55;color:#111827;">
    <p style="margin:0 0 18px;">Hi ${org.contact_name || (org as any).name || 'there'},</p>

    <!-- Hero metric grid -->
    <div style="display:table;width:100%;margin:0 0 20px;border-collapse:separate;border-spacing:8px;">
      <div style="display:table-row;">
        <div style="display:table-cell;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px;text-align:center;width:33%;">
          <div style="font-size:24px;font-weight:800;color:#047857;">${drawnCount}</div>
          <div style="font-size:11px;color:#065f46;text-transform:uppercase;letter-spacing:0.5px;">Patients drawn</div>
        </div>
        <div style="display:table-cell;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;text-align:center;width:33%;">
          <div style="font-size:24px;font-weight:800;color:#1d4ed8;">${deliveredCount}</div>
          <div style="font-size:11px;color:#1e40af;text-transform:uppercase;letter-spacing:0.5px;">Specimens delivered</div>
        </div>
        <div style="display:table-cell;background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px;text-align:center;width:33%;">
          <div style="font-size:24px;font-weight:800;color:#a16207;">$${(retainedCents / 100).toFixed(0)}</div>
          <div style="font-size:11px;color:#854d0e;text-transform:uppercase;letter-spacing:0.5px;">Program $ retained</div>
        </div>
      </div>
    </div>

    <p style="margin:0 0 6px;font-size:13px;color:#374151;">
      <strong>${drawnCount}</strong> of your patients had their bloodwork drawn at home this week instead of being lost to no-shows or Quest waiting rooms.
      That's ~<strong>$${(retainedCents / 100).toFixed(0)}</strong> of program revenue retained for your practice (estimated at $${(REVENUE_RETAINED_PER_DRAW_CENTS / 100).toFixed(0)}/patient based on industry phase-transition LTV).
    </p>

    ${drawnList ? `
    <div style="margin:18px 0;padding:14px 18px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">This week's draws</p>
      <ul style="margin:0;padding:0 0 0 4px;list-style:none;">${drawnList}</ul>
    </div>` : ''}

    ${pendingCount > 0 ? `
    <div style="margin:14px 0;padding:14px 18px;background:#fef3c7;border-left:4px solid #d97706;border-radius:6px;">
      <p style="margin:0;font-size:13px;color:#78350f;">
        <strong>${pendingCount} request${pendingCount === 1 ? '' : 's'} still open</strong> — patients haven't booked yet.
        We'll keep reminding them and alert you if any approach their deadline.
      </p>
    </div>` : ''}

    ${expiredCount > 0 ? `
    <div style="margin:14px 0;padding:14px 18px;background:#fee2e2;border-left:4px solid #b91c1c;border-radius:6px;">
      <p style="margin:0;font-size:13px;color:#7f1d1d;">
        <strong>${expiredCount} request${expiredCount === 1 ? '' : 's'} expired</strong> last week.
        Log in to re-send with a new deadline.
      </p>
    </div>` : ''}

    <div style="text-align:center;margin:24px 0 12px;">
      <a href="${PUBLIC_SITE_URL}/dashboard/provider" style="display:inline-block;background:#B91C1C;color:#fff;padding:13px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Open provider portal →</a>
    </div>

    <p style="margin:18px 0 0;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:14px;">
      You're receiving this because your practice is connected to ConveLabs. Reply to this email or call (941) 527-9169 with any questions.
    </p>
  </div>
</div>`;

      try {
        const fd = new FormData();
        fd.append('from', FROM_EMAIL);
        fd.append('to', recipient);
        const subject = drawnCount > 0
          ? `Your week with ConveLabs: ${drawnCount} patient${drawnCount === 1 ? '' : 's'} drawn, $${(retainedCents / 100).toFixed(0)} retained`
          : pendingCount > 0
            ? `Your ConveLabs update: ${pendingCount} pending request${pendingCount === 1 ? '' : 's'}, ${sentCount} sent this week`
            : `Your ConveLabs week in review`;
        fd.append('subject', subject);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });
        if (!mg.ok) {
          const t = await mg.text();
          console.warn(`[weekly-digest] mailgun failed for org ${org.id}: ${mg.status} ${t}`);
          skipped.push({ org_id: org.id, reason: 'mailgun_error', status: mg.status });
          continue;
        }
      } catch (e) {
        console.warn(`[weekly-digest] send error for org ${org.id}:`, e);
        skipped.push({ org_id: org.id, reason: 'send_exception' });
        continue;
      }

      await admin.from('provider_weekly_digest_log').insert({
        organization_id: org.id,
        week_start_date: weekStart,
        recipient_email: recipient,
        drawn_count: drawnCount,
        delivered_count: deliveredCount,
        pending_count: pendingCount,
        retained_revenue_estimate_cents: retainedCents,
        payload: { sent_count: sentCount, expired_count: expiredCount },
      });
      digestsSent++;
    }

    return new Response(JSON.stringify({
      ok: true,
      week_start: weekStart,
      week_end: weekEnd,
      digests_sent: digestsSent,
      orgs_considered: orgs?.length || 0,
      skipped,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[provider-weekly-digest] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
