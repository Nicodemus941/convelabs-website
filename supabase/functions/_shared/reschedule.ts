// _shared/reschedule.ts
//
// Shared reschedule logic so the FREE path (appointment-self-service) and the
// PAID path (stripe-webhook, after the <24h fee clears) commit a move
// identically: re-verify the slot, update the appointment, audit, and send the
// patient a confirmation SMS + email. Keep this the single source of truth.

const RESCHEDULE_FEE_CENTS = 2500; // $25 — published on /pricing; waived for members
const FEE_WINDOW_HOURS = 24;       // moving within this window costs the fee
const MIN_LEAD_HOURS = 2;          // closer than this → "call us", not self-serve

export const RESCHEDULE = { RESCHEDULE_FEE_CENTS, FEE_WINDOW_HOURS, MIN_LEAD_HOURS };

/** Hours between now and the appointment's current start (ET-anchored). */
export function hoursUntil(appt: any): number {
  const d = String(appt.appointment_date || '').substring(0, 10);
  const t = String(appt.appointment_time || '00:00:00');
  const start = new Date(`${d}T${t.length <= 5 ? t + ':00' : t}-04:00`);
  return (start.getTime() - Date.now()) / 3_600_000;
}

/** Active membership → reschedule fee is waived. Server-side only.
 *  user_memberships keys on user_id (+ billing_email), NOT patient_email, so we
 *  match by billing_email, then by resolved user_id, then fall back to the
 *  chart-level tier mirror (tenant_patients.membership_tier). */
export async function isActiveMember(admin: any, email?: string | null): Promise<boolean> {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  try {
    // 1) Active membership matched on billing_email.
    const { data: um } = await admin
      .from('user_memberships')
      .select('id')
      .ilike('billing_email', e)
      .eq('status', 'active')
      .limit(1);
    if (Array.isArray(um) && um.length > 0) return true;

    // 2) Resolve the auth user by email → active membership on user_id.
    const { data: prof } = await admin.from('profiles').select('id').ilike('email', e).limit(1);
    const uid = prof?.[0]?.id;
    if (uid) {
      const { data: um2 } = await admin
        .from('user_memberships')
        .select('id')
        .eq('user_id', uid)
        .eq('status', 'active')
        .limit(1);
      if (Array.isArray(um2) && um2.length > 0) return true;
    }

    // 3) Chart-level tier mirror (set on signup): any tier but 'none' counts.
    const { data: tp } = await admin
      .from('tenant_patients')
      .select('membership_tier')
      .ilike('email', e)
      .limit(1);
    const tier = (tp?.[0]?.membership_tier || '').toLowerCase();
    return !!tier && tier !== 'none';
  } catch {
    return false;
  }
}

function normPhone(p: string) {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p.startsWith('+') ? p : `+${d}`;
}

/**
 * Commit a reschedule: move the appointment, audit, notify. Caller must have
 * already verified the slot is free + lead/fee rules. `feeChargedCents` is
 * recorded for the paid path (0 for free moves).
 */
export async function commitReschedule(
  admin: any,
  appt: any,
  date: string,
  time: string,
  feeChargedCents = 0,
): Promise<{ ok: boolean; error?: string }> {
  const newTimestamp = `${date}T12:00:00-04:00`;
  const { error: updErr } = await admin.from('appointments').update({
    appointment_date: newTimestamp,
    appointment_time: time,
    rescheduled_at: new Date().toISOString(),
    status: 'scheduled',          // a moved visit is no longer "confirmed"
    patient_confirmed_at: null,
  }).eq('id', appt.id);
  if (updErr) return { ok: false, error: updErr.message };

  // Audit (best-effort)
  try {
    await admin.from('activity_log' as any).insert({
      appointment_id: appt.id,
      activity_type: 'patient_self_reschedule',
      description: `Rescheduled to ${date} ${time}` +
        (feeChargedCents > 0 ? ` · $${(feeChargedCents / 100).toFixed(2)} fee paid` : ' · no fee'),
      patient_name: appt.patient_name,
      status: 'completed',
    });
  } catch { /* non-blocking */ }

  // NOTE: we do NOT insert a stripe_qb_sync_log row here. That table requires
  // stripe_charge_id (NOT NULL), which we don't have at commit time, and the
  // existing Stripe→QB sync cron already ingests every Stripe charge (incl.
  // this $25 fee) with the real charge id. Inserting here would both fail the
  // constraint and risk a duplicate.

  // ── Patient confirmation (transactional; best-effort) ──
  const niceDate = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
  const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
  const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
  const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
  const phone = String(appt.patient_phone || '').trim();
  const email = String(appt.patient_email || '').trim();

  if (phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
    const smsBody = `ConveLabs: ✓ Rescheduled. Your visit is now ${niceDate} at ${time}. We'll text a reminder the night before. Questions? (941) 527-9169`;
    let sid: string | null = null, ok = false;
    try {
      const fd = new URLSearchParams({ To: normPhone(phone), From: TWILIO_FROM, Body: smsBody });
      const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fd.toString(),
      });
      ok = tw.ok;
      try { sid = (await tw.json())?.sid || null; } catch { /* */ }
    } catch (e) { console.warn('[reschedule] sms err:', e); }
    try {
      await admin.from('sms_notifications').insert({
        appointment_id: appt.id, notification_type: 'reschedule_confirmation',
        phone_number: normPhone(phone), message_content: smsBody.substring(0, 1500),
        sent_at: new Date().toISOString(), delivery_status: ok ? 'sent' : 'failed',
        twilio_message_sid: sid, metadata: { source: 'commitReschedule', new_date: date, new_time: time, fee_cents: feeChargedCents },
      });
    } catch { /* non-blocking */ }
  }

  if (email && MAILGUN_API_KEY) {
    const subject = `Rescheduled: your ConveLabs visit is now ${niceDate} at ${time}`;
    const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#059669,#047857);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="margin:0;font-size:20px;">✓ Your visit was rescheduled</h1></div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
    <p>Hi ${String(appt.patient_name || 'there').split(' ')[0]},</p>
    <p>You're all set — here are your new details:</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:14px;">
      <p style="margin:0;"><strong>${niceDate} at ${time}</strong></p>
      ${appt.address ? `<p style="margin:6px 0 0;">${String(appt.address)}</p>` : ''}
    </div>
    ${feeChargedCents > 0 ? `<p style="font-size:13px;color:#6b7280;">A $${(feeChargedCents / 100).toFixed(2)} same-week reschedule fee was applied. Tip: members reschedule free.</p>` : ''}
    <p style="font-size:13px;color:#6b7280;">We'll send a reminder the night before. Need to change again? Reply or call (941) 527-9169.</p>
    <p style="margin-top:18px;">— Nico at ConveLabs</p>
  </div>
</div>`;
    let mgId: string | null = null, ok = false;
    try {
      const fd = new FormData();
      fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
      fd.append('to', email);
      fd.append('subject', subject);
      fd.append('html', html);
      fd.append('o:tracking-clicks', 'no');
      const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST', headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` }, body: fd,
      });
      ok = mg.ok;
      try { mgId = (await mg.json())?.id || null; } catch { /* */ }
    } catch (e) { console.warn('[reschedule] email err:', e); }
    try {
      await admin.from('email_send_log').insert({
        appointment_id: appt.id, to_email: email, email_type: 'reschedule_confirmation',
        subject, sent_at: new Date().toISOString(), status: ok ? 'sent' : 'failed',
        mailgun_id: mgId, campaign_tag: 'reschedule_confirmation',
        organization_id: appt.organization_id || null,
      });
    } catch { /* non-blocking */ }
  }

  return { ok: true };
}
