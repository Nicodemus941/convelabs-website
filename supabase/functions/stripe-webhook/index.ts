import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from "../_shared/stripe.ts";
import { verifyRecipientEmail, verifyRecipientPhone } from "../_shared/verify-recipient.ts";

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response(JSON.stringify({ error: 'No signature provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.text();
    const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
    let event;

    try {
      // MUST use constructEventAsync in Deno/Supabase Edge Functions
      // constructEvent (sync) fails with SubtleCryptoProvider error
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        endpointSecret
      );
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // T2: log ONCE at end of handler (success) or in catch (error). The
    // previous code wrote a "processing" row here, before handler work.
    // If the handler crashed past this point without reaching the success
    // update, the row was stranded as "processing" — no way to tell success
    // from failure from an orphan. Now: no row until the outcome is known.
    console.log(`Processing event type: ${event.type}`);
    const webhookLogId = crypto.randomUUID();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Get customer and checkout IDs
      const customerId = session.customer;
      const checkoutId = session.id;

      // Get metadata from session
      const metadata = session.metadata || {};

      // Check if this is a Supernova member signup
      const isSupernovaMember = metadata.is_supernova_member === 'true';

      // Check if this is an upgrade
      const isUpgrade = metadata.is_upgrade === 'true';

      // isFoundingMember is INTENT only — the webhook calls claim_founding_seat
      // RPC post-insert to actually assign seat number 1-50 atomically.
      // The real "is this person a founder?" truth is founding_member_number
      // IS NOT NULL in user_memberships. See Founding 50 system (2026-04-19).
      const isFoundingMember = metadata.founding_member === 'true';

      // Whitelist of known metadata.type values. Anything not on this list
      // with metadata.type SET is a client-side bug or a malicious/stale
      // session — we used to silently fall through to handleMembershipSignup,
      // which misclassified the charge and created a phantom membership.
      // Now we reject explicitly; the outer catch logs to error_logs with
      // the full session id so we can diagnose and manually reprocess.
      const KNOWN_TYPES = new Set([
        'appointment_payment',
        'lab_request_unlock',
        'bundle_payment',
        'subscription_payment',
        'credit_pack',
        'org_subscription',
      ]);
      if (metadata.type && !KNOWN_TYPES.has(metadata.type)) {
        throw new Error(
          `unknown metadata.type="${metadata.type}" on session ${session.id} — refusing to default to membership signup. Investigate and replay manually.`
        );
      }

      // Handle appointment payments
      if (metadata.type === 'appointment_payment') {
        await handleAppointmentPayment(session);
      }
      // Handle lab-request unlock (membership + visit bundled in one checkout)
      else if (metadata.type === 'lab_request_unlock') {
        await handleLabRequestUnlock(session);
      }
      // Handle bundle (prepaid recurring series) payments
      else if (metadata.type === 'bundle_payment') {
        await handleBundlePayment(session);
      }
      // Handle subscription (patient recurring plan) checkout completion
      else if (metadata.type === 'subscription_payment') {
        await handleSubscriptionCheckoutComplete(session);
      }
      // Handle credit pack purchases
      else if (metadata.type === 'credit_pack') {
        await handleCreditPackPurchase(session);
      }
      // Handle org-subscription checkout (practice-pays-per-seat plan)
      else if (metadata.type === 'org_subscription') {
        await handleOrgSubscriptionActivated(session);
      }
      // Handle membership upgrades
      else if (isUpgrade) {
        await handleMembershipUpgrade(session, isFoundingMember, isSupernovaMember);
      }
      // Handle regular membership signups (no metadata.type — legacy path)
      else {
        await handleMembershipSignup(session, isFoundingMember, isSupernovaMember);
      }
    }
    // Handle subscription updated (e.g. renewing)
    else if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      await handleSubscriptionUpdate(subscription);
    }
    // Handle subscription canceled
    else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      await handleSubscriptionCancellation(subscription);
    }
    // Handle payment failures
    else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      await handlePaymentFailure(invoice);
    }
    // Handle refunds — fires when any refund is issued (via process-refund,
    // Stripe dashboard, or auto-refund from a dispute). Keeps the QB ledger
    // in sync with reality — previously a refund in Stripe produced no
    // compensating entry in stripe_qb_sync_log → books over-stated revenue.
    else if (event.type === 'charge.refunded') {
      await handleChargeRefunded(event.data.object);
    }
    // Handle invoice paid (for manual appointment invoices)
    else if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const appointmentId = invoice.metadata?.appointment_id;
      if (appointmentId) {
        console.log(`Invoice paid for appointment: ${appointmentId}`);
        const { error } = await supabaseClient
          .from('appointments')
          .update({
            payment_status: 'completed',
            invoice_status: 'paid',
            stripe_payment_intent_id: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : null,
          })
          .eq('id', appointmentId);
        if (error) console.error('Error updating appointment payment:', error);
        else console.log(`Appointment ${appointmentId} marked as paid via invoice`);
      } else if (invoice.id) {
        // Try matching by stripe_invoice_id
        const { error } = await supabaseClient
          .from('appointments')
          .update({
            payment_status: 'completed',
            invoice_status: 'paid',
          })
          .eq('stripe_invoice_id', invoice.id);
        if (error) console.error('Error updating by invoice ID:', error);
      }
    }

    // Log success (insert, not update — we no longer write a pre-handler row)
    // NOTE: Supabase query builders are thenable but do NOT expose .catch()
    // directly. Calling .catch() on .insert() throws "catch is not a function"
    // synchronously BEFORE the Promise resolves — which was wrapping every
    // webhook in an error because this log-success path fired unconditionally.
    // Fix: proper try/catch instead of the builder.catch() footgun.
    try {
      await supabaseClient.from('webhook_logs').insert({
        id: webhookLogId,
        event_type: event.type,
        stripe_session_id: event.data?.object?.id || null,
        status: 'success',
        payload_summary: { type: event.type, metadata_type: event.data?.object?.metadata?.type || null },
      });
    } catch (_logErr) { /* non-blocking */ }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    const msg = err?.message || String(err);
    const stack = err?.stack || '';
    console.error(`[stripe-webhook] top-level crash: ${msg}\n${stack}`);

    // Persist to BOTH webhook_logs and error_logs so we have redundant visibility.
    // Previously this insert was silently .catch()'d — meaning any crash after
    // signature-verification but before a handler-specific catch was invisible.
    // That's how 500s slipped past us: the runtime saw an unhandled rejection
    // before we could log the real error. Now both tables get the stack trace.
    await Promise.allSettled([
      supabaseClient.from('webhook_logs').insert({
        event_type: 'webhook_error',
        status: 'failed',
        error_message: msg.substring(0, 2000),
      }),
      supabaseClient.from('error_logs').insert({
        component: 'stripe-webhook',
        action: 'top_level_catch',
        error_type: 'unhandled',
        error_message: msg.substring(0, 2000),
        error_stack: stack.substring(0, 4000),
      }),
    ]);

    // Return 200 so Stripe stops retrying — we've captured the error server-side.
    // A 4xx/5xx triggers Stripe's exponential backoff which fires the same event
    // dozens of times per day and pollutes the dashboard. If our code can't
    // process the event, retrying won't help; we'll fix it and manually resend.
    return new Response(JSON.stringify({ received: true, logged_error: msg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Handle credit pack purchases
/**
 * Handle a prepaid bundle (recurring series) payment.
 * Sprint 4: when admin creates a recurring series with paymentMode=prepaid_bundle,
 * the patient is handed a Stripe checkout for the discounted total. This handler
 * runs when that checkout completes — marks the bundle + all linked appointments
 * as paid, and pings the owner.
 */
async function handleBundlePayment(session: any) {
  const metadata = session.metadata || {};
  const bundleId = metadata.bundle_id;
  if (!bundleId) {
    console.warn('[bundle_payment] no bundle_id in metadata');
    return;
  }

  const paidAmount = (session.amount_total || 0) / 100;

  // Mark the bundle paid by stamping amount_paid + making sure the session id matches
  try {
    await supabaseClient
      .from('visit_bundles' as any)
      .update({
        amount_paid: paidAmount,
        stripe_checkout_session_id: session.id,
      })
      .eq('id', bundleId);
  } catch (e) {
    console.error('[bundle_payment] failed to update bundle:', e);
  }

  // Every appointment linked to this bundle is now prepaid — mark payment_status completed
  try {
    const { data: updated } = await supabaseClient
      .from('appointments')
      .update({ payment_status: 'completed', invoice_status: 'not_required' })
      .eq('visit_bundle_id', bundleId)
      .select('id');
    console.log(`[bundle_payment] marked ${updated?.length || 0} appointments paid`);
  } catch (e) {
    console.error('[bundle_payment] failed to flip appointment payment_status:', e);
  }

  // Owner SMS
  try {
    const ownerPhone = Deno.env.get('OWNER_PHONE') || '9415279169';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: ownerPhone.startsWith('+') ? ownerPhone : `+1${ownerPhone.replace(/\D/g, '')}`,
          Body: `💰 Bundle PREPAID: $${paidAmount.toFixed(2)} — ${metadata.patient_name || metadata.patient_email || '(unknown)'} · ${metadata.occurrences || '?'} visits starting ${metadata.start_date || 'TBD'}`,
          From: TWILIO_FROM,
        }).toString(),
      });
    }
  } catch (e) {
    console.warn('[bundle_payment] owner SMS non-blocking fail:', e);
  }
}

