/**
 * INVOICE-SMS — the "your invoice is ready" text with the on-site pay link.
 *
 * Sent by send-appointment-invoice the first time a PATIENT invoice goes
 * out (never for org-billed). Same sending path as every other patient
 * text: `_shared/twilio.ts` (pinned ConveLabs From number, Twilio-level
 * STOP/opt-out enforcement, delivery status callback).
 *
 * Guards, in order:
 *   1. NOTIFICATIONS_SUSPENDED  → skip (logged, not sent)
 *   2. no usable phone          → skip
 *   3. HIPAA recipient guard    → skip (verifyRecipientPhone)
 *   4. quiet hours 9pm–8am ET   → QUEUED, not dropped: a notification_deferrals
 *      row (channel='sms', origin_function='send-appointment-invoice') that
 *      process-invoice-reminders drains on its first run after 8am ET.
 *
 * Every send/attempt is logged to sms_notifications
 * (notification_type='invoice_sent') so the reminder cascade can avoid
 * texting the same patient twice in one day.
 */

import { sendSMS } from './twilio.ts';
import { shouldSendNow, logDeferral } from './quiet-hours.ts';
import { verifyRecipientPhone } from './verify-recipient.ts';

export const INVOICE_SMS_TYPE = 'invoice_sent';
export const INVOICE_SMS_ORIGIN = 'send-appointment-invoice';

export interface InvoiceSmsResult {
  ok: boolean;
  status: 'sent' | 'deferred' | 'skipped' | 'failed';
  reason?: string;
  sid?: string | null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

/** Short, honest copy. ~150 chars + link; one SMS segment-ish. */
export function buildInvoiceSmsBody(firstName: string, amountDollars: number, payUrl: string): string {
  const first = String(firstName || 'there').split(' ')[0];
  const amt = `$${Number(amountDollars || 0).toFixed(2)}`;
  return `Hi ${first}, your ConveLabs invoice is ready: ${amt}. Pay securely on our site — tip optional: ${payUrl} — ConveLabs`;
}

async function logSms(admin: any, p: { appointment_id: string; to: string; body: string; status: string; sid?: string | null; source: string; error?: string }) {
  try {
    await admin.from('sms_notifications').insert({
      appointment_id: p.appointment_id,
      notification_type: INVOICE_SMS_TYPE,
      phone_number: p.to,
      message_content: p.body.substring(0, 1500),
      sent_at: new Date().toISOString(),
      delivery_status: p.status,
      twilio_message_sid: p.sid || null,
      metadata: { source: p.source, ...(p.error ? { error: p.error.substring(0, 300) } : {}) },
    });
  } catch (e) { console.warn('[invoice-sms] log failed (non-blocking):', (e as Error)?.message || e); }
}

/**
 * Send now, or queue for after quiet hours. `skipQuietHoursQueue` is used by
 * the cron drain (already outside quiet hours; must not re-queue).
 */
export async function sendInvoiceSms(
  admin: any,
  p: { appointment_id: string; phone: string | null | undefined; patient_name: string | null | undefined; body: string; source?: string; skipQuietHoursQueue?: boolean },
): Promise<InvoiceSmsResult> {
  const source = p.source || INVOICE_SMS_ORIGIN;

  if (Deno.env.get('NOTIFICATIONS_SUSPENDED')) {
    console.log(`[invoice-sms] NOTIFICATIONS_SUSPENDED — not texting appointment ${p.appointment_id}`);
    return { ok: false, status: 'skipped', reason: 'notifications_suspended' };
  }

  const to = normalizePhone(p.phone);
  if (!to) return { ok: false, status: 'skipped', reason: 'no_valid_phone' };

  try {
    const guard = await verifyRecipientPhone(p.appointment_id, to, String(p.patient_name || ''));
    if (!guard.safe) {
      console.warn(`[invoice-sms] HIPAA guard blocked ${to}: ${guard.reason}`);
      return { ok: false, status: 'skipped', reason: `recipient_guard:${guard.reason}` };
    }
  } catch { /* guard failure never blocks the send path */ }

  const gate = shouldSendNow('dunning');
  if (!gate.allow) {
    if (p.skipQuietHoursQueue) return { ok: false, status: 'skipped', reason: 'quiet_hours' };
    await logDeferral(admin, {
      category: 'dunning',
      recipient: to,
      channel: 'sms',
      // The drain re-reads this JSON; keep it well under logDeferral's 500-char cap.
      payload_summary: JSON.stringify({ appointment_id: p.appointment_id, to, body: p.body }),
      next_allowed_at: gate.nextAllowedAt,
      origin_function: INVOICE_SMS_ORIGIN,
    });
    console.log(`[invoice-sms] quiet hours — queued for ${gate.nextAllowedAt} (appointment ${p.appointment_id})`);
    return { ok: true, status: 'deferred', reason: gate.nextAllowedAt };
  }

  try {
    const msg = await sendSMS(to, p.body);
    const sid = (msg as any)?.sid || null;
    await logSms(admin, { appointment_id: p.appointment_id, to, body: p.body, status: 'sent', sid, source });
    return { ok: true, status: 'sent', sid };
  } catch (e: any) {
    // Twilio enforces STOP at the number level: an opted-out recipient
    // surfaces here as error 21610. Log it; never retry.
    const err = String(e?.message || e);
    await logSms(admin, { appointment_id: p.appointment_id, to, body: p.body, status: 'failed', source, error: err });
    return { ok: false, status: 'failed', reason: err };
  }
}

/** True if this appointment was texted an invoice link within `hours`. */
export async function invoiceSmsSentRecently(admin: any, appointmentId: string, hours = 20): Promise<boolean> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await admin.from('sms_notifications')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('notification_type', INVOICE_SMS_TYPE)
      .eq('delivery_status', 'sent')
      .gte('sent_at', since)
      .limit(1);
    return !!(data && data.length > 0);
  } catch { return false; }
}

