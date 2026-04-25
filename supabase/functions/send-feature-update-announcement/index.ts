/**
 * SEND-FEATURE-UPDATE-ANNOUNCEMENT
 *
 * Patient broadcast announcing five new features (April 2026):
 *   1. Extended booking hours (Mon-Sun 6 AM – 6 PM)
 *   2. Waitlist with auto-notification when slots open
 *   3. Provider portal lab order uploads → patient SMS to schedule
 *   4. Fasting reminder SMS + email (night before)
 *   5. Patient portal access
 *
 * Modes:
 *   POST { mode: 'test' }    → Sends ONE email to info@convelabs.com only
 *   POST { mode: 'dryrun' }  → Returns the would-send list with no emails sent
 *   POST { mode: 'live', token: '<expected>' } → Live broadcast with full
 *                                                 dedup + unsubscribe + conflict
 *                                                 protection (mirrors
 *                                                 send-patient-announcements-live).
 *
 * Mobile-first responsive HTML email:
 *   - max-width: 600px (Gmail/Outlook standard)
 *   - 16px base body text (no iOS zoom)
 *   - All CTAs are full-width on mobile, auto-width on desktop
 *   - Inline CSS only (most clients strip <style>)
 */

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
const EXPECTED_LIVE_TOKEN = 'feature-update-2026-04-25';
const CAMPAIGN_KEY = 'patient_feature_update_2026_04_25';
const SUBJECT = 'New ConveLabs Hours';

// ─── HTML EMAIL ────────────────────────────────────────────────────────

