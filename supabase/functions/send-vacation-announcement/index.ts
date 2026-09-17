import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

const EXPECTED_LIVE_TOKEN = 'convelabs-vacation-2026-08-20';
const CAMPAIGN_KEY = 'convelabs_vacation_notice_2026_08_31';
const SUBJECT = 'A quick scheduling note from Nico before Labor Day';
const VACATION_START = '2026-08-31';
const VACATION_END = '2026-09-07';
const RETURN_DATE = '2026-09-08';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isWellFormedEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

function isInternalOrTestEmail(raw: string): boolean {
  const lower = raw.toLowerCase().trim();
  if (!lower) return true;
  if (lower === 'info@convelabs.com') return true;
  if (lower.endsWith('@convelabs.com')) return true;
  if (lower.endsWith('@mg.convelabs.com')) return true;
  if (lower.endsWith('@example.com') || lower.endsWith('@test.com') || lower.endsWith('@localhost')) return true;
  if (lower.includes('+test') || lower.includes('+dev')) return true;
  return false;
}

function pickCanonicalRow(rows: any[]): any {
  return [...rows].sort((a, b) => {
    const aHasUser = !!a.user_id;
    const bHasUser = !!b.user_id;
    if (aHasUser !== bHasUser) return aHasUser ? -1 : 1;
    const aName = (a.first_name || '').trim();
    const bName = (b.first_name || '').trim();
    if (!!aName !== !!bName) return aName ? -1 : 1;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  })[0];
}

