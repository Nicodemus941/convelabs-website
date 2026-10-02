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
    let hasRecentReview = false;

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

    // Check review history
    if (patientEmail) {
      try {
        const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const r = await supabase.from('post_visit_sequences')
          .select('id')
          .eq('patient_email', patientEmail)
          .eq('step', 'review_request')
          .gte('scheduled_at', cutoff)
          .limit(1);
        hasRecentReview = (r.data || []).length > 0;
      } catch (_e) { /* ignore */ }
    }

    // Build smart sequence
    const steps = [];
    steps.push({ step: 'specimen_confirm', delay: 0 });
    if (isFirstVisit) steps.push({ step: 'survey', delay: 120 });
    if (!hasRecentReview) steps.push({ step: 'review_request', delay: 1440 });
    // Disabled 2026-05-03 — owner doesn't want to be responsible for
    // chasing lab-result delivery. Lab portal handoff is the lab's
    // accountability, not ConveLabs's. Keep the step type registered
    // in process-post-visit-sequences for backward compat; just stop
    // seeding new ones.
    // steps.push({ step: 'results_checkin', delay: 4320 });
    if (isFirstVisit) steps.push({ step: 'membership_upsell', delay: 10080 });
    if (isFirstVisit) steps.push({ step: 'referral_prompt', delay: 20160 });
    // 45 days for first-timers, 21 days for returning patients
    steps.push({ step: 'rebooking_nudge', delay: isFirstVisit ? 64800 : 30240 });

    const records = [];
    for (const s of steps) {
      records.push({
        appointment_id: appointmentId,
        patient_id: patientId,
        patient_email: patientEmail,
        patient_phone: patientPhone,
        step: s.step,
        scheduled_at: new Date(now.getTime() + s.delay * 60000).toISOString(),
        status: 'pending',
      });
    }

    const insertRes = await supabase.from('post_visit_sequences').insert(records);
    if (insertRes.error) throw insertRes.error;

    // Generate referral code for first-timers. patientId is
    // appointments.patient_id (a tenant_patients id for ~94% of rows); every
    // consumer resolves referral_codes.user_id on both tenant_patients.id and
    // tenant_patients.user_id, so either key works downstream.
    //
    // referral_codes.code is UNIQUE. The old NAME+2-digit code collided
    // between patients who share a first name (1-in-100 per pair), the
    // insert error was swallowed, no code existed, and the referral_prompt
    // SMS 14 days later was silently skipped. Retry with a wider suffix.
    if (isFirstVisit && patientId && patientName) {
      try {
        const existRes = await supabase.from('referral_codes').select('id').eq('user_id', patientId).maybeSingle();
        if (!existRes.data) {
          const name = (patientName.split(' ')[0] || 'FRIEND').toUpperCase().replace(/[^A-Z]/g, '') || 'FRIEND';
          const attempts = [
            name + String(Math.floor(Math.random() * 100)),
            name + String(100 + Math.floor(Math.random() * 900)),
            name + String(1000 + Math.floor(Math.random() * 9000)),
            name + '-' + crypto.randomUUID().slice(0, 4).toUpperCase(),
          ];
          for (const code of attempts) {
            const ins = await supabase.from('referral_codes').insert({ user_id: patientId, code, discount_amount: 25, referrer_credit: 25 });
            if (!ins.error) break;
            if (ins.error.code !== '23505') { console.warn('[referral-code] insert failed:', ins.error.message); break; }
          }
        }
      } catch (e) { console.warn('[referral-code] generation failed (non-blocking):', (e as any)?.message); }
    }

    return new Response(
      JSON.stringify({ success: true, stepsScheduled: records.length, isFirstVisit: isFirstVisit }),
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