/**
 * Activates an org-level subscription (practice-pays-per-seat plan).
 * Stamps the organizations row with subscription status + seats + price
 * so the provider dashboard + admin view reflect the new state instantly.
 */
async function handleOrgSubscriptionActivated(session: any) {
  try {
    const meta = session.metadata || {};
    const orgId = meta.organization_id;
    const seatCap = parseInt(meta.seat_cap || '0', 10) || 0;
    const perSeatCents = parseInt(meta.per_seat_cents || '8500', 10) || 8500;
    const priceCents = seatCap * perSeatCents;

    if (!orgId) {
      console.error('[org-subscription-activated] missing organization_id', session.id);
      return;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    await supabase.from('organizations').update({
      subscription_status: 'active',
      subscription_tier: 'per_patient',
      subscription_started_at: new Date().toISOString(),
      subscription_seat_cap: seatCap,
      subscription_per_seat_cents: perSeatCents,
      subscription_price_cents: priceCents,
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription,
    }).eq('id', orgId);

    console.log(`[org-subscription] activated org=${orgId} seats=${seatCap} $${priceCents/100}/mo`);
  } catch (e: any) {
    console.error('[org-subscription-activated] error:', e?.message);
  }
}

async function handleCreditPackPurchase(session: any) {
  try {
    const { metadata, customer_details, id: checkout_id, payment_intent } = session;
    
    // Extract customer email
    const customerEmail = customer_details?.email;
    if (!customerEmail) {
      throw new Error('No customer email provided');
    }
    
    // Get user ID from tenant_patients (auth.users is not accessible via PostgREST)
    const { data: patientData, error: patientError } = await supabaseClient
      .from('tenant_patients')
      .select('user_id, id')
      .ilike('email', customerEmail)
      .maybeSingle();

    if (patientError || !patientData?.user_id) {
      throw new Error(`Could not find patient with email ${customerEmail}`);
    }

    const userId = patientData.user_id;
    const creditsAmount = parseInt(metadata.credits_amount || '4', 10);
    const expiration = new Date();
    expiration.setFullYear(expiration.getFullYear() + 1); // Credit packs expire after 1 year
    
    // Store the credit pack
    const { data: creditPack, error: creditPackError } = await supabaseClient
      .from('credit_packs')
      .insert([{
        user_id: userId,
        credits_amount: creditsAmount,
        credits_remaining: creditsAmount,
        price: session.amount_total,
        purchase_date: new Date(),
        stripe_checkout_id: checkout_id,
        stripe_payment_id: payment_intent,
        expires_at: expiration.toISOString(),
        is_active: true
      }])
      .select()
      .single();
    
    if (creditPackError) {
      throw new Error(`Failed to create credit pack: ${creditPackError.message}`);
    }
    
    console.log(`Created credit pack for user ${userId}: ${creditsAmount} credits`);
    return creditPack;
  } catch (error) {
    console.error('Error processing credit pack purchase:', error);
    throw error;
  }
}

// Handle membership signup
async function handleMembershipSignup(session: any, isFoundingMember = false, isSupernovaMember = false) {
  try {
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const customerEmail = session.customer_details?.email;
    const planId = session.metadata?.plan_id;
    const billingFrequency = session.metadata?.billing_frequency;
    const bonusCredits = parseInt(session.metadata?.bonus_credits || '0', 10);
    const promotionLockedPrice = session.metadata?.promotion_locked_price 
      ? parseInt(session.metadata.promotion_locked_price, 10) 
      : null;
    const selectedAddOnId = session.metadata?.selected_add_on_id || null;

    if (!customerEmail) {
      throw new Error('No customer email provided');
    }

    if (!planId) {
      throw new Error('No plan ID provided');
    }

    // Get user ID from tenant_patients (auth.users not accessible via PostgREST)
    const { data: memberPatient, error: memberPatientError } = await supabaseClient
      .from('tenant_patients')
      .select('user_id, id')
      .ilike('email', customerEmail)
      .maybeSingle();

    if (memberPatientError || !memberPatient?.user_id) {
      throw new Error(`Could not find patient with email ${customerEmail}`);
    }

    const userId = memberPatient.user_id;

    // Fetch the selected plan
    const { data: planData, error: planError } = await supabaseClient
      .from('membership_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !planData) {
      throw new Error(`Could not find plan with ID ${planId}`);
    }

    // Calculate the next renewal date
    let nextRenewal = new Date();
    if (billingFrequency === 'monthly') {
      nextRenewal.setMonth(nextRenewal.getMonth() + 1);
    } else if (billingFrequency === 'quarterly') {
      nextRenewal.setMonth(nextRenewal.getMonth() + 3);
    } else if (billingFrequency === 'annually') {
      nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
    }

    // NOTE (2026-04-19): removed stale 2025-launch-era logic that forced
    // billing_cycle_anchor to Sept 1 for "founding members" (defined as
    // signed-up-before-Aug-1-2025). The Founding 50 concept now means
    // "one of the first 50 VIP seats" (claim_founding_seat RPC), not a
    // date window. Membership is active and billing cycle anchored on
    // the payment date — the default Stripe behavior.
    const nextBillingOverride = null;

    // Upsert the user membership — Stripe replays checkout.session.completed
    // on retry (or when an admin resends from the dashboard). Before we had
    // the uniq_user_memberships_stripe_sub index + upsert below, each replay
    // created a SECOND row with full credits allocated — silent credit leak.
    // onConflict uses stripe_subscription_id because that's what the unique
    // index is keyed on. ignoreDuplicates:false ensures we still get the row
    // back so agreement-linking + add-on insertion see the correct id.
    const { data: membershipData, error: membershipError } = await supabaseClient
      .from('user_memberships')
      .upsert([{
        user_id: userId,
        plan_id: planId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        billing_frequency: billingFrequency,
        credits_remaining: planData.credits_per_year + bonusCredits,
        credits_allocated_annual: planData.credits_per_year,
        next_renewal: nextRenewal.toISOString(),
        is_primary_member: true,
        founding_member: isFoundingMember,
        founding_member_signup_date: isFoundingMember ? new Date().toISOString() : null,
        next_billing_override: nextBillingOverride ? nextBillingOverride.toISOString() : null,
        is_supernova_member: isSupernovaMember,
        bonus_credits: bonusCredits,
        promotion_locked_price: promotionLockedPrice,
        supernova_enrollment_date: isSupernovaMember ? new Date().toISOString() : null
      }], { onConflict: 'stripe_subscription_id', ignoreDuplicates: false })
      .select()
      .single();

    if (membershipError) {
      throw new Error(`Failed to create membership: ${membershipError.message}`);
    }

    console.log(`Created membership for user ${userId} with plan ${planId}`);

    // ── FOUNDING 50 SEAT CLAIM ─────────────────────────────────────
    // If (a) the checkout flagged this as founding intent AND (b) the
    // plan is VIP, atomically claim the next founding seat number.
    // The RPC serializes via row-lock on system_settings, enforces the
    // 50-cap server-side, and sets founding_member_number +
    // founding_locked_rate_cents on the row we just upserted.
    //
    // If the cap is already reached: RPC returns NULL, the membership
    // is still active, but the user doesn't get founding status. No
    // error thrown — graceful degradation.
    const isVipPlan = String(planData?.name || '').toLowerCase() === 'vip';
    if (isFoundingMember && isVipPlan && (membershipData as any)?.id) {
      try {
        const { data: seatNumber, error: claimErr } = await supabaseClient
          .rpc('claim_founding_seat' as any, { p_membership_id: (membershipData as any).id });
        if (claimErr) {
          console.warn(`[founding-50] claim RPC error (non-blocking):`, claimErr.message);
        } else if (seatNumber) {
          console.log(`[founding-50] assigned seat #${seatNumber} to membership ${(membershipData as any).id}`);
        } else {
          console.log(`[founding-50] cap reached — membership ${(membershipData as any).id} created WITHOUT founding status`);
        }
      } catch (e: any) {
        console.warn(`[founding-50] claim exception (non-blocking):`, e?.message || e);
      }
    }

    // Link the signed agreement to the now-active membership (Sprint: membership agreements)
    // Agreement row was written BEFORE checkout; we find it by metadata.agreement_id
    // that the client passed through create-checkout-session → Stripe metadata.
    const agreementId = session.metadata?.agreement_id;
    if (agreementId) {
      try {
        // Was `(membership as any)?.id` — but `membership` is not defined in
        // this scope (the variable is `membershipData`). Silent ReferenceError
        // wrapped in the inner try, which meant agreement→membership links
        // never got written. Audit trail was broken for every signup.
        await supabaseClient.from('membership_agreements' as any).update({
          user_membership_id: (membershipData as any)?.id || null,
          stripe_subscription_id: subscriptionId,
          stripe_checkout_session_id: session.id,
        }).eq('id', agreementId);
        console.log(`Linked agreement ${agreementId} to membership ${(membershipData as any)?.id}`);
      } catch (e) {
        console.warn('[agreement link] non-blocking failure:', e);
      }
    } else {
      console.warn(`No agreement_id in metadata for ${customerEmail} — consider rejecting unsigned subscriptions in the future`);
    }
    
    // If this is a Supernova member with a selected add-on, create the add-on entry
    if (isSupernovaMember && selectedAddOnId) {
      const { error: addOnError } = await supabaseClient
        .from('user_add_ons')
        .insert([{
          user_id: userId,
          add_on_id: selectedAddOnId,
          is_active: true,
          is_supernova_benefit: true
        }]);
        
      if (addOnError) {
        console.error(`Failed to add Supernova add-on benefit: ${addOnError.message}`);
      } else {
        console.log(`Added Supernova add-on benefit for user ${userId}`);
      }
    }
    
    if (isFoundingMember) {
      console.log(`User ${userId} registered as Founding Member with next billing on ${nextBillingOverride?.toISOString()}`);
    }
    
    if (isSupernovaMember) {
      console.log(`User ${userId} registered as Supernova Member with ${bonusCredits} bonus credits`);
    }
    
    return membershipData;
  } catch (error) {
    console.error('Error processing membership signup:', error);
    throw error;
  }
}

// Handle subscription update
async function handleSubscriptionUpdate(subscription: any) {
  try {
    const subscriptionId = subscription.id;
    const status = subscription.status;
    const nextRenewalTimestamp = subscription.current_period_end;
    const nextRenewal = new Date(nextRenewalTimestamp * 1000).toISOString();

    // Update the user membership
    const { data, error } = await supabaseClient
      .from('user_memberships')
      .update({
        status: status,
        next_renewal: nextRenewal,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating membership:', error);
      throw error;
    }

    console.log(`Updated subscription ${subscriptionId} status to ${status}`);
    return data;
  } catch (error) {
    console.error('Error handling subscription update:', error);
    throw error;
  }
}

// Handle subscription cancellation
// T4 fix: cancel BOTH recurring_bookings AND user_memberships if both exist
// for the same subscription id. Previously we short-circuited after finding
// a recurring_booking match — any membership on the same subscription stayed
// active, leaving credits available after the patient's card was gone.
async function handleSubscriptionCancellation(subscription: any) {
  try {
    const subscriptionId = subscription.id;
    const results: { recurring_booking?: any; membership?: any; matched: number } = { matched: 0 };

    // 1. recurring_bookings (Tier 3 patient-paid recurring plan)
    const { data: recurring } = await supabaseClient
      .from('recurring_bookings' as any)
      .select('id, patient_email, is_active')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();

    if (recurring) {
      await supabaseClient.from('recurring_bookings' as any).update({
        is_active: false,
        cancelled_at: new Date().toISOString(),
      }).eq('id', (recurring as any).id);
      console.log(`[subscription.deleted] cancelled recurring_booking ${(recurring as any).id} (${(recurring as any).patient_email})`);
      results.recurring_booking = recurring;
      results.matched++;
    }

    // 2. user_memberships — ALSO check, don't skip if recurring matched.
    //    Shouldn't normally coexist but we don't enforce that at DB level,
    //    so the safe thing is cancel whatever exists.
    const { data: membership } = await supabaseClient
      .from('user_memberships')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId)
      .select()
      .maybeSingle();

    if (membership) {
      console.log(`[subscription.deleted] marked membership ${(membership as any).id} canceled`);
      results.membership = membership;
      results.matched++;
    }

    if (results.matched === 0) {
      console.warn(`[subscription.deleted] no match for ${subscriptionId} in recurring_bookings OR user_memberships`);
      return null;
    }
    if (results.matched === 2) {
      console.warn(`[subscription.deleted] DUAL match on ${subscriptionId} — recurring_booking AND membership share this sub id. Both cancelled, but investigate how they got linked to the same subscription.`);
    }
    return results;
  } catch (error) {
    console.error('Error handling subscription cancellation:', error);
    throw error;
  }
}

/**
 * Tier 3: recurring plan checkout completed. Flip the draft recurring_bookings
 * row to is_active=true and stamp the subscription id for future lifecycle events.
 */
async function handleSubscriptionCheckoutComplete(session: any) {
  const metadata = session.metadata || {};
  const recurringBookingId = metadata.recurring_booking_id;
  if (!recurringBookingId) {
    console.warn('[subscription_payment] no recurring_booking_id in metadata');
    return;
  }

  try {
    await supabaseClient.from('recurring_bookings' as any).update({
      is_active: true,
      stripe_subscription_id: session.subscription || null,
    }).eq('id', recurringBookingId);

    console.log(`[subscription_payment] activated recurring_booking ${recurringBookingId} (sub: ${session.subscription})`);

    // Owner SMS — confirm the subscription is live
    try {
      const ownerPhone = Deno.env.get('OWNER_PHONE') || '9415279169';
      const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
      const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
      const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: ownerPhone.startsWith('+') ? ownerPhone : `+1${ownerPhone.replace(/\D/g, '')}`,
            Body: `💰 RECURRING PLAN ACTIVE: ${metadata.patient_name || metadata.patient_email || '(unknown)'} — every ${metadata.frequency_weeks || '?'}w`,
            From: TWILIO_FROM,
          }).toString(),
        });
      }
    } catch (e) { console.warn('[subscription_payment] owner SMS non-blocking:', e); }
  } catch (e) {
    console.error('[subscription_payment] activation failed:', e);
  }
}

