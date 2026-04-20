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
  // Partner services — apply tier discounts so members always see a benefit.
  // Combined with each org's `lowest_wins` stacking rule, the server takes
  // min(partner_rate, member_tier_rate) → member can never pay MORE than
  // their tier entitles them to, from any referral source.
  'partner-restoration-place':       { none: 125,   member: 115,   vip: 99,    concierge: 85 },
  'partner-naturamed':               { none: 85,    member: 80,    vip: 75,    concierge: 65 },
  'partner-nd-wellness':             { none: 85,    member: 80,    vip: 75,    concierge: 65 },
  'partner-elite-medical-concierge': { none: 72.25, member: 72.25, vip: 72.25, concierge: 72.25 },
  'partner-aristotle-education':     { none: 185,   member: 185,   vip: 185,   concierge: 185 },
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
      referralCode = null,
      referralDiscountCents = 0,
      // New first-class attachment fields (replaces notes-stuffing pattern)
      labOrderFilePaths = [],
      insuranceCardPath = null,
      labDestination = null,
      labDestinationPending = false,
      // Optional: redeem specific referral credits on THIS booking
      redeemReferralCreditIds = [],
      // Optional: bundle an annual membership subscription with this booking
      // Shape: { planName: 'Regular' | 'VIP' | 'Concierge', annualPriceCents: number, agreementId: string }
      subscribeToMembership = null,
      // Partner/org linkage — applies partner time-window rules, pricing floor,
      // billing mode (patient vs org), and patient-name masking
      organizationId = null,
      // H2: attribution passed from client sessionStorage — UTM params,
      // referrer, landing page for the current booking session. Stamped on
      // the appointment row (via webhook metadata) for CAC attribution.
      attribution = {},
    } = await req.json();

    // ─── SERVER-SIDE: destination required for mobile visits ────────
    // Hormozi rule: "Never fulfill on ambiguity you could have resolved at intake."
    // The UI already enforces this, but keep the server as the source of truth —
    // client bypass attempts get rejected here.
    const DEST_REQUIRED_SERVICES = new Set(['mobile', 'senior', 'therapeutic', 'specialty-kit', 'specialty-kit-genova']);
    if (DEST_REQUIRED_SERVICES.has(serviceType) && !labDestination && !labDestinationPending) {
      return new Response(
        JSON.stringify({
          error: 'destination_required',
          message: 'Please select a lab destination for specimen delivery, or choose "I\'ll confirm with my doctor" so we can follow up.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!clientAmount || !appointmentDate || !patientDetails) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── SERVER-SIDE: fasting-service gate ────────────────────────────
    // Patient selected "Fasting Blood Draw" → they unlock the scarce
    // 6-9 AM window. If their uploaded lab order doesn't actually require
    // fasting, that's gaming. Verify via OCR before accepting the booking.
    //
    // Fallback rules:
    //   - No lab order attached → pass through, log for post-visit review
    //   - OCR fails or times out → pass through, log for admin review
    //   - OCR says fasting NOT detected → REJECT with helpful message
    if (serviceType === 'fasting-blood-draw') {
      const primaryOrderPath = Array.isArray(labOrderFilePaths) && labOrderFilePaths.length > 0
        ? String(labOrderFilePaths[0])
        : null;

      if (!primaryOrderPath) {
        // No order attached yet — can't verify. Honor user's claim, but log for review.
        await supabaseClient.from('service_mismatch_log').insert({
          patient_email: patientDetails?.email?.toLowerCase() || null,
          patient_phone: patientDetails?.phone || null,
          service_type_requested: serviceType,
          outcome: 'no_order',
          resolution_note: 'Fasting service selected without lab order upload. Admin should verify post-visit.',
        }).then(() => {}, () => {});
      } else {
        // Run OCR synchronously (adds ~5-15s to checkout but only for fasting bookings)
        try {
          const ocrResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ocr-lab-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ filePath: primaryOrderPath }),
            signal: AbortSignal.timeout(20000), // 20s timeout; OCR usually 5-15s
          });
          const ocrResult = await ocrResp.json().catch(() => null);

          if (!ocrResp.ok || !ocrResult || !ocrResult.ok) {
            // OCR failed — log + pass through (don't block booking on infra issue)
            await supabaseClient.from('service_mismatch_log').insert({
              patient_email: patientDetails?.email?.toLowerCase() || null,
              service_type_requested: serviceType,
              lab_order_file_path: primaryOrderPath,
              outcome: 'ocr_failed',
              resolution_note: `OCR unavailable at booking: ${ocrResult?.error || ocrResp.status}`,
            }).then(() => {}, () => {});
          } else if (ocrResult.fastingDetected === false) {
            // OCR says NO fasting required, but they selected fasting service. REJECT.
            await supabaseClient.from('service_mismatch_log').insert({
              patient_email: patientDetails?.email?.toLowerCase() || null,
              patient_phone: patientDetails?.phone || null,
              service_type_requested: serviceType,
              ocr_fasting_detected: false,
              ocr_panels: ocrResult.panels || [],
              lab_order_file_path: primaryOrderPath,
              outcome: 'rejected',
              resolution_note: 'Booking rejected — service_type=fasting but OCR detected no fasting panels',
            }).then(() => {}, () => {});

            return new Response(
              JSON.stringify({
                error: 'fasting_not_required',
                message: `Your uploaded lab order doesn't appear to require fasting (panels detected: ${(ocrResult.panels || []).slice(0, 3).join(', ') || 'none'}). Please switch to "Routine Blood Draw" which has the appropriate scheduling windows. If you believe this is in error, email info@convelabs.com.`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          } else {
            // OCR confirms fasting required — booking proceeds, log the verification
            await supabaseClient.from('service_mismatch_log').insert({
              patient_email: patientDetails?.email?.toLowerCase() || null,
              service_type_requested: serviceType,
              ocr_fasting_detected: true,
              ocr_panels: ocrResult.panels || [],
              lab_order_file_path: primaryOrderPath,
              outcome: 'warning_passed',
              resolution_note: 'OCR confirmed fasting required; booking approved',
            }).then(() => {}, () => {});
          }
        } catch (ocrErr: any) {
          // OCR crash / timeout — log, pass through, don't block
          await supabaseClient.from('service_mismatch_log').insert({
            patient_email: patientDetails?.email?.toLowerCase() || null,
            service_type_requested: serviceType,
            lab_order_file_path: primaryOrderPath,
            outcome: 'ocr_failed',
            resolution_note: `OCR exception: ${ocrErr?.message || 'unknown'}`,
          }).then(() => {}, () => {});
        }
      }
    }

    // ─── AUDIT LOG: snapshot the client payload BEFORE anything else ───
    // If anything ends up mismatched downstream, we have proof of what
    // the patient actually submitted.
    const dateOnly = String(appointmentDate).slice(0, 10);
    const rawPayload = {
      serviceType, serviceName, clientAmount, tipAmount, appointmentDate,
      appointmentTime, clientMemberTier, patientDetails, locationDetails,
      serviceDetails, userId,
    };
    try {
      await supabaseClient.from('booking_audit_log').insert({
        stage: 'checkout_created',
        patient_email: patientDetails?.email || null,
        patient_phone: patientDetails?.phone || null,
        patient_name: `${patientDetails?.firstName || ''} ${patientDetails?.lastName || ''}`.trim() || null,
        client_appointment_date: appointmentDate,
        client_appointment_time: appointmentTime,
        client_service_type: serviceType,
        server_appointment_date: dateOnly,
        server_appointment_time: appointmentTime,
        raw_payload: rawPayload,
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || null,
        user_agent: req.headers.get('user-agent') || null,
      });
    } catch (e) { console.warn('audit log insert failed (non-blocking):', e); }

    // ─── SERVER-SIDE SLOT-LOCK ENFORCEMENT ─────────────────────────
    // Prevent double-booking: check if (date, time) is already taken by
    // an active appointment OR held by an active slot_hold from another
    // session. If either is true, reject with a clear error BEFORE Stripe.
    if (appointmentTime && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      // Check for existing scheduled/confirmed appointment on that slot
      const { data: existingAppts } = await supabaseClient
        .from('appointments')
        .select('id, patient_name, appointment_time')
        .gte('appointment_date', dateOnly)
        .lte('appointment_date', `${dateOnly}T23:59:59`)
        .eq('appointment_time', appointmentTime)
        .in('status', ['scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress']);

      if (existingAppts && existingAppts.length > 0) {
        console.warn(`[slot-conflict] ${patientDetails.email} tried to book ${dateOnly} ${appointmentTime} (taken by ${existingAppts[0].patient_name})`);
        try {
          await supabaseClient.from('booking_audit_log').insert({
            stage: 'slot_conflict',
            patient_email: patientDetails?.email,
            client_appointment_date: appointmentDate,
            client_appointment_time: appointmentTime,
            server_appointment_date: dateOnly,
            mismatch_detected: true,
            mismatch_detail: `Slot already booked by existing appointment ${existingAppts[0].id}`,
            raw_payload: rawPayload,
          });
        } catch { /* non-blocking */ }
        return new Response(
          JSON.stringify({
            error: 'slot_unavailable',
            message: `That time slot (${dateOnly} at ${appointmentTime}) is no longer available. Please pick a different time.`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check for active slot_hold from a different session
      const clientSessionId = req.headers.get('x-session-id') || `stripe-session-${Date.now()}`;
      const { data: activeHolds } = await supabaseClient
        .from('slot_holds')
        .select('id, held_by, expires_at')
        .eq('appointment_date', dateOnly)
        .eq('appointment_time', appointmentTime)
        .eq('released', false)
        .gt('expires_at', new Date().toISOString());

      const conflictingHold = (activeHolds || []).find((h: any) => h.held_by !== clientSessionId);
      if (conflictingHold) {
        console.warn(`[slot-held] ${patientDetails.email} tried to book ${dateOnly} ${appointmentTime} (held by another session)`);
        try {
          await supabaseClient.from('booking_audit_log').insert({
            stage: 'slot_conflict',
            patient_email: patientDetails?.email,
            client_appointment_date: appointmentDate,
            client_appointment_time: appointmentTime,
            mismatch_detected: true,
            mismatch_detail: `Slot held by another session: ${conflictingHold.held_by}`,
            raw_payload: rawPayload,
          });
        } catch { /* non-blocking */ }
        return new Response(
          JSON.stringify({
            error: 'slot_held_by_other',
            message: `Another patient is currently booking that time slot. Please pick a different time.`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reserve the slot for 15 min (enough for the Stripe checkout flow)
      try {
        await supabaseClient.from('slot_holds').insert({
          appointment_date: dateOnly,
          appointment_time: appointmentTime,
          held_by: clientSessionId,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          released: false,
        });
      } catch (e) {
        console.warn('slot_hold insert failed (non-blocking, conflict-allowed):', e);
      }
    }

    // ─── SERVER-SIDE BLOCKED-DATE CHECK ────────────────────────────
    // Don't take payment for a date that's blocked. The UI greys out
    // blocked dates but race conditions + stale cached bundles + direct
    // API calls can bypass that — so we check here before any money moves.
    // Note: `dateOnly` was already computed above for the audit log.
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

    // ─── APOLOGY CREDIT APPLICATION ───────────────────────────────
    // When a patient has been inconvenienced (double-booking, late
    // arrival, etc.), credits accrue in apology_credits. Apply any
    // unredeemed credits to the current checkout automatically.
    // Hormozi: "The credit you issue in theory but never apply is
    // worse than no credit at all — it breeds distrust."
    let apologyCreditApplied = 0;
    const creditIdsToMark: string[] = [];
    if (patientDetails?.email) {
      const { data: credits } = await supabaseClient
        .from('apology_credits')
        .select('id, amount_cents')
        .eq('patient_email', patientDetails.email.toLowerCase())
        .eq('redeemed', false)
        .order('created_at', { ascending: true });

      if (credits && credits.length > 0) {
        for (const c of credits as any[]) {
          apologyCreditApplied += c.amount_cents || 0;
          creditIdsToMark.push(c.id);
        }
        // Cap at the client amount so we don't go negative
        apologyCreditApplied = Math.min(apologyCreditApplied, clientAmount);
        console.log(`[apology-credit] applied $${apologyCreditApplied / 100} for ${patientDetails.email} (${creditIdsToMark.length} credit(s))`);
      }
    }

    // ─── SERVER-SIDE BOOKING WINDOW ENFORCEMENT (tier-based) ────────
    // Time-of-day scarcity is THE core membership value lever. UI greys out
    // disallowed slots but a malicious or stale client could try to bypass —
    // this server-side check is the authoritative gate.
    //
    // Rules (mirrors src/lib/bookingWindows.ts — keep in sync if edited):
    //   Non-member:  Mon-Fri only. Fasting 6-9am, non-fasting 9am-12pm.
    //   Regular:     Mon-Fri 6am-12pm. Sat 6-9am.
    //   VIP:         Mon-Fri 6am-2pm. Sat 6-11am.
    //   Concierge:   anytime, any day (incl. same-day + Sunday).
    if (appointmentTime && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      // We need the tier BEFORE pricing for this check — verify early.
      const earlyTier: MemberTier = await verifyMemberTier(patientDetails?.email);
      // Heuristic for fasting: if service_type is "fasting-heavy" OR ocr text
      // has fasting signals, treat as fasting. For MVP we treat all in-office
      // / mobile / senior / therapeutic as POTENTIALLY fasting — the patient's
      // booking time still has to fit the tier rules regardless. If the
      // patient picked a morning fasting slot, we treat as fasting.
      let hh = 0, mm = 0;
      const t = String(appointmentTime);
      if (t.includes('AM') || t.includes('PM')) {
        const [tp, period] = t.split(' ');
        const [h, m] = tp.split(':').map(Number);
        hh = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h);
        mm = m || 0;
      } else {
        [hh, mm] = t.split(':').map(Number);
      }
      const hhmm = `${String(hh).padStart(2,'0')}:${String(mm || 0).padStart(2,'0')}`;
      const dow = new Date(dateOnly + 'T12:00:00').getDay(); // 0=Sun..6=Sat
      const isFasting = hhmm < '09:00';  // before 9am = fasting window

      // Tier window rules as a simple table
      const TIER_WINDOWS: Record<MemberTier, Record<number, { fasting: [string,string][]; nonFasting: [string,string][] }>> = {
        none:    { 1:{fasting:[['06:00','09:00']],nonFasting:[['09:00','12:00']]}, 2:{fasting:[['06:00','09:00']],nonFasting:[['09:00','12:00']]}, 3:{fasting:[['06:00','09:00']],nonFasting:[['09:00','12:00']]}, 4:{fasting:[['06:00','09:00']],nonFasting:[['09:00','12:00']]}, 5:{fasting:[['06:00','09:00']],nonFasting:[['09:00','12:00']]} },
        member:  { 1:{fasting:[['06:00','09:00']],nonFasting:[['06:00','12:00']]}, 2:{fasting:[['06:00','09:00']],nonFasting:[['06:00','12:00']]}, 3:{fasting:[['06:00','09:00']],nonFasting:[['06:00','12:00']]}, 4:{fasting:[['06:00','09:00']],nonFasting:[['06:00','12:00']]}, 5:{fasting:[['06:00','09:00']],nonFasting:[['06:00','12:00']]}, 6:{fasting:[['06:00','09:00']],nonFasting:[['06:00','09:00']]} },
        vip:     { 1:{fasting:[['06:00','09:00']],nonFasting:[['06:00','14:00']]}, 2:{fasting:[['06:00','09:00']],nonFasting:[['06:00','14:00']]}, 3:{fasting:[['06:00','09:00']],nonFasting:[['06:00','14:00']]}, 4:{fasting:[['06:00','09:00']],nonFasting:[['06:00','14:00']]}, 5:{fasting:[['06:00','09:00']],nonFasting:[['06:00','14:00']]}, 6:{fasting:[['06:00','09:00']],nonFasting:[['06:00','11:00']]} },
        concierge: Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, { fasting:[['06:00','20:00']], nonFasting:[['06:00','20:00']] }])) as any,
      };

      const dayRule = TIER_WINDOWS[earlyTier]?.[dow];
      const ranges = dayRule ? (isFasting ? dayRule.fasting : dayRule.nonFasting) : [];
      const allowed = ranges.some(([s, e]) => hhmm >= s && hhmm < e);

      if (!dayRule || !allowed) {
        // Partner services bypass this (corporate/clinic slots have their own schedule)
        const isPartner = String(serviceType || '').startsWith('partner-');
        if (!isPartner) {
          const tierLabel = earlyTier === 'none' ? 'Pay-As-You-Go' : earlyTier.toUpperCase();
          console.warn(`[booking-window] ${patientDetails?.email} (tier=${earlyTier}) tried ${dateOnly} ${hhmm} — rejected`);
          return new Response(
            JSON.stringify({
              error: 'outside_booking_window',
              message: `Your ${tierLabel} tier doesn't include ${hhmm} on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]}. Upgrade your membership for extended hours or pick a time within your window.`,
              tier: earlyTier,
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // ─── PARTNER ORGANIZATION ENFORCEMENT ──────────────────────────
    // If a partner org is specified (patient referred from Aristotle, CAO,
    // NaturaMed, etc.), load their rules and apply:
    //   - Time window: reject if outside the org's allowed hours
    //   - Locked price: floor at partner rate (unless stacking rule lets
    //     member tier win)
    //   - Billed-to: flag appointment for org-invoice instead of patient-pay
    //   - Patient name masking: for CAO, replace display name with reference ID
    let partnerOrg: any = null;
    let effectivePatientPaysCents = clientAmount;
    if (organizationId) {
      const { data: org } = await supabaseClient
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .eq('is_active', true)
        .maybeSingle();
      if (!org) {
        return new Response(JSON.stringify({ error: 'Partner organization not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      partnerOrg = org;

      // Time-window enforcement from org rules
      if (appointmentTime && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) && Array.isArray(org.time_window_rules)) {
        let hh = 0, mm = 0;
        const t = String(appointmentTime);
        if (t.includes('AM') || t.includes('PM')) {
          const [tp, period] = t.split(' ');
          const [h, m] = tp.split(':').map(Number);
          hh = period === 'PM' && h !== 12 ? h + 12 : (period === 'AM' && h === 12 ? 0 : h);
          mm = m || 0;
        } else {
          [hh, mm] = t.split(':').map(Number);
        }
        const hourFloat = hh + (mm / 60);
        const dow = new Date(dateOnly + 'T12:00:00').getDay();

        const rules = org.time_window_rules as Array<{ dayOfWeek: number[]; startHour: number; endHour: number; label?: string }>;
        const inWindow = rules.some(r => {
          if (!r.dayOfWeek.includes(dow)) return false;
          return hourFloat >= r.startHour && hourFloat < r.endHour;
        });
        if (!inWindow) {
          const ruleDescs = rules.map(r => r.label || `${r.startHour}-${r.endHour}`).join(' · ');
          return new Response(JSON.stringify({
            error: 'outside_partner_window',
            message: `${org.name} only books patients during: ${ruleDescs}. Please pick a time in that range.`,
            organization: org.name,
            allowed_windows: rules,
          }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // ─── SERVER-SIDE MEMBERSHIP VALIDATION ─────────────────────────
    // If the patient is a member but the frontend didn't apply the
    // discount (or claimed a lesser tier), we apply the correction
    // here. Customers should NEVER be charged more than their tier
    // entitles them to.
    let amount = Math.max(0, clientAmount - apologyCreditApplied);
    let priceCorrection = 0;
    const serverTier = await verifyMemberTier(patientDetails?.email);
    const pricing = TIER_PRICING[serviceType];

    if (pricing && serverTier !== 'none') {
      const baseTierPrice = pricing[clientMemberTier as MemberTier] ?? pricing['none'];
      const serverTierPrice = pricing[serverTier];
      // If server tier gives a lower price than what client applied, discount the difference
      if (serverTierPrice < baseTierPrice) {
        priceCorrection = (baseTierPrice - serverTierPrice) * 100; // cents
        amount = Math.max(0, amount - priceCorrection);
        console.warn(
          `[member-discount-correction] ${patientDetails.email} serviceType=${serviceType} ` +
          `clientTier=${clientMemberTier} serverTier=${serverTier} ` +
          `client=$${clientAmount / 100} server=$${amount / 100} saved=$${priceCorrection / 100}`
        );
      }
    }

    // ─── PARTNER PRICING OVERRIDE ──────────────────────────────────
    // Applied AFTER member tier correction, per the org's stacking rule:
    //   lowest_wins  — min(partner floor, member tier price) — Restoration Place
    //   partner_only — force partner floor, ignore tier — NaturaMed, ND Wellness
    //   org_covers   — patient pays $0; org invoiced separately — CAO, Elite, Aristotle
    //   none         — no partner rule applies
    if (partnerOrg) {
      const rule = String(partnerOrg.member_stacking_rule || 'none');
      const partnerPatientCents = partnerOrg.locked_price_cents != null ? Number(partnerOrg.locked_price_cents) : null;

      if (rule === 'org_covers') {
        // Patient pays nothing at booking — org gets invoiced separately
        console.log(`[partner] ${partnerOrg.name} covers patient cost — setting amount to 0`);
        amount = 0;
      }
      else if (rule === 'partner_only' && partnerPatientCents != null) {
        // Partner price overrides everything
        console.log(`[partner] ${partnerOrg.name} partner_only — forcing $${partnerPatientCents / 100}`);
        amount = partnerPatientCents;
      }
      else if (rule === 'lowest_wins' && partnerPatientCents != null) {
        // Take whichever is lower — partner floor OR member tier
        const prior = amount;
        amount = Math.min(amount, partnerPatientCents);
        if (amount < prior) {
          console.log(`[partner] ${partnerOrg.name} lowest_wins — $${prior/100} → $${amount/100}`);
        } else {
          console.log(`[partner] ${partnerOrg.name} lowest_wins — member tier already cheaper ($${amount/100})`);
        }
      }
    }

    // ─── REFERRAL CREDIT REDEMPTION ─────────────────────────────────
    // Admin or patient can opt-in to apply referral credits to this booking.
    // We verify the credits belong to this patient (by user_id or email match)
    // and are unredeemed, then subtract from the amount + mark redeemed.
    let referralCreditApplied = 0;
    const referralCreditIdsToMark: string[] = [];
    if (Array.isArray(redeemReferralCreditIds) && redeemReferralCreditIds.length > 0 && patientDetails?.email) {
      try {
        const { data: tp } = await supabaseClient
          .from('tenant_patients')
          .select('user_id')
          .ilike('email', patientDetails.email)
          .maybeSingle();
        const uid = (tp as any)?.user_id;
        if (uid) {
          const { data: credits } = await supabaseClient
            .from('referral_credits')
            .select('id, amount, user_id, redeemed')
            .in('id', redeemReferralCreditIds as string[])
            .eq('user_id', uid)
            .eq('redeemed', false);

          for (const c of (credits || []) as any[]) {
            const cents = Math.round(Number(c.amount || 0) * 100);
            if (cents > 0 && amount > 0) {
              const use = Math.min(cents, amount);
              referralCreditApplied += use;
              amount = Math.max(0, amount - use);
              referralCreditIdsToMark.push(c.id);
            }
          }
          console.log(`[referral-credit] ${patientDetails.email} applied $${referralCreditApplied / 100} from ${referralCreditIdsToMark.length} credit(s)`);
        }
      } catch (e) { console.warn('referral redemption failed (non-blocking):', e); }
    }

    // ─── STAMP benefit_first_used_at for refund lockout ─────────────
    // The moment a patient uses ANY member benefit (discount or referral),
    // their 30-day refund window auto-closes. Done via a separate update
    // below after Stripe session creation so we don't stamp on abandoned
    // checkouts. Flag is captured here for the post-session block.
    const willUseMemberBenefit = serverTier !== 'none' && priceCorrection > 0;

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
      // When account holder is booking for a saved family member; webhook
      // stamps appointments.family_member_id from this. Primary billing
      // still routes to the booker.
      family_member_id: patientDetails.familyMemberId ? String(patientDetails.familyMemberId).substring(0, 64) : '',
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
      referral_code: referralCode || '',
      referral_discount_cents: String(referralDiscountCents || 0),
      // First-class attachment metadata — stripe metadata values must be strings
      lab_order_file_paths: Array.isArray(labOrderFilePaths) ? labOrderFilePaths.slice(0, 10).join(',').substring(0, 500) : '',
      insurance_card_path: insuranceCardPath ? String(insuranceCardPath).substring(0, 500) : '',
      lab_destination: labDestination ? String(labDestination).substring(0, 50) : '',
      lab_destination_pending: labDestinationPending ? 'true' : 'false',
      // H2: attribution (last-touch) — stripe-webhook reads these into the
      // appointments row for CAC-per-channel reporting
      utm_source: String(attribution?.utm_source || '').substring(0, 100),
      utm_medium: String(attribution?.utm_medium || '').substring(0, 100),
      utm_campaign: String(attribution?.utm_campaign || '').substring(0, 100),
      utm_content: String(attribution?.utm_content || '').substring(0, 100),
      utm_term: String(attribution?.utm_term || '').substring(0, 100),
      referrer_url: String(attribution?.referrer_url || '').substring(0, 500),
      landing_page: String(attribution?.landing_page || '').substring(0, 500),
      // Service-type-aware block duration. Webhook uses this on insert; the
      // appointments_autofill DB trigger is the safety net if it's missing.
      duration_minutes: String((() => {
        const s = (serviceType || '').toLowerCase();
        if (s.startsWith('therapeutic')) return 75;
        if (s.startsWith('specialty-kit-genova')) return 80;
        if (s.startsWith('specialty-kit')) return 75;
        if (s === 'partner-nd-wellness') return 65;
        if (s === 'partner-aristotle-education') return 75;
        if (s.startsWith('partner-')) return 60;
        return 60;
      })()),
    };

    // ─── LOG UPGRADE EVENTS (INTENT) for ROI dashboard ───────────────
    // These log at checkout-create time. verify-appointment-checkout
    // will flip status to 'converted' once Stripe confirms payment.
    try {
      if (serverTier !== 'none' && priceCorrection > 0) {
        await supabaseClient.from('upgrade_events').insert({
          event_type: 'membership_applied',
          status: 'intent',
          patient_email: patientDetails?.email?.toLowerCase() || null,
          patient_name: `${patientDetails?.firstName || ''} ${patientDetails?.lastName || ''}`.trim() || null,
          patient_phone: patientDetails?.phone || null,
          discount_cents: priceCorrection,
          potential_cents: amount,
          metadata: { tier: serverTier, service_type: serviceType },
        });
      }
      if (referralCode && referralDiscountCents > 0) {
        await supabaseClient.from('upgrade_events').insert({
          event_type: 'promo_applied',
          status: 'intent',
          patient_email: patientDetails?.email?.toLowerCase() || null,
          patient_name: `${patientDetails?.firstName || ''} ${patientDetails?.lastName || ''}`.trim() || null,
          patient_phone: patientDetails?.phone || null,
          discount_cents: referralDiscountCents,
          potential_cents: amount,
          metadata: { referral_code: referralCode, service_type: serviceType },
        });
      }
    } catch (e) { console.warn('upgrade_events insert failed (non-blocking):', e); }

    // Create the checkout session
    // Tag metadata with credit info for Stripe dashboard visibility
    metadata.apology_credit_applied_cents = String(apologyCreditApplied);
    metadata.referral_credit_applied_cents = String(referralCreditApplied);
    metadata.redeemed_referral_credit_ids = referralCreditIdsToMark.join(',').substring(0, 500);
    metadata.member_benefit_used = willUseMemberBenefit ? 'true' : 'false';

    // Partner linkage — webhook + verify use these to stamp organization_id +
    // billed_to + patient_name_masked on the appointment row
    if (partnerOrg) {
      metadata.organization_id = partnerOrg.id;
      metadata.organization_name = String(partnerOrg.name).substring(0, 80);
      metadata.billed_to = partnerOrg.default_billed_to || 'patient';
      metadata.patient_name_masked = partnerOrg.show_patient_name_on_appointment === false ? 'true' : 'false';
      metadata.org_invoice_price_cents = String(partnerOrg.org_invoice_price_cents || 0);
    }

    // ─── BUNDLE-SUBSCRIBE: optional membership + this visit, one Stripe session ──
    // Hormozi's "anchor flip" — patient already pulling out wallet for a draw,
    // bundle the annual membership in. They save on THIS visit (hook) + get
    // the annual benefits. Uses Stripe subscription mode with mixed line items.
    let sessionMode: 'payment' | 'subscription' = 'payment';
    if (subscribeToMembership && subscribeToMembership.annualPriceCents && subscribeToMembership.planName) {
      sessionMode = 'subscription';
      lineItems.push({
        price_data: {
          currency: 'usd',
          recurring: { interval: 'year' },
          product_data: {
            name: `ConveLabs ${subscribeToMembership.planName} Annual Membership`,
            description: `${subscribeToMembership.planName} tier — ${String(subscribeToMembership.planName).toLowerCase().includes('concierge') ? 'anytime booking + same-day + dedicated phleb' : String(subscribeToMembership.planName).toLowerCase().includes('vip') ? 'extended morning + Saturday access + referral bonuses' : 'morning + Saturday access + discounted family add-ons'}. Billed once a year.`,
          },
          unit_amount: subscribeToMembership.annualPriceCents,
        },
        quantity: 1,
      });
      metadata.bundled_subscription_plan = subscribeToMembership.planName;
      metadata.bundled_subscription_cents = String(subscribeToMembership.annualPriceCents);
      if (subscribeToMembership.agreementId) {
        metadata.agreement_id = subscribeToMembership.agreementId;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: sessionMode,
      customer: customerId,
      line_items: lineItems,
      metadata,
      ...(sessionMode === 'payment' ? { payment_intent_data: { metadata } } : { subscription_data: { metadata } }),
      // Hormozi trust ceremony: every paid booking lands on /welcome where
      // the patient sees a clear "you paid ✓ · benefits" page. Prevents the
      // Suzanne-style double-charge pattern on every appointment flow.
      success_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: metadata.service_type === 'membership'
        ? `${origin}/pricing?status=cancel`
        : `${origin}/book-now?status=cancel`,
    });

    // Mark applied apology credits as redeemed (tied to this session).
    // If checkout is abandoned, they stay redeemed — but next attempt
    // will just find them already-used and won't double-apply.
    if (creditIdsToMark.length > 0) {
      try {
        await supabaseClient.from('apology_credits')
          .update({
            redeemed: true,
            redeemed_at: new Date().toISOString(),
          })
          .in('id', creditIdsToMark);
      } catch (e) { console.warn('credit redemption mark failed (non-blocking):', e); }
    }

    // Mark referral credits redeemed (same abandonment semantics — accepted)
    if (referralCreditIdsToMark.length > 0) {
      try {
        await supabaseClient.from('referral_credits')
          .update({
            redeemed: true,
            redeemed_at: new Date().toISOString(),
          })
          .in('id', referralCreditIdsToMark);
      } catch (e) { console.warn('referral credit mark failed (non-blocking):', e); }
    }

    // Stamp benefit_first_used_at on the patient's active membership, locking
    // their 30-day refund window. Only stamps the FIRST time — subsequent
    // benefits don't re-stamp (preserves the original redemption timestamp).
    if (willUseMemberBenefit || referralCreditApplied > 0) {
      try {
        const { data: tp } = await supabaseClient
          .from('tenant_patients').select('user_id').ilike('email', patientDetails.email).maybeSingle();
        const uid = (tp as any)?.user_id;
        if (uid) {
          const nowIso = new Date().toISOString();
          // Only stamps if currently null (first-use only)
          await supabaseClient
            .from('user_memberships')
            .update({
              benefit_first_used_at: nowIso,
              benefit_usage_count: (await supabaseClient.from('user_memberships').select('benefit_usage_count').eq('user_id', uid).eq('status', 'active').maybeSingle())?.data?.benefit_usage_count + 1 || 1,
              total_savings_cents: (priceCorrection + referralCreditApplied),
            })
            .eq('user_id', uid)
            .eq('status', 'active')
            .is('benefit_first_used_at', null);
          // Also mirror to the agreement for refund audit
          await supabaseClient
            .from('membership_agreements' as any)
            .update({ benefit_first_used_at: nowIso })
            .eq('user_email', patientDetails.email.toLowerCase())
            .is('benefit_first_used_at', null);
        }
      } catch (e) { console.warn('benefit stamp failed (non-blocking):', e); }
    }

    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
        apologyCreditApplied: apologyCreditApplied / 100,
      }),
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
