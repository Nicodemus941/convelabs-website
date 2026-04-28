/**
 * MAILGUN-WEBHOOK
 *
 * Receives Mailgun event webhooks (delivered / opened / clicked /
 * failed / bounced / complained / unsubscribed) and updates
 * email_send_log.status for the matching mailgun_id so the Emails tab
 * reflects the real delivery state, not just the moment-we-sent state.
 *
 * Configure in Mailgun dashboard → Webhooks → add for each event type
 * pointing at:
 *   https://<project>.supabase.co/functions/v1/mailgun-webhook
 *
 * Security: HMAC-SHA256 verification using MAILGUN_WEBHOOK_SIGNING_KEY
 * (Mailgun → Settings → Webhooks → HTTP webhook signing key). Requests
 * without a valid signature are rejected with 401.
 *
 * Payload shape (Mailgun v3):
 *   { signature: { token, timestamp, signature }, event-data: { event, message: { headers: { message-id } }, ... } }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAILGUN_SIGNING_KEY = Deno.env.get('MAILGUN_WEBHOOK_SIGNING_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map Mailgun event names → our status enum
const EVENT_TO_STATUS: Record<string, string> = {
  accepted: 'sent',
  delivered: 'sent',
  opened: 'opened',
  clicked: 'clicked',
  unsubscribed: 'complained',
  complained: 'complained',
  failed: 'failed',
  bounced: 'bounced',
  'permanent_fail': 'bounced',
  'temporary_fail': 'failed',
};

// Event priority — once a row is 'clicked' we don't want a later 'opened'
// webhook to demote it.
const STATUS_RANK: Record<string, number> = {
  failed: 1, bounced: 2, sent: 3, opened: 4, clicked: 5, complained: 1,
};

async function verifySignature(timestamp: string, token: string, signature: string): Promise<boolean> {
  if (!MAILGUN_SIGNING_KEY) return true; // if not configured, accept (dev mode)
  const data = new TextEncoder().encode(timestamp + token);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(MAILGUN_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, data);
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex === signature;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json();
    const sig = payload?.signature || {};
    const ok = await verifySignature(String(sig.timestamp || ''), String(sig.token || ''), String(sig.signature || ''));
    if (!ok) {
      return new Response(JSON.stringify({ error: 'invalid_signature' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const eventData = payload['event-data'] || {};
    const event = String(eventData.event || '').toLowerCase();
    const severity = eventData.severity ? `_${eventData.severity}` : '';
    const eventKey = `${event}${severity}`.replace(/_permanent$/, '_permanent_fail').replace(/_temporary$/, '_temporary_fail');
    const newStatus = EVENT_TO_STATUS[eventKey] || EVENT_TO_STATUS[event];
    const messageId = String(eventData.message?.headers?.['message-id'] || '').replace(/[<>]/g, '');

    if (!newStatus) {
      return new Response(JSON.stringify({ ok: true, skipped: 'unmapped_event', event }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!messageId) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_message_id', event }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Look up the current status — only upgrade if new status outranks it
    const { data: existing } = await admin
      .from('email_send_log')
      .select('id, status')
      .eq('mailgun_id', messageId)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_matching_row', message_id: messageId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentRank = STATUS_RANK[existing.status || 'sent'] || 0;
    const newRank = STATUS_RANK[newStatus] || 0;
    if (newRank < currentRank) {
      return new Response(JSON.stringify({ ok: true, skipped: 'outranked', current: existing.status, incoming: newStatus }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updErr } = await admin
      .from('email_send_log')
      .update({ status: newStatus })
      .eq('id', existing.id);

    if (updErr) {
      console.error('[mailgun-webhook] update failed:', updErr.message);
      return new Response(JSON.stringify({ error: 'update_failed', message: updErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[mailgun-webhook] ${messageId} → ${newStatus} (from ${existing.status})`);

    // ─── BOUNCE PROPAGATION — when an invoice email bounces, find the
    //     most recent matching appointment, mark its email as bounced
    //     so dunning escalation skips it, and SMS the owner so they
    //     can intervene (call patient / re-send to alternate). Without
    //     this, we'd send 3 dunning emails into a black hole, then
    //     auto-cancel the appointment 24h later — terrible patient UX.
    if (newStatus === 'bounced') {
      try {
        // Pull the to_email + email_type for context
        const { data: logRow } = await admin
          .from('email_send_log')
          .select('to_email, email_type, subject')
          .eq('id', existing.id)
          .maybeSingle();

        const toEmail = (logRow as any)?.to_email || null;
        const emailType = (logRow as any)?.email_type || '';
        const isInvoiceEmail = emailType.toLowerCase().includes('invoice') || emailType.toLowerCase().includes('appointment');

        if (toEmail && isInvoiceEmail) {
          // Find the latest unpaid appointment for this email
          const { data: appt } = await admin
            .from('appointments')
            .select('id, patient_name, total_amount, invoice_status, invoice_email_bounced')
            .ilike('patient_email', toEmail)
            .in('invoice_status', ['sent', 'pending_send', 'reminded', 'final_warning'])
            .eq('invoice_email_bounced', false)
            .order('invoice_sent_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

          if (appt) {
            const reason = (eventData as any)?.['delivery-status']?.message
              || (eventData as any)?.reason
              || 'Mailgun bounce — see logs';

            await admin.from('appointments').update({
              invoice_email_bounced: true,
              invoice_email_bounced_at: new Date().toISOString(),
              invoice_email_bounce_reason: String(reason).substring(0, 250),
            }).eq('id', appt.id);

            // Audit log row
            try {
              await admin.from('invoice_audit_log' as any).insert({
                appointment_id: appt.id,
                action: 'email_bounced',
                email_before: toEmail,
                amount_cents: Math.round(Number(appt.total_amount || 0) * 100),
                reason: String(reason).substring(0, 500),
                metadata: {
                  patient_name: appt.patient_name,
                  email_send_log_id: existing.id,
                  mailgun_id: messageId,
                  email_subject: (logRow as any)?.subject || null,
                  invoice_status_at_bounce: appt.invoice_status,
                },
              });
            } catch (e) { console.warn('[mailgun-webhook] audit insert failed:', e); }

            // Owner SMS so admin can intervene before dunning escalates
            try {
              const TWILIO_SID  = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
              const TWILIO_AUTH = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
              const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '+14074104939';
              const OWNER_PHONE = Deno.env.get('OWNER_PHONE') || '9415279169';
              if (TWILIO_SID && TWILIO_AUTH) {
                const cleanPhone = OWNER_PHONE.startsWith('+') ? OWNER_PHONE : `+1${OWNER_PHONE.replace(/\D/g, '')}`;
                await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_AUTH}`)}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    To: cleanPhone,
                    Body: `📧 Invoice email BOUNCED for ${appt.patient_name || toEmail} ($${appt.total_amount}). Email: ${toEmail}. Dunning paused for this row. Update the patient's email or call them.`.substring(0, 1500),
                    From: TWILIO_FROM,
                  }).toString(),
                });
              }
            } catch (e) { console.warn('[mailgun-webhook] owner SMS failed:', e); }

            console.log(`[mailgun-webhook] bounce propagated to appointment ${appt.id} (${toEmail})`);
          }
        }
      } catch (e) {
        console.warn('[mailgun-webhook] bounce propagation failed (non-blocking):', e);
      }
    }

    return new Response(JSON.stringify({ ok: true, message_id: messageId, status: newStatus, previous: existing.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[mailgun-webhook] unhandled:', e?.message);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
