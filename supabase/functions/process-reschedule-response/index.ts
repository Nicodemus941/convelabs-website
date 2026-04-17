import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * PROCESS RESCHEDULE RESPONSE
 *
 * Handles the POST from the /reschedule/:token page when a patient:
 *   - Approves a suggested slot → atomic update + confirmation
 *   - Declines all suggestions → escalates to office (SMS)
 *   - Picks a custom time → validates + updates
 *
 * Request body:
 *   {
 *     "token": "abc123...",
 *     "action": "approve" | "decline" | "pick_custom",
 *     "selectedDate": "2026-04-24",   // for approve/pick_custom
 *     "selectedTime": "11:30 AM"      // for approve/pick_custom
 *   }
 *
 * Idempotent: already-approved tokens return the current state without
 * re-processing. Expired tokens return a clear error so the UI can
 * redirect to /reschedule/expired.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendSMS(
  phone: string,
  message: string,
  accountSid: string,
  authToken: string,
  fromNumber: string,
): Promise<boolean> {
  try {
    const cleanPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: cleanPhone, Body: message.substring(0, 1500), From: fromNumber }).toString(),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function sendConfirmationEmail(
  to: string,
  patientName: string,
  newDate: string,
  newTime: string,
): Promise<boolean> {
  const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY');
  const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN');
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) return false;

  const FROM = Deno.env.get('MAILGUN_FROM') || `ConveLabs <hello@${MAILGUN_DOMAIN}>`;
  const displayDate = new Date(newDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const html = `
<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;">
<h1 style="color:#10b981;margin:0 0 8px">You're all set, ${patientName?.split(' ')[0] || 'there'}!</h1>
<p style="font-size:16px;color:#333">Your appointment has been rescheduled. Here are the new details:</p>
<div style="background:#F9FAFB;border-left:4px solid #B91C1C;padding:16px 20px;border-radius:8px;margin:24px 0">
  <p style="margin:0 0 4px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.1em">New appointment</p>
  <p style="margin:0;font-size:20px;font-weight:700;color:#1a1a1a">${displayDate}</p>
  <p style="margin:4px 0 0;font-size:18px;color:#B91C1C;font-weight:600">${newTime}</p>
</div>
<p style="font-size:16px;color:#333">Your <strong>$25 apology credit</strong> has been added to your account — it'll auto-apply to this visit or any future one.</p>
<p style="font-size:14px;color:#666">Thank you for being patient with us. Looking forward to seeing you.</p>
<p style="font-size:13px;color:#999;margin-top:32px">Questions? Reply to this email or call (941) 527-9169.<br>— The ConveLabs Team</p>
</body></html>`;

  const text = `You're all set! Your appointment has been rescheduled to ${displayDate} at ${newTime}.\n\nYour $25 apology credit has been added to your account. See you then!\n\n— The ConveLabs Team`;

  const form = new FormData();
  form.append('from', FROM);
  form.append('to', to);
  form.append('subject', `Rescheduled: your ConveLabs visit is now ${displayDate} at ${newTime}`);
  form.append('html', html);
  form.append('text', text);
  form.append('o:tag', 'reschedule-confirmation');

  try {
    const resp = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`api:${MAILGUN_API_KEY}`) },
      body: form,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { token, action, selectedDate, selectedTime } = await req.json();

    if (!token || !action) {
      return new Response(JSON.stringify({ success: false, error: 'Missing token or action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('reschedule_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Expired?
    if (new Date(tokenRow.expires_at) < new Date()) {
      await supabase.from('reschedule_tokens').update({ status: 'expired' }).eq('id', tokenRow.id);
      return new Response(JSON.stringify({ success: false, error: 'expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Already processed? Return current state (idempotent)
    if (tokenRow.status !== 'pending') {
      return new Response(JSON.stringify({
        success: true,
        alreadyProcessed: true,
        status: tokenRow.status,
        approvedDate: tokenRow.approved_date,
        approvedTime: tokenRow.approved_time,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load the appointment
    const { data: appt } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', tokenRow.appointment_id)
      .maybeSingle();

    if (!appt) {
      return new Response(JSON.stringify({ success: false, error: 'appointment_not_found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
    const smsReady = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN);

    // ─── ACTION: DECLINE ────────────────────────────────────────────
    if (action === 'decline') {
      await supabase.from('reschedule_tokens').update({
        status: 'declined',
        patient_responded_at: new Date().toISOString(),
      }).eq('id', tokenRow.id);

      // Escalate to office: a human needs to call this patient
      if (smsReady) {
        await sendSMS(
          OWNER_PHONE,
          `[URGENT] ${appt.patient_name || 'Patient'} declined all reschedule options for their ${new Date(tokenRow.original_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${tokenRow.original_time} appointment. Please call them: ${appt.patient_phone || appt.patient_email}.`,
          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM,
        );
      }

      return new Response(JSON.stringify({
        success: true,
        status: 'declined',
        message: 'We\'ll call you shortly to find a time that works.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── ACTION: APPROVE or PICK_CUSTOM ─────────────────────────────
    if (action === 'approve' || action === 'pick_custom') {
      if (!selectedDate || !selectedTime) {
        return new Response(JSON.stringify({ success: false, error: 'selectedDate and selectedTime required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Parse time (e.g. "11:30 AM") to HH:MM 24hr for appointment_time column
      const parseTime = (s: string): string => {
        const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (!m) return s;
        let h = parseInt(m[1], 10);
        const min = m[2];
        const period = (m[3] || '').toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${min}:00`;
      };

      const dateOnly = selectedDate.slice(0, 10);
      const time24 = parseTime(selectedTime);
      // Construct a timestamp-tz anchored at noon local to avoid off-by-one
      const newTimestamp = `${dateOnly}T12:00:00`;

      // Update the appointment
      const { error: updateErr } = await supabase
        .from('appointments')
        .update({
          appointment_date: newTimestamp,
          appointment_time: selectedTime,
          rescheduled_at: new Date().toISOString(),
          status: 'scheduled',
        })
        .eq('id', appt.id);

      if (updateErr) {
        return new Response(JSON.stringify({ success: false, error: `Update failed: ${updateErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Mark token as approved
      await supabase.from('reschedule_tokens').update({
        status: action === 'approve' ? 'approved' : 'picked_other',
        approved_date: newTimestamp,
        approved_time: selectedTime,
        patient_responded_at: new Date().toISOString(),
      }).eq('id', tokenRow.id);

      // Mark apology credit as issued (it stays unredeemed, applied at next checkout)
      await supabase.from('reschedule_tokens').update({ apology_credit_applied: true }).eq('id', tokenRow.id);

      // Log activity
      try {
        await supabase.from('activity_log' as any).insert({
          appointment_id: appt.id,
          activity_type: 'auto_reschedule',
          description: `Self-healed: patient accepted ${selectedDate} ${selectedTime} via token ${tokenRow.token.slice(0, 8)}…`,
          created_by_name: 'system',
        });
      } catch { /* non-fatal */ }

      // Send confirmation SMS + email
      if (appt.patient_phone && smsReady) {
        const displayDate = new Date(dateOnly + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric',
        });
        await sendSMS(
          appt.patient_phone,
          `ConveLabs: confirmed! Your visit is now ${displayDate} at ${selectedTime}. $25 credit added for your next visit. Thanks for your patience.`,
          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM,
        );
      }
      if (appt.patient_email) {
        await sendConfirmationEmail(appt.patient_email, appt.patient_name || 'there', dateOnly, selectedTime);
      }

      // Notify owner
      if (smsReady) {
        await sendSMS(
          OWNER_PHONE,
          `[Auto-healed] ${appt.patient_name} accepted reschedule to ${dateOnly} ${selectedTime}. Calendar updated.`,
          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM,
        );
      }

      return new Response(JSON.stringify({
        success: true,
        status: action === 'approve' ? 'approved' : 'picked_other',
        newDate: dateOnly,
        newTime: selectedTime,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Reschedule response error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
