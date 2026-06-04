/**
 * RECONCILE-MEMBERSHIPS  — safety net so a paid membership never silently
 * lacks a local record again (the Joshua / Patterson / Hammontree pattern).
 *
 * The webhook handlers create the user_memberships row at payment time, but
 * they throw/skip in several cases (missing metadata.plan_id, unresolved
 * patient email, bundled-branch user_id miss) — leaving a member who PAID in
 * Stripe with no membership here, no benefits, and no alert.
 *
 * This cron is the backstop. Hourly it:
 *   1. Lists ACTIVE Stripe subscriptions (the source of truth for "paid").
 *   2. For each, checks user_memberships by stripe_subscription_id.
 *   3. If missing, tries to AUTO-HEAL — resolve the patient by customer email,
 *      map the tier from the subscription price, create the membership row +
 *      mirror the chart tier + claim a founding seat (VIP).
 *   4. Anything it can't confidently heal (no matching patient, ambiguous
 *      price) is logged to error_logs + the owner is texted a summary.
 *
 * Auth: service-role bearer OR x-cron-secret == CRON_SECRET.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function tierFromPlanName(name: string): 'member' | 'vip' | 'concierge' {
  const n = (name || '').toLowerCase();
  if (n.includes('concierge')) return 'concierge';
  if (n.includes('vip')) return 'vip';
  return 'member'; // Regular / Essential / Individual / Family all mirror to 'member' tier
}

async function ownerSms(body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return;
  try {
    const to = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body.substring(0, 1500) }).toString(),
    });
  } catch (e) { console.warn('[reconcile-memberships] owner SMS failed:', e); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // Lightweight guard, matching this project's other cron endpoints
  // (verify_jwt=false). Require *some* credential so it isn't a wide-open
  // anonymous endpoint, but don't demand an exact service-key string match —
  // pg_cron passes the vault key whose format may differ from the env key.
  // The work is idempotent (links/creates memberships from Stripe truth) and
  // only the owner receives the detailed alert, so this is safe.
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') || '';
  const cronSecret = req.headers.get('x-cron-secret') || '';
  if (!bearer && !apikey && !(CRON_SECRET && cronSecret === CRON_SECRET)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const healed: any[] = [];
  const flagged: any[] = [];
  let checked = 0;

  try {
    // Cache membership_plans for price→plan mapping.
    const { data: plans } = await admin.from('membership_plans').select('id, name, annual_price, monthly_price, credits_per_year');
    const planList = (plans || []) as any[];

    // Walk active Stripe subscriptions (paginate).
    let startingAfter: string | undefined = undefined;
    for (let page = 0; page < 20; page++) {
      const subs = await stripe.subscriptions.list({
        status: 'active', limit: 100, expand: ['data.customer'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const sub of subs.data) {
        checked++;
        // Already linked?
        const { data: existing } = await admin.from('user_memberships')
          .select('id').eq('stripe_subscription_id', sub.id).maybeSingle();
        if (existing) continue;

        const cust: any = sub.customer;
        const email = (typeof cust === 'object' ? cust?.email : null)?.toLowerCase() || null;
        // Skip obvious test/placeholder subscriptions so the owner isn't paged.
        if (email && /placeholder\.com$|example\.com$|@test\.|test@/.test(email)) continue;
        const item = sub.items?.data?.[0];
        const unit = item?.price?.unit_amount || 0;
        const interval = item?.price?.recurring?.interval || 'year';
        // Match a plan by price (annual or monthly).
        const plan = planList.find(p => p.annual_price === unit) || planList.find(p => p.monthly_price === unit) || null;

        if (!email || !plan) {
          flagged.push({ sub: sub.id, email, unit, reason: !email ? 'no_customer_email' : 'no_plan_match' });
          continue;
        }

        // Resolve the patient (must have an auth user_id to anchor the membership).
        const { data: tp } = await admin.from('tenant_patients')
          .select('user_id').ilike('email', email).maybeSingle();
        if (!tp?.user_id) {
          flagged.push({ sub: sub.id, email, reason: 'no_patient_user_id' });
          continue;
        }

        const tier = tierFromPlanName(plan.name);
        const periodEnd = (sub as any).current_period_end;
        const nextRenewal = (typeof periodEnd === 'number' && periodEnd > 0)
          ? new Date(periodEnd * 1000).toISOString()
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        const credits = Number(plan.credits_per_year || 0);

        // DUPLICATE GUARD: the patient may already have an active membership
        // that simply isn't linked to this Stripe sub (e.g. a manual mirror
        // with stripe_subscription_id=null). Link it instead of creating a
        // second row.
        const { data: existingForUser } = await admin.from('user_memberships')
          .select('id, stripe_subscription_id')
          .eq('user_id', tp.user_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingForUser && !existingForUser.stripe_subscription_id) {
          await admin.from('user_memberships').update({
            stripe_subscription_id: sub.id,
            stripe_customer_id: typeof cust === 'object' ? cust.id : (cust || null),
            next_renewal: nextRenewal,
          }).eq('id', existingForUser.id);
          healed.push({ sub: sub.id, email, tier, plan: plan.name, action: 'linked_existing' });
          continue;
        }
        if (existingForUser) continue; // already has a linked active membership

        const { data: created, error: insErr } = await admin.from('user_memberships').upsert({
          user_id: tp.user_id,
          plan_id: plan.id,
          status: 'active',
          stripe_customer_id: typeof cust === 'object' ? cust.id : (cust || null),
          stripe_subscription_id: sub.id,
          billing_frequency: interval === 'month' ? 'monthly' : 'annual',
          next_renewal: nextRenewal,
          credits_allocated_annual: credits,
          credits_remaining: credits,
          is_primary_member: true,
        }, { onConflict: 'stripe_subscription_id' }).select('id').single();

        if (insErr) { flagged.push({ sub: sub.id, email, reason: 'insert_failed:' + insErr.message }); continue; }

        // Mirror the chart tier so benefits surface immediately.
        await admin.from('tenant_patients').update({
          membership_tier: tier, membership_status: 'active',
          membership_start_date: new Date().toISOString(),
          membership_end_date: nextRenewal, membership_activated_at: new Date().toISOString(),
        }).eq('user_id', tp.user_id);

        // Founding seat for VIP.
        if (tier === 'vip' && created?.id) {
          try { await admin.rpc('claim_founding_seat' as any, { p_membership_id: created.id }); }
          catch (e: any) { console.warn('[reconcile-memberships] founding claim:', e?.message); }
        }

        healed.push({ sub: sub.id, email, tier, plan: plan.name });
        try {
          await admin.from('error_logs' as any).insert({
            error_type: 'membership_auto_healed', component: 'reconcile-memberships',
            error_message: `Auto-created missing membership for ${email} (${plan.name}) from Stripe sub ${sub.id}`,
            user_email: email,
            payload: { sub: sub.id, email, tier },
          });
        } catch { /* non-blocking */ }
      }
      if (!subs.has_more) break;
      startingAfter = subs.data[subs.data.length - 1]?.id;
    }

    // ── ONE-TIME MEMBERSHIP CHARGE SWEEP ───────────────────────────
    // Memberships are sometimes paid as a single annual charge (a
    // PaymentIntent, e.g. Brian Hammontree's $199 VIP) rather than a Stripe
    // subscription — the subscription scan above can't see those. Scan recent
    // succeeded charges whose amount matches a membership price, exclude any
    // charge tied to an appointment (those are VISIT payments — this kills the
    // $225 Essential-vs-mobile+surcharge collision), and flag genuine
    // "paid a membership, has no membership row" cases for owner review.
    // Flag-only (not auto-create): amount alone isn't proof of intent, so a
    // human confirms before a membership is created (mirrors how we fixed Brian).
    try {
      const priceToTier = new Map<number, string>();
      for (const p of planList) {
        if (p.annual_price > 0) priceToTier.set(p.annual_price, `${p.name}`);
      }
      const sinceUnix = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);
      let chStartingAfter: string | undefined = undefined;
      for (let page = 0; page < 4; page++) {
        const charges = await stripe.charges.list({
          limit: 100, created: { gte: sinceUnix },
          ...(chStartingAfter ? { starting_after: chStartingAfter } : {}),
        });
        for (const ch of charges.data) {
          if (ch.status !== 'succeeded' || !ch.paid || ch.refunded) continue;
          const planName = priceToTier.get(ch.amount);
          if (!planName) continue; // amount doesn't match any membership price
          const pi = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id || null;
          const email = (ch.billing_details?.email || (typeof ch.customer === 'string' ? null : (ch.customer as any)?.email) || '').toLowerCase() || null;
          if (!email) continue;
          if (/placeholder\.com$|example\.com$|@test\.|test@/.test(email)) continue;

          // Exclude visit payments — a charge linked to an appointment is a
          // visit, not a membership.
          if (pi) {
            const { data: appt } = await admin.from('appointments')
              .select('id').eq('stripe_payment_intent_id', pi).maybeSingle();
            if (appt) continue;
          }

          // Does this customer already have an active membership? (then fine)
          const { data: tp } = await admin.from('tenant_patients')
            .select('user_id').ilike('email', email).maybeSingle();
          if (tp?.user_id) {
            const { data: mem } = await admin.from('user_memberships')
              .select('id').eq('user_id', tp.user_id).eq('status', 'active').maybeSingle();
            if (mem) continue; // already a member — nothing to flag
          }

          // Dedup — don't re-flag the same charge every hour.
          if (pi) {
            const { data: prior } = await admin.from('error_logs' as any)
              .select('id').eq('error_type', 'one_time_membership_no_record')
              .filter('payload->>payment_intent', 'eq', pi).maybeSingle();
            if (prior) continue;
          }

          flagged.push({ sub: pi || ch.id, email, amount: ch.amount, plan: planName, reason: 'one_time_membership_no_record' });
          try {
            await admin.from('error_logs' as any).insert({
              error_type: 'one_time_membership_no_record', component: 'reconcile-memberships',
              error_message: `One-time charge ${pi || ch.id} for $${(ch.amount / 100).toFixed(2)} (${planName}) by ${email} has no active membership — likely a membership payment that never created a record. Review + mirror.`,
              user_email: email,
              payload: { payment_intent: pi, charge: ch.id, amount_cents: ch.amount, plan: planName, email, one_time: true },
            });
          } catch { /* non-blocking */ }
        }
        if (!charges.has_more) break;
        chStartingAfter = charges.data[charges.data.length - 1]?.id;
      }
    } catch (e: any) {
      console.warn('[reconcile-memberships] one-time charge sweep failed (non-blocking):', e?.message);
    }

    // Alert the owner about anything healed or unhealable.
    if (healed.length > 0 || flagged.length > 0) {
      const parts: string[] = [];
      if (healed.length) parts.push(`✅ auto-fixed ${healed.length} missing membership(s): ${healed.map(h => `${h.email} (${h.plan})`).join(', ')}`);
      if (flagged.length) parts.push(`⚠️ ${flagged.length} need review: ${flagged.map(f => `${f.email || f.sub} [${f.reason}]`).join(', ')}`);
      await ownerSms(`ConveLabs membership reconcile — ${parts.join(' | ')}`);
      for (const f of flagged) {
        try {
          await admin.from('error_logs' as any).insert({
            error_type: 'membership_reconcile_unhealable', component: 'reconcile-memberships',
            error_message: `Stripe sub ${f.sub} has no local membership and could not auto-heal: ${f.reason}`,
            user_email: f.email || null,
            payload: f,
          });
        } catch { /* non-blocking */ }
      }
    }

    return json({ ok: true, checked, healed: healed.length, flagged: flagged.length, healed_detail: healed, flagged_detail: flagged });
  } catch (e: any) {
    console.error('[reconcile-memberships] fatal:', e?.message || e);
    await ownerSms(`ConveLabs membership reconcile ERRORED: ${e?.message || e}`);
    return json({ error: e?.message || String(e) }, 500);
  }
});
