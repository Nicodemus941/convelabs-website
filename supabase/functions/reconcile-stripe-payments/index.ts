// reconcile-stripe-payments  (Payment audit T1)
// ────────────────────────────────────────────────────────────────────────
// Detects the cardinal payment-system sin: "Stripe has the money but our
// DB doesn't know about the transaction." This happened for ~18 hours
// earlier this week when the stripe-webhook silently ReferenceError'd on
// every `lab_request_unlock` event — patients paid, no appointments were
// created, no one noticed until someone checked the Stripe dashboard.
//
// This job runs every 6 hours:
//   1. Lists paid Stripe checkout sessions from the last 48 hours
//   2. For each, checks whether the expected downstream DB row exists
//      (based on metadata.type)
//   3. Writes orphans to orphaned_payments (upsert by session id so
//      re-detections don't duplicate)
//   4. Marks previously-orphaned sessions `resolved=true` if their
//      downstream row now exists (manual Stripe resend worked)
//   5. Alerts the owner via SMS on any NEW orphans (no spam — alert_sent_at
//      gate means one ping per orphan, not one per cron tick)
//
// Runs via cron; also callable ad-hoc with ?hours=72 to widen the window.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';

// Map metadata.type → (description, check function)
// Each check returns { found: boolean, note: string } so the orphan row
// captures WHAT was missing, not just THAT something was missing.
async function checkDownstreamRecord(
  admin: any,
  session: any,
): Promise<{ expected_type: string; found: boolean; missing_record: string }> {
  const type = session.metadata?.type || '';
  const sessionId = session.id;

  switch (type) {
    case 'appointment_payment': {
      const { data } = await admin
        .from('appointments')
        .select('id')
        .eq('stripe_checkout_session_id', sessionId)
        .maybeSingle();
      return {
        expected_type: 'appointment_payment',
        found: !!data,
        missing_record: data ? '' : 'appointments row with matching stripe_checkout_session_id',
      };
    }
    case 'lab_request_unlock': {
      // Expected: lab request flipped to 'scheduled' + appointment row created
      const labRequestId = session.metadata?.lab_request_id;
      if (!labRequestId) {
        return { expected_type: 'lab_request_unlock', found: false, missing_record: 'lab_request_id absent from metadata (cannot verify)' };
      }
      const { data: req } = await admin
        .from('patient_lab_requests')
        .select('status, appointment_id')
        .eq('id', labRequestId)
        .maybeSingle();
      const ok = !!req && req.status === 'scheduled' && !!req.appointment_id;
      return {
        expected_type: 'lab_request_unlock',
        found: ok,
        missing_record: ok ? '' : `patient_lab_requests[${labRequestId}].status='scheduled' with appointment_id set`,
      };
    }
    case 'bundle_payment': {
      const bundleId = session.metadata?.bundle_id;
      if (!bundleId) {
        return { expected_type: 'bundle_payment', found: false, missing_record: 'bundle_id absent from metadata' };
      }
      const { data } = await admin
        .from('visit_bundles')
        .select('id, amount_paid')
        .eq('id', bundleId)
        .maybeSingle();
      const ok = !!data && (data.amount_paid || 0) > 0;
      return {
        expected_type: 'bundle_payment',
        found: ok,
        missing_record: ok ? '' : `visit_bundles[${bundleId}] with amount_paid > 0`,
      };
    }
    case 'subscription_payment': {
      const recurringId = session.metadata?.recurring_booking_id;
      if (!recurringId) {
        return { expected_type: 'subscription_payment', found: false, missing_record: 'recurring_booking_id absent from metadata' };
      }
      const { data } = await admin
        .from('recurring_bookings')
        .select('is_active, stripe_subscription_id')
        .eq('id', recurringId)
        .maybeSingle();
      const ok = !!data && data.is_active === true;
      return {
        expected_type: 'subscription_payment',
        found: ok,
        missing_record: ok ? '' : `recurring_bookings[${recurringId}].is_active=true`,
      };
    }
    case 'credit_pack': {
      const { data } = await admin
        .from('credit_packs')
        .select('id')
        .eq('stripe_checkout_id', sessionId)
        .maybeSingle();
      return {
        expected_type: 'credit_pack',
        found: !!data,
        missing_record: data ? '' : 'credit_packs row with matching stripe_checkout_id',
      };
    }
    default: {
      // Membership (no metadata.type) — identified by subscription mode + absence of known types
      if (session.mode === 'subscription' && session.subscription) {
        const { data } = await admin
          .from('user_memberships')
          .select('id')
          .eq('stripe_subscription_id', session.subscription)
          .maybeSingle();
        return {
          expected_type: 'membership_signup',
          found: !!data,
          missing_record: data ? '' : `user_memberships row with stripe_subscription_id=${session.subscription}`,
        };
      }
      // Genuinely unknown — flag for manual review (shouldn't happen post-M2)
      return {
        expected_type: type || 'unknown',
        found: false,
        missing_record: `unclassifiable: mode=${session.mode}, metadata.type='${type}' — needs manual review`,
      };
    }
  }
}

