/**
 * FLAG-OVERDUE-LAB-PATIENTS
 *
 * Daily cron. Finds tenant_patients whose lab_reminder_deadline_at has
 * passed and who haven't had a completed visit in the last 7 days, and:
 *
 *   1. Stamps overdue_flagged_at on the patient row
 *   2. Emails the org's contact with the list of overdue patients so
 *      their team can reach out (the no-show killer Hormozi promise)
 *   3. Logs to activity_alerts_log for audit
 *
 * Idempotent via overdue_flagged_at — once flagged, we won't re-email
 * until the provider resets the cadence (which clears the flag).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function sendOrgOverdueDigest(org: any, patients: any[]) {
  const recipient = org.contact_email || org.billing_email;
  if (!recipient || !MAILGUN_API_KEY) return false;

  const rows = patients.map(p => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;">${p.first_name || ''} ${p.last_name || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">${p.phone || p.email || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#B91C1C;font-weight:600;">Overdue</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
      <tr><td style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);padding:32px 28px;text-align:center;color:#fff;">
        <div style="font-family:Georgia,serif;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#fecaca;">ConveLabs</div>
        <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:24px;font-weight:normal;line-height:1.3;">${patients.length} patient${patients.length === 1 ? '' : 's'} overdue — please follow up</h1>
      </td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;color:#111827;font-size:15px;line-height:1.7;">Hi ${org.contact_name ? 'Dr. ' + String(org.contact_name).split(' ').slice(-1)[0] : 'team'},</p>
        <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">These patients from <strong>${org.name}</strong> have passed their lab reminder deadline without scheduling a draw. Your team can reach out or reset the deadline from the ConveLabs provider dashboard.</p>
        <table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:12px 0;">
          <thead><tr>
            <th style="padding:10px 12px;background:#faf7f2;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Patient</th>
            <th style="padding:10px 12px;background:#faf7f2;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Contact</th>
            <th style="padding:10px 12px;background:#faf7f2;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="text-align:center;margin:24px 0 8px;">
          <a href="https://www.convelabs.com/dashboard/provider" style="display:inline-block;background:#B91C1C;color:#fff;padding:13px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Open provider dashboard →</a>
        </div>
      </td></tr>
      <tr><td style="background:#faf7f2;padding:18px;text-align:center;border-top:1px solid #f3f4f6;">
        <p style="margin:0;color:#9ca3af;font-size:11px;">ConveLabs · HIPAA compliant · (941) 527-9169</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

  const fd = new FormData();
  fd.append('from', `ConveLabs <nico@${MAILGUN_DOMAIN}>`);
  fd.append('h:Reply-To', 'info@convelabs.com');
  fd.append('to', recipient);
  fd.append('subject', `⚠ ${patients.length} overdue lab${patients.length === 1 ? '' : 's'} — ${org.name}`);
  fd.append('html', html);
  fd.append('o:tag', 'overdue_lab_digest');
  try {
    const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: fd,
    });
    return res.ok;
  } catch (e) {
    console.error('[overdue-digest] mailgun error', e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Candidates: deadline passed + not yet flagged + has an org
    const { data: candidates } = await admin
      .from('tenant_patients')
      .select('id, first_name, last_name, email, phone, organization_id, lab_reminder_deadline_at')
      .not('organization_id', 'is', null)
      .not('lab_reminder_deadline_at', 'is', null)
      .lt('lab_reminder_deadline_at', new Date().toISOString())
      .is('overdue_flagged_at', null)
      .limit(500);

    if (!candidates?.length) {
      return new Response(JSON.stringify({ ok: true, flagged: 0, reason: 'no_candidates' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Exclude any who've had a completed visit in last 7 days (counts as "done")
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const candidateNames = candidates.map((c: any) =>
      `${(c.first_name || '').toLowerCase()} ${(c.last_name || '').toLowerCase()}`.trim()
    );

    const { data: recentVisits } = await admin
      .from('appointments')
      .select('patient_name, organization_id')
      .in('status', ['completed', 'specimen_delivered'])
      .gte('appointment_date', sevenDaysAgo);

    const recentSet = new Set(
      (recentVisits || []).map((v: any) =>
        `${(v.patient_name || '').toLowerCase()}::${v.organization_id}`
      )
    );

    const stillOverdue = candidates.filter((c: any) => {
      const key = `${(c.first_name || '').toLowerCase()} ${(c.last_name || '').toLowerCase()}::${c.organization_id}`;
      return !recentSet.has(key);
    });

    if (stillOverdue.length === 0) {
      return new Response(JSON.stringify({ ok: true, flagged: 0, reason: 'all_recent_visits' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Stamp overdue_flagged_at on each
    const ids = stillOverdue.map((c: any) => c.id);
    await admin.from('tenant_patients').update({
      overdue_flagged_at: new Date().toISOString(),
    } as any).in('id', ids);

    // 4. Group by org, email the digest
    const byOrg = new Map<string, any[]>();
    for (const p of stillOverdue as any[]) {
      const list = byOrg.get(p.organization_id) || [];
      list.push(p);
      byOrg.set(p.organization_id, list);
    }

    const { data: orgs } = await admin
      .from('organizations')
      .select('id, name, contact_name, contact_email, billing_email')
      .in('id', Array.from(byOrg.keys()));

    let emailed = 0;
    for (const org of (orgs || []) as any[]) {
      const patients = byOrg.get(org.id) || [];
      const ok = await sendOrgOverdueDigest(org, patients);
      if (ok) emailed++;
    }

    // 5. Audit log
    await admin.from('activity_alerts_log').insert({
      alert_type: 'overdue_lab_sweep',
      fired_at: new Date().toISOString(),
      metadata: { flagged_count: stillOverdue.length, orgs_emailed: emailed },
    } as any).then(() => {}, () => {});

    return new Response(JSON.stringify({
      ok: true,
      flagged: stillOverdue.length,
      orgs_emailed: emailed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[flag-overdue-lab-patients]', e);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