/**
 * Keep the QB ledger honest when money goes back out. Fires on every refund
 * — ours (process-refund), manual (Stripe dashboard), or automatic (dispute
 * lost). Before this handler, Stripe would show a refund but stripe_qb_sync_log
 * still showed full revenue → books over-stated income → tax-season surprise.
 *
 * Strategy: update the existing sync-log row's amount_refunded_cents + status,
 * AND write a compensating negative-amount row classified as "Refunds Issued"
 * so QB import sees both the original revenue and the reversing entry.
 */
async function handleChargeRefunded(charge: any) {
  try {
    const chargeId = charge.id;
    const totalRefunded = charge.amount_refunded || 0;
    const isFullRefund = totalRefunded >= charge.amount;

    // 1. Update the existing sync-log row (if we previously synced this charge)
    const { data: existing } = await supabaseClient
      .from('stripe_qb_sync_log')
      .select('id, appointment_id, amount_gross_cents, amount_refunded_cents, qb_class_name')
      .eq('stripe_charge_id', chargeId)
      .is('stripe_balance_transaction_id', null) // only match the revenue row, not compensating rows
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabaseClient
        .from('stripe_qb_sync_log')
        .update({
          amount_refunded_cents: totalRefunded,
          sync_status: isFullRefund ? 'refunded' : 'partial_refund',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      console.warn(`[charge.refunded] no sync_log row for ${chargeId} — skipping update, compensating entry will still be written`);
    }

    // 2. Write a compensating negative-amount row so QB sees a reversing
    //    entry even without our nightly sync. Idempotent via the charge.id +
    //    refund-marker suffix so multiple webhook deliveries don't duplicate.
    const refundMarkerId = `${chargeId}__refund`;
    const { data: refundExists } = await supabaseClient
      .from('stripe_qb_sync_log')
      .select('id')
      .eq('stripe_charge_id', refundMarkerId)
      .maybeSingle();

    if (!refundExists) {
      await supabaseClient
        .from('stripe_qb_sync_log')
        .insert({
          stripe_charge_id: refundMarkerId,
          stripe_customer_id: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
          charge_date: new Date().toISOString(),
          amount_gross_cents: -totalRefunded,
          amount_fee_cents: 0,
          amount_net_cents: -totalRefunded,
          amount_refunded_cents: 0,
          currency: charge.currency || 'usd',
          appointment_id: existing?.appointment_id || null,
          qb_account_name: 'Refunds Issued',
          qb_class_name: existing?.qb_class_name || null,
          qb_income_type: 'refund',
          sync_status: 'pending',
          raw_stripe_data: charge,
        });
    }

    // 3. If this charge was tied to an appointment, flag its refund status
    //    so the admin UI stops showing it as collectible revenue.
    if (existing?.appointment_id) {
      await supabaseClient
        .from('appointments')
        .update({
          refund_status: isFullRefund ? 'fully_refunded' : 'partially_refunded',
          payment_status: isFullRefund ? 'refunded' : 'partial_refund',
        })
        .eq('id', existing.appointment_id);
    }

    console.log(`[charge.refunded] processed ${chargeId}: refunded $${(totalRefunded / 100).toFixed(2)}${isFullRefund ? ' (full)' : ' (partial)'}`);
  } catch (error: any) {
    console.error('[charge.refunded] error:', error);
    // Don't re-throw — we want the webhook to 200 either way; error_logs
    // captured via the top-level catch in the main handler.
    throw error;
  }
}

// Handle payment failure
// Two paths: (a) subscription invoices → flip membership to past_due,
// (b) appointment invoices → flip the appointment into the reminder
// cascade so process-invoice-reminders picks it up. Before this, an
// appointment invoice that bounced produced zero follow-up; every
// failed-card charge was silently uncollectable unless a human noticed.
async function handlePaymentFailure(invoice: any) {
  try {
    const subscriptionId = invoice.subscription;
    const appointmentId = invoice.metadata?.appointment_id || null;

    // Path (b): appointment invoice — enroll in the existing dunning cascade
    if (appointmentId) {
      try {
        await supabaseClient
          .from('appointments')
          .update({
            payment_status: 'failed',
            invoice_status: 'sent', // triggers process-invoice-reminders
            invoice_sent_at: new Date().toISOString(),
          })
          .eq('id', appointmentId);

        // Append WHY payment failed to the notes field (read-then-append
        // because Postgres doesn't have a native ilike-append — keeps the
        // admin UI's notes section informative instead of "just reach out").
        const failReason = invoice.last_finalization_error?.message
          || invoice.charge?.failure_message
          || 'Card was declined';
        const { data: appt } = await supabaseClient
          .from('appointments').select('notes').eq('id', appointmentId).maybeSingle();
        const appended = [(appt?.notes || '').trim(), `[auto] Invoice payment failed ${new Date().toISOString().substring(0, 10)}: ${failReason}`].filter(Boolean).join(' | ');
        await supabaseClient.from('appointments').update({ notes: appended }).eq('id', appointmentId);

        console.log(`[invoice.payment_failed] appointment ${appointmentId} enrolled in reminder cascade`);
      } catch (e) {
        console.error('[invoice.payment_failed] appointment update error:', e);
      }
    }

    // Path (a): subscription invoice — mark membership past_due
    if (subscriptionId) {
      const { data, error } = await supabaseClient
        .from('user_memberships')
        .update({
          status: 'past_due',
          updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', subscriptionId)
        .select()
        .maybeSingle();

      if (error) {
        console.warn('[invoice.payment_failed] past_due update error:', error.message);
      } else if (data) {
        console.log(`Marked subscription ${subscriptionId} as past_due`);
        return data;
      }
    }

    if (!subscriptionId && !appointmentId) {
      console.log('[invoice.payment_failed] no subscription or appointment — nothing to update');
    }
  } catch (error) {
    console.error('Error handling payment failure:', error);
    throw error;
  }
}

// Handle appointment payments (one-time blood draw bookings)
async function handleAppointmentPayment(session: any) {
  try {
    const { metadata, id: checkoutSessionId, payment_intent } = session;

    // MEMBERSHIP PAYMENT: Create membership record instead of appointment
    if (metadata.service_type === 'membership') {
      console.log('Processing membership payment:', metadata.service_name);
      const email = metadata.patient_email || session.customer_details?.email;

      // Find user by email
      let userId = metadata.user_id || null;
      if (!userId && email) {
        const { data: tp } = await supabaseClient.from('tenant_patients').select('user_id').ilike('email', email).maybeSingle();
        if (tp?.user_id) userId = tp.user_id;
      }

      // Determine tier from service name
      const svcName = (metadata.service_name || '').toLowerCase();
      let tier = 'member';
      if (svcName.includes('concierge')) tier = 'concierge';
      else if (svcName.includes('vip')) tier = 'vip';

      // Find or create plan in membership_plans
      const planName = tier.charAt(0).toUpperCase() + tier.slice(1);
      const prices: Record<string, number> = { member: 9900, vip: 19900, concierge: 39900 };
      let { data: plan } = await supabaseClient.from('membership_plans').select('id').ilike('name', `%${tier}%`).maybeSingle();
      if (!plan) {
        const { data: newPlan } = await supabaseClient.from('membership_plans').insert({
          name: planName, annual_price: prices[tier], monthly_price: Math.round(prices[tier] / 12), credits_per_year: 0,
        }).select('id').single();
        plan = newPlan;
      }

      if (userId && plan) {
        // Create or update membership
        const nextRenewal = new Date();
        nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);

        await supabaseClient.from('user_memberships').upsert({
          user_id: userId,
          plan_id: plan.id,
          status: 'active',
          stripe_customer_id: session.customer || null,
          billing_frequency: 'annual',
          next_renewal: nextRenewal.toISOString(),
          is_primary_member: true,
        }, { onConflict: 'user_id' });

        console.log(`Membership activated: ${planName} for user ${userId}`);

        // Update patient metadata
        if (email) {
          await supabaseClient.from('tenant_patients').update({ membership_status: tier }).ilike('email', email);
        }
      }

      // Log to webhook_logs
      await supabaseClient.from('webhook_logs').update({ status: 'success' }).eq('stripe_session_id', checkoutSessionId).catch(() => {});
      return { id: 'membership', success: true };
    }

    // IDEMPOTENCY CHECK: Don't create duplicate appointments for the same checkout session
    const { data: existingAppt } = await supabaseClient
      .from('appointments')
      .select('id')
      .eq('stripe_checkout_session_id', checkoutSessionId)
      .maybeSingle();

    if (existingAppt) {
      console.log(`Appointment already exists for session ${checkoutSessionId}, skipping`);
      return existingAppt;
    }

    const appointmentDate = metadata.appointment_date;
    const appointmentTime = metadata.appointment_time || null;
    const servicePrice = parseInt(metadata.service_price || '0', 10); // cents
    const tipAmount = parseInt(metadata.tip_amount || '0', 10); // cents
    const userId = metadata.user_id || null;

    // Build address string (include apt/unit if present)
    let fullAddress = [metadata.address, metadata.city, metadata.state, metadata.zip_code].filter(Boolean).join(', ');
    if (metadata.apt_unit) fullAddress = `${metadata.apt_unit}, ${fullAddress}`;

    // Find patient_id — try user_id from metadata first, then lookup by email
    let patientId = userId || null;
    if (!patientId && metadata.patient_email) {
      // Look up patient by email in tenant_patients
      try {
        const { data: tp } = await supabaseClient
          .from('tenant_patients')
          .select('id')
          .ilike('email', metadata.patient_email.trim())
          .maybeSingle();
        if (tp) patientId = tp.id;
      } catch (lookupErr) {
        console.error('Patient lookup error (non-fatal):', lookupErr);
      }
    }

    // SLOT VALIDATION: Check if this time slot is already booked
    if (appointmentDate && appointmentTime) {
      const { count } = await supabaseClient
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('appointment_date', appointmentDate)
        .eq('appointment_time', appointmentTime)
        .in('status', ['scheduled', 'confirmed', 'en_route', 'in_progress']);

      if (count && count > 0) {
        console.warn(`DOUBLE BOOKING PREVENTED: Slot ${appointmentDate} ${appointmentTime} already has ${count} appointment(s). Creating anyway with flag.`);
        // Still create appointment (patient already paid) but flag it for manual review
      }
    }

    const patientName = `${metadata.patient_first_name || ''} ${metadata.patient_last_name || ''}`.trim();

    // Create the appointment record
    const { data: appointment, error: appointmentError } = await supabaseClient
      .from('appointments')
      .insert([{
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        status: 'scheduled',
        payment_status: 'completed',
        patient_id: patientId,
        patient_name: patientName,
        patient_email: metadata.patient_email || null,
        patient_phone: metadata.patient_phone || null,
        // When account holder booked for a saved family member, link the
        // appointment to that family_members row. The billing/booker stays
        // on patient_id; family_member_id is the visit subject.
        family_member_id: metadata.family_member_id && metadata.family_member_id.length >= 32
          ? metadata.family_member_id
          : null,
        address: fullAddress,
        zipcode: metadata.zip_code || '',
        service_type: metadata.service_type || 'mobile',
        service_name: metadata.service_name || 'Blood Draw',
        gate_code: metadata.gate_code || null,
        // Prefer first-class metadata fields (new post-2026-04-18 bookings).
        // Fall back to regex parsing of additional_notes for older bookings.
        lab_order_file_path: (() => {
          const firstClass = String(metadata.lab_order_file_paths || '').split(',')[0]?.trim();
          if (firstClass) return firstClass;
          const notes = metadata.additional_notes || '';
          const match = notes.match(/Lab orders?:\s*([^|]+)/);
          return match ? match[1].trim() : null;
        })(),
        insurance_card_path: (() => {
          if (metadata.insurance_card_path) return String(metadata.insurance_card_path);
          const notes = metadata.additional_notes || '';
          const match = notes.match(/Insurance:\s*([^|]+)/);
          return match ? match[1].trim() : null;
        })(),
        lab_destination: metadata.lab_destination || null,
        lab_destination_pending: metadata.lab_destination_pending === 'true',
        // Partner / organization linkage
        organization_id: metadata.organization_id || null,
        billed_to: metadata.billed_to || 'patient',
        patient_name_masked: metadata.patient_name_masked === 'true',
        org_reference_id: metadata.organization_id && metadata.patient_name_masked === 'true'
          ? `${String(metadata.organization_name || 'ORG').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4)}-${Date.now().toString().slice(-6)}`
          : null,
        notes: [
          // Strip the file paths from notes (they're stored in their own columns)
          (metadata.additional_notes || '').replace(/Lab orders?:\s*[^|]+\|?\s*/g, '').replace(/Insurance:\s*[^|]+\|?\s*/g, '').trim(),
          metadata.instructions ? `Instructions: ${metadata.instructions}` : '',
          metadata.gate_code ? `Gate Code: ${metadata.gate_code}` : '',
        ].filter(Boolean).join(' | ') || null,
        total_amount: (servicePrice + tipAmount) / 100, // convert cents to dollars
        service_price: servicePrice / 100,
        tip_amount: tipAmount / 100,
        surcharge_amount: 0,
        stripe_checkout_session_id: checkoutSessionId,
        stripe_payment_intent_id: typeof payment_intent === 'string' ? payment_intent : payment_intent?.id || null,
        // Honor client-supplied duration when present; the appointments_autofill
        // trigger will still correct to the service-type default if this is
        // missing or stuck at the 30-min column default.
        duration_minutes: metadata.duration_minutes ? parseInt(metadata.duration_minutes, 10) : undefined,
        extended_hours: false,
        weekend_service: metadata.weekend === 'true',
        booking_source: 'online',
        // H2: last-touch attribution from session — empty strings become null
        utm_source: metadata.utm_source || null,
        utm_medium: metadata.utm_medium || null,
        utm_campaign: metadata.utm_campaign || null,
        utm_content: metadata.utm_content || null,
        utm_term: metadata.utm_term || null,
        referrer_url: metadata.referrer_url || null,
        landing_page: metadata.landing_page || null,
      }])
      .select()
      .single();

    if (appointmentError) {
      throw new Error(`Failed to create appointment: ${appointmentError.message}`);
    }

    console.log(`Created appointment ${appointment.id} for ${metadata.patient_email} on ${appointmentDate} at ${appointmentTime}`);

    // ─── COPY PRICING BREAKDOWN onto appointment row ─────────────────
    // create-appointment-checkout stashed the itemized cart in
    // pending_pricing_breakdowns keyed by stripe_session_id. Pull it
    // here, write to appointments.pricing_breakdown, then delete the
    // pending row. Lets every future pricing-drift alert be reconciled
    // in one query — the actual cart is on the row.
    try {
      const sessionId = (session as any)?.id;
      if (sessionId) {
        const { data: pending } = await supabaseClient
          .from('pending_pricing_breakdowns')
          .select('breakdown')
          .eq('stripe_session_id', sessionId)
          .maybeSingle();
        if (pending && (pending as any).breakdown) {
          await supabaseClient.from('appointments').update({
            pricing_breakdown: (pending as any).breakdown,
          }).eq('id', appointment.id);
          await supabaseClient.from('pending_pricing_breakdowns')
            .delete().eq('stripe_session_id', sessionId);
          console.log(`[pricing-breakdown] mirrored to appointment ${appointment.id}`);
        }
      }
    } catch (e: any) {
      console.warn('[pricing-breakdown] mirror failed (non-blocking):', e?.message);
    }

    // ─── BUNDLED MEMBERSHIP ACTIVATION ───────────────────────────────────
    // When the patient added an annual membership at checkout (Hormozi
    // anchor-flip), create-appointment-checkout used Stripe subscription
    // mode and stamped these metadata fields. Activate the membership row
    // so the patient gets credit for the next visit at the discounted tier.
    try {
      if (metadata.bundled_subscription_plan) {
        const planName = String(metadata.bundled_subscription_plan).toLowerCase();
        let tier: 'member' | 'vip' | 'concierge' = 'member';
        if (planName.includes('concierge')) tier = 'concierge';
        else if (planName.includes('vip')) tier = 'vip';

        // Find the patient's auth user id (so the membership row anchors to them)
        let memberUserId: string | null = metadata.user_id || null;
        if (!memberUserId && metadata.patient_email) {
          const { data: tp } = await supabaseClient
            .from('tenant_patients').select('user_id').ilike('email', metadata.patient_email).maybeSingle();
          if (tp?.user_id) memberUserId = tp.user_id;
        }

        // Find or create the membership_plans row
        let { data: plan } = await supabaseClient
          .from('membership_plans').select('id').ilike('name', `%${tier}%`).maybeSingle();
        if (!plan) {
          const annualPriceMap: Record<string, number> = { member: 9900, vip: 19900, concierge: 39900 };
          const { data: newPlan } = await supabaseClient.from('membership_plans').insert({
            name: tier.charAt(0).toUpperCase() + tier.slice(1),
            annual_price: annualPriceMap[tier],
            monthly_price: Math.round(annualPriceMap[tier] / 12),
            credits_per_year: 0,
          }).select('id').single();
          plan = newPlan;
        }

        if (memberUserId && plan) {
          const nextRenewal = new Date();
          nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
          // Subscription ID is on session.subscription when sessionMode='subscription'
          const stripeSubscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id || null;

          await supabaseClient.from('user_memberships').upsert({
            user_id: memberUserId,
            plan_id: plan.id,
            status: 'active',
            stripe_customer_id: session.customer || null,
            stripe_subscription_id: stripeSubscriptionId,
            billing_frequency: 'annual',
            next_renewal: nextRenewal.toISOString(),
            is_primary_member: true,
          }, { onConflict: 'user_id' });

          // Stamp the appointment row with the new tier so the welcome flow
          // shows "your VIP rate is now active" instead of pay-as-you-go.
          await supabaseClient.from('appointments').update({
            member_status: tier,
          }).eq('id', appointment.id);

          console.log(`[bundled-membership] activated ${tier} for user ${memberUserId} via session ${session.id}`);

          // Honor the membership_agreements row (legal record of the click-accept)
          if (metadata.agreement_id) {
            try {
              await supabaseClient.from('membership_agreements' as any).update({
                accepted_at: new Date().toISOString(),
                stripe_session_id: session.id,
                accepted_via: 'bundled_visit_checkout',
              }).eq('id', metadata.agreement_id);
            } catch (e) { console.warn('[bundled-membership] agreement stamp failed:', e); }
          }
        } else {
          console.warn(`[bundled-membership] no user_id resolved for ${metadata.patient_email}; membership not activated`);
        }
      }
    } catch (e: any) {
      // Non-blocking — appointment is already created; admin can manually
      // activate via Stripe webhook replay if this branch fails.
      console.error('[bundled-membership] activation failed (non-blocking):', e?.message || e);
    }

    // ─── STRIPE CONNECT — log the destination transfer to staff_payouts ──
    // create-appointment-checkout stamped these on the session metadata when
    // the assigned phleb has a connected Stripe Express account. The actual
    // transfer happens automatically inside the same charge (transfer_data
    // on payment_intent_data); this row is the audit trail.
    try {
      if (metadata.connect_transfer_destination && metadata.connect_staff_id) {
        const baseCents = parseInt(metadata.connect_base_cents || '0', 10) || 0;
        const companionCents = parseInt(metadata.connect_companion_cents || '0', 10) || 0;
        const tipCents = parseInt(metadata.connect_tip_cents || '0', 10) || 0;
        const amountCents = parseInt(metadata.connect_transfer_amount_cents || '0', 10) || 0;
        await supabaseClient.from('staff_payouts' as any).insert({
          staff_id: metadata.connect_staff_id,
          appointment_id: appointment.id,
          stripe_payment_intent_id: typeof payment_intent === 'string' ? payment_intent : payment_intent?.id || null,
          stripe_destination_account_id: metadata.connect_transfer_destination,
          service_type: metadata.service_type || null,
          base_per_visit_cents: baseCents,
          companion_addon_cents: companionCents,
          tip_cents: tipCents,
          amount_cents: amountCents,
          status: 'succeeded',
          transferred_at: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      // Non-blocking — Stripe already executed the transfer; this is just our log.
      console.warn('[connect] staff_payouts insert failed (non-blocking):', e?.message || e);
    }

    // ─── OWNER REVENUE SMS (fire FIRST, before anything that could throw) ──
    // Pre-2026-04-20: owner SMS lived inside sendAppointmentConfirmation, so if
    // a HIPAA guard, Mailgun, or patient-SMS step threw, the outer try/catch
    // swallowed the owner notification too (Diane Kessler incident). Now we
    // fire owner SMS in its own isolated try/catch right after the row is
    // committed, before any of those downstream calls run.
    try {
      if (!Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
        const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID');
        const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN');
        const TWILIO_MSG  = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
        const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
        const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
        if (TWILIO_SID && TWILIO_AUTH) {
          const pn = `${metadata.patient_first_name || ''} ${metadata.patient_last_name || ''}`.trim() || metadata.patient_email || '(unknown)';
          const rev = appointment.total_amount || 0;
          const body = `💰 New Booking!\n${pn}\n${metadata.service_name || metadata.service_type || ''}\n${appointmentDate || ''}${appointmentTime ? ` @ ${appointmentTime}` : ''}\n$${Number(rev).toFixed(2)}${appointment.duration_minutes ? ` · ${appointment.duration_minutes}min` : ''}`;
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
              Body: body,
              ...(TWILIO_MSG ? { MessagingServiceSid: TWILIO_MSG } : { From: TWILIO_FROM }),
            }).toString(),
          });
          console.log(`[owner-sms-early] revenue notification sent for ${appointment.id}`);
        }
      }
    } catch (e) {
      console.error('[owner-sms-early] non-fatal:', e);
    }

    // Fire OCR on the uploaded lab order (fire-and-forget) so the fasting
    // banner + panel chips render for image/PDF uploads too.
    if (appointment.lab_order_file_path) {
      try {
        // Fire-and-forget OCR trigger. Was `supabase.functions.invoke` which
        // threw ReferenceError (no `supabase` binding in this module) — silently
        // caught by the surrounding try, so OCR never ran. Use supabaseClient.
        supabaseClient.functions.invoke('ocr-lab-order', {
          body: { appointmentId: appointment.id },
        }).catch((e) => console.warn('[ocr] trigger failed (non-blocking):', e));
      } catch (e) { console.warn('[ocr] invoke exception:', e); }
    }

    // Create visit bundle record if the booking included a bundle purchase
    try {
      const notes = metadata.additional_notes || '';
      const bundleMatch = notes.match(/BundleCount:\s*(\d+)/);
      if (bundleMatch && appointment?.id) {
        const bundleCount = parseInt(bundleMatch[1], 10);
        if (bundleCount > 1) {
          const expires = new Date();
          expires.setFullYear(expires.getFullYear() + 1);
          await supabaseClient.from('visit_bundles' as any).insert({
            patient_email: metadata.patient_email || null,
            patient_id: patientId,
            initial_appointment_id: appointment.id,
            credits_purchased: bundleCount,
            credits_remaining: bundleCount - 1, // first visit already booked
            discount_percent: 15,
            amount_paid: (servicePrice + tipAmount) / 100,
            stripe_checkout_session_id: checkoutSessionId,
            expires_at: expires.toISOString(),
          });
          console.log(`Created visit bundle: ${bundleCount - 1} credits remaining for ${metadata.patient_email}`);
        }
      }
    } catch (bundleErr) {
      console.error('Bundle creation error (non-fatal):', bundleErr);
    }

    // Release any slot holds for this date/time
    if (appointmentDate && appointmentTime) {
      await supabaseClient
        .from('slot_holds')
        .update({ released: true })
        .eq('appointment_date', appointmentDate)
        .eq('appointment_time', appointmentTime);
    }

    // Process referral code if present (record redemption + credit referrer)
    try {
      const notes = metadata.additional_notes || '';
      const referralMatch = notes.match(/Referral:\s*(\w+)/);
      if (referralMatch) {
        const referralCode = referralMatch[1];
        console.log(`Processing referral code: ${referralCode}`);

        // Find the referral code
        const { data: codeData } = await supabaseClient
          .from('referral_codes')
          .select('id, user_id, discount_amount, referrer_credit, uses')
          .eq('code', referralCode)
          .eq('active', true)
          .maybeSingle();

        if (codeData) {
          // Record the redemption
          await supabaseClient.from('referral_redemptions').insert({
            referral_code_id: codeData.id,
            referred_email: metadata.patient_email,
            appointment_id: appointment.id,
            discount_applied: codeData.discount_amount || 25,
            referrer_credited: true,
          });

          // Increment uses count on the referral code
          await supabaseClient.from('referral_codes')
            .update({ uses: (codeData.uses || 0) + 1 })
            .eq('id', codeData.id);

          // Add $25 credit to referrer's balance
          await supabaseClient.from('referral_credits').insert({
            user_id: codeData.user_id,
            amount: codeData.referrer_credit || 25,
            type: 'referral_earned',
            referral_code_id: codeData.id,
            appointment_id: appointment.id,
            description: `Referral from ${metadata.patient_first_name || 'a friend'} (code: ${referralCode})`,
          });

          console.log(`Referral ${referralCode}: redemption + $${codeData.referrer_credit || 25} credit, uses=${(codeData.uses || 0) + 1}`);

          // Notify the referrer that their friend booked
          if (codeData.user_id) {
            const { data: referrer } = await supabaseClient
              .from('tenant_patients')
              .select('phone, first_name, email')
              .eq('id', codeData.user_id)
              .maybeSingle();

            if (referrer?.phone && !Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
              const referrerPhoneCheck = await verifyRecipientPhone(appointment.id, referrer.phone, referrer.first_name || 'Referrer');
              if (!referrerPhoneCheck.safe) {
                console.warn('HIPAA guard blocked referrer SMS to ' + referrer.phone + ': ' + referrerPhoneCheck.reason);
              } else {
                const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
                const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
                const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
                if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
                  const credit = codeData.referrer_credit || 25;
                  const smsBody = `ConveLabs: Great news ${referrer.first_name || ''}! Your referral code ${referralCode} was just used. You earned a $${credit} credit toward your next visit. Thank you for spreading the word!`;
                  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
                  await fetch(twilioUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                      To: referrer.phone.startsWith('+') ? referrer.phone : `+1${referrer.phone.replace(/\D/g, '')}`,
                      Body: smsBody,
                      ...(TWILIO_MESSAGING_SERVICE_SID ? { MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID } : { From: Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939' }),
                    }).toString(),
                  });
                  console.log(`Referrer notified via SMS: ${referrer.phone}`);
                }
              }
            }
          }

          // Also notify the REFERRED FRIEND that their discount was applied
          const friendPhone = metadata.patient_phone;
          const friendName = metadata.patient_first_name || 'Friend';
          if (friendPhone && !Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
            const friendPhoneCheck = await verifyRecipientPhone(appointment.id, friendPhone, friendName);
            if (!friendPhoneCheck.safe) {
              console.warn('HIPAA guard blocked referred friend SMS to ' + friendPhone + ': ' + friendPhoneCheck.reason);
            } else {
              const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
              const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
              const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
              if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
                await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    To: friendPhone.startsWith('+') ? friendPhone : `+1${friendPhone.replace(/\D/g, '')}`,
                    Body: `ConveLabs: Hi ${friendName}! Your $${codeData.discount_amount || 25} referral discount was applied to your booking. Welcome to ConveLabs! After your visit, you'll get your own referral code to share.`,
                    ...(TWILIO_MESSAGING_SERVICE_SID ? { MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID } : { From: Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939' }),
                  }).toString(),
                });
              }
            }
          }
        }
      }
    } catch (refErr) {
      console.error('Referral processing error (non-fatal):', refErr);
    }

    // Send confirmation email + SMS via Mailgun and Twilio
    if (!Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
      try {
        await sendAppointmentConfirmation(appointment, metadata);
      } catch (notifErr) {
        console.error('Failed to send appointment confirmation (non-fatal):', notifErr);
      }

      // Schedule "What to Expect" follow-up email (2 hours after booking)
      try {
        await supabaseClient.from('post_visit_sequences').insert({
          appointment_id: appointment.id,
          patient_id: patientId,
          patient_email: metadata.patient_email,
          patient_phone: metadata.patient_phone,
          step: 'what_to_expect',
          scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        });
      } catch (e) { console.error('What-to-expect schedule error:', e); }
    } else {
      console.log('NOTIFICATIONS_SUSPENDED: skipping appointment confirmation and what-to-expect sequence');
    }

    return appointment;
  } catch (error) {
    console.error('Error processing appointment payment:', error);
    throw error;
  }
}