/**
 * Drain queued invoice texts (called by process-invoice-reminders, which only
 * runs outside quiet hours). Re-checks the appointment is still unpaid and
 * active before sending; marks every row processed with a result.
 */
export async function drainDeferredInvoiceSms(admin: any): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const { data: rows } = await admin.from('notification_deferrals')
    .select('id, payload_summary, created_at')
    .eq('channel', 'sms')
    .eq('origin_function', INVOICE_SMS_ORIGIN)
    .is('processed_at', null)
    .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(50);

  for (const row of (rows || []) as any[]) {
    let result = 'skipped:unparseable';
    try {
      const p = JSON.parse(String(row.payload_summary || '{}'));
      if (p?.appointment_id && p?.to && p?.body) {
        const { data: appt } = await admin.from('appointments')
          .select('id, patient_name, payment_status, invoice_status, status')
          .eq('id', p.appointment_id).maybeSingle();
        const stillDue = appt
          && !['completed', 'paid', 'succeeded', 'org_billed'].includes(String(appt.payment_status))
          && !['paid', 'voided', 'cancelled'].includes(String(appt.invoice_status))
          && appt.status !== 'cancelled';
        if (!stillDue) {
          result = 'skipped:no_longer_due';
        } else if (await invoiceSmsSentRecently(admin, p.appointment_id, 20)) {
          result = 'skipped:already_texted';
        } else {
          const r = await sendInvoiceSms(admin, { appointment_id: p.appointment_id, phone: p.to, patient_name: appt.patient_name, body: p.body, source: 'process-invoice-reminders:drain', skipQuietHoursQueue: true });
          result = `${r.status}${r.reason ? `:${r.reason}` : ''}`.substring(0, 200);
        }
      }
    } catch (e) { result = `failed:${String((e as Error)?.message || e).substring(0, 150)}`; }
    if (result.startsWith('sent')) out.sent++; else if (result.startsWith('failed')) out.failed++; else out.skipped++;
    try {
      await admin.from('notification_deferrals').update({ processed_at: new Date().toISOString(), processed_result: result }).eq('id', row.id);
    } catch { /* non-blocking */ }
  }
  return out;
}
