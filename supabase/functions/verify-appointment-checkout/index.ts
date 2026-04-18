import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * VERIFY APPOINTMENT CHECKOUT — Post-Stripe-redirect fallback + notification hub.
 *
 * Called client-side after Stripe redirects back. Responsibilities:
 *  1. Verify the Stripe session actually paid
 *  2. Check that the requested date isn't blocked (defensive — if client
 *     bypassed the date picker, server STILL rejects)
 *  3. Create the appointment if the webhook hasn't already (idempotent)
 *  4. Auto-assign a default phlebotomist so the card appears on the
 *     phleb dashboard (prior bug: phleb_id was null → invisible)
 *  5. Normalize appointment_date to noon-local so calendar rendering
 *     is immune to UTC↔local conversion shenanigans
 *  6. Fire the full notification trio: patient (email+SMS), phleb SMS,
 *     owner SMS. The webhook may ALSO fire these, but notifications are
 *     idempotent (duplicate confirmation texts are a much smaller sin
 *     than missed ones).
 *
 * If a blocked date is detected post-payment, the appointment is still
 * created (don't lose the booking), but it's flagged + an URGENT SMS
 * is sent to the owner so they can call the patient to reschedule.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// Default phleb = Nico (the owner-operator). Single-phleb shop today.
// Swap to lookup logic when a second phleb is hired.
const DEFAULT_PHLEB_ID = Deno.env.get('DEFAULT_PHLEB_ID') || '91c76708-8c5b-4068-92c6-323805a3b164';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';

async function sendSMS(phone: string, message: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return false;
  try {
    const cleanPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: cleanPhone, Body: message.substring(0, 1500), From: TWILIO_FROM }).toString(),
    });
    return resp.ok;
  } catch (e) {
    console.error('SMS error:', e);
    return false;
  }
}

async function isDateBlocked(dateOnly: string): Promise<{ blocked: boolean; reason?: string }> {
  try {
    const { data } = await supabaseClient
      .from('time_blocks')
      .select('start_date, end_date, reason, block_type')
      .lte('start_date', dateOnly)
      .gte('end_date', dateOnly)
      .eq('block_type', 'office_closure')
      .limit(1);
    if (data && data.length > 0) {
      return { blocked: true, reason: data[0].reason || 'office closure' };
    }
  } catch (e) {
    console.warn('blocked-date check failed:', e);
  }
  return { blocked: false };
}

function normalizeAppointmentDate(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const dateOnly = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return raw;
  return `${dateOnly}T12:00:00-04:00`;
}

/**
 * Generate a URL-safe token for guest-booking view URLs.
 * 32 chars, base64url (no +, /, =).
 */
function generateViewToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .substring(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: 'session_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First check if the appointment has been created by the webhook
    const { data: appointment } = await supabaseClient
      .from('appointments')
      .select('*')
      .eq('stripe_checkout_session_id', session_id)
      .maybeSingle();

    if (appointment) {
      return new Response(
        JSON.stringify({
          status: 'completed',
          appointment,
          bookingId: appointment.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no appointment yet, check the Stripe session status
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      // Give webhook 3 seconds to process first (race condition guard)
      await new Promise(r => setTimeout(r, 3000));

      const { data: lateAppointment } = await supabaseClient
        .from('appointments')
        .select('*')
        .eq('stripe_checkout_session_id', session_id)
        .maybeSingle();

      if (lateAppointment) {
        return new Response(
          JSON.stringify({ status: 'completed', appointment: lateAppointment, bookingId: lateAppointment.id }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Payment confirmed — create appointment (webhook didn't handle it)
      const metadata = session.metadata || {};
      const fullAddress = [metadata.address, metadata.city, metadata.state, metadata.zip_code].filter(Boolean).join(', ');
      const patientName = `${metadata.patient_first_name || ''} ${metadata.patient_last_name || ''}`.trim();

      // Normalize the date — noon local so calendar day is stable
      const normalizedDate = normalizeAppointmentDate(metadata.appointment_date);
      const dateOnly = (metadata.appointment_date || '').slice(0, 10);

      // Defensive: is this date blocked? (In case client bypassed the picker.)
      let blockedFlag = false;
      let blockedReason: string | undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
        const check = await isDateBlocked(dateOnly);
        blockedFlag = check.blocked;
        blockedReason = check.reason;
      }

      // Read first-class attachment fields from Stripe metadata. Before this fix,
      // only the webhook regex-extracted lab file paths from notes, and ONLY if
      // the webhook fired. The verify-fallback path dropped them silently — which
      // is why 56/57 recent bookings lost the lab file.
      const firstLabFile = String(metadata.lab_order_file_paths || '').split(',')[0]?.trim() || null;

      const { data: newAppt, error: insertError } = await supabaseClient
        .from('appointments')
        .insert([{
          appointment_date: normalizedDate,
          appointment_time: metadata.appointment_time || null,
          patient_id: metadata.user_id || null,
          phlebotomist_id: DEFAULT_PHLEB_ID,
          view_token: generateViewToken(), // guest-view URL key
          patient_name: patientName || null,
          patient_email: metadata.patient_email || null,
          patient_phone: metadata.patient_phone || null,
          service_type: metadata.service_type || 'mobile',
          service_name: metadata.service_name || 'Blood Draw',
          status: 'scheduled',
          payment_status: 'completed',
          total_amount: (session.amount_total || 0) / 100,
          tip_amount: parseInt(metadata.tip_amount || '0') / 100,
          service_price: parseInt(metadata.service_price || '0') / 100,
          address: fullAddress || 'Pending',
          zipcode: metadata.zip_code || '32801',
          stripe_checkout_session_id: session_id,
          stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          booking_source: 'online',
          notes: [
            metadata.additional_notes,
            blockedFlag ? `⚠️ DATE WAS BLOCKED: ${blockedReason} — needs reschedule` : null,
          ].filter(Boolean).join(' | ') || null,
          weekend_service: metadata.weekend === 'true',
          // First-class attachment fields — the whole reason we're here
          lab_order_file_path: firstLabFile || null,
          insurance_card_path: metadata.insurance_card_path || null,
          lab_destination: metadata.lab_destination || null,
          lab_destination_pending: metadata.lab_destination_pending === 'true',
          // Partner/org linkage (if booking came from a provider)
          organization_id: metadata.organization_id || null,
          billed_to: metadata.billed_to || 'patient',
          patient_name_masked: metadata.patient_name_masked === 'true',
          org_reference_id: metadata.organization_id && metadata.patient_name_masked === 'true'
            ? `${String(metadata.organization_name || 'ORG').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4)}-${Date.now().toString().slice(-6)}`
            : null,
        }])
        .select()
        .single();

      if (insertError) {
        // Might be duplicate — try fetching again
        const { data: existing } = await supabaseClient
          .from('appointments')
          .select('*')
          .eq('stripe_checkout_session_id', session_id)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ status: 'completed', appointment: existing, bookingId: existing.id }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.error('[CRITICAL] Appointment INSERT failed:', insertError);
        // Urgent SMS to owner — payment taken but appointment creation failed
        await sendSMS(OWNER_PHONE,
          `[URGENT] Payment received but appointment INSERT failed. Session ${session_id.slice(-12)}. Patient: ${patientName || metadata.patient_email}. Call them + manually create. Error: ${insertError.message}`,
        );
        return new Response(
          JSON.stringify({ status: 'processing' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ── Trigger OCR on the uploaded lab order (fire-and-forget) ──
      // Phleb card uses the extracted text for fasting banners + panel chips.
      if (firstLabFile) {
        try {
          supabaseClient.functions.invoke('ocr-lab-order', {
            body: { appointmentId: newAppt.id },
          }).catch((e) => console.warn('[ocr] trigger failed (non-blocking):', e));
        } catch (e) { console.warn('[ocr] invoke exception:', e); }
      }

      // ── Admin ping if destination is pending doctor confirmation ──
      if (metadata.lab_destination_pending === 'true') {
        try {
          await sendSMS(OWNER_PHONE,
            `📞 Destination pending: ${patientName} booked ${dateOnly} but needs follow-up to confirm which lab. Call: ${metadata.patient_phone || metadata.patient_email}`,
          );
        } catch (e) { console.warn('admin ping failed:', e); }
      }

      // Compute displayDate up-front (used by both celebration + phleb/owner SMS below)
      const displayDate = dateOnly ? new Date(dateOnly + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      }) : metadata.appointment_date || 'TBD';

      // ── Fire the notification trio (fire-and-forget, non-blocking) ──
      // 1. Patient confirmation (email + SMS via send-appointment-confirmation)
      try {
        await supabaseClient.functions.invoke('send-appointment-confirmation', {
          body: { appointmentId: newAppt.id },
        });
      } catch (notifErr) {
        console.error('Patient confirmation error (non-blocking):', notifErr);
      }

      // ── CELEBRATION EMAIL: fire when a discount was applied ──
      // Either a membership correction OR a referral/promo code.
      const memberTier = (metadata.member_tier || 'none') as string;
      const memberCorrectionCents = parseInt(String(metadata.member_correction_cents || '0')) || 0;
      const referralCode = metadata.referral_code || '';
      const referralDiscountCents = parseInt(String(metadata.referral_discount_cents || '0')) || 0;
      const siteUrl = Deno.env.get('SITE_URL') || 'https://convelabs-website.vercel.app';
      const viewUrl = newAppt?.view_token ? `${siteUrl}/visit/${newAppt.view_token}` : `${siteUrl}/dashboard`;

      const shouldCelebrate =
        (memberTier !== 'none' && memberCorrectionCents > 0) ||
        (referralCode && referralDiscountCents > 0);

      if (shouldCelebrate) {
        try {
          const discountType = memberTier !== 'none' && memberCorrectionCents > 0 ? 'membership' : 'promo';
          const discountCents = discountType === 'membership' ? memberCorrectionCents : referralDiscountCents;
          await supabaseClient.functions.invoke('send-discount-celebration', {
            body: {
              to: metadata.patient_email,
              patient_name: patientName,
              discount_cents: discountCents,
              discount_type: discountType,
              membership_tier: memberTier !== 'none' ? memberTier : undefined,
              promo_code: referralCode || undefined,
              appointment_date: displayDate,
              appointment_time: metadata.appointment_time,
              view_url: viewUrl,
            },
          });
        } catch (celebErr) {
          console.error('Celebration email error (non-blocking):', celebErr);
        }

        // Flip the intent-logged upgrade_events to converted for ROI accounting
        try {
          const targetType = memberTier !== 'none' && memberCorrectionCents > 0
            ? 'membership_applied'
            : 'promo_applied';
          await supabaseClient
            .from('upgrade_events')
            .update({
              status: 'converted',
              appointment_id: newAppt.id,
              revenue_cents: (session.amount_total || 0),
              converted_at: new Date().toISOString(),
            })
            .eq('patient_email', (metadata.patient_email || '').toLowerCase())
            .eq('event_type', targetType)
            .eq('status', 'intent')
            .is('appointment_id', null);
        } catch (e) { console.warn('upgrade_events convert flip failed (non-blocking):', e); }
      }

      // 2. Phleb SMS — so they know they have a new booking on their schedule
      const phlebMsg =
        `[NEW BOOKING] ${patientName || 'Patient'}\n` +
        `${displayDate} @ ${metadata.appointment_time || 'TBD'}\n` +
        `${fullAddress || 'Address TBD'}\n` +
        `Service: ${metadata.service_name || metadata.service_type || 'Blood Draw'}\n` +
        `Patient: ${metadata.patient_phone || metadata.patient_email || ''}`;

      // Default phleb = owner for now, so use owner phone
      await sendSMS(OWNER_PHONE, phlebMsg);

      // 3. Owner separate "payment received" ping (same number today, different message)
      const amount = (session.amount_total || 0) / 100;
      const ownerMsg =
        `💰 Payment: $${amount.toFixed(2)} — ${patientName || metadata.patient_email}\n` +
        `For ${displayDate} @ ${metadata.appointment_time || 'TBD'}${blockedFlag ? ` ⚠️ ON BLOCKED DATE (${blockedReason})` : ''}`;
      await sendSMS(OWNER_PHONE, ownerMsg);

      // If the date was blocked, escalate IMMEDIATELY with a call-to-action
      if (blockedFlag) {
        await sendSMS(OWNER_PHONE,
          `[URGENT] ${patientName} booked on BLOCKED date ${displayDate} (${blockedReason}). Call ${metadata.patient_phone || metadata.patient_email} to reschedule.`,
        );
      }

      return new Response(
        JSON.stringify({
          status: 'completed',
          appointment: newAppt,
          bookingId: newAppt.id,
          ...(blockedFlag ? { warning: 'booked_on_blocked_date', blockedReason } : {}),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.status === 'expired') {
      return new Response(
        JSON.stringify({ status: 'expired' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ status: 'pending' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error verifying appointment checkout:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
