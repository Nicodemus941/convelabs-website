/**
 * twilio-status-callback — Twilio Message Status webhook.
 *
 * Twilio POSTs here on every status transition of an outbound SMS
 * (queued → sent → delivered, or → undelivered / failed). We:
 *   1. Update sms_notifications.delivery_status to the REAL carrier outcome
 *      (so the DB stops lying "sent" when the carrier actually bounced it).
 *   2. On a terminal FAILURE (undelivered/failed) — e.g. error 30034 — alert
 *      the platform owner, unless the failed message WAS an owner alert
 *      (avoids an alert→fail→alert loop; those go to error_logs only).
 *   3. LEAK DETECTOR: if a ConveLabs text ever goes out on a number other than
 *      the 407 ConveLabs number, alert the owner (catches the shared-pool /
 *      717 E-Labus leak structurally, from one place).
 *
 * Deployed with --no-verify-jwt (Twilio posts with no Supabase auth). Abuse is
 * bounded: we only act on message SIDs that already exist in our table, and
 * each row's owner-alert fires at most once (deduped via metadata flag).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendOwnerAlert, normalizePhone } from '../_shared/alert-recipients.ts';

const CONVELABS_NUMBER = normalizePhone(Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939');
const FAILURE_STATES = new Set(['undelivered', 'failed']);

function ok() { return new Response('', { status: 204 }); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    // Twilio sends application/x-www-form-urlencoded
    const form = await req.formData().catch(() => null);
    if (!form) return ok();
    const sid = String(form.get('MessageSid') || form.get('SmsSid') || '');
    const status = String(form.get('MessageStatus') || form.get('SmsStatus') || '').toLowerCase();
    const errorCode = form.get('ErrorCode') ? String(form.get('ErrorCode')) : null;
    const from = String(form.get('From') || '');
    const to = String(form.get('To') || '');
    if (!sid || !status) return ok();

    // Find the matching row (bounds abuse to real SIDs we sent)
    const { data: row } = await admin
      .from('sms_notifications')
      .select('id, notification_type, metadata, delivery_status')
      .eq('twilio_message_sid', sid)
      .maybeSingle();

    const meta = { ...((row as any)?.metadata || {}) };
    meta.callback_status = status;
    if (errorCode) meta.error_code = errorCode;
    if (status === 'delivered') meta.delivered_at = new Date().toISOString();
    if (from) meta.delivered_from = from;

    if (row) {
      await admin.from('sms_notifications')
        .update({ delivery_status: status, metadata: meta })
        .eq('id', (row as any).id);
    }

    const alreadyAlerted = !!(row as any)?.metadata?.owner_alerted_at;
    const isOwnerAlert = (row as any)?.notification_type === 'owner_alert';

    // 3) LEAK DETECTOR — went out on a non-ConveLabs number
    if (from && normalizePhone(from) !== CONVELABS_NUMBER && !alreadyAlerted) {
      try {
        await admin.from('error_logs').insert({
          error_type: 'sms_wrong_sender_number',
          error_message: `ConveLabs SMS ${sid} went out on ${from} (expected ${CONVELABS_NUMBER}). To: ${to}`,
          context: { sid, from, to, status },
        } as any);
      } catch { /* */ }
      if (!isOwnerAlert) {
        await sendOwnerAlert(admin, `⚠️ ConveLabs SMS went out on the WRONG number (${from}, expected ${CONVELABS_NUMBER}). Check TWILIO_MESSAGING_SERVICE_SID isn't set.`);
        if (row) await admin.from('sms_notifications').update({ metadata: { ...meta, owner_alerted_at: new Date().toISOString() } }).eq('id', (row as any).id);
      }
      return ok();
    }

    // 2) Terminal delivery FAILURE → alert owner (once), unless it's an owner alert itself
    if (FAILURE_STATES.has(status) && !alreadyAlerted) {
      const detail = `to ${to}${errorCode ? ` (Twilio ${errorCode}${errorCode === '30034' ? ' = A2P not registered' : ''})` : ''}`;
      try {
        await admin.from('error_logs').insert({
          error_type: 'sms_delivery_failed',
          error_message: `SMS ${status} ${detail} [${(row as any)?.notification_type || 'unknown'}]`,
          context: { sid, to, status, error_code: errorCode, notification_type: (row as any)?.notification_type },
        } as any);
      } catch { /* */ }
      if (!isOwnerAlert) {
        await sendOwnerAlert(admin, `⚠️ ConveLabs SMS not delivered ${detail}. Type: ${(row as any)?.notification_type || 'unknown'}.`);
        if (row) await admin.from('sms_notifications').update({ metadata: { ...meta, owner_alerted_at: new Date().toISOString() } }).eq('id', (row as any).id);
      }
    }

    return ok();
  } catch (_e) {
    // Always 2xx so Twilio doesn't retry-storm us
    return ok();
  }
});
