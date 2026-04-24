// activity-monitor — real-time activity alerter (every 5 minutes via cron)
//
// Checks 6 signal tables for new rows since the last poll and fires an
// SMS alert to OWNER_PHONE if anything happened:
//
//   1. PURCHASES      stripe_qb_sync_log (successful Stripe charges)
//   2. INQUIRIES      provider_partnership_inquiries (new partner leads)
//   3. BOOKINGS       appointments (new scheduled visits)
//   4. MEMBERSHIPS    user_memberships (new subscriptions)
//   5. FOUNDING       user_memberships with founding_member_number just assigned
//   6. ERRORS         error_logs where resolved=false (high priority)
//
// Watermark strategy: reads the most recent fired_at from
// activity_alerts_log as "last check time". New rows = rows created
// after that timestamp. On first run, falls back to (now - 5 min).
//
// Quiet hours: 9 PM – 8 AM ET blocks SMS. Errors STILL go through
// (they're operational, not marketing). Other alerts are deferred
// and logged — the next run after 8 AM consolidates and sends.
//
// If no activity: silently records a heartbeat row (alert_type=
// 'heartbeat', channel='none') so the watermark advances. Admin can
// query activity_alerts_log to see the poller is alive.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
const TWILIO_MSG_SERVICE = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || '';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const OWNER_EMAIL = 'info@convelabs.com';

// ── Quiet hours: 9 PM – 8 AM ET (per Hormozi guardrail) ─────────
function isQuietHours(): boolean {
  const now = new Date();
  // Convert to ET roughly (EST -5 or EDT -4). Using -4 April-Nov.
  const month = now.getUTCMonth() + 1;
  const etOffset = (month >= 3 && month <= 11) ? -4 : -5;
  const etHour = (now.getUTCHours() + etOffset + 24) % 24;
  return etHour >= 21 || etHour < 8;
}

function nowIso(): string { return new Date().toISOString(); }

async function sendSMS(body: string): Promise<{ ok: boolean; sid: string | null; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN) return { ok: false, sid: null, error: 'twilio_not_configured' };
  const to = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('Body', body);
  if (TWILIO_MSG_SERVICE) params.append('MessagingServiceSid', TWILIO_MSG_SERVICE);
  else params.append('From', TWILIO_FROM);

  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, sid: null, error: (json as any)?.message || `http ${resp.status}` };
  return { ok: true, sid: (json as any)?.sid || null };
}

async function sendEmail(subject: string, html: string): Promise<string | null> {
  if (!MAILGUN_API_KEY) return null;
  const fd = new FormData();
  fd.append('from', `ConveLabs Activity Monitor <noreply@${MAILGUN_DOMAIN}>`);
  fd.append('to', OWNER_EMAIL);
  fd.append('subject', subject);
  fd.append('html', html);
  fd.append('o:tracking-clicks', 'no');
  const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body: fd,
  });
  if (!resp.ok) return null;
  const body = await resp.text().catch(() => '');
  try { return JSON.parse(body).id || null; } catch { return null; }
}

// ── CHECKOUT LIVENESS PROBE ─────────────────────────────────────────
// Hormozi principle: "Money moves through a small number of doors. Watch
// those doors like a hawk." After the 503 boot-error on create-checkout-
// session that killed payments for hours before a patient reported it,
// we probe every checkout fn every 5 minutes. Any 5xx = immediate SMS,
// bypasses quiet hours (errors always fire).
const CHECKOUT_FUNCTIONS = [
  'create-checkout-session',
  'create-appointment-checkout',
  'create-subscription-checkout',
  'create-addon-checkout',
  'create-bundle-checkout',
  'create-credit-pack-checkout',
];

// Single probe — OPTIONS preflight. Cheap, doesn't trigger real work,
// but still requires the module to boot. Returns null on success,
// a ":CODE" / ":timeout" suffix on failure.
async function probeOnce(name: string, timeoutMs: number): Promise<string | null> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://www.convelabs.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.status >= 500) return `${name}:${resp.status}`;
    return null;
  } catch {
    return `${name}:timeout`;
  }
}

