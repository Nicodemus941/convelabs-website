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
