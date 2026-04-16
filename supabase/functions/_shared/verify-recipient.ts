/**
 * Pre-send recipient verification — HIPAA safeguard
 *
 * Before sending any patient notification (SMS or email), this module
 * verifies that the recipient email/phone actually belongs to the patient
 * named on the appointment. If there's a mismatch, the notification is
 * blocked and flagged for manual review.
 *
 * This prevents cross-contamination where one patient receives another
 * patient's appointment details.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface VerificationResult {
  safe: boolean;
  reason?: string;
  flagged?: boolean;
}

/**
 * Verify that an email belongs to the patient on this appointment.
 * Returns { safe: true } if OK to send, { safe: false, reason } if blocked.
 */
export async function verifyRecipientEmail(
  appointmentId: string,
  recipientEmail: string,
  patientName: string,
): Promise<VerificationResult> {
  if (!recipientEmail || !patientName) {
    return { safe: false, reason: 'Missing email or patient name' };
  }

  const email = recipientEmail.trim().toLowerCase();

  try {
    // Look up who this email belongs to in tenant_patients
    const { data: patient } = await supabase
      .from('tenant_patients')
      .select('first_name, last_name')
      .ilike('email', email)
      .maybeSingle();

    if (!patient) {
      // Email not in patient registry — could be new patient, allow but flag
      return { safe: true, flagged: true, reason: 'Email not found in patient registry' };
    }

    // Compare names (fuzzy — check if the patient record name appears in the appointment name)
    const registryName = `${patient.first_name || ''} ${patient.last_name || ''}`.toLowerCase().trim();
    const apptName = patientName.toLowerCase().trim();

    // Check if names overlap meaningfully
    const registryParts = registryName.split(/\s+/).filter(p => p.length > 1);
    const apptParts = apptName.split(/\s+/).filter(p => p.length > 1);
    const overlap = registryParts.filter(part => apptParts.includes(part));

    if (overlap.length === 0) {
      // Email belongs to a DIFFERENT person than the appointment patient
      console.error(
        `HIPAA GUARD BLOCKED: Email ${email} belongs to "${registryName}" but appointment ${appointmentId} is for "${apptName}"`
      );

      // Log the blocked notification for admin review
      await supabase.from('webhook_logs').insert({
        id: crypto.randomUUID(),
        event_type: 'hipaa_guard_blocked',
        status: 'blocked',
        payload_summary: {
          appointment_id: appointmentId,
          recipient_email: email,
          appointment_patient: apptName,
          email_owner: registryName,
          reason: 'Email belongs to a different patient',
        },
      }).catch(() => {});

      return {
        safe: false,
        flagged: true,
        reason: `Email belongs to "${registryName}" but appointment is for "${apptName}"`,
      };
    }

    return { safe: true };
  } catch (err) {
    console.error('Recipient verification error (allowing send):', err);
    // On verification error, allow the send but flag it
    return { safe: true, flagged: true, reason: 'Verification check failed' };
  }
}

/**
 * Verify that a phone number belongs to the patient on this appointment.
 */
export async function verifyRecipientPhone(
  appointmentId: string,
  recipientPhone: string,
  patientName: string,
): Promise<VerificationResult> {
  if (!recipientPhone || !patientName) {
    return { safe: false, reason: 'Missing phone or patient name' };
  }

  const phone = recipientPhone.replace(/[^0-9]/g, '');
  if (phone.length < 7) {
    return { safe: false, reason: 'Invalid phone number' };
  }

  try {
    // Look up who this phone belongs to in tenant_patients
    const { data: patients } = await supabase
      .from('tenant_patients')
      .select('first_name, last_name, phone')
      .not('phone', 'is', null);

    if (!patients || patients.length === 0) {
      return { safe: true, flagged: true, reason: 'No patients in registry to verify against' };
    }

    // Find matching phone
    const match = patients.find(p => {
      const pPhone = (p.phone || '').replace(/[^0-9]/g, '');
      return pPhone.length >= 7 && (pPhone.endsWith(phone.slice(-10)) || phone.endsWith(pPhone.slice(-10)));
    });

    if (!match) {
      // Phone not in registry — new patient, allow but flag
      return { safe: true, flagged: true, reason: 'Phone not found in patient registry' };
    }

    // Compare names
    const registryName = `${match.first_name || ''} ${match.last_name || ''}`.toLowerCase().trim();
    const apptName = patientName.toLowerCase().trim();
    const registryParts = registryName.split(/\s+/).filter(p => p.length > 1);
    const apptParts = apptName.split(/\s+/).filter(p => p.length > 1);
    const overlap = registryParts.filter(part => apptParts.includes(part));

    if (overlap.length === 0) {
      console.error(
        `HIPAA GUARD BLOCKED: Phone ${phone} belongs to "${registryName}" but appointment ${appointmentId} is for "${apptName}"`
      );

      await supabase.from('webhook_logs').insert({
        id: crypto.randomUUID(),
        event_type: 'hipaa_guard_blocked',
        status: 'blocked',
        payload_summary: {
          appointment_id: appointmentId,
          recipient_phone: phone,
          appointment_patient: apptName,
          phone_owner: registryName,
          reason: 'Phone belongs to a different patient',
        },
      }).catch(() => {});

      return {
        safe: false,
        flagged: true,
        reason: `Phone belongs to "${registryName}" but appointment is for "${apptName}"`,
      };
    }

    return { safe: true };
  } catch (err) {
    console.error('Phone verification error (allowing send):', err);
    return { safe: true, flagged: true, reason: 'Verification check failed' };
  }
}
