// get-lab-request-slots
// Public endpoint — returns live-computed availability for a given date,
// scoped to the org attached to the lab request token. Called by the
// patient page each time they pick a date.
//
// Request:  { access_token, date }
// Response: { slots: [{time, available, reason?}, ...] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getAvailableSlotsForDate } from '../_shared/availability.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { access_token, date } = await req.json();
    if (!access_token || !date) return new Response(JSON.stringify({ error: 'access_token and date required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Validate token + get org
    const { data: request } = await admin
      .from('patient_lab_requests')
      .select('id, organization_id, draw_by_date, access_token_expires_at, status')
      .eq('access_token', access_token)
      .maybeSingle();
    if (!request) return new Response(JSON.stringify({ error: 'Invalid link' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (new Date(request.access_token_expires_at) < new Date()) return new Response(JSON.stringify({ error: 'Link expired' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Constrain to the provider's draw window
    if (date > request.draw_by_date) {
      return new Response(JSON.stringify({ slots: [], out_of_window: true, draw_by_date: request.draw_by_date }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: org } = await admin
      .from('organizations')
      .select('time_window_rules')
      .eq('id', request.organization_id)
      .maybeSingle();

    const slots = await getAvailableSlotsForDate(admin, request.organization_id, date, org?.time_window_rules);

    return new Response(JSON.stringify({ slots, draw_by_date: request.draw_by_date }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('get-lab-request-slots error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