async function sendOwnerSms(message: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return;
  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
        Body: message.substring(0, 1550), // Twilio hard-caps longer
        From: TWILIO_FROM,
      }).toString(),
    });
  } catch (e) {
    console.warn('[reconcile] owner SMS failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const url = new URL(req.url);
    const hours = Math.min(168, Math.max(6, parseInt(url.searchParams.get('hours') || '48', 10)));
    const sinceTs = Math.floor((Date.now() - hours * 60 * 60 * 1000) / 1000);

    console.log(`[reconcile] scanning Stripe sessions since ${new Date(sinceTs * 1000).toISOString()}`);

    // ── 1. Pull paid checkout sessions from window ────────────────────
    // Stripe's default list returns most recent first, capped at 100.
    // For a 48h window we virtually never exceed 100; paginate anyway
    // so a high-volume day doesn't silently truncate the scan.
    const sessions: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const resp = await stripe.checkout.sessions.list({
        created: { gte: sinceTs },
        limit: 100,
        starting_after: startingAfter,
        expand: ['data.customer'],
      });
      sessions.push(...resp.data);
      hasMore = resp.has_more;
      startingAfter = resp.data.length ? resp.data[resp.data.length - 1].id : undefined;
      if (sessions.length > 500) break; // safety valve — 500 sessions in 48h is unusual
    }

    console.log(`[reconcile] fetched ${sessions.length} session(s)`);

    // ── 2. For each PAID session, verify downstream record ───────────
    const newOrphans: any[] = [];
    const resolvedOrphans: string[] = [];
    let checked = 0;

    for (const session of sessions) {
      // Only reconcile sessions that actually moved money. status='complete'
      // alone isn't enough (can happen on $0 sessions); require payment_status.
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        continue;
      }
      if (session.status !== 'complete') continue;

      checked++;
      const { expected_type, found, missing_record } = await checkDownstreamRecord(admin, session);

      if (found) {
        // If this session was previously orphaned, mark resolved.
        const { data: prior } = await admin
          .from('orphaned_payments')
          .select('id, resolved')
          .eq('stripe_session_id', session.id)
          .maybeSingle();
        if (prior && !prior.resolved) {
          await admin
            .from('orphaned_payments')
            .update({
              resolved: true,
              resolved_at: new Date().toISOString(),
              resolved_note: 'auto-resolved: downstream record now exists',
              last_checked_at: new Date().toISOString(),
            })
            .eq('id', prior.id);
          resolvedOrphans.push(session.id);
        }
        continue;
      }

      // Missing downstream record → upsert an orphan row
      const email = session.customer_details?.email
        || session.metadata?.patient_email
        || null;

      const { data: existingOrphan } = await admin
        .from('orphaned_payments')
        .select('id, alert_sent_at')
        .eq('stripe_session_id', session.id)
        .maybeSingle();

      if (existingOrphan) {
        // Update last_checked_at but don't re-alert
        await admin
          .from('orphaned_payments')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', existingOrphan.id);
      } else {
        const { data: inserted } = await admin
          .from('orphaned_payments')
          .insert({
            stripe_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
            session_created_at: new Date(session.created * 1000).toISOString(),
            amount_cents: session.amount_total || 0,
            patient_email: email,
            expected_type,
            missing_record,
            metadata: session.metadata || {},
          })
          .select('id')
          .single();
        if (inserted) newOrphans.push({ id: inserted.id, session_id: session.id, email, amount: session.amount_total, expected_type, missing_record });
      }
    }

    // ── 3. Alert owner on new orphans (once per orphan) ──────────────
    if (newOrphans.length > 0) {
      const lines = newOrphans.slice(0, 5).map(o =>
        `• $${((o.amount || 0) / 100).toFixed(0)} ${o.expected_type} for ${o.email || 'unknown'} — missing ${o.missing_record.substring(0, 60)}`
      );
      const more = newOrphans.length > 5 ? `\n…and ${newOrphans.length - 5} more.` : '';
      await sendOwnerSms(
        `🚨 ${newOrphans.length} orphaned Stripe payment(s) detected — paid in Stripe, missing in DB:\n${lines.join('\n')}${more}\nReview: admin → Orphaned Payments`
      );
      await admin
        .from('orphaned_payments')
        .update({ alert_sent_at: new Date().toISOString() })
        .in('id', newOrphans.map(o => o.id));
    }

    // Also alert if a previously-orphaned session auto-resolved (good news ping, once)
    if (resolvedOrphans.length > 0) {
      await sendOwnerSms(`✅ ${resolvedOrphans.length} previously-orphaned payment(s) auto-resolved after downstream record appeared.`);
    }

    const summary = {
      success: true,
      window_hours: hours,
      sessions_fetched: sessions.length,
      sessions_checked: checked,
      new_orphans: newOrphans.length,
      resolved_orphans: resolvedOrphans.length,
      orphan_details: newOrphans,
      resolved_details: resolvedOrphans,
    };
    console.log('[reconcile] summary:', summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[reconcile] fatal error:', error);
    // Log to error_logs so the reconciler itself is monitored
    await admin.from('error_logs').insert({
      component: 'reconcile-stripe-payments',
      action: 'top_level',
      error_type: 'unhandled',
      error_message: (error?.message || String(error)).substring(0, 2000),
      error_stack: (error?.stack || '').substring(0, 4000),
    }).catch(() => {});
    await sendOwnerSms(`🚨 reconcile-stripe-payments FAILED: ${error?.message || String(error)}`.substring(0, 300));
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
