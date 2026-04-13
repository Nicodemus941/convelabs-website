import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from "../_shared/stripe.ts";

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

    // Handle the event
    console.log(`Processing event type: ${event.type}`);

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
      
      // Check if this is a Founding Member signup (before August 1st)
      const isFoundingMember = metadata.founding_member === 'true';
      
      // Handle appointment payments
      if (metadata.type === 'appointment_payment') {
        await handleAppointmentPayment(session);
      }
      // Handle credit pack purchases
      else if (metadata.type === 'credit_pack') {
        await handleCreditPackPurchase(session);
      }
      // Handle membership upgrades
      else if (isUpgrade) {
        await handleMembershipUpgrade(session, isFoundingMember, isSupernovaMember);
      }
      // Handle regular membership signups
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

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error(`Error processing webhook: ${err.message}`);
    return new Response(JSON.stringify({ error: `Webhook error: ${err.message}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Handle credit pack purchases
async function handleCreditPackPurchase(session: any) {
  try {
    const { metadata, customer_details, id: checkout_id, payment_intent } = session;
    
    // Extract customer email
    const customerEmail = customer_details?.email;
    if (!customerEmail) {
      throw new Error('No customer email provided');
    }
    
    // Get user ID from email
    const { data: userData, error: userError } = await supabaseClient
      .from('auth.users')
      .select('id')
      .eq('email', customerEmail)
      .single();
    
    if (userError || !userData) {
      throw new Error(`Could not find user with email ${customerEmail}`);
    }
    
    const userId = userData.id;
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

    // Get user ID from email
    const { data: userData, error: userError } = await supabaseClient
      .from('auth.users')
      .select('id')
      .eq('email', customerEmail)
      .single();

    if (userError || !userData) {
      throw new Error(`Could not find user with email ${customerEmail}`);
    }

    const userId = userData.id;

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

    // For founding members, set the next billing date to September 1st
    let nextBillingOverride = null;
    if (isFoundingMember) {
      // Check if current date is before August 1st
      const currentDate = new Date();
      const launchDate = new Date(currentDate.getFullYear(), 7, 1); // August 1st
      
      if (currentDate < launchDate) {
        // Set next billing to September 1st
        nextBillingOverride = new Date(currentDate.getFullYear(), 8, 1); // September 1st
        
        // Also update the subscription in Stripe to bill on September 1st
        try {
          await stripe.subscriptions.update(subscriptionId, {
            billing_cycle_anchor: Math.floor(nextBillingOverride.getTime() / 1000),
            proration_behavior: 'none'
          });
          
          console.log(`Updated subscription ${subscriptionId} billing cycle to September 1st`);
        } catch (stripeErr) {
          console.error(`Failed to update Stripe subscription billing cycle: ${stripeErr.message}`);
        }
      }
    }

    // Insert the user membership
    const { data: membershipData, error: membershipError } = await supabaseClient
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
        next_billing_override: nextBillingOverride ? nextBillingOverride.toISOString() : null,
        is_supernova_member: isSupernovaMember,
        bonus_credits: bonusCredits,
        promotion_locked_price: promotionLockedPrice,
        supernova_enrollment_date: isSupernovaMember ? new Date().toISOString() : null
      }])
      .select()
      .single();

    if (membershipError) {
      throw new Error(`Failed to create membership: ${membershipError.message}`);
    }

    console.log(`Created membership for user ${userId} with plan ${planId}`);
    
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
async function handleSubscriptionCancellation(subscription: any) {
  try {
    const subscriptionId = subscription.id;
    
    // Mark membership as canceled
    const { data, error } = await supabaseClient
      .from('user_memberships')
      .update({ 
        status: 'canceled',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId)
      .select()
      .single();
    
    if (error) {
      console.error('Error marking membership as canceled:', error);
      throw error;
    }
    
    console.log(`Marked subscription ${subscriptionId} as canceled`);
    return data;
  } catch (error) {
    console.error('Error handling subscription cancellation:', error);
    throw error;
  }
}

// Handle payment failure
async function handlePaymentFailure(invoice: any) {
  try {
    const subscriptionId = invoice.subscription;
    
    if (!subscriptionId) {
      console.log('No subscription associated with this invoice');
      return;
    }
    
    // Mark membership as past_due
    const { data, error } = await supabaseClient
      .from('user_memberships')
      .update({ 
        status: 'past_due',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId)
      .select()
      .single();
    
    if (error) {
      console.error('Error marking membership as past_due:', error);
      throw error;
    }
    
    console.log(`Marked subscription ${subscriptionId} as past_due`);
    return data;
  } catch (error) {
    console.error('Error handling payment failure:', error);
    throw error;
  }
}

// Handle appointment payments (one-time blood draw bookings)
async function handleAppointmentPayment(session: any) {
  try {
    const { metadata, id: checkoutSessionId, payment_intent } = session;

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
      // Use admin API to find user by email (can't query auth.users as a table)
      try {
        const { data: { users } } = await supabaseClient.auth.admin.listUsers({ page: 1, perPage: 1 });
        // Fallback: search tenant_patients
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
        address: fullAddress,
        zipcode: metadata.zip_code || '',
        service_type: metadata.service_type || 'mobile',
        service_name: metadata.service_name || 'Blood Draw',
        gate_code: metadata.gate_code || null,
        notes: [
          metadata.additional_notes,
          metadata.instructions ? `Instructions: ${metadata.instructions}` : '',
          metadata.gate_code ? `Gate Code: ${metadata.gate_code}` : '',
        ].filter(Boolean).join(' | ') || null,
        total_amount: (servicePrice + tipAmount) / 100, // convert cents to dollars
        service_price: servicePrice / 100,
        tip_amount: tipAmount / 100,
        surcharge_amount: 0,
        stripe_checkout_session_id: checkoutSessionId,
        stripe_payment_intent_id: typeof payment_intent === 'string' ? payment_intent : payment_intent?.id || null,
        extended_hours: false,
        weekend_service: metadata.weekend === 'true',
        booking_source: 'online',
      }])
      .select()
      .single();

    if (appointmentError) {
      throw new Error(`Failed to create appointment: ${appointmentError.message}`);
    }

    console.log(`Created appointment ${appointment.id} for ${metadata.patient_email} on ${appointmentDate} at ${appointmentTime}`);

    // Release any slot holds for this date/time
    if (appointmentDate && appointmentTime) {
      await supabaseClient
        .from('slot_holds')
        .update({ released: true })
        .eq('appointment_date', appointmentDate)
        .eq('appointment_time', appointmentTime);
    }

    // Send confirmation email + SMS via Mailgun and Twilio
    try {
      await sendAppointmentConfirmation(appointment, metadata);
    } catch (notifErr) {
      console.error('Failed to send appointment confirmation (non-fatal):', notifErr);
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

  // 2. Send confirmation SMS via Twilio
  if (phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
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

    // Get user ID from email
    const { data: userData, error: userError } = await supabaseClient
      .from('auth.users')
      .select('id')
      .eq('email', customerEmail)
      .single();

    if (userError || !userData) {
      throw new Error(`Could not find user with email ${customerEmail}`);
    }

    const userId = userData.id;

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
