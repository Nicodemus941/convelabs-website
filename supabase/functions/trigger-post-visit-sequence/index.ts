/**
 * TRIGGER-POST-VISIT-SEQUENCE — seeds the steps the DB trigger does NOT.
 *
 * Two seeders used to overlap (2026-10-02 audit):
 *   • DB trigger `auto_queue_google_review` (on appointments → completed)
 *     seeds google_review (48h), results_checkin (5d — disabled, see
 *     migration DRAFT), referral_prompt (7d), membership_upsell (14d),
 *     rebooking_nudge (30d) with ON CONFLICT (unique_key) DO NOTHING.
 *   • This function (called by the phleb app on "complete") inserted
 *     specimen_confirm, survey, review_request (24h), membership_upsell,
 *     referral_prompt (14d), rebooking_nudge (21/45d) with a PLAIN insert.
 *
 * Because the DB trigger fires first inside the same status UPDATE, this
 * function's insert collided on `appointment_id::step` for the shared
 * steps and the whole batch failed — so specimen_confirm and survey were
 * never seeded either (only 5 specimen_confirm rows in 30 days), while a
 * patient who got through received BOTH a 24h review_request and a 48h
 * google_review.
 *
 * Contract now:
 *   DB trigger owns: google_review, referral_prompt, membership_upsell,
 *                    rebooking_nudge  (+ results_checkin until the
 *                    migration lands; the processor skips it).
 *   This function owns: specimen_confirm (now), survey (2h, first visit),
 *                    and the referral code for first-timers.
 *   Inserts are upserts on unique_key with ignoreDuplicates, so running
 *   twice — or running after the trigger — is harmless.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const appointmentId = body.appointmentId;
    if (!appointmentId) throw new Error('appointmentId required');

    const patientId = body.patientId || null;
    const patientEmail = body.patientEmail || null;
    const patientPhone = body.patientPhone || null;
    const patientName = body.patientName || '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const now = new Date();
    let isFirstVisit = true;

    // Check visit count by email
    if (patientEmail) {
      try {
        const r = await supabase.from('appointments')
          .select('id', { count: 'exact', head: true })
          .ilike('patient_email', patientEmail)
          .eq('status', 'completed');
        isFirstVisit = (r.count || 0) <= 1;
      } catch (_e) { /* ignore */ }
    }

    // Steps this function owns (see header). Review / referral / upsell /
    // rebooking are seeded by the DB trigger.
    const steps: Array<{ step: string; delay: number }> = [];
    steps.push({ step: 'specimen_confirm', delay: 0 });
    if (isFirstVisit) steps.push({ step: 'survey', delay: 120 });

    const records = steps.map(s => ({
      appointment_id: appointmentId,
      patient_id: patientId,
      patient_email: patientEmail,
      patient_phone: patientPhone,
      step: s.step,
      scheduled_at: new Date(now.getTime() + s.delay * 60000).toISOString(),
      status: 'pending',
    }));

    // unique_key is a generated column (appointment_id::step) backing
    // uniq_pvs_appointment_step — ignoreDuplicates makes this idempotent.
    const insertRes = await supabase
      .from('post_visit_sequences')
      .upsert(records, { onConflict: 'unique_key', ignoreDuplicates: true });
    if (insertRes.error) throw insertRes.error;

    // Generate referral code for first-timers (the DB-seeded referral_prompt
    // step only sends when a code exists).
    if (isFirstVisit && patientId && patientName) {
      try {
        const existRes = await supabase.from('referral_codes').select('id').eq('user_id', patientId).maybeSingle();
        if (!existRes.data) {
          const name = patientName.split(' ')[0] || 'FRIEND';
          const code = name.toUpperCase() + String(Math.floor(Math.random() * 100));
          await supabase.from('referral_codes').insert({ user_id: patientId, code: code, discount_amount: 25, referrer_credit: 25 });
        }
      } catch (_e) { /* ignore */ }
    }

    return new Response(
      JSON.stringify({ success: true, stepsScheduled: records.length, isFirstVisit: isFirstVisit, seededBy: 'edge:specimen_confirm,survey · db-trigger:google_review,referral_prompt,membership_upsell,rebooking_nudge' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || JSON.stringify(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