function buildEmailHtml(opts: { firstName: string; email: string; unsubscribeUrl: string }): string {
  const { firstName, email, unsubscribeUrl } = opts;
  const greeting = firstName ? firstName : 'there';
  const portalUrl = `${PUBLIC_SITE}/login?email=${encodeURIComponent(email)}`;
  const bookUrl = `${PUBLIC_SITE}/book-now`;
  const pricingUrl = `${PUBLIC_SITE}/pricing`;

  // Reusable feature-card factory — every block below uses the same layout
  const card = (opts: {
    badge: string;
    badgeColor: string;
    title: string;
    body: string;
    cta?: { label: string; url: string };
  }) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;margin:0 0 14px;">
      <tr><td style="padding:22px 22px 18px;">
        <span style="display:inline-block;background:${opts.badgeColor};color:#ffffff;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;padding:5px 11px;border-radius:999px;margin:0 0 10px;">${opts.badge}</span>
        <h2 style="margin:6px 0 8px;color:#111827;font-size:19px;font-weight:700;line-height:1.3;">${opts.title}</h2>
        <p style="margin:0 0 ${opts.cta ? '14px' : '0'};color:#374151;font-size:15px;line-height:1.6;">${opts.body}</p>
        ${opts.cta ? `
        <a href="${opts.cta.url}" style="display:inline-block;background:#B91C1C;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:8px;line-height:1.2;">${opts.cta.label} →</a>
        ` : ''}
      </td></tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${SUBJECT}</title>
<!--[if mso]>
<style type="text/css">
table {border-collapse: collapse;}
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<!-- Preheader (hidden but shown in inbox preview) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#faf7f2;opacity:0;">
  Five upgrades to make scheduling easier — extended hours, waitlist alerts, fasting reminders, and your patient portal is live.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;">
  <tr><td align="center" style="padding:24px 12px;">
    <!-- Outer container -->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

      <!-- HERO -->
      <tr><td style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:34px 24px;text-align:center;">
        <p style="margin:0;color:#fecaca;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">ConveLabs · Spring 2026 Update</p>
        <h1 style="margin:10px 0 6px;color:#ffffff;font-size:26px;font-weight:700;line-height:1.25;">Five upgrades to make scheduling labs easier</h1>
        <p style="margin:0;color:#fecaca;font-size:14px;line-height:1.5;">A quick note from Nico — what's new this month and how to use it.</p>
      </td></tr>

      <!-- INTRO -->
      <tr><td style="padding:26px 22px 6px;color:#111827;font-size:15.5px;line-height:1.65;">
        <p style="margin:0 0 12px;">Hi ${greeting},</p>
        <p style="margin:0 0 8px;">We've been building behind the scenes — and the result is five concrete things that make booking a draw with ConveLabs simpler. Here's what changed:</p>
      </td></tr>

      <!-- FEATURE CARDS -->
      <tr><td style="padding:14px 22px 6px;">
        ${card({
          badge: '1 · Extended hours',
          badgeColor: '#B91C1C',
          title: `We're now open Monday – Sunday, 6 AM – 6 PM`,
          body: `No more "we don't book Sundays." If your specimen is heading to AdventHealth, you can book any day of the week, all the way through 6 PM. Saturday? Sunday? Tuesday at 4 PM? Pick the time that fits your life — we come to you.`,
          cta: { label: 'Pick a time', url: bookUrl },
        })}

        ${card({
          badge: '2 · Waitlist alerts',
          badgeColor: '#7F1D1D',
          title: `Slot full? Join the waitlist. We'll text you when it opens.`,
          body: `When the time you want is already booked, tap <strong>Join Waitlist</strong> on that slot. At 5 PM the day before, our system checks if the slot has reopened — and texts and emails you first, before opening it back to the public. You get a one-tap booking link that locks it in.`,
          cta: { label: 'See open dates', url: bookUrl },
        })}

        ${card({
          badge: `3 · Doctor's office uploads your order`,
          badgeColor: '#059669',
          title: 'Your provider sends the lab order — you get a text to schedule',
          body: `Your doctor's office can now upload your lab orders straight from their provider portal. The moment they do, you get an SMS with a personalized link to pick a time within the window your doctor specified. No more chasing paperwork. No more "did you bring the requisition?" Your draw is ready before you even open the door.`,
        })}

        ${card({
          badge: '4 · Fasting reminders',
          badgeColor: '#D97706',
          title: `A text and email the night before — so you don't get caught off guard`,
          body: `If your draw requires fasting, we send you a friendly text <strong>at 8 PM the night before</strong>, plus an email — both spelling out the exact time to stop eating and drinking. No more accidental coffee at 5 AM that ruins the panel. (Quiet hours: we never text you between 9 PM and 8 AM ET.)`,
        })}

        ${card({
          badge: '5 · Your patient portal',
          badgeColor: '#1E40AF',
          title: 'Your portal is live — every visit, receipt, and lab order in one place',
          body: `You now have a full patient portal. Book in 90 seconds, see upcoming + past visits, download receipts, view your lab order files, reschedule with two taps, and add household members so you can manage a spouse's or parent's labs from the same login. Your email is already on file — just click below and you'll set a password.`,
          cta: { label: 'Open my portal', url: portalUrl },
        })}
      </td></tr>

      <!-- BIG PRIMARY CTA -->
      <tr><td style="padding:18px 22px 8px;text-align:center;">
        <a href="${bookUrl}" style="display:inline-block;background:#B91C1C;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:16px 38px;border-radius:12px;line-height:1.2;box-shadow:0 4px 12px rgba(185,28,28,0.25);">Book a draw — picks a time in 90 seconds →</a>
        <p style="margin:14px 0 0;font-size:12.5px;color:#6b7280;">Already have an account? <a href="${portalUrl}" style="color:#B91C1C;font-weight:600;text-decoration:none;">Sign in here</a></p>
      </td></tr>

      <!-- VIP NUDGE -->
      <tr><td style="padding:8px 22px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%);border:2px solid #d97706;border-radius:14px;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:800;">If you draw labs more than twice a year</p>
            <p style="margin:0 0 10px;color:#78350f;font-size:17px;font-weight:700;line-height:1.3;">VIP Founding pricing — locked at $199/yr for life</p>
            <p style="margin:0 0 14px;color:#451a03;font-size:14px;line-height:1.55;">Standard mobile draw is $150 — VIP brings every visit down to <strong>$115</strong>. The membership pays for itself in 2 visits. Founding seats are capped at 50.</p>
            <a href="${pricingUrl}" style="display:inline-block;background:#92400e;color:#ffffff;text-decoration:none;font-weight:700;font-size:13.5px;padding:10px 22px;border-radius:8px;line-height:1.2;">See VIP pricing →</a>
          </td></tr>
        </table>
      </td></tr>

      <!-- GUARANTEE -->
      <tr><td style="padding:14px 22px 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;">
          <tr><td style="padding:14px 18px;">
            <p style="margin:0 0 4px;font-size:13px;color:#7f1d1d;font-weight:700;">Our recollection guarantee — in writing</p>
            <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.55;">If <strong>ConveLabs</strong> caused the issue, recollection is <strong>100% free</strong>. If the <strong>reference lab</strong> caused it, recollection is <strong>50% off</strong>.</p>
          </td></tr>
        </table>
      </td></tr>

      <!-- SIGN-OFF -->
      <tr><td style="padding:18px 22px 26px;color:#111827;font-size:15px;line-height:1.65;">
        <p style="margin:0 0 10px;">Questions? Email <a href="mailto:info@convelabs.com" style="color:#B91C1C;font-weight:600;text-decoration:none;">info@convelabs.com</a> or text <a href="tel:+19415279169" style="color:#B91C1C;font-weight:600;text-decoration:none;">(941) 527-9169</a>. I read every message.</p>
        <p style="margin:14px 0 0;">With gratitude,<br/>
        <strong>Nicodemme &ldquo;Nico&rdquo; Jean-Baptiste</strong><br/>
        <span style="color:#6b7280;font-size:13px;">Founder, ConveLabs Concierge Lab Services</span></p>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#faf7f2;padding:18px 22px 22px;border-top:1px solid #e7e2d8;text-align:center;">
        <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;line-height:1.6;">
          You're receiving this because you have an active ConveLabs account.<br/>
          ConveLabs Concierge Lab Services · Orlando, FL · (941) 527-9169
        </p>
        <p style="margin:8px 0 0;font-size:11px;">
          <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from marketing emails</a>
          <span style="color:#d1d5db;"> · </span>
          <span style="color:#9ca3af;">transactional appointment notifications continue</span>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── MAILGUN SEND ──────────────────────────────────────────────────────

async function sendOne(toEmail: string, firstName: string, unsubscribeUrl: string) {
  const html = buildEmailHtml({ firstName, email: toEmail, unsubscribeUrl });
  const fd = new FormData();
  fd.append('from', `Nicodemme Jean-Baptiste <nico@${MAILGUN_DOMAIN}>`);
  fd.append('h:Reply-To', 'info@convelabs.com');
  fd.append('to', toEmail);
  fd.append('subject', SUBJECT);
  fd.append('html', html);
  fd.append('o:tag', 'patient_feature_update_2026_04_25');
  fd.append('o:tracking-clicks', 'yes');
  const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  const bodyText = await resp.text().catch(() => '');
  if (!resp.ok) throw new Error(`mailgun ${resp.status}: ${bodyText.substring(0, 300)}`);
  let mailgunId: string | null = null;
  try { mailgunId = (JSON.parse(bodyText)?.id || null); } catch {}
  return { ok: true, mailgunId };
}

// ─── EMAIL SAFETY HELPERS (mirrors send-patient-announcements-live) ────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function isWellFormedEmail(e: string): boolean { return EMAIL_RE.test(e.trim()); }

function isInternalOrTestEmail(raw: string): boolean {
  const lower = raw.toLowerCase().trim();
  if (lower.endsWith('@convelabs.com')) return true;
  if (lower.endsWith('@example.com') || lower.endsWith('@test.com') || lower.endsWith('@localhost')) return true;
  if (lower.includes('+test')) return true;
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

// ─── HANDLER ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!MAILGUN_API_KEY) {
      return new Response(JSON.stringify({ error: 'MAILGUN_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json().catch(() => ({}));
    const mode: string = String(body?.mode || 'test').toLowerCase();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ─── TEST MODE: send ONE email to info@convelabs.com only ─────────
    if (mode === 'test') {
      const testEmail = body?.testEmail || 'info@convelabs.com';
      // Pull the real first_name from tenant_patients so the test preview
      // shows the same personalization patients will receive in live mode.
      let firstName = body?.firstName || '';
      if (!firstName) {
        const { data } = await supabase.from('tenant_patients').select('first_name').ilike('email', testEmail).limit(1).maybeSingle();
        firstName = ((data as any)?.first_name || '').trim();
      }
      const unsubscribeUrl = `mailto:info@convelabs.com?subject=${encodeURIComponent('Unsubscribe me')}&body=${encodeURIComponent('Please remove ' + testEmail + ' from ConveLabs marketing emails.')}`;
      const result = await sendOne(testEmail, firstName, unsubscribeUrl);
      return new Response(JSON.stringify({
        success: true,
        mode: 'test',
        sent_to: testEmail,
        first_name_used: firstName || '(none — used "there" greeting)',
        mailgun_id: result.mailgunId,
        subject: SUBJECT,
        note: 'Check your inbox. If it looks good, fire mode=live with the live token.',
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── DRYRUN + LIVE — pull patient list ───────────────────────────
    if (mode !== 'dryrun' && mode !== 'live') {
      return new Response(JSON.stringify({ error: 'mode must be test, dryrun, or live' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (mode === 'live' && body?.token !== EXPECTED_LIVE_TOKEN) {
      return new Response(JSON.stringify({ error: 'live mode requires the correct token' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: patients, error } = await supabase
      .from('tenant_patients')
      .select('id, first_name, last_name, email, user_id, updated_at')
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('email', 'is', null)
      .neq('email', '');
    if (error) throw error;

    const [{ data: alreadySent }, { data: unsubs }] = await Promise.all([
      supabase.from('campaign_sends').select('recipient_email').eq('campaign_key', CAMPAIGN_KEY),
      supabase.from('email_unsubscribes').select('email'),
    ]);
    const alreadySentSet = new Set<string>((alreadySent || []).map((r: any) => String(r.recipient_email).toLowerCase()));
    const unsubSet = new Set<string>((unsubs || []).map((r: any) => String(r.email).toLowerCase()));

    // Group by lowercase email; resolve conflicts
    const byEmail = new Map<string, any[]>();
    const filtered: Array<{ email: string; reason: string }> = [];
    for (const p of (patients || [])) {
      const raw = String(p.email || '').trim();
      const key = raw.toLowerCase();
      if (!raw) continue;
      if (!isWellFormedEmail(raw)) { filtered.push({ email: raw, reason: 'malformed_email' }); continue; }
      if (isInternalOrTestEmail(raw)) { filtered.push({ email: raw, reason: 'internal_or_test_email' }); continue; }
      const arr = byEmail.get(key) || [];
      arr.push(p);
      byEmail.set(key, arr);
    }

    interface QueueItem { email: string; firstName: string; patient_id: string; row_count: number }
    const queue: QueueItem[] = [];
    const conflicts: any[] = [];
    for (const [email, rows] of byEmail.entries()) {
      if (rows.length === 1) {
        queue.push({ email, firstName: (rows[0].first_name || '').trim(), patient_id: rows[0].id, row_count: 1 });
        continue;
      }
      const distinctNames = new Set(rows.map(r => (r.first_name || '').trim().toLowerCase()).filter(Boolean));
      if (distinctNames.size > 1) {
        conflicts.push({ email, reason: 'different_first_names', row_count: rows.length, candidate_names: Array.from(distinctNames), patient_ids: rows.map(r => r.id) });
        continue;
      }
      const best = pickCanonicalRow(rows);
      queue.push({ email, firstName: (best.first_name || '').trim(), patient_id: best.id, row_count: rows.length });
    }

    const sendQueue = queue.filter(q => !alreadySentSet.has(q.email.toLowerCase()) && !unsubSet.has(q.email.toLowerCase()));

    if (mode === 'dryrun') {
      return new Response(JSON.stringify({
        success: true,
        mode: 'dryrun',
        campaign_key: CAMPAIGN_KEY,
        totals: {
          patient_rows: patients?.length || 0,
          unique_emails: byEmail.size,
          filtered_out: filtered.length,
          conflicts: conflicts.length,
          already_sent: queue.length - sendQueue.length - queue.filter(q => unsubSet.has(q.email.toLowerCase())).length,
          unsubscribed: queue.filter(q => unsubSet.has(q.email.toLowerCase())).length,
          would_send: sendQueue.length,
        },
        queue_sample: sendQueue.slice(0, 30).map(q => ({ email: q.email, firstName: q.firstName })),
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // LIVE — send + record campaign_sends row per success
    let sent = 0;
    let failed = 0;
    const failures: any[] = [];
    for (const q of sendQueue) {
      const unsubscribeUrl = `mailto:info@convelabs.com?subject=${encodeURIComponent('Unsubscribe me')}&body=${encodeURIComponent('Please remove ' + q.email + ' from ConveLabs marketing emails.')}`;
      try {
        const r = await sendOne(q.email, q.firstName, unsubscribeUrl);
        await supabase.from('campaign_sends').insert({
          campaign_key: CAMPAIGN_KEY,
          recipient_email: q.email.toLowerCase(),
          patient_id: q.patient_id,
          mailgun_id: r.mailgunId,
        });
        sent++;
      } catch (e: any) {
        failed++;
        failures.push({ email: q.email, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      mode: 'live',
      campaign_key: CAMPAIGN_KEY,
      sent,
      failed,
      conflicts: conflicts.length,
      filtered: filtered.length,
      failures: failures.slice(0, 20),
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[send-feature-update-announcement]', e);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
