// provider-dashboard-data
// One-shot endpoint that returns everything the provider dashboard needs:
//  - org + partnership rules
//  - live-ops counts (today's visits, specimens in transit, needs-attention)
//  - upcoming 7-day visits
//  - this-month counts (MTD visits, MTD spend, avg turnaround)
//  - patient list (distinct from appointments)
//  - invoice list
//  - team roster
//
// Request:  GET (or POST with empty body) — requires Authorization: Bearer <user_token>
// Response: { org, liveOps, thisMonth, upcoming, patients, invoices, team }
//
// Authorization: caller must be role='provider' and have org_id in metadata.
// Data is scoped server-side to caller.user_metadata.org_id — clients cannot
// request other orgs' data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function startOfDayET(): string {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return new Date(et.getFullYear(), et.getMonth(), et.getDate()).toISOString();
}
function startOfMonthET(): string {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return new Date(et.getFullYear(), et.getMonth(), 1).toISOString();
}
function plusDays(iso: string, n: number): string {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp } = await admin.auth.getUser(token);
    const user = userResp?.user;
    if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const role = user.user_metadata?.role;
    const orgId = user.user_metadata?.org_id;
    if (role !== 'provider' || !orgId) {
      return new Response(JSON.stringify({ error: 'Not a provider account' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── ORG ──────────────────────────────────────────────────────────────
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('id, name, contact_name, contact_email, contact_phone, billing_email, default_billed_to, locked_price_cents, org_invoice_price_cents, member_stacking_rule, show_patient_name_on_appointment, time_window_rules, portal_enabled, is_active')
      .eq('id', orgId).maybeSingle();
    if (orgErr || !org) return new Response(JSON.stringify({ error: 'Org not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const todayStart = startOfDayET();
    const tomorrowStart = plusDays(todayStart, 1);
    const in7Days = plusDays(todayStart, 7);
    const monthStart = startOfMonthET();

    // ── LIVE OPS COUNTS ──────────────────────────────────────────────────
    const [todayResp, transitResp, needsAttnResp, upcomingResp, mtdResp] = await Promise.all([
      admin.from('appointments')
        .select('id, status', { count: 'exact', head: false })
        .eq('organization_id', orgId)
        .gte('appointment_date', todayStart)
        .lt('appointment_date', tomorrowStart),
      admin.from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('collection_at', 'is', null)
        .is('result_received_at', null),
      admin.from('appointments')
        .select('id, lab_order_file_path, lab_destination, address, patient_name, patient_email', { count: 'exact', head: false })
        .eq('organization_id', orgId)
        .gte('appointment_date', todayStart)
        .neq('status', 'cancelled')
        .neq('status', 'completed'),
      admin.from('appointments')
        .select('id, patient_name, patient_email, appointment_date, appointment_time, status, service_name, service_type, total_amount, lab_destination, org_reference_id, patient_name_masked')
        .eq('organization_id', orgId)
        .gte('appointment_date', todayStart)
        .lte('appointment_date', in7Days)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })
        .limit(20),
      admin.from('appointments')
        .select('id, status, total_amount, collection_at, result_received_at')
        .eq('organization_id', orgId)
        .gte('appointment_date', monthStart),
    ]);

    const todayVisits = todayResp.data || [];
    const todayCount = todayVisits.length;
    const todayInProgress = todayVisits.filter(v => ['arrived', 'in_progress', 'collected'].includes(v.status)).length;
    const todayCompleted = todayVisits.filter(v => v.status === 'completed').length;

    const specimensInTransit = transitResp.count || 0;

    // Needs attention: missing lab order, lab destination, or address
    const needsAttnRows = needsAttnResp.data || [];
    const needsAttention = needsAttnRows.filter(a =>
      !a.lab_order_file_path || !a.lab_destination || !a.address
    ).length;

    // This month
    const mtdRows = mtdResp.data || [];
    const mtdVisits = mtdRows.length;
    const mtdSpend = mtdRows
      .filter(r => r.status === 'completed' || r.status === 'paid')
      .reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    const turnaroundSamples = mtdRows
      .filter(r => r.collection_at && r.result_received_at)
      .map(r => new Date(r.result_received_at!).getTime() - new Date(r.collection_at!).getTime());
    const avgTurnaroundHrs = turnaroundSamples.length > 0
      ? (turnaroundSamples.reduce((s, n) => s + n, 0) / turnaroundSamples.length) / (1000 * 60 * 60)
      : null;

    // Usage predictor — linear pace to end of month
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const daysInMonth = new Date(et.getFullYear(), et.getMonth() + 1, 0).getDate();
    const dayOfMonth = et.getDate();
    const predictedEomVisits = dayOfMonth > 0 ? Math.round((mtdVisits / dayOfMonth) * daysInMonth) : mtdVisits;

    // ── PATIENTS (distinct from this org's appointments) ─────────────────
    const { data: patientsRows } = await admin
      .from('appointments')
      .select('patient_name, patient_email, patient_phone, org_reference_id, patient_name_masked, appointment_date, id')
      .eq('organization_id', orgId)
      .order('appointment_date', { ascending: false })
      .limit(200);
    const patientMap = new Map<string, any>();
    for (const r of patientsRows || []) {
      const key = r.patient_email || r.patient_name || r.id;
      if (!patientMap.has(key)) {
        patientMap.set(key, {
          name: r.patient_name_masked ? (r.org_reference_id || 'Confidential') : r.patient_name,
          email: r.patient_email,
          phone: r.patient_phone,
          last_visit: r.appointment_date,
          masked: r.patient_name_masked,
        });
      }
    }
    const patients = Array.from(patientMap.values()).slice(0, 50);

    // ── INVOICES (appointments with invoice data or completed visits) ────
    const { data: invoiceRows } = await admin
      .from('appointments')
      .select('id, patient_name, appointment_date, total_amount, stripe_invoice_id, stripe_invoice_url, invoice_status, invoice_sent_at, payment_status, billed_to, org_reference_id, patient_name_masked')
      .eq('organization_id', orgId)
      .not('total_amount', 'is', null)
      .order('appointment_date', { ascending: false })
      .limit(50);
    const invoices = (invoiceRows || []).map(r => ({
      id: r.id,
      patient_label: r.patient_name_masked ? (r.org_reference_id || 'Confidential') : r.patient_name,
      date: r.appointment_date,
      amount: r.total_amount,
      stripe_url: r.stripe_invoice_url,
      status: r.invoice_status || r.payment_status,
      billed_to: r.billed_to,
    }));

    // ── LAB REQUESTS (provider-initiated patient bookings) ───────────────
    const { data: labRequests } = await admin
      .from('patient_lab_requests')
      .select('id, patient_name, patient_email, patient_phone, draw_by_date, next_doctor_appt_date, status, appointment_id, patient_notified_at, patient_scheduled_at, created_at, access_token, lab_order_panels, fasting_required')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    // ── TEAM ROSTER (other users with this org_id in metadata) ───────────
    const allUsers: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data: pg } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      const u = pg?.users || [];
      allUsers.push(...u);
      if (u.length < 1000) break;
    }
    const team = allUsers
      .filter(u => u.user_metadata?.org_id === orgId)
      .map(u => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.user_metadata?.org_name || null,
        phone: u.phone,
        last_sign_in: u.last_sign_in_at,
        invited_by: u.user_metadata?.invited_by,
        is_self: u.id === user.id,
      }));

    return new Response(JSON.stringify({
      org,
      liveOps: {
        todayCount,
        todayInProgress,
        todayCompleted,
        specimensInTransit,
        needsAttention,
      },
      thisMonth: {
        mtdVisits,
        mtdSpend,
        avgTurnaroundHrs,
        predictedEomVisits,
      },
      upcoming: upcomingResp.data || [],
      patients,
      invoices,
      team,
      labRequests: labRequests || [],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('provider-dashboard-data error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
