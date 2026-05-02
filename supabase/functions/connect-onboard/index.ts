/**
 * CONNECT-ONBOARD
 *
 * Creates (or refreshes) a Stripe Connect Express account for the
 * authenticated staff member and returns a hosted onboarding URL.
 *
 * Body:
 *   { action: 'onboard' }   — create + return onboarding link
 *   { action: 'status' }    — refresh capabilities from Stripe + return state
 *   { action: 'dashboard' } — return Express dashboard login link
 *
 * The onboarding flow is one-tap from the phleb dashboard Settings tab:
 *   1. Phleb clicks "Connect your Stripe account"
 *   2. Server creates an Express account (or fetches existing) + Account Link
 *   3. Phleb redirected to Stripe-hosted form (5 min: SSN, DOB, bank)
 *   4. Stripe redirects back to /dashboard/phlebotomist?connect=success
 *   5. Status check fires capabilities (charges_enabled, payouts_enabled)
 *   6. From here on, every patient charge auto-splits via transfer_data
 */

import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface StaffRow {
  id: string;
  user_id: string;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded_at: string | null;
  stripe_connect_charges_enabled: boolean;
  stripe_connect_payouts_enabled: boolean;
}

async function getStaffForAuthUser(token: string): Promise<{ staff: StaffRow | null; email: string | null; firstName: string | null; lastName: string | null; phone: string | null }> {
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
  // Resolve auth user from JWT
  const { data: { user } } = await adminClient.auth.getUser(token);
  if (!user) return { staff: null, email: null, firstName: null, lastName: null, phone: null };

  const { data: staff } = await adminClient
    .from('staff_profiles')
    .select('id, user_id, stripe_connect_account_id, stripe_connect_onboarded_at, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  const meta = (user.user_metadata || {}) as any;
  return {
    staff: (staff as StaffRow) || null,
    email: user.email || null,
    firstName: meta.first_name || meta.firstName || null,
    lastName: meta.last_name || meta.lastName || null,
    phone: meta.phone || null,
  };
}

async function syncCapabilities(adminClient: any, staffId: string, accountId: string): Promise<{ charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean }> {
  const account = await stripe.accounts.retrieve(accountId);
  const charges = !!account.charges_enabled;
  const payouts = !!account.payouts_enabled;
  const onboarded = charges && payouts;

  await adminClient
    .from('staff_profiles')
    .update({
      stripe_connect_charges_enabled: charges,
      stripe_connect_payouts_enabled: payouts,
      stripe_connect_onboarded_at: onboarded ? new Date().toISOString() : null,
    })
    .eq('id', staffId);

  return { charges_enabled: charges, payouts_enabled: payouts, details_submitted: !!account.details_submitted };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!Deno.env.get('STRIPE_SECRET_KEY')) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized', message: 'Sign in required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action = 'onboard' } = await req.json().catch(() => ({}));
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { staff, email, firstName, lastName, phone } = await getStaffForAuthUser(token);

    if (!staff) {
      return new Response(JSON.stringify({
        error: 'no_staff_profile',
        message: 'No staff profile found for the signed-in user. Contact admin to enroll.',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const origin = req.headers.get('origin') || 'https://www.convelabs.com';
    const returnUrl = `${origin}/dashboard/phlebotomist?connect=success`;
    const refreshUrl = `${origin}/dashboard/phlebotomist?connect=refresh`;

    // ─── action: status — pull from Stripe + sync DB ────────────────
    if (action === 'status') {
      if (!staff.stripe_connect_account_id) {
        return new Response(JSON.stringify({
          ok: true,
          connected: false,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const caps = await syncCapabilities(adminClient, staff.id, staff.stripe_connect_account_id);
      return new Response(JSON.stringify({
        ok: true,
        connected: caps.charges_enabled && caps.payouts_enabled,
        account_id: staff.stripe_connect_account_id,
        ...caps,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── action: dashboard — login link to Stripe Express dashboard ─
    if (action === 'dashboard') {
      if (!staff.stripe_connect_account_id) {
        return new Response(JSON.stringify({
          error: 'not_connected',
          message: 'Connect your account first.',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const link = await stripe.accounts.createLoginLink(staff.stripe_connect_account_id);
      return new Response(JSON.stringify({ ok: true, url: link.url }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── action: onboard (default) — create or fetch Express account
    //          and return a fresh Account Link for the hosted form. ─
    let accountId = staff.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          mcc: '8011', // Doctors / Physicians (closest standard MCC for phlebotomy)
          name: 'ConveLabs Phlebotomist',
          product_description: 'Mobile blood draw services on behalf of ConveLabs',
          url: 'https://www.convelabs.com',
        },
        individual: {
          email: email || undefined,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          phone: phone || undefined,
        },
        metadata: {
          convelabs_staff_id: staff.id,
          convelabs_user_id: staff.user_id,
          source: 'phleb_dashboard_onboard',
        },
      });
      accountId = account.id;
      await adminClient
        .from('staff_profiles')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', staff.id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    // Sync capabilities now (in case the account was already through onboarding
    // — e.g. phleb hits Connect a second time but bailed last time)
    const caps = await syncCapabilities(adminClient, staff.id, accountId);

    return new Response(JSON.stringify({
      ok: true,
      account_id: accountId,
      onboarding_url: link.url,
      expires_at: link.expires_at,
      ...caps,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[connect-onboard] unhandled:', e);

    // Detect the "platform not registered for Connect" error specifically.
    // Stripe returns the literal text "signed up for Connect" in the
    // message and our test surface confirmed there's no dedicated error
    // code for it — match on the substring. When this fires, the OWNER
    // of the Stripe account needs to enable Connect at
    // https://dashboard.stripe.com/connect — no code change can fix it.
    const msg = String(e?.message || '');
    const isPlatformNotEnabled = /signed up for Connect/i.test(msg)
      || /not.*Connect.*platform/i.test(msg);

    // Persist the Stripe error so admin can read it without opening
    // dev tools — surface in error_logs which the dashboard can render.
    try {
      const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
      await adminClient.from('error_logs').insert({
        error_type: isPlatformNotEnabled ? 'stripe_connect_platform_not_enabled' : 'stripe_connect_onboard',
        component: 'connect-onboard',
        action: 'top_level_catch',
        error_message: msg || 'unknown',
        error_stack: String(e?.stack || ''),
        payload: {
          stripe_code: e?.code || null,
          stripe_type: e?.type || null,
          stripe_status_code: e?.statusCode || null,
          stripe_request_id: e?.requestId || null,
          stripe_doc_url: e?.doc_url || null,
          admin_action_required: isPlatformNotEnabled
            ? 'Enable Stripe Connect at https://dashboard.stripe.com/connect — pick Platform or marketplace, Express onboarding type. One-time setup, instant approval for US accounts.'
            : null,
        },
      } as any);
    } catch { /* non-fatal */ }

    if (isPlatformNotEnabled) {
      // 503 Service Unavailable — semantically "we'll work after admin
      // does the one-time setup," not an internal code bug.
      return new Response(JSON.stringify({
        error: 'platform_not_enabled',
        message: 'Stripe Connect isn\'t enabled on the ConveLabs Stripe account yet. Our admin has been notified — you\'ll be able to connect your bank account as soon as setup is complete (usually same-day).',
        admin_message: 'Enable Connect at https://dashboard.stripe.com/connect (Platform or marketplace → Express). One-time, instant approval for US.',
        admin_action_required: true,
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      error: 'connect_failed',
      message: e?.message || 'Stripe Connect onboarding failed',
      stripe_code: e?.code || null,
      stripe_type: e?.type || null,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