function fmtHumanDate(raw: string): string {
  const d = new Date(`${raw.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function compareDateOnly(a: string, b: string): number {
  return a.slice(0, 10).localeCompare(b.slice(0, 10));
}

function buildAppointmentPanel(nextAppointment: { appointment_date: string; appointment_time?: string | null } | null): string {
  if (!nextAppointment?.appointment_date) {
    return `
      <div style="background:#fffaf0;border:1px solid #f5d089;border-radius:14px;padding:18px 18px 16px;margin:18px 0;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#9a6700;font-weight:800;">Your calendar</p>
        <p style="margin:0;color:#5b3a00;font-size:14px;line-height:1.6;">You do not currently have a visit on the books. If you want to be seen before our break, I’d recommend reserving your slot before <strong>Monday, August 31, 2026</strong>.</p>
      </div>`;
  }

  const dateOnly = nextAppointment.appointment_date.slice(0, 10);
  const dateLabel = fmtHumanDate(dateOnly);
  const timeLabel = nextAppointment.appointment_time ? ` at ${nextAppointment.appointment_time}` : '';

  if (compareDateOnly(dateOnly, VACATION_START) < 0) {
    return `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:14px;padding:18px 18px 16px;margin:18px 0;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#166534;font-weight:800;">Your calendar</p>
        <p style="margin:0;color:#14532d;font-size:14px;line-height:1.6;">You’re already scheduled for <strong>${dateLabel}${timeLabel}</strong>, so you’re all set before our break.</p>
      </div>`;
  }

  if (compareDateOnly(dateOnly, VACATION_END) <= 0) {
    return `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:18px 18px 16px;margin:18px 0;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#991b1b;font-weight:800;">Your calendar</p>
        <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;">You currently have a visit on <strong>${dateLabel}${timeLabel}</strong>, which falls inside our vacation window. We’ll personally review and confirm that plan with you before <strong>Monday, August 31, 2026</strong>.</p>
      </div>`;
  }

  return `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:18px 18px 16px;margin:18px 0;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#1d4ed8;font-weight:800;">Your calendar</p>
      <p style="margin:0;color:#1e3a8a;font-size:14px;line-height:1.6;">You’re already scheduled for <strong>${dateLabel}${timeLabel}</strong>, which is after we return on <strong>Tuesday, September 8, 2026</strong>.</p>
    </div>`;
}

function buildEmailHtml(opts: {
  firstName: string;
  email: string;
  unsubscribeUrl: string;
  nextAppointment: { appointment_date: string; appointment_time?: string | null } | null;
  proofLabel?: string | null;
}): string {
  const greeting = opts.firstName || 'there';
  const bookUrl = `${PUBLIC_SITE}/book-now`;
  const portalUrl = `${PUBLIC_SITE}/login?email=${encodeURIComponent(opts.email)}`;
  const appointmentPanel = buildAppointmentPanel(opts.nextAppointment);
  const proofRibbon = opts.proofLabel ? `
    <div style="background:#111827;color:#f9fafb;padding:10px 16px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.4px;">
      ${opts.proofLabel}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:#f8f4ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f8f4ee;">
    ConveLabs will be away from Monday, August 31, 2026 through Monday, September 7, 2026, and returns Tuesday, September 8, 2026.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f4ee;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(64,35,15,0.10);">
          ${proofRibbon}
          <tr>
            <td style="background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 54%,#d97706 100%);padding:38px 28px 32px;text-align:center;">
              <p style="margin:0;color:#fde68a;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Concierge Service Notice</p>
              <h1 style="margin:12px 0 8px;color:#ffffff;font-size:30px;line-height:1.2;font-weight:700;">A quick note before we step away for Labor Day week</h1>
              <p style="margin:0;color:#fee2e2;font-size:14px;line-height:1.6;">From Monday, August 31, 2026 through Monday, September 7, 2026, ConveLabs will be on vacation. We return Tuesday, September 8, 2026.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:30px 28px 12px;color:#111827;font-size:15px;line-height:1.75;">
              <p style="margin:0 0 14px;">Hi ${greeting},</p>
              <p style="margin:0 0 14px;">I wanted to send this personally so nothing feels last-minute or impersonal. ConveLabs will be away from <strong>Monday, August 31, 2026 through Monday, September 7, 2026</strong>, and we’ll be fully back on <strong>Tuesday, September 8, 2026</strong>.</p>
              <p style="margin:0 0 14px;">If you know you’ll need a draw before we leave, please book before <strong>Monday, August 31, 2026</strong>. If you reach out while we’re away, the first full response day will be <strong>Tuesday, September 8, 2026</strong>.</p>

              ${appointmentPanel}

              <div style="background:linear-gradient(135deg,#fff7ed 0%,#fff1f2 100%);border:1px solid #fed7aa;border-radius:16px;padding:22px 20px;margin:22px 0;">
                <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.8px;color:#9a3412;font-weight:800;">What stays easy</p>
                <h2 style="margin:0 0 10px;color:#7c2d12;font-size:22px;line-height:1.3;font-weight:700;">Your experience should still feel calm, polished, and personal.</h2>
                <ul style="margin:0;padding-left:20px;color:#7c2d12;font-size:14px;line-height:1.75;">
                  <li>Your portal stays open, so you can still review past visits, receipts, and saved details.</li>
                  <li>If you want priority before the break, book now and we’ll lock your slot while availability is still open.</li>
                  <li>Once we return on <strong>Tuesday, September 8, 2026</strong>, normal scheduling resumes immediately.</li>
                </ul>
              </div>

              <div style="background:#111827;border-radius:18px;padding:22px 22px 20px;margin:24px 0 20px;color:#f9fafb;">
                <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.8px;color:#fcd34d;font-weight:800;">Before we go</p>
                <h3 style="margin:0 0 10px;font-size:24px;line-height:1.3;font-weight:700;">Reserve your visit before the calendar gets tight.</h3>
                <p style="margin:0 0 16px;color:#e5e7eb;font-size:14px;line-height:1.7;">The best time to secure a visit is before the Labor Day week pause begins. If you’ve been meaning to get it handled, this is the cleanest window to do it.</p>
                <div style="text-align:center;">
                  <a href="${bookUrl}" style="display:inline-block;background:#fbbf24;color:#111827;text-decoration:none;font-weight:800;font-size:15px;padding:14px 30px;border-radius:10px;">Reserve my visit before August 31 →</a>
                </div>
              </div>

              <div style="text-align:center;margin:22px 0 4px;">
                <a href="${portalUrl}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:13px 26px;border-radius:10px;">Open my portal</a>
              </div>
              <p style="margin:12px 0 0;text-align:center;font-size:12px;color:#6b7280;">Need anything urgent before the break? Email <a href="mailto:info@convelabs.com" style="color:#b91c1c;text-decoration:none;font-weight:700;">info@convelabs.com</a>.</p>

              <p style="margin:22px 0 0;">With gratitude,<br><strong>Nicodemme “Nico” Jean-Baptiste</strong><br><span style="color:#6b7280;font-size:13px;">Founder, ConveLabs</span></p>
            </td>
          </tr>

          <tr>
            <td style="background:#faf7f2;border-top:1px solid #eee4d5;padding:18px 24px 22px;text-align:center;">
              <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;line-height:1.65;">
                You’re receiving this because you have a ConveLabs patient record.<br>
                ConveLabs · Orlando, Florida · (941) 527-9169
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">
                <a href="${opts.unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from general announcements</a>
                <span style="color:#d1d5db;"> · </span>
                appointment notifications continue
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendOne(toEmail: string, html: string) {
  const fd = new FormData();
  fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
  fd.append('h:Reply-To', 'info@convelabs.com');
  fd.append('to', toEmail);
  fd.append('subject', SUBJECT);
  fd.append('html', html);
  fd.append('o:tracking-clicks', 'yes');
  const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  const bodyText = await resp.text().catch(() => '');
  if (!resp.ok) throw new Error(`mailgun ${resp.status}: ${bodyText.substring(0, 300)}`);
  let mailgunId: string | null = null;
  try { mailgunId = JSON.parse(bodyText)?.id || null; } catch { /* noop */ }
  return { ok: true, mailgunId };
}

interface QueueItem {
  email: string;
  firstName: string;
  patientId: string;
  rowCount: number;
  nextAppointment: { appointment_date: string; appointment_time?: string | null } | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ error: 'MAILGUN_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || 'proof').toLowerCase();
    const proofEmail = String(body?.proofEmail || 'info@convelabs.com').trim().toLowerCase();

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: patients, error: patientErr }, { data: futureAppts, error: apptErr }, { data: alreadySent }, { data: unsubs }] = await Promise.all([
      supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, email, user_id, updated_at')
        .eq('is_active', true)
        .is('deleted_at', null)
        .not('email', 'is', null)
        .neq('email', ''),
      supabase
        .from('appointments')
        .select('patient_email, appointment_date, appointment_time, status')
        .gte('appointment_date', today)
        .neq('status', 'cancelled')
        .not('patient_email', 'is', null),
      supabase.from('campaign_sends').select('recipient_email').eq('campaign_key', CAMPAIGN_KEY),
      supabase.from('email_unsubscribes').select('email'),
    ]);

    if (patientErr) throw patientErr;
    if (apptErr) throw apptErr;

    const nextByEmail = new Map<string, { appointment_date: string; appointment_time?: string | null }>();
    for (const row of (futureAppts || []) as any[]) {
      const email = String(row.patient_email || '').trim().toLowerCase();
      if (!email) continue;
      const current = nextByEmail.get(email);
      if (!current || compareDateOnly(String(row.appointment_date), current.appointment_date) < 0) {
        nextByEmail.set(email, {
          appointment_date: String(row.appointment_date).slice(0, 10),
          appointment_time: row.appointment_time || null,
        });
      }
    }

    const alreadySentSet = new Set<string>((alreadySent || []).map((r: any) => String(r.recipient_email).toLowerCase()));
    const unsubSet = new Set<string>((unsubs || []).map((r: any) => String(r.email).toLowerCase()));

    const byEmail = new Map<string, any[]>();
    const filtered: Array<{ email: string; reason: string }> = [];

    for (const p of (patients || []) as any[]) {
      const raw = String(p.email || '').trim();
      const key = raw.toLowerCase();
      if (!raw) continue;
      if (!isWellFormedEmail(raw)) {
        filtered.push({ email: raw, reason: 'malformed_email' });
        continue;
      }
      if (isInternalOrTestEmail(raw)) {
        filtered.push({ email: raw, reason: 'internal_or_test_email' });
        continue;
      }
      const arr = byEmail.get(key) || [];
      arr.push(p);
      byEmail.set(key, arr);
    }

    const queue: QueueItem[] = [];
    const conflicts: Array<{ email: string; candidate_names: string[]; patient_ids: string[] }> = [];

    for (const [email, rows] of byEmail.entries()) {
      if (rows.length === 1) {
        const row = rows[0];
        queue.push({
          email,
          firstName: (row.first_name || '').trim(),
          patientId: row.id,
          rowCount: 1,
          nextAppointment: nextByEmail.get(email) || null,
        });
        continue;
      }

      const distinctNames = new Set(rows.map(r => (r.first_name || '').trim().toLowerCase()).filter(Boolean));
      if (distinctNames.size > 1) {
        conflicts.push({
          email,
          candidate_names: Array.from(distinctNames),
          patient_ids: rows.map(r => r.id),
        });
        continue;
      }

      const best = pickCanonicalRow(rows);
      queue.push({
        email,
        firstName: (best.first_name || '').trim(),
        patientId: best.id,
        rowCount: rows.length,
        nextAppointment: nextByEmail.get(email) || null,
      });
    }

    const sendQueue = queue.filter(q => !alreadySentSet.has(q.email) && !unsubSet.has(q.email));

    if (mode === 'dryrun') {
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        campaign_key: CAMPAIGN_KEY,
        totals: {
          patient_rows_considered: patients?.length || 0,
          unique_email_groups: byEmail.size,
          filtered_out: filtered.length,
          conflicts_blocked: conflicts.length,
          skipped_already_sent: queue.filter(q => alreadySentSet.has(q.email)).length,
          skipped_unsubscribed: queue.filter(q => unsubSet.has(q.email)).length,
          would_send: sendQueue.length,
        },
        sample: sendQueue.slice(0, 25).map(q => ({
          email: q.email,
          firstName: q.firstName,
          nextAppointment: q.nextAppointment,
        })),
        conflicts,
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (mode === 'proof') {
      const sample = sendQueue[0] || {
        email: 'sample@convelabs.com',
        firstName: 'Avery',
        patientId: 'proof',
        rowCount: 1,
        nextAppointment: null,
      };
      const unsubscribeUrl = `${PUBLIC_SITE}/unsubscribe?email=${encodeURIComponent(sample.email)}&campaign=${encodeURIComponent(CAMPAIGN_KEY)}`;
      const html = buildEmailHtml({
        firstName: sample.firstName || 'Avery',
        email: sample.email,
        unsubscribeUrl,
        nextAppointment: sample.nextAppointment,
        proofLabel: `Proof only · would personalize for ${sample.firstName || 'Avery'} <${sample.email}>`,
      });
      const result = await sendOne(proofEmail, html);
      return new Response(JSON.stringify({
        success: true,
        mode: 'proof',
        proof_sent_to: proofEmail,
        sample_recipient: { email: sample.email, firstName: sample.firstName, nextAppointment: sample.nextAppointment },
        mailgun_id: result.mailgunId,
        totals: { would_send: sendQueue.length, conflicts_blocked: conflicts.length, filtered_out: filtered.length },
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (mode !== 'live' || body?.token !== EXPECTED_LIVE_TOKEN) {
      return new Response(JSON.stringify({ error: 'invalid_mode_or_token' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stats = { eligible: sendQueue.length, sent: 0, failed: 0, skipped_race: 0 };
    const failedSamples: Array<{ email: string; err: string }> = [];

    for (const item of sendQueue) {
      const claim = await supabase
        .from('campaign_sends')
        .insert({
          campaign_key: CAMPAIGN_KEY,
          recipient_email: item.email,
          status: 'sending',
          metadata: {
            patient_id: item.patientId,
            first_name: item.firstName || null,
            source_row_count: item.rowCount,
          },
        })
        .select('id')
        .maybeSingle();

      if (claim.error) {
        const code = String((claim.error as any).code || '');
        const msg = String((claim.error as any).message || '');
        if (code === '23505' || /duplicate|unique/i.test(msg)) {
          stats.skipped_race++;
          continue;
        }
        stats.failed++;
        if (failedSamples.length < 10) failedSamples.push({ email: item.email, err: `claim_failed:${msg}` });
        continue;
      }

      try {
        const unsubscribeUrl = `${PUBLIC_SITE}/unsubscribe?email=${encodeURIComponent(item.email)}&campaign=${encodeURIComponent(CAMPAIGN_KEY)}`;
        const html = buildEmailHtml({
          firstName: item.firstName || 'there',
          email: item.email,
          unsubscribeUrl,
          nextAppointment: item.nextAppointment,
        });
        const result = await sendOne(item.email, html);
        await supabase.from('campaign_sends').update({ status: 'sent', mailgun_id: result.mailgunId }).eq('id', claim.data!.id);
        stats.sent++;
      } catch (e: any) {
        await supabase.from('campaign_sends').update({
          status: 'failed',
          metadata: {
            patient_id: item.patientId,
            first_name: item.firstName || null,
            error: String(e?.message || e).slice(0, 250),
          },
        }).eq('id', claim.data!.id);
        stats.failed++;
        if (failedSamples.length < 10) failedSamples.push({ email: item.email, err: String(e?.message || e).slice(0, 250) });
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return new Response(JSON.stringify({
      success: true,
      mode: 'live',
      campaign_key: CAMPAIGN_KEY,
      totals: {
        eligible: stats.eligible,
        sent: stats.sent,
        failed: stats.failed,
        skipped_race: stats.skipped_race,
        conflicts_blocked: conflicts.length,
      },
      failed_samples: failedSamples,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