async function probeCheckoutFunctions(): Promise<{ down: string[]; summary: string | null }> {
  const down: string[] = [];
  // Hysteresis: a single slow cold-start on Supabase edge fns (occasionally
  // 6-8s) was triggering false "CHECKOUT DOWN" pages. Require two consecutive
  // failures with a 2s breather between attempts. First try uses 6s; retry
  // uses 8s (functions are warm by then).
  await Promise.all(CHECKOUT_FUNCTIONS.map(async (name) => {
    const first = await probeOnce(name, 6000);
    if (!first) return; // healthy on first try
    // Wait 2s then retry once — cold-start should be done
    await new Promise(r => setTimeout(r, 2000));
    const second = await probeOnce(name, 8000);
    if (second) down.push(second);
  }));
  return {
    down,
    summary: down.length > 0 ? `CHECKOUT DOWN: ${down.join(', ')}` : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── CHECK CHECKOUT LIVENESS FIRST (P0 signal) ───────────────
    // Run the probe in parallel with the other queries below, but if
    // anything is down, we alert immediately regardless of other events.
    const checkoutProbePromise = probeCheckoutFunctions();

    // Watermark: time of the most recent alert (skip heartbeat rows so
    // silent intervals don't advance the cursor past unseen activity).
    const { data: lastRow } = await supabase
      .from('activity_alerts_log')
      .select('fired_at')
      .neq('alert_type', 'heartbeat')
      .order('fired_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Look at least 5 min back, max 6 hours (prevents flood after long
    // outage — cap the lookback window so we don't SMS 200 events at once)
    const defaultLookback = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const maxLookback = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    let since = (lastRow as any)?.fired_at || defaultLookback;
    if (since < maxLookback) since = maxLookback;

    // ── QUERY EACH SIGNAL ───────────────────────────────────────
    const [purchases, inquiries, bookings, memberships, foundingClaims, errors] = await Promise.all([
      // 1. Successful Stripe charges
      supabase.from('stripe_qb_sync_log' as any)
        .select('amount_gross_cents, qb_income_type, charge_date, customer_email')
        .gte('charge_date', since)
        .order('charge_date', { ascending: false })
        .limit(10),
      // 2. New partnership inquiries
      supabase.from('provider_partnership_inquiries' as any)
        .select('practice_name, contact_name, contact_email, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10),
      // 3. New appointments (booking activity)
      supabase.from('appointments')
        .select('id, patient_name, appointment_date, appointment_time, service_name, created_at')
        .gte('created_at', since)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(10),
      // 4. New memberships
      supabase.from('user_memberships')
        .select('id, plan_id, founding_member, founding_member_number, created_at, membership_plans(name)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10),
      // 5. Founding seats JUST claimed (subset of memberships — flagged separately for hype)
      supabase.from('user_memberships')
        .select('id, founding_member_number, created_at')
        .gte('created_at', since)
        .not('founding_member_number', 'is', null)
        .order('founding_member_number', { ascending: true })
        .limit(10),
      // 6. Unresolved errors (high priority — always alerts even in quiet hours)
      supabase.from('error_logs')
        .select('error_type, error_message, created_at')
        .gte('created_at', since)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const pList = (purchases.data as any[]) || [];
    const iList = (inquiries.data as any[]) || [];
    const bList = (bookings.data as any[]) || [];
    const mList = (memberships.data as any[]) || [];
    const fList = (foundingClaims.data as any[]) || [];
    const eList = (errors.data as any[]) || [];

    // ── Resolve the checkout liveness probe (fired in parallel) ─
    const checkout = await checkoutProbePromise;
    const checkoutDown = checkout.down.length > 0;

    const totalEvents = pList.length + iList.length + bList.length + mList.length + eList.length;

    // ── NO NEW ACTIVITY + CHECKOUT OK: heartbeat + exit ────────
    if (totalEvents === 0 && !checkoutDown) {
      await supabase.from('activity_alerts_log').insert({
        alert_type: 'heartbeat',
        summary: 'No new activity',
        channel: 'none',
        details: { since, checked_at: nowIso(), checkout_probe: 'ok' },
      });
      return new Response(JSON.stringify({ success: true, activity: false, checkout: 'ok', since }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CHECKOUT DOWN: SMS IMMEDIATELY (bypasses quiet hours) ──
    // This is P0 — every minute checkout is down, we lose money. Don't
    // wait for a patient to complain. Don't respect 9-8 quiet hours.
    if (checkoutDown) {
      const urgentMsg = `🚨🚨 CHECKOUT DOWN 🚨🚨\n${checkout.summary}\n\nPatients CANNOT pay right now.\nDeploy fix ASAP: supabase functions deploy <fn>`;
      const smsRes = await sendSMS(urgentMsg);
      await supabase.from('activity_alerts_log').insert({
        alert_type: 'error',
        summary: checkout.summary || 'Checkout probe failed',
        channel: 'sms',
        recipients: `sms:${OWNER_PHONE}`,
        twilio_sid: smsRes.sid,
        details: { probe: 'checkout', down_functions: checkout.down, checked_at: nowIso() },
      });
    }

    // ── COMPOSE MESSAGE BODY ────────────────────────────────────
    const lines: string[] = [];
    let icon = '📊';

    if (pList.length > 0) {
      const total = pList.reduce((s, p: any) => s + (p.amount_gross_cents || 0), 0) / 100;
      lines.push(`💰 ${pList.length} payment${pList.length === 1 ? '' : 's'} · $${total.toFixed(0)} total`);
      icon = '💰';
    }
    if (fList.length > 0) {
      const lowest = Math.min(...fList.map((f: any) => f.founding_member_number || 999));
      lines.push(`✨ Founding VIP seat #${lowest} just claimed!`);
      icon = '✨';
    }
    if (mList.length > 0) {
      lines.push(`🎉 ${mList.length} new membership${mList.length === 1 ? '' : 's'}`);
      if (icon === '📊') icon = '🎉';
    }
    if (iList.length > 0) {
      const first = iList[0] as any;
      lines.push(`🤝 ${iList.length} partner inquiry · ${first.practice_name}`);
      if (icon === '📊') icon = '🤝';
    }
    if (bList.length > 0) {
      lines.push(`📅 ${bList.length} new booking${bList.length === 1 ? '' : 's'}`);
      if (icon === '📊') icon = '📅';
    }
    if (eList.length > 0) {
      lines.push(`🚨 ${eList.length} unresolved error${eList.length === 1 ? '' : 's'}`);
      icon = '🚨'; // errors override any other icon
    }

    const smsBody = `${icon} ConveLabs activity\n${lines.join('\n')}\n\nDashboard: convelabs.com/dashboard/super_admin/hormozi`;

    // ── QUIET HOURS: defer unless error (errors always send) ────
    const quiet = isQuietHours();
    const hasError = eList.length > 0;

    if (quiet && !hasError) {
      await supabase.from('activity_alerts_log').insert({
        alert_type: 'deferred',
        summary: `Deferred ${totalEvents} events to post-quiet-hours`,
        channel: 'deferred_quiet_hours',
        details: {
          since,
          purchase_count: pList.length,
          inquiry_count: iList.length,
          booking_count: bList.length,
          membership_count: mList.length,
          founding_count: fList.length,
          error_count: eList.length,
        },
      });
      return new Response(JSON.stringify({
        success: true,
        deferred: true,
        reason: 'quiet_hours',
        total_events: totalEvents,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── SEND SMS ───────────────────────────────────────────────
    const smsResult = await sendSMS(smsBody);

    // ── SEND EMAIL for errors OR ≥3 events (richer context) ───
    let mailgunId: string | null = null;
    if (hasError || totalEvents >= 3) {
      const emailHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:${hasError ? '#B91C1C' : '#065f46'};color:#fff;padding:20px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;font-size:18px;">${icon} Activity alert · ${totalEvents} events</h2>
            <p style="margin:4px 0 0;opacity:.85;font-size:12px;">Since ${new Date(since).toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 12px 12px;font-size:14px;line-height:1.6;">
            ${pList.length > 0 ? `<h3 style="margin:10px 0 6px;color:#059669;">💰 Payments (${pList.length})</h3><ul style="margin:0 0 12px;padding-left:20px;">${pList.slice(0, 5).map((p: any) => `<li>$${((p.amount_gross_cents || 0) / 100).toFixed(2)} · ${p.qb_income_type || 'charge'} · ${p.customer_email || 'unknown'}</li>`).join('')}</ul>` : ''}
            ${fList.length > 0 ? `<h3 style="margin:10px 0 6px;color:#d97706;">✨ Founding claims (${fList.length})</h3><ul style="margin:0 0 12px;padding-left:20px;">${fList.map((f: any) => `<li>Seat #${f.founding_member_number}</li>`).join('')}</ul>` : ''}
            ${mList.length > 0 ? `<h3 style="margin:10px 0 6px;color:#0891b2;">🎉 Memberships (${mList.length})</h3><ul style="margin:0 0 12px;padding-left:20px;">${mList.slice(0, 5).map((m: any) => `<li>${(m.membership_plans as any)?.name || 'plan'} ${m.founding_member ? '(Founding)' : ''}</li>`).join('')}</ul>` : ''}
            ${iList.length > 0 ? `<h3 style="margin:10px 0 6px;color:#B91C1C;">🤝 Partner inquiries (${iList.length})</h3><ul style="margin:0 0 12px;padding-left:20px;">${iList.map((i: any) => `<li><strong>${i.practice_name}</strong> — ${i.contact_name} · <a href="mailto:${i.contact_email}">${i.contact_email}</a></li>`).join('')}</ul>` : ''}
            ${bList.length > 0 ? `<h3 style="margin:10px 0 6px;color:#7c3aed;">📅 New bookings (${bList.length})</h3><ul style="margin:0 0 12px;padding-left:20px;">${bList.slice(0, 5).map((b: any) => `<li>${b.patient_name || 'unknown'} · ${b.appointment_date} ${b.appointment_time || ''} · ${b.service_name || 'visit'}</li>`).join('')}</ul>` : ''}
            ${eList.length > 0 ? `<h3 style="margin:10px 0 6px;color:#dc2626;">🚨 Errors (${eList.length})</h3><ul style="margin:0 0 12px;padding-left:20px;">${eList.map((e: any) => `<li><strong>${e.error_type || 'unknown'}</strong>: ${String(e.error_message || '').substring(0, 200)}</li>`).join('')}</ul>` : ''}
            <hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0;">
            <p style="margin:0;font-size:12px;color:#666;">
              <a href="https://convelabs.com/dashboard/super_admin/hormozi" style="color:#B91C1C;">Open Hormozi Dashboard →</a>
            </p>
          </div>
        </div>`;
      mailgunId = await sendEmail(`${icon} ConveLabs activity · ${totalEvents} event${totalEvents === 1 ? '' : 's'}`, emailHtml);
    }

    // ── LOG THE ALERT ──────────────────────────────────────────
    await supabase.from('activity_alerts_log').insert({
      alert_type: hasError ? 'error' : pList.length > 0 ? 'purchase' : iList.length > 0 ? 'inquiry' : mList.length > 0 ? 'membership' : 'booking',
      summary: lines.join(' · '),
      channel: smsResult.ok && mailgunId ? 'both' : smsResult.ok ? 'sms' : mailgunId ? 'email' : 'failed',
      recipients: `sms:${OWNER_PHONE}${mailgunId ? `, email:${OWNER_EMAIL}` : ''}`,
      twilio_sid: smsResult.sid,
      mailgun_id: mailgunId,
      details: {
        since,
        purchase_count: pList.length,
        inquiry_count: iList.length,
        booking_count: bList.length,
        membership_count: mList.length,
        founding_count: fList.length,
        error_count: eList.length,
        sms_error: smsResult.error,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      total_events: totalEvents,
      sms_sent: smsResult.ok,
      email_sent: !!mailgunId,
      since,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[activity-monitor] exception:', err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
