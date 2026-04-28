/**
 * PRICING-DRIFT-SMOKE
 *
 * Hourly safety net that compares every appointment created in the last
 * 24 hours against the canonical pricing matrix. Any row whose total_amount
 * doesn't match the expected price (within $1 tolerance to absorb tip
 * rounding) gets flagged via SMS to the owner.
 *
 * Why this exists: the audit on 2026-04-28 found 5 parallel pricing maps
 * across the codebase. Three were stale duplicates that drifted from the
 * canonical source. One of them caused the kiturah doward bug — admin booked
 * an ND Wellness patient as 'specialty-kit' (\$185) instead of
 * 'partner-nd-wellness' (\$85). The drift was invisible until a $100
 * revenue mismatch hit Stripe vs the appointment ledger.
 *
 * This smoke catches the SAME class of drift within an hour. If a future
 * code change breaks the pricing pipeline (e.g. someone adds a new local
 * map, mis-types a service ID, or skips the canonical helper), an hour
 * later the owner gets an SMS with the offending appointment ids.
 *
 * Tolerance band reasoning:
 *   • $1 — absorbs cents-rounding from tier % math
 *   • EXCLUDES manual admin overrides (booking_source LIKE 'manual%' AND
 *     notes mentions 'Custom price' / 'Discount' / 'Waived')
 *   • EXCLUDES partner orgs that bill org-side (default_billed_to='org' —
 *     patient's appointment.total_amount can be \$0 by design)
 *   • EXCLUDES bundle / multi-visit prepays (notes mentions 'BUNDLE')
 *   • EXCLUDES family_group_id companion rows (those use companion_addon)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Canonical pricing matrix — must mirror src/services/pricing/pricingService.ts
// + supabase/functions/create-appointment-checkout/index.ts. If any of these
// drift, this smoke catches it via the appointment-row comparison below.
type Tier = 'none' | 'member' | 'vip' | 'concierge';
const TIER_PRICING: Record<string, Record<Tier, number>> = {
  'mobile':                          { none: 150,    member: 130,    vip: 115,    concierge: 99 },
  'in-office':                       { none: 55,     member: 49,     vip: 45,     concierge: 39 },
  'senior':                          { none: 100,    member: 85,     vip: 75,     concierge: 65 },
  'specialty-kit':                   { none: 185,    member: 165,    vip: 150,    concierge: 135 },
  'specialty-kit-genova':            { none: 200,    member: 180,    vip: 165,    concierge: 150 },
  'therapeutic':                     { none: 200,    member: 180,    vip: 165,    concierge: 150 },
  'partner-restoration-place':       { none: 125,    member: 115,    vip: 99,     concierge: 85 },
  'partner-naturamed':               { none: 85,     member: 80,     vip: 75,     concierge: 65 },
  'partner-nd-wellness':             { none: 85,     member: 80,     vip: 75,     concierge: 65 },
  'partner-elite-medical-concierge': { none: 72.25,  member: 72.25,  vip: 72.25,  concierge: 72.25 },
  'partner-aristotle-education':     { none: 185,    member: 185,    vip: 185,    concierge: 185 },
};

const SURCHARGES = {
  sameDay: 100,        // Same-day / STAT
  weekend: 75,         // Weekend service
  extendedHours: 50,   // After-hours
  extendedArea: 75,    // Extended service area (Lake Nona, Kissimmee, etc.)
};

const EXTENDED_AREA_CITIES = [
  'lake nona', 'celebration', 'kissimmee', 'sanford', 'eustis',
  'clermont', 'montverde', 'deltona', 'geneva', 'tavares',
  'mount dora', 'leesburg', 'groveland', 'mascotte', 'minneola',
  'daytona beach', 'deland', 'debary', 'orange city',
];

function isExtendedAreaAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const lower = String(address).toLowerCase();
  return EXTENDED_AREA_CITIES.some(c => lower.includes(c));
}

function expectedPrice(row: any): number {
  const serviceType = String(row.service_type || '').toLowerCase();
  if (!TIER_PRICING[serviceType]) return -1; // unknown service — caller skips
  const tier = (['member', 'vip', 'concierge'].includes(row.member_status)
    ? row.member_status
    : 'none') as Tier;
  let price = TIER_PRICING[serviceType][tier];

  // Surcharges — additive
  if (row.weekend_service === true) price += SURCHARGES.weekend;
  if (row.extended_hours === true)  price += SURCHARGES.extendedHours;
  if (row.same_day_surcharge === true || (row.notes || '').includes('Same-day +$100'))
    price += SURCHARGES.sameDay;
  if (isExtendedAreaAddress(row.address)) price += SURCHARGES.extendedArea;

  return price;
}

async function sendOwnerSMS(message: string): Promise<void> {
  if (!TWILIO_SID || !TWILIO_AUTH) {
    console.warn('[pricing-drift] Twilio not configured — would have sent:', message);
    return;
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const cleanPhone = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: cleanPhone, Body: message.substring(0, 1500), From: TWILIO_FROM,
      }).toString(),
    });
  } catch (e) {
    console.error('[pricing-drift] SMS send failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Pull every paid appointment created in the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: appts, error } = await supabase
      .from('appointments')
      .select(`id, patient_name, patient_email, service_type, service_price, total_amount, tip_amount,
               surcharge_amount, member_status, weekend_service, extended_hours, address,
               billed_to, family_group_id, booking_source, notes, organization_id,
               created_at, payment_status`)
      .gte('created_at', since)
      .eq('payment_status', 'completed')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    type Drift = {
      id: string;
      patient_name: string;
      service_type: string;
      member_status: string | null;
      total_amount: number;
      expected: number;
      delta: number;
      reason: string;
    };
    const drifts: Drift[] = [];
    let scanned = 0;
    let skipped = 0;

    // Pre-load family-group primaries that have companions — those rows
    // have a $75 (or tier-aware) companion add-on we don't model perfectly.
    const apptIds = (appts || []).map(a => a.id);
    const primariesWithCompanions = new Set<string>();
    if (apptIds.length > 0) {
      const { data: comps } = await supabase
        .from('appointments')
        .select('family_group_id')
        .in('family_group_id', apptIds)
        .neq('id', 'family_group_id'); // companion rows
      for (const c of (comps || [])) {
        if (c.family_group_id) primariesWithCompanions.add(c.family_group_id);
      }
    }

    // Pre-load actual membership truth from user_memberships. The smoke
    // does NOT trust appointments.member_status — that field is a
    // denormalized snapshot that can be wrong (stamped at booking time
    // before the patient actually subscribed, or never cleaned up after
    // a cancellation). Source-of-truth is user_memberships joined to
    // tenant_patients via email.
    //
    // For each patient email seen in the 24-hour window, look up:
    //   - their active membership tier (member / vip / concierge / null)
    //   - their membership start_date
    // We then use the START_DATE check to decide if the booking happened
    // when they were a member or not — this kills the 'upgraded-after'
    // false positives.
    const emails = Array.from(new Set((appts || []).map(a => (a.patient_email || '').toLowerCase()).filter(Boolean)));
    type MembershipFact = { tier: Tier; startedAt: string };
    const membershipByEmail = new Map<string, MembershipFact>();
    if (emails.length > 0) {
      const { data: mems } = await supabase
        .from('user_memberships')
        .select(`user_id, created_at, status,
                 membership_plans(name),
                 tenant_patients!inner(email)`)
        .in('tenant_patients.email', emails as any)
        .eq('status', 'active');
      for (const m of (mems || []) as any[]) {
        const email = (m.tenant_patients?.email || '').toLowerCase();
        if (!email || membershipByEmail.has(email)) continue;
        const planName = (m.membership_plans?.name || '').toLowerCase();
        let tier: Tier = 'member';
        if (planName.includes('concierge')) tier = 'concierge';
        else if (planName.includes('vip')) tier = 'vip';
        membershipByEmail.set(email, { tier, startedAt: m.created_at });
      }
    }

    for (const a of (appts || [])) {
      const notes = String(a.notes || '');
      const source = String(a.booking_source || '').toLowerCase();
      if (a.billed_to === 'org') { skipped++; continue; }                              // org pays
      if (a.family_group_id && a.id !== a.family_group_id) { skipped++; continue; }    // companion row
      if (primariesWithCompanions.has(a.id)) { skipped++; continue; }                  // primary w/ companion (companion fee complicates)
      if (notes.includes('BUNDLE') || notes.includes('Bundle')) { skipped++; continue; }
      if (notes.includes('Custom price') || notes.includes('Fee waived') ||
          notes.includes('% discount') || notes.includes('off') ||
          notes.includes('Companion visit')) {
        if (source.startsWith('manual')) { skipped++; continue; }
      }

      scanned++;

      // Compute the EFFECTIVE tier at the time this appointment was created,
      // using user_memberships as the authoritative source. Ignores the
      // appointment's own member_status field entirely — that's the
      // denormalized snapshot that drifts.
      let effectiveTier: Tier = 'none';
      if (a.patient_email) {
        const fact = membershipByEmail.get(String(a.patient_email).toLowerCase());
        if (fact && new Date(fact.startedAt) <= new Date(a.created_at)) {
          effectiveTier = fact.tier;
        }
      }

      // Recompute expected with the effective tier
      const expected = (() => {
        const st = String(a.service_type || '').toLowerCase();
        if (!TIER_PRICING[st]) return -1;
        let p = TIER_PRICING[st][effectiveTier];
        if (a.weekend_service === true) p += SURCHARGES.weekend;
        if (a.extended_hours === true)  p += SURCHARGES.extendedHours;
        if (notes.includes('Same-day +$100')) p += SURCHARGES.sameDay;
        if (isExtendedAreaAddress(a.address)) p += SURCHARGES.extendedArea;
        return p;
      })();
      if (expected < 0) continue;

      const visitTotal = Number(a.total_amount || 0) - Number(a.tip_amount || 0);
      const delta = Math.abs(visitTotal - expected);
      if (delta > 1) {
        drifts.push({
          id: a.id,
          patient_name: a.patient_name || '(unknown)',
          service_type: a.service_type,
          member_status: effectiveTier,
          total_amount: Number(a.total_amount),
          expected,
          delta,
          reason: visitTotal > expected ? 'overcharge' : 'undercharge',
        });
      }
    }

    if (drifts.length > 0) {
      // Sort by delta size, biggest first
      drifts.sort((a, b) => b.delta - a.delta);
      const top = drifts.slice(0, 5);
      const lines = top.map(d =>
        `• ${d.patient_name} (${d.service_type}, ${d.member_status}): $${d.total_amount} vs expected $${d.expected.toFixed(2)} — ${d.reason} $${d.delta.toFixed(2)}`
      ).join('\n');
      const more = drifts.length > 5 ? `\n+${drifts.length - 5} more` : '';
      await sendOwnerSMS(
        `⚠️ Pricing drift — ${drifts.length} appointment${drifts.length > 1 ? 's' : ''} off canonical price (24h scan):\n${lines}${more}`
      );
    }

    return new Response(JSON.stringify({
      ok: true,
      checked_at: new Date().toISOString(),
      window_hours: 24,
      appointments_scanned: scanned,
      appointments_skipped: skipped,
      drifts_found: drifts.length,
      drifts,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[pricing-drift] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
