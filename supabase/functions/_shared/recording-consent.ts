/**
 * Attaching a checkout's recording consent to the appointment it paid for.
 *
 * Called from BOTH places an appointment can be created after payment:
 * stripe-webhook (normally first) and verify-appointment-checkout (the
 * redirect-time fallback). Either can win the race, so this is idempotent:
 * the consent is linked once, the appointment's answer is written from the
 * consent each time, and the patient's copy is emailed once.
 *
 * Never throws. A consent that fails to link leaves the appointment at
 * 'not_asked', which the phleb sees and treats as "do not record".
 */

import { brandedEmailWrapper } from './branded-email.ts';
import { SCOPE_LABEL, isKnownMinor, type RecordingScope } from './recording-release.ts';
import { shouldSendNow } from './quiet-hours.ts';

export interface LinkOptions {
  sessionId: string | null | undefined;
  appointmentId: string;
  patientDob?: string | null;
  /** YYYY-MM-DD or ISO; used to decide "minor" on the visit day. */
  appointmentDate?: string | null;
  rescheduleFromId?: string | null;
  origin: 'stripe-webhook' | 'verify-appointment-checkout';
}

type Preference = 'accepted' | 'declined' | 'not_asked' | 'not_eligible';

function fromHexBytea(v: unknown): Uint8Array<ArrayBuffer> | null {
  const s = String(v ?? '');
  if (!s.startsWith('\\x')) return null;
  const hex = s.slice(2);
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export async function linkRecordingConsent(admin: any, opts: LinkOptions): Promise<void> {
  try {
    const visitDay = opts.appointmentDate && /^\d{4}-\d{2}-\d{2}/.test(opts.appointmentDate)
      ? new Date(opts.appointmentDate.slice(0, 10) + 'T12:00:00Z')
      : new Date();
    const minor = isKnownMinor(opts.patientDob, visitDay);

    let consent: any = null;
    if (opts.sessionId) {
      const { data } = await admin
        .from('recording_consents')
        .select('id, decision, scope, revoked_at, appointment_id, copy_emailed_at, patient_email, signer_name')
        .eq('stripe_session_id', opts.sessionId)
        .maybeSingle();
      consent = data;
    }

    let preference: Preference = 'not_asked';
    let scope: RecordingScope | null = null;
    let consentId: string | null = null;

    if (minor) {
      preference = 'not_eligible';
    } else if (consent) {
      if (!consent.appointment_id) {
        await admin
          .from('recording_consents')
          .update({ appointment_id: opts.appointmentId, linked_at: new Date().toISOString() })
          .eq('id', consent.id)
          .is('appointment_id', null);
      }
      consentId = consent.id;
      const active = consent.decision === 'accepted' && !consent.revoked_at;
      preference = active ? 'accepted' : 'declined';
      scope = active ? consent.scope : null;
    } else if (opts.rescheduleFromId) {
      // A reschedule is the same visit at a new time: the answer carries over.
      const { data: old } = await admin
        .from('appointments')
        .select('recording_preference, recording_scope, recording_consent_id')
        .eq('id', opts.rescheduleFromId)
        .maybeSingle();
      if (old && old.recording_preference && old.recording_preference !== 'not_asked') {
        preference = old.recording_preference;
        scope = old.recording_scope ?? null;
        consentId = old.recording_consent_id ?? null;
      }
    }

    if (preference === 'not_asked') return;

    await admin
      .from('appointments')
      .update({ recording_preference: preference, recording_scope: scope, recording_consent_id: consentId })
      .eq('id', opts.appointmentId);
    console.log(`[recording-consent] ${opts.origin}: appointment ${opts.appointmentId} -> ${preference}${scope ? ` (${scope})` : ''}`);

    if (preference === 'accepted' && consent && !consent.copy_emailed_at) {
      await emailConsentCopy(admin, consent.id, opts.appointmentId);
    }
  } catch (e: any) {
    console.warn(`[recording-consent] link failed (non-blocking) for ${opts.appointmentId}:`, e?.message);
  }
}

/**
 * HIPAA: the patient gets a copy of the authorization they signed. Sent with
 * the booking (the 'booking_confirmation' category -- the patient just paid
 * and is waiting on it), and never while notifications are suspended.
 */
export async function emailConsentCopy(admin: any, consentId: string, appointmentId: string): Promise<boolean> {
  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    console.log(`[recording-consent] notifications suspended; copy for ${consentId} not sent`);
    return false;
  }
  const gate = shouldSendNow('booking_confirmation');
  if (!gate.allow) return false;

  const apiKey = Deno.env.get('MAILGUN_API_KEY');
  const domain = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
  if (!apiKey) return false;

  // Claimed first, so the webhook and the fallback can never both send it.
  const { data: claimed } = await admin
    .from('recording_consents')
    .update({ copy_emailed_at: new Date().toISOString() })
    .eq('id', consentId)
    .is('copy_emailed_at', null)
    .select('id, scope, signer_name, patient_email, consent_pdf')
    .maybeSingle();
  if (!claimed) return false;

  const pdf = fromHexBytea(claimed.consent_pdf);
  const scopeLabel = SCOPE_LABEL[claimed.scope as RecordingScope] || 'Arm and hands only';
  const firstName = String(claimed.signer_name || '').split(/\s+/)[0] || 'there';

  const html = brandedEmailWrapper({
    headline: 'Your recording',
    accent: 'permission',
    greeting: `Hi ${firstName},`,
    bodyHtml: `
      <p style="margin:0 0 14px">Thank you for agreeing to let us record your visit for ConveLabs. A copy of the authorization you signed is attached.</p>
      <p style="margin:0 0 14px"><strong>What may be recorded:</strong> ${scopeLabel}.</p>
      <p style="margin:0 0 14px">We never record your lab order, name, date of birth or address. Your phlebotomist will check with you again before recording, and you can ask them to stop at any time.</p>
      <p style="margin:0">Changed your mind? Just reply to this email or tell your phlebotomist, and nothing will be recorded.</p>`,
    showLockup: true,
  });

  const form = new FormData();
  form.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
  form.append('to', claimed.patient_email);
  form.append('subject', 'Your ConveLabs recording authorization (copy)');
  form.append('html', html);
  if (pdf) form.append('attachment', new Blob([pdf], { type: 'application/pdf' }), 'convelabs-recording-authorization.pdf');

  try {
    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
      body: form,
    });
    if (!res.ok) throw new Error(`mailgun ${res.status}`);
    console.log(`[recording-consent] copy emailed for appointment ${appointmentId}`);
    return true;
  } catch (e: any) {
    // Release the claim so an admin resend (or the other path) can try again.
    await admin.from('recording_consents').update({ copy_emailed_at: null }).eq('id', consentId);
    console.warn(`[recording-consent] copy email failed for ${consentId}:`, e?.message);
    return false;
  }
}
