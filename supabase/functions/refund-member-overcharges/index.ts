import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { stripe } from '../_shared/stripe.ts';

/**
 * REFUND MEMBER OVERCHARGES — Retroactive Fix
 *
 * Scans the last N days of appointments. For each one where:
 *   - Patient has an active membership
 *   - Appointment was charged at full price (non-member tier)
 *
 * …calculates the overcharge, issues a partial Stripe refund for the
 * difference, and sends the patient an SMS explaining what happened.
 *
 * Hormozi principle: when you find a mistake, FIX IT LOUDLY. Patients
 * trust companies that catch their own errors and make them right
 * before being asked. Every refund you send unprompted is a story
 * that customer tells their friends.
 *
 * Callable on-demand (admin button) OR one-off. Dry-run mode supported.
 *
 * POST body:
 *   {
 *     "days": 60,          // default: 60
 *     "dryRun": true,      // default: true (safe; set false to execute)
 *     "notify": true       // default: true (sends SMS with refund note)
 *   }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MemberTier = 'none' | 'member' | 'vip' | 'concierge';

const TIER_PRICING: Record<string, Record<MemberTier, number>> = {
  'mobile':               { none: 150, member: 130, vip: 115, concierge: 99 },
  'in-office':            { none: 55,  member: 49,  vip: 45,  concierge: 39 },
  'senior':               { none: 100, member: 85,  vip: 75,  concierge: 65 },
  'specialty-kit':        { none: 185, member: 165, vip: 150, concierge: 135 },
  'specialty-kit-genova': { none: 200, member: 180, vip: 165, concierge: 150 },
  'therapeutic':          { none: 200, member: 180, vip: 165, concierge: 150 },
};

async function sendSMS(
  phone: string,
  message: string,
  accountSid: string,
  authToken: string,
  fromNumber: string,
): Promise<boolean> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const cleanPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: cleanPhone, Body: message.substring(0, 1500), From: fromNumber }).toString(),
    });
    return resp.ok;
  } catch (e) {
    console.error('SMS error:', e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const daysBack = body.days || 60;
    const dryRun = body.dryRun !== false; // Default TRUE for safety
    const notify = body.notify !== false;

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
    const smsReady = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN;

    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    // ── Step 1: pull all paid appointments in the window ─────────────
    const { data: appts, error: apptError } = await supabase
      .from('appointments')
      .select('id, patient_email, patient_phone, patient_name, service_type, total_amount, tip_amount, stripe_payment_intent_id, stripe_invoice_id, payment_status, created_at, appointment_date')
      .gte('appointment_date', sinceDate)
      .eq('payment_status', 'completed')
      .not('status', 'in', '("cancelled","refunded")');

    if (apptError) throw new Error(`Appointment query failed: ${apptError.message}`);

    const results = {
      scanned: appts?.length || 0,
      member_appointments: 0,
      overcharged: 0,
      refunded: 0,
      skipped_no_payment_intent: 0,
      refund_errors: 0,
      total_refunded_cents: 0,
      details: [] as any[],
    };

    if (!appts || appts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No appointments found in window', ...results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Step 2: for each appointment, check membership + recalc ─────
    for (const appt of appts) {
      if (!appt.patient_email) continue;

      // Look up membership
      const { data: tp } = await supabase
        .from('tenant_patients')
        .select('user_id')
        .ilike('email', appt.patient_email)
        .maybeSingle();
      if (!tp?.user_id) continue;

      const { data: mem } = await supabase
        .from('user_memberships')
        .select('*, membership_plans(name), created_at')
        .eq('user_id', tp.user_id)
        .eq('status', 'active')
        .maybeSingle();
      if (!mem) continue;

      // Only count overcharge if membership was active BEFORE the appointment
      const memCreated = (mem as any).created_at;
      if (memCreated && new Date(memCreated) > new Date(appt.appointment_date)) {
        continue;
      }

      results.member_appointments++;

      const planName = (((mem as any).membership_plans?.name) || '').toLowerCase();
      let tier: MemberTier = 'member';
      if (planName.includes('concierge')) tier = 'concierge';
      else if (planName.includes('vip')) tier = 'vip';

      const pricing = TIER_PRICING[appt.service_type];
      if (!pricing) continue;

      // Compute the overcharge: if the paid total_amount is closer to base price
      // than member tier, they were overcharged.
      const paid = Number(appt.total_amount) || 0;
      const expectedMember = pricing[tier];
      const basePrice = pricing['none'];
      const overcharge = basePrice - expectedMember;

      // Only treat as overcharge if they paid close to base price (within $5 tolerance)
      const paidNearBase = Math.abs(paid - basePrice) < 5;
      if (!paidNearBase) continue;

      results.overcharged++;

      const detail: any = {
        appointmentId: appt.id,
        email: appt.patient_email,
        name: appt.patient_name,
        service: appt.service_type,
        paid,
        shouldHavePaid: expectedMember,
        overcharge,
        tier,
      };

      if (!appt.stripe_payment_intent_id) {
        detail.action = 'skipped_no_payment_intent';
        results.skipped_no_payment_intent++;
        results.details.push(detail);
        continue;
      }

      if (dryRun) {
        detail.action = 'dry_run_would_refund';
        results.details.push(detail);
        continue;
      }

      // ── Issue the partial refund ──
      try {
        const refund = await stripe.refunds.create({
          payment_intent: appt.stripe_payment_intent_id,
          amount: overcharge * 100, // cents
          reason: 'requested_by_customer',
          metadata: {
            type: 'member_overcharge_correction',
            appointment_id: appt.id,
            tier,
            overcharge_cents: String(overcharge * 100),
          },
        });

        detail.action = 'refunded';
        detail.refundId = refund.id;
        results.refunded++;
        results.total_refunded_cents += overcharge * 100;

        // Record the refund on the appointment
        await supabase.from('appointments').update({
          total_amount: expectedMember,
          notes: `[Auto] Member-discount correction refunded: $${overcharge} via ${refund.id}. Paid tier: ${tier}.`,
        }).eq('id', appt.id);

        // Notify the patient
        if (notify && appt.patient_phone && smsReady) {
          const sent = await sendSMS(
            appt.patient_phone,
            `ConveLabs: We caught a billing mistake on your recent ${appt.service_type} visit. As a ${tier}, you should have been charged $${expectedMember} instead of $${paid}. We've refunded $${overcharge} to your card. Sorry about that — thanks for being a member. — The ConveLabs team.`,
            TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM,
          );
          detail.sms_sent = sent;
        }
      } catch (e: any) {
        detail.action = 'refund_failed';
        detail.error = e.message;
        results.refund_errors++;
      }

      results.details.push(detail);
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      daysScanned: daysBack,
      ...results,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Refund script error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
