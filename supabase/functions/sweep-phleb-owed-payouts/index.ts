/**
 * SWEEP-PHLEB-OWED-PAYOUTS
 *
 * One-click "pay me what I'm owed" — finds every staff_payouts row with
 * status='manual_owed' for the caller's connected staff account, fires
 * a single Stripe Connect transfer for the total, then marks all rows
 * succeeded with the transfer_id stamped for audit.
 *
 * Auth: requires bearer token of an authenticated user. We look up that
 * user's staff_profiles row, ensure they have a Stripe Connect account,
 * and only sweep payouts that belong to them. Admins can additionally
 * pass { p_staff_id } to sweep on behalf of another phleb.
 *
 * Idempotent at the row level (rows flip to 'succeeded' once swept, so
 * a re-run is a no-op). Idempotent at the transfer level via
 * transfer_group = `phleb_sweep_${staff_id}_${date}` so the same calendar
 * day won't re-transfer accidentally.
 *
 * verify_jwt=false (we manually parse the token via supabase.auth.getUser).
 */

import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

interface PayoutRow {
  id: string;
  appointment_id: string | null;
  amount_cents: number;
  stripe_destination_account_id: string | null;
  notes: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'auth_required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({} as any));
    const adminRequestedStaffId: string | undefined = body?.p_staff_id;

    // Resolve which staff_profile we're sweeping for
    let staffId: string | null = null;
    let stripeAcct: string | null = null;

    if (adminRequestedStaffId) {
      // Admin override path
      const role = (user.user_metadata?.role || user.app_metadata?.role || '').toString();
      if (role !== 'super_admin' && role !== 'office_manager' && role !== 'admin') {
        return new Response(JSON.stringify({ error: 'admin_only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data: sp } = await admin
        .from('staff_profiles')
        .select('id, stripe_connect_account_id, stripe_connect_payouts_enabled')
        .eq('id', adminRequestedStaffId).maybeSingle();
      staffId = (sp as any)?.id || null;
      stripeAcct = (sp as any)?.stripe_connect_account_id || null;
    } else {
      // Self-serve path
      const { data: sp } = await admin
        .from('staff_profiles')
        .select('id, stripe_connect_account_id, stripe_connect_payouts_enabled')
        .eq('user_id', user.id).maybeSingle();
      staffId = (sp as any)?.id || null;
      stripeAcct = (sp as any)?.stripe_connect_account_id || null;
      if (!(sp as any)?.stripe_connect_payouts_enabled) {
        return new Response(JSON.stringify({
          error: 'stripe_connect_not_ready',
          message: 'Finish Stripe Connect onboarding before sweeping.'
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (!staffId) {
      return new Response(JSON.stringify({ error: 'no_staff_profile' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!stripeAcct) {
      return new Response(JSON.stringify({ error: 'no_stripe_connect_account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch all manual_owed rows for this staff
    const { data: owed } = await admin
      .from('staff_payouts')
      .select('id, appointment_id, amount_cents, stripe_destination_account_id, notes')
      .eq('staff_id', staffId)
      .eq('status', 'manual_owed')
      .order('created_at', { ascending: true });

    const rows = (owed as PayoutRow[]) || [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({
        ok: true, swept_count: 0, total_cents: 0, message: 'Nothing owed.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate destinations — every row must point at the same Connect account
    const wrongDest = rows.filter(r => r.stripe_destination_account_id && r.stripe_destination_account_id !== stripeAcct);
    if (wrongDest.length > 0) {
      return new Response(JSON.stringify({
        error: 'destination_mismatch',
        details: `${wrongDest.length} rows point at a different Connect account.`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const totalCents = rows.reduce((s, r) => s + (r.amount_cents || 0), 0);
    if (totalCents <= 0) {
      return new Response(JSON.stringify({ ok: true, swept_count: 0, total_cents: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fire ONE Stripe Connect transfer for the full owed total
    const today = new Date().toISOString().substring(0, 10);
    const transferGroup = `phleb_sweep_${staffId}_${today}`;
    let transfer: any;
    try {
      transfer = await stripe.transfers.create({
        amount: totalCents,
        currency: 'usd',
        destination: stripeAcct,
        transfer_group: transferGroup,
        description: `Phleb sweep: ${rows.length} owed visits, ${today}`,
        metadata: {
          staff_id: staffId,
          row_count: String(rows.length),
          sweep_date: today,
          source: 'sweep-phleb-owed-payouts',
        },
      }, {
        idempotencyKey: transferGroup,
      });
    } catch (e: any) {
      console.error('[sweep] stripe transfer failed:', e?.message);
      return new Response(JSON.stringify({
        error: 'stripe_transfer_failed',
        message: e?.message || 'Stripe rejected the transfer',
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Mark all rows succeeded with the transfer id
    const { error: updateErr } = await admin
      .from('staff_payouts')
      .update({
        status: 'succeeded',
        stripe_transfer_id: transfer.id,
        transferred_at: new Date().toISOString(),
        notes: rows[0].notes ? `${rows[0].notes} · swept ${today}` : `swept ${today}`,
      })
      .in('id', rows.map(r => r.id));

    if (updateErr) {
      console.error('[sweep] DB update failed after Stripe success:', updateErr);
      // Transfer succeeded but DB write failed — surface the transfer_id
      // so the admin can manually mark the rows.
      return new Response(JSON.stringify({
        ok: false,
        warning: 'stripe_transferred_but_db_failed',
        stripe_transfer_id: transfer.id,
        total_cents: totalCents,
        row_ids: rows.map(r => r.id),
        error: updateErr.message,
      }), { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      ok: true,
      swept_count: rows.length,
      total_cents: totalCents,
      stripe_transfer_id: transfer.id,
      transfer_group: transferGroup,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[sweep] uncaught:', e);
    return new Response(JSON.stringify({ error: e?.message || 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
