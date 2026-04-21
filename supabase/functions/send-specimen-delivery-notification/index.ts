/**
 * SEND-SPECIMEN-DELIVERY-NOTIFICATION
 *
 * Fires when phleb marks a specimen delivered via the PWA
 * SpecimenDeliveryModal. Loops through appointment_organizations for
 * the appointment and emails every linked org (primary + cc) with a
 * HIPAA-safe footer. Dedupes via notified_delivery_at to prevent
 * double-notifications on replay.
 *
 * Body params:
 *   { appointmentId, specimenId, labName, tubeCount, deliveredAt }
 *
 * Multi-org safety: WHERE clause scopes by appointment_id so CC orgs
 * never get OTHER appointments' data. Each email is sent individually
 * with the org's specific contact routing.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

interface Body {
  appointmentId: string;
  appointment_id?: string; // snake_case fallback
  specimenId?: string;
  labName?: string;
  tubeCount?: number;
  deliveredAt?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const apptId = body.appointmentId || body.appointment_id;
    if (!apptId) {
      return new Response(JSON.stringify({ error: 'appointment_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch appointment + linked orgs (primary + cc)
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, patient_name, patient_name_masked, org_reference_id, appointment_date, service_name, service_type, organization_id')
      .eq('id', apptId)
      .maybeSingle();

    if (!appt) {
      return new Response(JSON.stringify({ error: 'appointment_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: links } = await supabase
      .from('appointment_organizations')
      .select('organization_id, role, notified_delivery_at')
      .eq('appointment_id', apptId);

    // Also include appointments.organization_id fallback if not in junction
    const orgIds = new Set<string>((links || []).map((l: any) => l.organization_id));
    if (appt.organization_id) orgIds.add(appt.organization_id as string);

    if (orgIds.size === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_linked_orgs' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, contact_name, contact_email, billing_email, default_billed_to')
      .in('id', Array.from(orgIds));

    const displayPatient = appt.patient_name_masked
      ? (appt.org_reference_id || 'your patient')
      : (appt.patient_name || 'your patient');
    const apptDate = appt.appointment_date
      ? new Date(appt.appointment_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'recently';
    const svc = appt.service_name || appt.service_type || 'lab draw';

    let sent = 0, skipped = 0;
    const trackingLink = body.specimenId ? `<p style="margin:6px 0 0;"><strong>Tracking:</strong> ${body.specimenId}</p>` : '';
    const labLine = body.labName ? `<p style="margin:6px 0 0;"><strong>Delivered to:</strong> ${body.labName}</p>` : '';

    for (const org of (orgs || [])) {
      const recipient = org.contact_email || org.billing_email;
      if (!recipient) { skipped++; continue; }
      if (!MAILGUN_API_KEY) { skipped++; continue; }

      // Dedup via notified_delivery_at on the junction row
      const link = (links || []).find((l: any) => l.organization_id === org.id);
      if (link?.notified_delivery_at) { skipped++; continue; }

      try {
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#059669;color:white;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
    <h2 style="margin:0;font-size:20px;">Specimen Delivered ✓</h2>
    <p style="margin:4px 0 0;opacity:0.9;font-size:13px;">ConveLabs chain-of-custody update</p>
  </div>
  <div style="background:white;border:1px solid #e5e7eb;padding:22px;border-radius:0 0 10px 10px;line-height:1.5;">
    <p>Hi ${org.contact_name || 'team'},</p>
    <p>We've completed the specimen handoff for <strong>${displayPatient}</strong>${appt.patient_name_masked ? ` (reference: ${appt.org_reference_id})` : ''}.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin:14px 0;font-size:14px;">
      <p style="margin:0;"><strong>Visit:</strong> ${svc} on ${apptDate}</p>
      ${labLine}
      ${trackingLink}
    </div>
    <p style="font-size:13px;color:#6b7280;">Results will arrive via the destination lab's standard pipeline. If you need us to resend or re-route, just reply to this email.</p>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;border-top:1px solid #f3f4f6;padding-top:12px;">
      This email contains limited patient-identifier information consistent with HIPAA minimum-necessary standards.<br/>
      ConveLabs · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810 · (941) 527-9169
    </p>
  </div>
</div>`;

        const fd = new FormData();
        fd.append('from', `ConveLabs <noreply@${MAILGUN_DOMAIN}>`);
        fd.append('to', recipient);
        fd.append('subject', `Specimen delivered for ${displayPatient}${body.labName ? ` · ${body.labName}` : ''}`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        fd.append('o:tag', 'specimen-delivery-org-notify');

        const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });

        if (!mgRes.ok) {
          console.error(`[specimen-org-notify] mailgun ${org.name} ${mgRes.status}`);
          skipped++;
          continue;
        }

        // Stamp dedup timestamp on junction row (only if link exists)
        if (link) {
          await supabase.from('appointment_organizations')
            .update({ notified_delivery_at: new Date().toISOString() })
            .eq('appointment_id', apptId)
            .eq('organization_id', org.id);
        }

        // Also stamp on appointment for legacy consumers
        await supabase.from('appointments')
          .update({ org_notified_delivery_at: new Date().toISOString() })
          .eq('id', apptId);

        sent++;
      } catch (e: any) {
        console.error(`[specimen-org-notify] ${org.name} failed:`, e);
        skipped++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped, total_orgs: orgIds.size }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[specimen-org-notify] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