// Send appointment confirmation email + SMS directly (no separate edge function needed)
async function sendAppointmentConfirmation(appointment: any, metadata: any) {
  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
  const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
  const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

  const patientName = appointment.patient_name || `${metadata.patient_first_name || ''} ${metadata.patient_last_name || ''}`.trim() || 'Patient';
  const firstName = metadata.patient_first_name || patientName.split(' ')[0] || 'Patient';
  const email = appointment.patient_email || metadata.patient_email;
  const phone = appointment.patient_phone || metadata.patient_phone;
  const appointmentDate = appointment.appointment_date;
  const appointmentTime = appointment.appointment_time || '';
  const address = appointment.address || '';
  const serviceName = appointment.service_name || metadata.service_name || 'Blood Draw';
  const totalAmount = appointment.total_amount || 0;

  // Format date for display
  let displayDate = appointmentDate;
  try {
    const d = new Date(appointmentDate);
    displayDate = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch {}

  // 1. Send confirmation EMAIL via Mailgun
  if (email && MAILGUN_API_KEY) {
    const emailCheck = await verifyRecipientEmail(appointment.id, email, patientName);
    if (!emailCheck.safe) {
      console.warn('HIPAA guard blocked confirmation email to ' + email + ': ' + emailCheck.reason);
    } else {
      try {
        const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#B91C1C,#991B1B);color:white;padding:28px;border-radius:12px 12px 0 0;text-align:center;">
            <h1 style="margin:0;font-size:22px;">Appointment Confirmed!</h1>
            <p style="margin:6px 0 0;opacity:0.9;">ConveLabs Mobile Phlebotomy</p>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
            <p>Hi ${firstName},</p>
            <p>Your appointment has been confirmed! Here are the details:</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
              <table style="width:100%;font-size:14px;">
                <tr><td style="padding:6px 0;color:#6b7280;">Service</td><td style="padding:6px 0;font-weight:600;text-align:right;">${serviceName}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;font-weight:600;text-align:right;">${displayDate}</td></tr>
                ${appointmentTime ? `<tr><td style="padding:6px 0;color:#6b7280;">Time</td><td style="padding:6px 0;font-weight:600;text-align:right;">${appointmentTime}</td></tr>` : ''}
                ${address ? `<tr><td style="padding:6px 0;color:#6b7280;">Location</td><td style="padding:6px 0;font-weight:600;text-align:right;">${address}</td></tr>` : ''}
                <tr style="border-top:1px solid #e5e7eb;"><td style="padding:10px 0 6px;font-weight:600;">Total Paid</td><td style="padding:10px 0 6px;font-weight:700;font-size:18px;text-align:right;color:#B91C1C;">$${totalAmount.toFixed(2)}</td></tr>
              </table>
            </div>
            <p style="font-size:13px;color:#6b7280;"><strong>What to expect:</strong> A licensed phlebotomist will arrive at your location during your scheduled time window. Please have your lab order and insurance card ready.</p>
            <p style="font-size:13px;color:#6b7280;">Need to reschedule? Call us at <a href="tel:+19415279169" style="color:#B91C1C;">(941) 527-9169</a></p>
            <div style="text-align:center;margin:20px 0;">
              <a href="https://convelabs.com/dashboard" style="display:inline-block;background:#B91C1C;color:white;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;">View My Appointment</a>
            </div>
            <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p>
          </div>
        </div>`;

        const formData = new FormData();
        formData.append('from', 'ConveLabs <noreply@mg.convelabs.com>');
        formData.append('to', email);
        formData.append('subject', `Appointment Confirmed - ${displayDate}`);
        formData.append('html', emailHtml);

        const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: formData,
        });

        if (mgRes.ok) {
          console.log(`Confirmation email sent to ${email}`);
        } else {
          const errText = await mgRes.text();
          console.error(`Mailgun error: ${mgRes.status} ${errText}`);
        }
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
      }
    }
  }

  // 2. Send confirmation SMS via Twilio
  if (phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    const smsCheck = await verifyRecipientPhone(appointment.id, phone, patientName);
    if (!smsCheck.safe) {
      console.warn('HIPAA guard blocked confirmation SMS to ' + phone + ': ' + smsCheck.reason);
    } else {
      try {
        const smsBody = `ConveLabs: Your appointment is confirmed!\n\n${serviceName}\n${displayDate}${appointmentTime ? ` at ${appointmentTime}` : ''}\n${address ? `Location: ${address}\n` : ''}\nTotal: $${totalAmount.toFixed(2)}\n\nA phlebotomist will arrive at your scheduled time. Have your lab order & insurance ready.\n\nQuestions? Call (941) 527-9169`;

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const twilioBody = new URLSearchParams({
          To: phone,
          Body: smsBody,
          ...(TWILIO_MESSAGING_SERVICE_SID
            ? { MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }
            : { From: TWILIO_PHONE_NUMBER || '+14074104939' }),
        });

        const twilioRes = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: twilioBody.toString(),
        });

        if (twilioRes.ok) {
          console.log(`Confirmation SMS sent to ${phone}`);
        } else {
          const errText = await twilioRes.text();
          console.error(`Twilio error: ${twilioRes.status} ${errText}`);
        }
      } catch (smsErr) {
        console.error('SMS send error:', smsErr);
      }
    }
  }

  // 3. Notify PHLEBOTOMIST of new booking via SMS
  try {
    // Fetch assigned phlebotomist's phone from staff_profiles
    const phlebId = appointment.phlebotomist_id;
    let phlebPhone: string | null = null;
    let phlebName = 'Phlebotomist';

    if (phlebId) {
      const { data: staff } = await supabaseClient
        .from('staff_profiles')
        .select('first_name, last_name, phone')
        .eq('user_id', phlebId)
        .maybeSingle();
      if (staff?.phone) phlebPhone = staff.phone;
      if (staff?.first_name) phlebName = `${staff.first_name} ${staff.last_name || ''}`.trim();
    }

    // Fallback: notify owner phone directly (Nico)
    const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';

    if (phlebPhone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const phlebSms = `New Booking!\n\nPatient: ${patientName}\nService: ${serviceName}\nDate: ${displayDate}${appointmentTime ? ` at ${appointmentTime}` : ''}\nLocation: ${address || 'TBD'}\nAmount: $${totalAmount.toFixed(2)}\n\nView in your dashboard: https://convelabs.com/dashboard`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      const twilioBody = new URLSearchParams({
        To: phlebPhone.startsWith('+') ? phlebPhone : `+1${phlebPhone.replace(/\D/g, '')}`,
        Body: phlebSms,
        ...(TWILIO_MESSAGING_SERVICE_SID
          ? { MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }
          : { From: TWILIO_PHONE_NUMBER || '+14074104939' }),
      });

      await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: twilioBody.toString(),
      });
      console.log(`Phlebotomist notification sent to ${phlebPhone}`);
    }

    // 4. Notify OWNER of revenue via SMS
    if (OWNER_PHONE && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const ownerSms = `💰 New Booking!\n\nPatient: ${patientName}\nService: ${serviceName}\nRevenue: $${totalAmount.toFixed(2)}${appointment.tip_amount ? ` (incl. $${appointment.tip_amount.toFixed(2)} tip)` : ''}\nDate: ${displayDate}${appointmentTime ? ` at ${appointmentTime}` : ''}\nSource: ${appointment.booking_source || 'online'}`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      const twilioBody = new URLSearchParams({
        To: OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`,
        Body: ownerSms,
        ...(TWILIO_MESSAGING_SERVICE_SID
          ? { MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }
          : { From: TWILIO_PHONE_NUMBER || '+14074104939' }),
      });

      await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: twilioBody.toString(),
      });
      console.log(`Owner revenue notification sent to ${OWNER_PHONE}`);
    }
  } catch (notifErr) {
    console.error('Staff/owner notification error (non-fatal):', notifErr);
  }
}

// New function to handle upgrades
async function handleMembershipUpgrade(session: any, isFoundingMember = false, isSupernovaMember = false) {
  try {
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const customerEmail = session.customer_details?.email;
    const planId = session.metadata?.plan_id;
    const billingFrequency = session.metadata?.billing_frequency;
    const bonusCredits = parseInt(session.metadata?.bonus_credits || '0', 10);
    const promotionLockedPrice = session.metadata?.promotion_locked_price 
      ? parseInt(session.metadata.promotion_locked_price, 10) 
      : null;
    const selectedAddOnId = session.metadata?.selected_add_on_id || null;

    if (!customerEmail) {
      throw new Error('No customer email provided');
    }

    if (!planId) {
      throw new Error('No plan ID provided');
    }

    // Get user ID from tenant_patients (auth.users not accessible via PostgREST)
    const { data: memberPatient, error: memberPatientError } = await supabaseClient
      .from('tenant_patients')
      .select('user_id, id')
      .ilike('email', customerEmail)
      .maybeSingle();

    if (memberPatientError || !memberPatient?.user_id) {
      throw new Error(`Could not find patient with email ${customerEmail}`);
    }

    const userId = memberPatient.user_id;

    // Fetch the selected plan
    const { data: planData, error: planError } = await supabaseClient
      .from('membership_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !planData) {
      throw new Error(`Could not find plan with ID ${planId}`);
    }

    // Fetch current user membership
    const { data: currentMembership, error: membershipError } = await supabaseClient
      .from('user_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
      
    if (membershipError) {
      throw new Error(`Error fetching current membership: ${membershipError.message}`);
    }
    
    // Calculate the next renewal date
    let nextRenewal = new Date();
    if (billingFrequency === 'monthly') {
      nextRenewal.setMonth(nextRenewal.getMonth() + 1);
    } else if (billingFrequency === 'quarterly') {
      nextRenewal.setMonth(nextRenewal.getMonth() + 3);
    } else if (billingFrequency === 'annually') {
      nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
    }

    // NOTE (2026-04-19): removed Sept-1 billing-anchor override for this
    // upgrade path too. Membership activates + bills on the payment date
    // from the moment the subscription is created. Founding 50 seat-claim
    // is handled via claim_founding_seat RPC, not a date window.
    const nextBillingOverride: Date | null = null;

    // Transfer remaining credits from old plan
    const remainingCredits = currentMembership ?
      (currentMembership.credits_remaining + (currentMembership.rollover_credits || 0)) : 0;
    
    // If the user already has a membership, update it
    if (currentMembership) {
      // Archive the old subscription in Stripe if different from new one
      if (currentMembership.stripe_subscription_id && 
          currentMembership.stripe_subscription_id !== subscriptionId) {
        try {
          await stripe.subscriptions.cancel(currentMembership.stripe_subscription_id, {
            invoice_now: false,
            prorate: true
          });
          console.log(`Cancelled old subscription ${currentMembership.stripe_subscription_id}`);
        } catch (stripeErr) {
          console.error(`Failed to cancel old subscription: ${stripeErr.message}`);
          // Continue with the upgrade even if cancellation fails
        }
      }
      
      // Update the membership with new plan details
      const { error: updateError } = await supabaseClient
        .from('user_memberships')
        .update({
          plan_id: planId,
          stripe_subscription_id: subscriptionId,
          billing_frequency: billingFrequency,
          credits_remaining: planData.credits_per_year + remainingCredits + bonusCredits,
          credits_allocated_annual: planData.credits_per_year,
          next_renewal: nextRenewal.toISOString(),
          next_billing_override: nextBillingOverride ? nextBillingOverride.toISOString() : null,
          is_supernova_member: isSupernovaMember,
          bonus_credits: bonusCredits,
          promotion_locked_price: promotionLockedPrice,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentMembership.id);
        
      if (updateError) {
        throw new Error(`Failed to update membership: ${updateError.message}`);
      }
      
      console.log(`Updated membership for user ${userId} with new plan ${planId}`);
      
      // If user had a shared pool that's no longer relevant, update others in that pool
      if (currentMembership.shared_pool_id && currentMembership.is_primary_member) {
        // This is complex and would require additional handling for family plan migrations
        // For now, log it for manual review
        console.log(`WARNING: User ${userId} was primary member of pool ${currentMembership.shared_pool_id} and has upgraded to a different plan type. Manual review needed.`);
      }
    } else {
      // This shouldn't happen for upgrades, but just in case
      // Create a new membership record
      const { error: insertError } = await supabaseClient
        .from('user_memberships')
        .insert([{
          user_id: userId,
          plan_id: planId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          billing_frequency: billingFrequency,
          credits_remaining: planData.credits_per_year + bonusCredits,
          credits_allocated_annual: planData.credits_per_year,
          next_renewal: nextRenewal.toISOString(),
          is_primary_member: true,
          founding_member: isFoundingMember,
          founding_member_signup_date: isFoundingMember ? new Date().toISOString() : null,
          is_supernova_member: isSupernovaMember,
          bonus_credits: bonusCredits,
          promotion_locked_price: promotionLockedPrice
        }]);
        
      if (insertError) {
        throw new Error(`Failed to create new membership: ${insertError.message}`);
      }
      
      console.log(`Created new membership for user ${userId} with plan ${planId}`);
    }
    
    // If this is a Supernova member with a selected add-on, create the add-on entry
    if (isSupernovaMember && selectedAddOnId) {
      const { error: addOnError } = await supabaseClient
        .from('user_add_ons')
        .insert([{
          user_id: userId,
          add_on_id: selectedAddOnId,
          is_active: true,
          is_supernova_benefit: true
        }]);
        
      if (addOnError) {
        console.error(`Failed to add Supernova add-on benefit: ${addOnError.message}`);
      } else {
        console.log(`Added Supernova add-on benefit for user ${userId}`);
      }
    }
    
    console.log(`Upgrade completed successfully for user ${userId} to plan ${planId}`);
    
    return { success: true };
  } catch (error) {
    console.error('Error processing membership upgrade:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// handleLabRequestUnlock
// Fires when a patient completes the unlock checkout (subscription mode with
// one-time visit invoice item). Creates:
//   1. user_memberships row (linked to the new Stripe subscription)
//   2. appointment at the chosen slot with the tier-discounted price
//   3. add_invoice_items to the subscription's first invoice = the visit charge
//   4. patient_lab_requests updated to status='scheduled' with appointment_id
//   5. provider notified via email (reuses the usual lab-request notification)
// ─────────────────────────────────────────────────────────────────────────
async function handleLabRequestUnlock(session: any) {
  try {
    const metadata = session.metadata || {};
    const labRequestId = metadata.lab_request_id;
    const tier = metadata.tier;
    const visitCents = parseInt(metadata.visit_cents || '0', 10);
    const apptDate = metadata.appointment_date;
    const apptTime = metadata.appointment_time;
    const address = metadata.address;
    const patientEmail = metadata.patient_email;
    const patientPhone = metadata.patient_phone;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!labRequestId || !apptDate || !apptTime) {
      console.error('[unlock] missing metadata', metadata);
      return;
    }

    // Load the lab request + org for pricing/rules.
    // Module binding is `supabaseClient`, not `supabase` — every reference
    // below was throwing ReferenceError silently inside the outer try, which
    // made the whole unlock path a no-op in production. Now corrected.
    const { data: request } = await supabaseClient
      .from('patient_lab_requests').select('*').eq('id', labRequestId).maybeSingle();
    if (!request) { console.error('[unlock] lab request not found', labRequestId); return; }

    const { data: org } = await supabaseClient
      .from('organizations').select('id, name, contact_email, billing_email, contact_name, show_patient_name_on_appointment')
      .eq('id', request.organization_id).maybeSingle();

    // Add visit as a one-time invoice item on the subscription
    // (can happen before or after subscription start — Stripe will include it on next invoice)
    try {
      await stripe.invoiceItems.create({
        customer: customerId,
        subscription: subscriptionId,
        amount: visitCents,
        currency: 'usd',
        description: `Mobile Blood Draw — ${tier} rate (lab request)`,
      });
    } catch (e: any) {
      console.warn('[unlock] invoice item create failed:', e.message);
    }

    // Create the membership row
    const { data: plan } = await supabaseClient
      .from('membership_plans' as any).select('id').eq('tier', tier).maybeSingle();
    if (plan) {
      await supabaseClient.from('user_memberships' as any).insert({
        email: patientEmail,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        membership_plan_id: plan.id,
        status: 'active',
        started_at: new Date().toISOString(),
        source: 'lab_request_unlock',
      });
    }

    // Create the appointment
    const apptDateIso = `${apptDate}T12:00:00-04:00`;
    const { data: appt, error: apptErr } = await supabaseClient.from('appointments').insert({
      patient_name: request.patient_name,
      patient_email: patientEmail,
      patient_phone: patientPhone,
      address,
      service_type: 'mobile',
      service_name: 'Mobile Blood Draw',
      appointment_date: apptDateIso,
      appointment_time: apptTime,
      total_amount: visitCents / 100,
      status: 'scheduled',
      payment_status: 'paid', // included in the subscription first invoice
      organization_id: org?.id || null,
      billed_to: 'patient',
      patient_name_masked: org?.show_patient_name_on_appointment === false,
      lab_order_file_path: request.lab_order_file_path,
      lab_order_panels: request.lab_order_panels,
      lab_order_full_text: request.lab_order_full_text,
      fasting_required: request.fasting_required,
      urine_required: request.urine_required,
      gtt_required: request.gtt_required,
      lab_request_id: request.id,
      member_status: tier,
      stripe_checkout_session_id: session.id,
      notes: `[Lab request by ${org?.name}] Unlocked with ${tier} membership.`,
    }).select('*').single();

    if (apptErr) { console.error('[unlock] appointment insert failed:', apptErr); return; }

    await supabaseClient.from('patient_lab_requests').update({
      status: 'scheduled',
      appointment_id: appt.id,
      patient_scheduled_at: new Date().toISOString(),
      provider_notified_at: new Date().toISOString(),
    }).eq('id', request.id);

    // Provider notification email (reuses the same template format)
    const providerEmail = org?.contact_email || org?.billing_email;
    if (providerEmail && Deno.env.get('MAILGUN_API_KEY')) {
      try {
        const fd = new FormData();
        fd.append('from', `ConveLabs <noreply@${Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com'}>`);
        fd.append('to', providerEmail);
        fd.append('subject', `✓ ${request.patient_name} booked + joined ${tier}: ${apptDate} at ${apptTime}`);
        fd.append('html', `<p>${request.patient_name} booked their draw for <strong>${apptDate} at ${apptTime}</strong>, and while they were at it, joined our <strong>${tier} membership</strong>. Win-win.</p><p>— Nico</p>`);
        fd.append('o:tracking-clicks', 'no');
        await fetch(`https://api.mailgun.net/v3/${Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com'}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${Deno.env.get('MAILGUN_API_KEY')}`)}` },
          body: fd,
        });
      } catch (e) { console.warn('[unlock] provider email failed:', e); }
    }

    console.log(`[unlock] success: request ${labRequestId} → appt ${appt.id} + ${tier} membership`);
  } catch (error: any) {
    console.error('[unlock] top-level error:', error);
  }
}
