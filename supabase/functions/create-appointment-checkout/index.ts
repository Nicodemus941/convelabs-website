import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { stripe } from '../_shared/stripe.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// ─────────────────────────────────────────────────────────────────────
// SERVER-SIDE MEMBERSHIP PRICING (source of truth)
// If the frontend forgets to apply the member discount — OR a malicious
// client tries to over-claim a tier — this is the line of defense.
// Mirror src/services/pricing/pricingService.ts TIER_PRICING.
// ─────────────────────────────────────────────────────────────────────
type MemberTier = 'none' | 'member' | 'vip' | 'concierge';

const TIER_PRICING: Record<string, Record<MemberTier, number>> = {
  'dev-testing':          { none: 1,   member: 1,   vip: 1,   concierge: 1 },
  'mobile':               { none: 150, member: 130, vip: 115, concierge: 99 },
  'in-office':            { none: 55,  member: 49,  vip: 45,  concierge: 39 },
  'senior':               { none: 100, member: 85,  vip: 75,  concierge: 65 },
  'specialty-kit':        { none: 185, member: 165, vip: 150, concierge: 135 },
  'specialty-kit-genova': { none: 200, member: 180, vip: 165, concierge: 150 },
  'therapeutic':          { none: 200, member: 180, vip: 165, concierge: 150 },
};

/**
 * Verify membership server-side by patient email. Returns the actual
 * active tier the customer is entitled to, which may be MORE generous
 * than what the frontend claimed (ex: client forgot to pass memberTier).
 */
async function verifyMemberTier(email: string | undefined): Promise<MemberTier> {
  if (!email) return 'none';
  try {
    const { data: tp } = await supabaseClient
      .from('tenant_patients')
      .select('user_id')
      .ilike('email', email)
      .maybeSingle();
    if (!tp?.user_id) return 'none';

    const { data: mem } = await supabaseClient
      .from('user_memberships')
      .select('*, membership_plans(name)')
      .eq('user_id', tp.user_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!mem) return 'none';

    const planName = ((mem as any).membership_plans?.name || '').toLowerCase();
    if (planName.includes('concierge')) return 'concierge';
    if (planName.includes('vip')) return 'vip';
    return 'member';
  } catch (err) {
    console.warn('verifyMemberTier failed:', err);
    return 'none';
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      serviceType,
      serviceName,
      amount: clientAmount, // in cents — WHAT THE CLIENT CLAIMS (don't trust)
      tipAmount = 0, // in cents
      appointmentDate,
      appointmentTime,
      memberTier: clientMemberTier = 'none',
      patientDetails,
      locationDetails,
      serviceDetails,
      userId,
    } = await req.json();

    if (!clientAmount || !appointmentDate || !patientDetails) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── SERVER-SIDE BLOCKED-DATE CHECK ────────────────────────────
    // Don't take payment for a date that's blocked. The UI greys out
    // blocked dates but race conditions + stale cached bundles + direct
    // API calls can bypass that — so we check here before any money moves.
    const dateOnly = String(appointmentDate).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      const { data: blocks } = await supabaseClient
        .from('time_blocks')
        .select('start_date, end_date, reason, block_type')
        .lte('start_date', dateOnly)
        .gte('end_date', dateOnly)
        .eq('block_type', 'office_closure')
        .limit(1);

      if (blocks && blocks.length > 0) {
        console.warn(`[blocked-date-rejected] ${patientDetails.email} tried to book ${dateOnly} (reason: ${blocks[0].reason})`);
        return new Response(
          JSON.stringify({
            error: 'date_blocked',
            message: `Sorry — we're not available on ${dateOnly}${blocks[0].reason ? ` (${blocks[0].reason})` : ''}. Please pick another date.`,
            blockedDate: dateOnly,
            reason: blocks[0].reason,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ─── SERVER-SIDE MEMBERSHIP VALIDATION ─────────────────────────
    // If the patient is a member but the frontend didn't apply the
    // discount (or claimed a lesser tier), we apply the correction
    // here. Customers should NEVER be charged more than their tier
    // entitles them to.
    let amount = clientAmount;
    let priceCorrection = 0;
    const serverTier = await verifyMemberTier(patientDetails?.email);
    const pricing = TIER_PRICING[serviceType];

    if (pricing && serverTier !== 'none') {
      const baseTierPrice = pricing[clientMemberTier as MemberTier] ?? pricing['none'];
      const serverTierPrice = pricing[serverTier];
      // If server tier gives a lower price than what client applied, discount the difference
      if (serverTierPrice < baseTierPrice) {
        priceCorrection = (baseTierPrice - serverTierPrice) * 100; // cents
        amount = Math.max(0, clientAmount - priceCorrection);
        console.warn(
          `[member-discount-correction] ${patientDetails.email} serviceType=${serviceType} ` +
          `clientTier=${clientMemberTier} serverTier=${serverTier} ` +
          `client=$${clientAmount / 100} server=$${amount / 100} saved=$${priceCorrection / 100}`
        );
      }
    }

    // Determine the origin for success/cancel URLs
    const origin = req.headers.get('origin') || 'https://convelabs-website.vercel.app';

    // Create or find Stripe customer
    const customerEmail = patientDetails.email;
    const customerName = `${patientDetails.firstName} ${patientDetails.lastName}`;

    let customerId: string | undefined;

    if (customerEmail) {
      // Search for existing customer
      const existingCustomers = await stripe.customers.list({
        email: customerEmail,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email: customerEmail,
          name: customerName,
          phone: patientDetails.phone || undefined,
          metadata: {
            supabase_user_id: userId || '',
            source: 'appointment_booking',
          },
        });
        customerId = customer.id;
      }
    }

    // Build line items
    const lineItems: any[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: serviceName || 'Blood Draw Service',
            description: `Appointment on ${appointmentDate}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ];

    // Add tip as separate line item if provided
    if (tipAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Gratuity',
            description: 'Tip for your phlebotomist',
          },
          unit_amount: tipAmount,
        },
        quantity: 1,
      });
    }

    // Store all appointment data in metadata for the webhook
    const metadata: Record<string, string> = {
      type: 'appointment_payment',
      service_type: serviceType || '',
      service_name: serviceName || '',
      service_price: String(amount),
      tip_amount: String(tipAmount),
      appointment_date: appointmentDate,
      appointment_time: appointmentTime || '',
      patient_first_name: patientDetails.firstName || '',
      patient_last_name: patientDetails.lastName || '',
      patient_email: patientDetails.email || '',
      patient_phone: patientDetails.phone || '',
      address: locationDetails?.address || '',
      city: locationDetails?.city || '',
      state: locationDetails?.state || '',
      zip_code: locationDetails?.zipCode || '',
      location_type: locationDetails?.locationType || '',
      apt_unit: locationDetails?.aptUnit || '',
      gate_code: locationDetails?.gateCode || '',
      instructions: (locationDetails?.instructions || '').substring(0, 500),
      same_day: String(serviceDetails?.sameDay || false),
      weekend: String(serviceDetails?.weekend || false),
      additional_notes: (serviceDetails?.additionalNotes || '').substring(0, 500),
      user_id: userId || '',
      // Membership-related — source of truth is server verification
      member_tier: serverTier,
      member_tier_claimed: clientMemberTier,
      member_correction_cents: String(priceCorrection),
    };

    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: lineItems,
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url: metadata.service_type === 'membership'
        ? `${origin}/dashboard/patient?membership=success`
        : `${origin}/book-now?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: metadata.service_type === 'membership'
        ? `${origin}/pricing?status=cancel`
        : `${origin}/book-now?status=cancel`,
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error creating appointment checkout:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
