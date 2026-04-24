/**
 * Shared helper for writing rich rows into email_send_log from patient-facing
 * email functions (confirmation, reminder, specimen delivered, invoice).
 *
 * Resolves organization_id from the appointment if available so the email
 * surfaces under the correct org's Emails tab in admin. Captures the
 * Mailgun message id so the mailgun-webhook can later flip status to
 * opened/clicked/bounced.
 *
 * Usage:
 *   const mgRes = await fetch('https://api.mailgun.net/...', { ... });
 *   await logOrgEmail(supabase, {
 *     appointmentId: appt.id,
 *     toEmail: patientEmail,
 *     ccEmails: [],
 *     emailType: 'appointment_reminder',
 *     subject: 'Reminder: your visit is tomorrow',
 *     mailgunResponse: mgRes,
 *     organizationId: appt.organization_id, // optional override
 *   });
 */

export interface LogOrgEmailArgs {
  appointmentId?: string | null;
  organizationId?: string | null;
  toEmail: string;
  ccEmails?: string[] | null;
  emailType: string;
  subject: string;
  mailgunResponse?: Response;         // pass the raw Response to capture id + status
  status?: 'sent' | 'failed' | 'bounced' | 'complained' | 'opened' | 'clicked';
  sentBy?: string | null;              // auth.users.id that triggered the send
}

/**
 * Resolve the organization_id for an appointment. Checks the direct
 * organization_id column first, falls back to the appointment_organizations
 * junction table (for CC'd orgs).
 */
export async function resolveOrgIdFromAppointment(
  supabase: any,
  appointmentId: string
): Promise<string | null> {
  try {
    const { data: appt } = await supabase
      .from('appointments')
      .select('organization_id')
      .eq('id', appointmentId)
      .maybeSingle();
    if (appt?.organization_id) return appt.organization_id;

    const { data: junction } = await supabase
      .from('appointment_organizations')
      .select('organization_id')
      .eq('appointment_id', appointmentId)
      .limit(1)
      .maybeSingle();
    return junction?.organization_id || null;
  } catch {
    return null;
  }
}

export async function logOrgEmail(supabase: any, args: LogOrgEmailArgs): Promise<void> {
  try {
    // Resolve org_id if not explicitly passed
    let orgId = args.organizationId || null;
    if (!orgId && args.appointmentId) {
      orgId = await resolveOrgIdFromAppointment(supabase, args.appointmentId);
    }

    // Capture Mailgun message id if response provided
    let mailgunId: string | null = null;
    let status: string = args.status || 'sent';
    if (args.mailgunResponse) {
      if (!args.mailgunResponse.ok) status = 'failed';
      try {
        const body = await args.mailgunResponse.clone().json();
        mailgunId = String((body as any)?.id || '').replace(/[<>]/g, '') || null;
      } catch { /* not JSON — non-fatal */ }
    }

    // Filter empty / duplicate CCs
    const ccClean = (args.ccEmails || [])
      .map(e => String(e || '').trim().toLowerCase())
      .filter((e, i, arr) =>
        e && e.includes('@') && e !== args.toEmail.toLowerCase() && arr.indexOf(e) === i
      );

    await supabase.from('email_send_log').insert({
      organization_id: orgId,
      to_email: args.toEmail,
      cc_emails: ccClean.length > 0 ? ccClean : null,
      email_type: args.emailType,
      campaign_tag: args.emailType, // legacy field, keep in sync
      subject: args.subject,
      status,
      mailgun_id: mailgunId,
      sent_by: args.sentBy || null,
      sent_at: new Date().toISOString(),
    } as any);
  } catch (e) {
    // Never block the caller on logging failure
    console.warn('[email-log] insert failed (non-fatal):', e);
  }
}
