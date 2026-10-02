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
// Data is scoped server-side to caller.app_metadata.organization_id — clients cannot
// request other orgs' data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getTrustedRole, getTrustedOrgId } from '../_shared/authz.ts';

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

function normalizeDigits(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
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

    // Accept both 'provider' and 'office_manager' — same dashboard, same scope.
    // (2026-05-07: Lara at Littleton was locked out of the org dashboard because
    // her role is office_manager. Hormozi gap — receptionists/coordinators need
    // the same view as the doctor to do their job.)
    // Also accept either org_id or organization_id metadata shape (legacy users
    // have one, fresh invite-org-manager users have the other).
    const role = getTrustedRole(user);
    const orgId = getTrustedOrgId(user);
    if (!['provider','office_manager'].includes(role) || !orgId) {
      return new Response(JSON.stringify({
        error: 'Not a provider account',
        detail: `role=${role} org=${orgId ? 'set' : 'missing'}`,
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        .select('id, lab_order_file_path, lab_destination, address, patient_name, patient_email, patient_name_masked, org_reference_id, appointment_date, appointment_time, status', { count: 'exact', head: false })
        .eq('organization_id', orgId)
        .gte('appointment_date', todayStart)
        .neq('status', 'cancelled')
        .neq('status', 'completed'),
      admin.from('appointments')
        .select('id, patient_name, patient_email, appointment_date, appointment_time, status, service_name, service_type, total_amount, lab_destination, org_reference_id, patient_name_masked, lab_order_file_path')
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

    // Needs attention: missing lab order, lab destination, or address.
    //
    // The rows were already being fetched and then discarded for a bare count,
    // which left the provider staring at a number with no way to learn which
    // visits it referred to. Return the offending rows and say what each one
    // is missing. The count is derived from the same array below so the badge
    // and the list can never disagree.
    const needsAttnRows = needsAttnResp.data || [];
    const needsAttentionItems = needsAttnRows
      .map((a: any) => {
        const missing: string[] = [];
        if (!a.lab_order_file_path) missing.push('Lab order');
        if (!a.lab_destination) missing.push('Lab destination');
        if (!a.address) missing.push('Address');
        return { a, missing };
      })
      .filter(x => x.missing.length > 0)
      .map(({ a, missing }) => ({
        id: a.id,
        // Same masking rule the rest of this payload uses -- an org that masks
        // patient names must not have them leak through this list.
        patient_label: a.patient_name_masked ? (a.org_reference_id || 'Confidential') : a.patient_name,
        appointment_date: a.appointment_date,
        appointment_time: a.appointment_time,
        status: a.status,
        missing,
      }));
    const needsAttention = needsAttentionItems.length;

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
    //
    // This is the authoritative patient list for the dashboard, and the
    // Patients tab now falls back to it.
    //
    // The tab's own source, the get_org_linked_patients RPC, resolves the org
    // from auth.jwt() -- and ONLY from the 'organization_id' claim. Two ways
    // that comes back empty for a practice that plainly has patients:
    // a user whose metadata carries the legacy 'org_id' key instead, and a
    // user whose organization_id was added after their last sign-in, whose
    // token therefore predates the claim. This function has neither problem:
    // it reads the live user record and accepts both key shapes. So when the
    // RPC returns nothing, this list is what the tab shows.
    //
    // Scope matches the RPC: appointments owned by the org OR linked through
    // the appointment_organizations junction. Dropping the junction here would
    // hide co-billed visits the RPC counts.
    const [{ data: ownedRows }, { data: junctionRows }] = await Promise.all([
      admin.from('appointments')
        .select('patient_name, patient_email, patient_phone, org_reference_id, patient_name_masked, appointment_date, service_name, service_type, status, id')
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .order('appointment_date', { ascending: false })
        .limit(5000),
      admin.from('appointment_organizations')
        .select('appointment_id')
        .eq('organization_id', orgId)
        .limit(5000),
    ]);

    // Pull in junction-linked appointments this org doesn't directly own.
    const ownedIds = new Set((ownedRows || []).map((r: any) => r.id));
    const extraIds = (junctionRows || [])
      .map((r: any) => r.appointment_id)
      .filter((id: string) => id && !ownedIds.has(id));
    let extraRows: any[] = [];
    if (extraIds.length > 0) {
      const { data } = await admin.from('appointments')
        .select('patient_name, patient_email, patient_phone, org_reference_id, patient_name_masked, appointment_date, service_name, service_type, status, id')
        .in('id', extraIds.slice(0, 1000))
        .neq('status', 'cancelled');
      extraRows = data || [];
    }

    // Dedupe on name, matching the RPC's GROUP BY, so the two sources can't
    // disagree about how many patients a practice has. Email is not the key:
    // household members routinely share one address, and keying on it
    // collapsed a family into a single patient.
    const patientMap = new Map<string, any>();
    for (const r of [...(ownedRows || []), ...extraRows]) {
      if (!r.patient_name) continue;
      const key = String(r.patient_name).trim().toLowerCase();
      const existing = patientMap.get(key);
      if (existing) {
        existing.visit_count += 1;
        if (r.appointment_date > existing.last_visit) existing.last_visit = r.appointment_date;
        continue;
      }
      patientMap.set(key, {
        name: r.patient_name_masked ? (r.org_reference_id || 'Confidential') : r.patient_name,
        email: r.patient_email,
        phone: r.patient_phone,
        last_visit: r.appointment_date,
        last_service: r.service_name || r.service_type || null,
        visit_count: 1,
        masked: r.patient_name_masked,
      });
    }
    // No slice. A practice asking to see its patients means all of them --
    // the old cap of 50 silently hid the rest with nothing on screen to say so.
    const patients = Array.from(patientMap.values())
      .sort((a, b) => String(b.last_visit || '').localeCompare(String(a.last_visit || '')));

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
      .select('id, patient_name, patient_email, patient_phone, patient_dob, draw_by_date, next_doctor_appt_date, next_doctor_appt_notes, admin_notes, status, appointment_id, patient_notified_at, patient_scheduled_at, created_at, access_token, lab_order_file_path, lab_order_panels, fasting_required, provider_payment_status, billed_to, cancelled_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: rosterRows } = await admin
      .from('tenant_patients')
      .select('id, first_name, last_name, email, phone, date_of_birth, address, city, zipcode')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(500);

    const enrichedLabRequests = ((labRequests as any[]) || []).map((request) => {
      const reqEmail = String(request.patient_email || '').trim().toLowerCase();
      const reqPhoneDigits = normalizeDigits(request.patient_phone);
      const reqName = normalizeName(request.patient_name);
      const rosterMatch = ((rosterRows as any[]) || []).find((row) =>
        (reqEmail && String(row.email || '').trim().toLowerCase() === reqEmail) ||
        (reqPhoneDigits && normalizeDigits(row.phone) === reqPhoneDigits) ||
        (reqName && normalizeName(`${row.first_name || ''} ${row.last_name || ''}`) === reqName)
      );
      return {
        ...request,
        has_lab_order: !!request.lab_order_file_path,
        has_dob: !!(request.patient_dob || rosterMatch?.date_of_birth),
        has_chart_address: !!(rosterMatch?.address || rosterMatch?.city || rosterMatch?.zipcode),
        has_email: !!reqEmail,
        has_phone: !!String(request.patient_phone || '').trim(),
        chart_patient_id: rosterMatch?.id || null,
      };
    });

    // ── RECENT ACTIVITY (last 30 days of completed/delivered visits) ────
    // Provider needs a permanent timeline of work we did for them so
    // completed visits don't disappear after the date rolls over. Each
    // row includes the specimen tracking ID + lab destination so the
    // org can match it to their results inbox.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);
    const { data: recentRows } = await admin
      .from('appointments')
      .select(`
        id, patient_name, patient_email, patient_name_masked, org_reference_id,
        appointment_date, appointment_time, status, service_name, service_type,
        total_amount, lab_destination,
        specimens_delivered_at, delivered_at,
        specimen_tracking_id, specimen_lab_name,
        collection_at, result_received_at
      `)
      .eq('organization_id', orgId)
      .gte('appointment_date', thirtyDaysAgo)
      .in('status', ['specimen_delivered', 'completed'])
      .order('specimens_delivered_at', { ascending: false, nullsFirst: false })
      .order('appointment_date', { ascending: false })
      .limit(50);

    // Build the timeline rows — masked-aware, includes tracking
    const recentActivity = ((recentRows as any[]) || []).map(r => ({
      id: r.id,
      patient_label: r.patient_name_masked ? (r.org_reference_id || 'Confidential') : r.patient_name,
      appointment_date: r.appointment_date,
      appointment_time: r.appointment_time,
      status: r.status,
      service_name: r.service_name || r.service_type,
      delivered_at: r.specimens_delivered_at || r.delivered_at,
      specimen_tracking_id: r.specimen_tracking_id,
      specimen_lab_name: r.specimen_lab_name,
      collection_at: r.collection_at,
      result_received_at: r.result_received_at,
    }));

    // ── TEAM ROSTER (other users with this org_id in metadata) ───────────
    const allUsers: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data: pg } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      const u = pg?.users || [];
      allUsers.push(...u);
      if (u.length < 1000) break;
    }
    const team = allUsers
      .filter(u =>
        // Membership comes from service-role-only app_metadata.
        getTrustedOrgId(u) === orgId
      )
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
        needsAttentionItems,
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
      labRequests: enrichedLabRequests,
      recentActivity,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('provider-dashboard-data error:', error);
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
