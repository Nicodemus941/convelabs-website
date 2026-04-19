// stripe-event-reconcile
// Daily cron. Pulls the last 7 days of Stripe events (checkout.session.completed,
// invoice.paid, invoice.payment_succeeded) from the Stripe API. For each, checks
// if we have a corresponding row in our DB. If missing, either creates the row
// OR emails an alert so a human can investigate.
//
// Designed to catch events dropped because stripe-webhook was 401'ing, or any
// future gap (network blip, our webhook down, etc.). Stripe's own retry window
// is 3 days — this is our belt-and-suspenders over 7.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

Deno.serve(async (_req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const sinceEpoch = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

    // Pull recent Stripe events we care about
    const eventTypes = [
      'checkout.session.completed',
      'invoice.paid',
      'invoice.payment_succeeded',
    ];
    const missingEvents: Array<{ event_id: string; type: string; created: number; detail: string }> = [];

    for (const type of eventTypes) {
      // Paginate through events since 7 days ago
      let hasMore = true;
      let starting_after: string | undefined;
      let scanned = 0;
      while (hasMore && scanned < 500) {
        const page = await stripe.events.list({
          type,
          created: { gte: sinceEpoch },
          limit: 100,
          starting_after,
        });
        scanned += page.data.length;
        for (const ev of page.data) {
          // Check our webhook_logs table for this event id
          const { data: existing } = await admin
            .from('webhook_logs' as any)
            .select('id, status')
            .eq('stripe_session_id', ev.data?.object?.id || '')
            .limit(1)
            .maybeSingle();
          if (!existing) {
            let detail = type;
            const obj: any = ev.data?.object || {};
            if (obj.customer_email) detail += ` · ${obj.customer_email}`;
            if (obj.amount_due) detail += ` · \$${(obj.amount_due / 100).toFixed(2)}`;
            if (obj.metadata?.appointment_id) detail += ` · appt:${obj.metadata.appointment_id}`;
            missingEvents.push({ event_id: ev.id, type: type, created: ev.created, detail });
          }
        }
        hasMore = page.has_more;
        starting_after = page.data[page.data.length - 1]?.id;
      }
    }

    // Alert if we found drops
    if (missingEvents.length > 0 && MAILGUN_API_KEY) {
      try {
        const rows = missingEvents.slice(0, 50).map(m =>
          `<tr><td style="padding:4px 8px;font-family:monospace;font-size:11px;">${m.event_id.substring(0, 28)}</td><td style="padding:4px 8px;">${m.type}</td><td style="padding:4px 8px;">${new Date(m.created * 1000).toLocaleString('en-US')}</td><td style="padding:4px 8px;">${m.detail}</td></tr>`
        ).join('');
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:700px;">
  <div style="background:#F59E0B;color:#fff;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
    <h2 style="margin:0;">⚠️ ${missingEvents.length} Stripe event${missingEvents.length === 1 ? '' : 's'} missing from our DB</h2>
  </div>
  <div style="padding:22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;line-height:1.5;">
    <p>The reconciliation cron found Stripe events from the last 7 days that don't appear in our webhook_logs. These are events Stripe successfully fired but our webhook either didn't receive (network blip, 401, or down) or didn't log.</p>
    <p><strong>Action needed:</strong> for each missing event, check:</p>
    <ol>
      <li>Did we create the downstream record anyway? (appointment for checkout.session.completed, payment received row for invoice.paid, etc.)</li>
      <li>If not, consider manually replaying via the Stripe Dashboard → Events → [event_id] → "Resend webhook"</li>
    </ol>
    <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:12px;">
      <thead><tr style="background:#f9fafb;"><th style="text-align:left;padding:6px 8px;">Event ID</th><th style="text-align:left;padding:6px 8px;">Type</th><th style="text-align:left;padding:6px 8px;">When</th><th style="text-align:left;padding:6px 8px;">Detail</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${missingEvents.length > 50 ? `<p style="font-size:12px;color:#6b7280;">${missingEvents.length - 50} more events not shown — see Stripe dashboard.</p>` : ''}
    <p style="font-size:12px;color:#6b7280;">This alert fires from the stripe-event-reconcile cron.</p>
  </div>
</div>`;
        const fd = new FormData();
        fd.append('from', `ConveLabs Ops <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', 'info@convelabs.com');
        fd.append('subject', `⚠️ ${missingEvents.length} Stripe event${missingEvents.length === 1 ? '' : 's'} missing from ConveLabs DB`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });
      } catch (e) { console.error('reconcile alert email failed:', e); }
    }

    return new Response(JSON.stringify({
      ok: true,
      missing_count: missingEvents.length,
      missing_events: missingEvents.slice(0, 100),
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('stripe-event-reconcile error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
