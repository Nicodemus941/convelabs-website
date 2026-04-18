/**
 * GENERATE RECURRING APPOINTMENTS — Tier 3 nightly cron
 *
 * Reads recurring_bookings where:
 *   - is_active = true
 *   - cancelled_at IS NULL
 *   - (paused_until IS NULL OR paused_until < today)
 *   - next_booking_date <= today + 14 days
 *
 * For each due row:
 *   1. Create an appointment with the saved prefs (service_type, service_name,
 *      preferred_address, preferred_time, etc.)
 *   2. If preferred_day_of_week is set, snap next_booking_date to the next
 *      occurrence of that weekday (prevents drift if someone changes frequency)
 *   3. Mark appointment payment_status=completed (subscription prepays each
 *      period via Stripe) with invoice_status=not_required
 *   4. Stamp recurrence_group_id = recurring_booking.id for series linking
 *   5. Advance next_booking_date by frequency_weeks
 *   6. Set last_generated_appointment_id + last_run_at
 *   7. Fire notification trio (patient email+sms, phleb sms, owner sms)
 *
 * Safe to re-run — won't create duplicates because it only processes rows
 * whose next_booking_date is due. After creating the appointment, the date
 * is advanced to the next cycle.
 *
 * Scheduled via pg_cron daily 09:00 America/New_York (14:00 UTC standard / 13:00 UTC DST).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

// Default phleb assignment — matches verify-appointment-checkout.
const DEFAULT_PHLEB_ID = Deno.env.get('DEFAULT_PHLEB_ID') || '91c76708-8c5b-4068-92c6-323805a3b164';

interface RecurringBooking {
  id: string;
  patient_id: string | null;
  patient_email: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  service_type: string;
  service_name: string | null;
  frequency_weeks: number;
  preferred_day_of_week: number | null;
  preferred_time: string | null;
  preferred_address: string | null;
  preferred_city: string | null;
  preferred_state: string | null;
  preferred_zip: string | null;
  next_booking_date: string;
  per_visit_price_cents: number | null;
  stripe_subscription_id: string | null;
}

function todayEtIso(): string {
  // YYYY-MM-DD in America/New_York
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Snap to the next occurrence of the desired weekday on/after a given date
function snapToWeekday(dateIso: string, targetDow: number): string {
  const d = new Date(dateIso + 'T12:00:00');
  while (d.getDay() !== targetDow) {
    d.setDate(d.getDate() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generateViewToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .substring(0, 32);
}

async function processOne(rb: RecurringBooking, todayIso: string): Promise<{ ok: boolean; error?: string; appointmentId?: string }> {
  try {
    const bookingDate = rb.next_booking_date;
    const fullAddress = [rb.preferred_address, rb.preferred_city, rb.preferred_state, rb.preferred_zip]
      .filter(Boolean).join(', ') || 'Pending — patient to confirm';

    // Normalized appointment_date (noon ET to avoid TZ drift)
    const normalizedDate = `${bookingDate}T12:00:00-04:00`;

    const { data: newAppt, error: insertErr } = await supabase
      .from('appointments')
      .insert([{
        appointment_date: normalizedDate,
        appointment_time: rb.preferred_time || '9:00 AM',
        patient_id: rb.patient_id,
        phlebotomist_id: DEFAULT_PHLEB_ID,
        view_token: generateViewToken(),
        patient_name: rb.patient_name,
        patient_email: rb.patient_email,
        patient_phone: rb.patient_phone,
        service_type: rb.service_type,
        service_name: rb.service_name || 'Blood Draw',
        status: 'scheduled',
        payment_status: 'completed',  // subscription prepays via Stripe
        invoice_status: 'not_required',
        total_amount: (rb.per_visit_price_cents || 0) / 100,
        service_price: (rb.per_visit_price_cents || 0) / 100,
        address: fullAddress,
        zipcode: rb.preferred_zip || '32801',
        booking_source: 'subscription',
        notes: `Auto-generated from recurring subscription (every ${rb.frequency_weeks}w)`,
        // Series linking — recurrence_group_id = the subscription row id
        recurrence_group_id: rb.id,
      }])
      .select()
      .single();

    if (insertErr || !newAppt) {
      console.error('[generate-recurring] insert failed', insertErr);
      return { ok: false, error: insertErr?.message || 'insert failed' };
    }

    // Advance next_booking_date by frequency_weeks, then snap to preferred weekday
    let nextDate = addDaysIso(bookingDate, rb.frequency_weeks * 7);
    if (rb.preferred_day_of_week !== null && rb.preferred_day_of_week !== undefined) {
      nextDate = snapToWeekday(nextDate, rb.preferred_day_of_week);
    }

    await supabase.from('recurring_bookings' as any)
      .update({
        next_booking_date: nextDate,
        last_generated_appointment_id: newAppt.id,
        last_run_at: new Date().toISOString(),
      })
      .eq('id', rb.id);

    // Fire the confirmation trio (fire-and-forget)
    try {
      supabase.functions.invoke('send-appointment-confirmation', {
        body: { appointmentId: newAppt.id },
      }).catch((e) => console.warn('[generate-recurring] confirmation non-blocking:', e));
    } catch (e) { console.warn('[generate-recurring] confirmation dispatch:', e); }

    return { ok: true, appointmentId: newAppt.id };
  } catch (e: any) {
    console.error('[generate-recurring] exception', e);
    return { ok: false, error: e?.message || 'unknown' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const todayIso = todayEtIso();
    const horizonIso = addDaysIso(todayIso, 14);  // look ahead 14 days

    // Fetch due subscriptions
    const { data: due, error: fetchErr } = await supabase
      .from('recurring_bookings' as any)
      .select('*')
      .eq('is_active', true)
      .is('cancelled_at', null)
      .lte('next_booking_date', horizonIso);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = (due || []) as unknown as RecurringBooking[];
    // Filter out paused ones (doing this in code — null-safe)
    const eligible = rows.filter((r: any) => {
      const pausedUntil = r.paused_until;
      if (!pausedUntil) return true;
      return pausedUntil < todayIso;
    });

    const results: Array<{ bookingId: string; ok: boolean; appointmentId?: string; error?: string }> = [];
    for (const rb of eligible) {
      const r = await processOne(rb, todayIso);
      results.push({ bookingId: rb.id, ...r });
    }

    const successes = results.filter(r => r.ok).length;
    const failures = results.filter(r => !r.ok).length;

    console.log(`[generate-recurring] ${successes} appointments generated, ${failures} failed, ${rows.length - eligible.length} paused`);

    return new Response(JSON.stringify({
      ok: true,
      scanned: rows.length,
      eligible: eligible.length,
      created: successes,
      failed: failures,
      paused: rows.length - eligible.length,
      horizon: horizonIso,
      results,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[generate-recurring] unhandled', err);
    return new Response(JSON.stringify({ error: err?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
