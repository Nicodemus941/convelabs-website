// get-lab-request
// Public endpoint — patients hit /lab-request/:token, this fetches the
// context the page needs to render (org name, provider, panels, urgency).
// Does NOT return admin_notes (org-internal).
//
// Request: { access_token }
// Response: 200 { request: {...}, org: {...} } | 404 if not found/expired

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { access_token } = await req.json();
    if (!access_token) return new Response(JSON.stringify({ error: 'access_token required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: request } = await admin
      .from('patient_lab_requests')
      .select('id, organization_id, patient_name, patient_email, patient_phone, lab_order_file_path, lab_order_panels, fasting_required, urine_required, gtt_required, draw_by_date, next_doctor_appt_date, next_doctor_appt_notes, access_token_expires_at, status, appointment_id, patient_scheduled_at')
      .eq('access_token', access_token)
      .maybeSingle();

    if (!request) return new Response(JSON.stringify({ error: 'Link not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (new Date(request.access_token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link has expired. Please contact your provider to send a new one.' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: org } = await admin
      .from('organizations')
      .select('id, name, contact_name, default_billed_to, member_stacking_rule, locked_price_cents, org_invoice_price_cents, show_patient_name_on_appointment, time_window_rules')
      .eq('id', request.organization_id)
      .maybeSingle();

    // Sign the lab order file URL (if present) so patient can preview it
    let labOrderUrl: string | null = null;
    if (request.lab_order_file_path) {
      try {
        const { data: signed } = await admin.storage.from('lab-orders').createSignedUrl(request.lab_order_file_path, 60 * 60 * 24); // 24h signed URL
        labOrderUrl = signed?.signedUrl || null;
      } catch { /* non-blocking */ }
    }

    // If already scheduled, pull the appointment so we can show the real
    // confirmation details (date, time, address) when patient revisits the link
    let scheduled_appointment: any = null;
    if (request.appointment_id) {
      try {
        const { data: appt } = await admin
          .from('appointments')
          .select('appointment_date, appointment_time, address, status, total_amount, fasting_required')
          .eq('id', request.appointment_id)
          .maybeSingle();
        if (appt) {
          scheduled_appointment = {
            date: appt.appointment_date,
            time: appt.appointment_time,
            address: appt.address,
            status: appt.status,
            total_amount: appt.total_amount,
            fasting_required: appt.fasting_required,
          };
        }
      } catch { /* non-blocking */ }
    }

    return new Response(JSON.stringify({
      request: {
        id: request.id,
        patient_name: request.patient_name,
        patient_email: request.patient_email,
        patient_phone: request.patient_phone,
        lab_order_url: labOrderUrl,
        panels: request.lab_order_panels,
        fasting_required: request.fasting_required,
        urine_required: request.urine_required,
        gtt_required: request.gtt_required,
        draw_by_date: request.draw_by_date,
        next_doctor_appt_date: request.next_doctor_appt_date,
        next_doctor_appt_notes: request.next_doctor_appt_notes,
        status: request.status,
        appointment_id: request.appointment_id,
        already_scheduled: request.status !== 'pending_schedule',
        scheduled_appointment,
      },
      org: {
        id: org?.id,
        name: org?.name,
        contact_name: org?.contact_name,
        default_billed_to: org?.default_billed_to,
        member_stacking_rule: org?.member_stacking_rule,
        patient_price_cents: org?.locked_price_cents,
        org_covers: org?.default_billed_to === 'org' || org?.member_stacking_rule === 'org_covers',
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('get-lab-request error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
