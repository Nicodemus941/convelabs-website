import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { appointmentId, patientId, patientEmail, patientPhone, patientName } = await req.json();
    if (!appointmentId) throw new Error('appointmentId required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const now = new Date();

    // Define the 7-step post-visit sequence
    const steps = [
      { step: 'specimen_confirm', delayMinutes: 0 },
      { step: 'survey', delayMinutes: 120 },          // 2 hours
      { step: 'review_request', delayMinutes: 1440 },  // 24 hours
      { step: 'results_checkin', delayMinutes: 4320 },  // 3 days
      { step: 'membership_upsell', delayMinutes: 10080 }, // 7 days
      { step: 'referral_prompt', delayMinutes: 20160 },   // 14 days
      { step: 'rebooking_nudge', delayMinutes: 43200 },   // 30 days
    ];

    const records = steps.map(s => ({
      appointment_id: appointmentId,
      patient_id: patientId || null,
      patient_email: patientEmail || null,
      patient_phone: patientPhone || null,
      step: s.step,
      scheduled_at: new Date(now.getTime() + s.delayMinutes * 60000).toISOString(),
      status: 'pending',
    }));

    const { error } = await supabase.from('post_visit_sequences').insert(records);
    if (error) throw error;

    // Also generate referral code for the patient if they don't have one
    if (patientId && patientName) {
      const { data: existing } = await supabase
        .from('referral_codes')
        .select('id')
        .eq('user_id', patientId)
        .maybeSingle();

      if (!existing) {
        const firstName = patientName.split(' ')[0]?.toUpperCase() || 'FRIEND';
        const code = `${firstName}${Math.floor(Math.random() * 100)}`;

        await supabase.from('referral_codes').insert({
          user_id: patientId,
          code,
          discount_amount: 25,
          referrer_credit: 25,
        });
        console.log(`Referral code created: ${code} for patient ${patientId}`);
      }
    }

    console.log(`Post-visit sequence scheduled: ${records.length} steps for appointment ${appointmentId}`);

    return new Response(
      JSON.stringify({ success: true, stepsScheduled: records.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Trigger post-visit error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
