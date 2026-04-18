/**
 * MANAGE SUBSCRIPTION — patient self-service for recurring plans.
 *
 * Lets a logged-in patient (or their admin) pause, skip, or cancel a
 * recurring_bookings row. For cancel, we also cancel the Stripe
 * subscription so billing stops.
 *
 * Auth model:
 *   - Request MUST include Authorization: Bearer <user jwt>
 *   - We verify the user owns the subscription by matching patient_email
 *     to the authenticated user's email (OR patient_id to auth.uid())
 *   - Admins bypass ownership checks (role super_admin / office_manager)
 *
 * POST body:
 *   {
 *     bookingId: uuid,
 *     action: 'pause' | 'resume' | 'skip' | 'cancel',
 *     pausedUntil?: 'YYYY-MM-DD'   // required for 'pause'
 *   }
 *
 * Responses: { ok: true, booking: {...} } or { error: '...' }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { stripe } from '../_shared/stripe.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

type Action = 'pause' | 'resume' | 'skip' | 'cancel';

async function resolveUserFromJwt(req: Request): Promise<{ userId: string | null; email: string | null; role: string | null }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { userId: null, email: null, role: null };
  try {
    const { data: userRes } = await supabase.auth.getUser(token);
    const user = userRes?.user;
    if (!user) return { userId: null, email: null, role: null };

    // Look up role from user_roles (admins bypass ownership check)
    const { data: roleRow } = await supabase
      .from('user_roles' as any)
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    const role = (roleRow as any)?.role ? String((roleRow as any).role) : null;

    return { userId: user.id, email: user.email || null, role };
  } catch (e) {
    console.warn('[manage-subscription] jwt resolve failed:', e);
    return { userId: null, email: null, role: null };
  }
}

function isAdminRole(role: string | null): boolean {
  return !!role && ['super_admin', 'office_manager', 'franchise_owner', 'owner'].includes(role);
}

function addWeeksIso(dateIso: string, weeks: number): string {
  const d = new Date(dateIso + 'T12:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const { bookingId, action, pausedUntil } = body || {};
    if (!bookingId || !action) {
      return new Response(JSON.stringify({ error: 'bookingId + action required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth + ownership
    const { userId, email, role } = await resolveUserFromJwt(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: booking, error: fetchErr } = await supabase
      .from('recurring_bookings' as any)
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      return new Response(JSON.stringify({ error: 'Subscription not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const b = booking as any;
    const owns = (b.patient_id && b.patient_id === userId)
              || (b.patient_email && email && b.patient_email.toLowerCase() === email.toLowerCase());
    if (!owns && !isAdminRole(role)) {
      return new Response(JSON.stringify({ error: 'Not authorized for this subscription' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action handlers
    const act = String(action) as Action;
    let update: Record<string, any> = {};

    if (act === 'pause') {
      if (!pausedUntil || !/^\d{4}-\d{2}-\d{2}$/.test(pausedUntil)) {
        return new Response(JSON.stringify({ error: 'pausedUntil (YYYY-MM-DD) required for pause' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      update = { paused_until: pausedUntil };
    }
    else if (act === 'resume') {
      update = { paused_until: null };
    }
    else if (act === 'skip') {
      // Bump next_booking_date forward by one frequency cycle
      const nextDate = addWeeksIso(b.next_booking_date, b.frequency_weeks || 4);
      update = { next_booking_date: nextDate };
    }
    else if (act === 'cancel') {
      update = {
        is_active: false,
        cancelled_at: new Date().toISOString(),
      };
      // Cancel Stripe subscription too — don't want billing to keep running
      if (b.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(b.stripe_subscription_id);
          console.log(`[manage-subscription] cancelled Stripe subscription ${b.stripe_subscription_id}`);
        } catch (e: any) {
          console.warn('[manage-subscription] Stripe cancel failed (non-blocking):', e?.message);
        }
      }
    }
    else {
      return new Response(JSON.stringify({ error: `Unknown action: ${act}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('recurring_bookings' as any)
      .update(update)
      .eq('id', bookingId)
      .select()
      .single();
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, booking: updated, action: act }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[manage-subscription] unhandled', err);
    return new Response(JSON.stringify({ error: err?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
