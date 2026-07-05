// provider-quote — returns a live volume-tiered quote for a provider draw plan.
// Public (anon) so the configurator can quote before the provider signs in.
// Pricing math lives in _shared/provider-pricing.ts; the per-draw tiers are the
// provider_rate_card table (single source of truth).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { computeQuote, type DrawFrequency, type RateTier } from '../_shared/provider-pricing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_FREQ: DrawFrequency[] = ['one_time', 'monthly', 'biweekly', 'weekly', 'custom'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const patientCount = parseInt(body.patientCount, 10);
    const frequency = body.frequency as DrawFrequency;

    if (!Number.isFinite(patientCount) || patientCount < 1 || patientCount > 5000) {
      return json({ error: 'invalid_patient_count', message: 'Enter between 1 and 5000 patients.' }, 400);
    }
    if (!VALID_FREQ.includes(frequency)) {
      return json({ error: 'invalid_frequency' }, 400);
    }
    if (frequency === 'custom') {
      const c = Number(body.customDrawsPerMonthPerPatient);
      if (!Number.isFinite(c) || c <= 0) {
        return json({ error: 'invalid_custom_frequency', message: 'Custom cadence needs a draws-per-month value.' }, 400);
      }
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );

    const { data: tiers, error } = await admin
      .from('provider_rate_card')
      .select('tier_key, label, min_draws_mo, max_draws_mo, per_draw_cents')
      .eq('active', true);

    if (error || !tiers || tiers.length === 0) {
      return json({ error: 'rate_card_unavailable' }, 500);
    }

    const quote = computeQuote(
      {
        patientCount,
        frequency,
        customDrawsPerMonthPerPatient: body.customDrawsPerMonthPerPatient,
        setupFeeCents: body.setupFeeCents,
      },
      tiers as RateTier[],
    );

    return json({ ok: true, quote });
  } catch (e: any) {
    console.error('[provider-quote] error:', e?.message);
    return json({ error: 'quote_failed' }, 500);
  }

  function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
