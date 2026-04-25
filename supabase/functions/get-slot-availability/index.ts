/**
 * GET-SLOT-AVAILABILITY
 *
 * Single source of truth for slot availability. Both the patient booking
 * flow and the admin Schedule New Appointment modal call this endpoint so
 * neither can drift from the server's canonical busy logic.
 *
 * Body:
 *   {
 *     date: 'YYYY-MM-DD',
 *     lab_destination?: 'labcorp' | 'quest' | 'adventhealth' | ...,
 *     current_tier?: 'none' | 'regular_member' | 'vip' | 'concierge',
 *     apply_tier_gating?: boolean,   // false for admin (bypass tier windows)
 *     org_id?: string,                // optional org for time_window_rules
 *   }
 *
 * Returns:
 *   {
 *     slots: [{ time, available, reason?, requires_tier?, unlock_price_cents?, visit_savings_cents? }, ...],
 *     date_unlocked: boolean,
 *     advent: boolean,
 *   }
 *
 * Date_unlocked = the daily 5pm-prior cron has opened tier-locked slots.
 * Advent = AdventHealth destination chosen → 7-day extended grid.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getAvailableSlotsForDate, withTierGating, isDateUnlocked, isAdventHealthDestination } from '../_shared/availability.ts';
import { minTierForSlot, slotUnlockOffer } from '../_shared/tier-gating.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TIER_ORDER = ['none', 'regular_member', 'vip', 'concierge'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const date: string = String(body?.date || '').trim();
    if (!date) {
      return new Response(JSON.stringify({ error: 'date required (YYYY-MM-DD)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const labDestination: string | null = body?.lab_destination || null;
    const currentTier: string = String(body?.current_tier || 'none');
    const applyTierGating: boolean = body?.apply_tier_gating !== false; // default true
    const orgId: string | null = body?.org_id || null;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull org time_window_rules if an org is specified (e.g. "Restoration Place 6-9am only")
    let timeWindowRules: any = null;
    if (orgId) {
      const { data: org } = await admin
        .from('organizations')
        .select('time_window_rules')
        .eq('id', orgId)
        .maybeSingle();
      timeWindowRules = org?.time_window_rules || null;
    }

    // Base availability — the canonical busy logic (bidirectional duration-aware blocking)
    let slots = await getAvailableSlotsForDate(admin, orgId || '', date, timeWindowRules, labDestination);

    const advent = isAdventHealthDestination(labDestination);
    const unlocked = await isDateUnlocked(admin, date);

    // Tier gating — only when caller asks for it AND the date hasn't been unlocked AND not AdventHealth
    if (applyTierGating && !unlocked && !advent) {
      slots = withTierGating(slots, date, currentTier, 'mobile', {
        minTierForSlot,
        slotUnlockOffer,
        TIER_ORDER,
      });
    }

    return new Response(JSON.stringify({
      slots,
      date_unlocked: unlocked,
      advent,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[get-slot-availability]', e);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
