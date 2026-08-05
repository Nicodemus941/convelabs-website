/**
 * NOTIFY-PHLEB-PUSH — send a push notification to a phlebotomist's devices.
 *
 * POST { userId, type, appointmentId?, title, body }
 *   type: 'new_booking' | 'reschedule' | 'cancellation' | 'assignment' | 'generic'
 *
 * Delivery: FCM HTTP v1 (one Firebase service account covers Android natively
 * and iOS via APNs-through-FCM). Tokens come from public.push_tokens.
 *
 * Payload contract (mirrored in src/lib/native/push.ts):
 *   notification: { title, body }          → the OS banner
 *   data: { type, appointmentId }          → tap-routing to the appointment card
 *
 * GRACEFUL GATE: if FCM_SERVICE_ACCOUNT_JSON isn't set yet, we log + return
 * { sent: 0, gated: true } — callers (assignment/reschedule/cancel triggers)
 * never fail because push isn't configured. SMS remains their fallback.
 *
 * Auth: service-role or internal-secret callers only (server-to-server; this
 * fn can message any phleb, so it must never be anon-invokable).
 * Deployed verify_jwt=false + explicit check below.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Content-Type': 'application/json',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') || '';
const FCM_SA_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') || '';

// ── Google OAuth2 for FCM v1 (JWT bearer grant, no SDK needed) ────────────
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const signingInput = `${header}.${claims}`;

  // Import the PEM private key
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const raw = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', raw, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${b64url(sig)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error(`oauth token exchange failed: ${resp.status} ${await resp.text()}`);
  const j = await resp.json();
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // ── Trusted callers only ──────────────────────────────────────────
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const providedSecret = req.headers.get('x-internal-secret') || '';
    const trusted = (SERVICE_KEY && bearer === SERVICE_KEY) ||
                    (INTERNAL_SECRET && providedSecret === INTERNAL_SECRET);
    if (!trusted) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    const { userId, type = 'generic', appointmentId = null, title, body } = await req.json();
    if (!userId || !title || !body) {
      return new Response(JSON.stringify({ error: 'userId, title, body required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Audit trail regardless of delivery outcome (webhook_logs schema:
    // event_type / status / payload_summary / error_message)
    const logDelivery = async (sent: number, detail: string) => {
      try {
        await admin.from('webhook_logs' as any).insert({
          event_type: 'phleb_push',
          status: sent > 0 ? 'sent' : 'skipped',
          payload_summary: JSON.stringify({ userId, type, appointmentId, title, sent, detail }).substring(0, 900),
        });
      } catch { /* non-blocking */ }
    };

    if (!FCM_SA_JSON) {
      console.log('[phleb-push] FCM_SERVICE_ACCOUNT_JSON not set — push gated off');
      await logDelivery(0, 'gated:no_fcm_credentials');
      return new Response(JSON.stringify({ sent: 0, gated: true }), { status: 200, headers: corsHeaders });
    }

    const { data: tokens } = await admin
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId);
    if (!tokens || tokens.length === 0) {
      await logDelivery(0, 'no_tokens');
      return new Response(JSON.stringify({ sent: 0, reason: 'no_tokens' }), { status: 200, headers: corsHeaders });
    }

    const sa = JSON.parse(FCM_SA_JSON);
    const accessToken = await getAccessToken(sa);
    const projectId = sa.project_id;

    let sent = 0;
    const dead: string[] = [];
    for (const t of tokens as any[]) {
      const message = {
        message: {
          token: t.token,
          notification: { title, body },
          data: {
            type: String(type),
            appointmentId: appointmentId ? String(appointmentId) : '',
          },
          android: { priority: 'HIGH', notification: { channel_id: 'appointments' } },
          apns: {
            payload: { aps: { sound: 'default', badge: 1 } },
          },
        },
      };
      const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      if (resp.ok) {
        sent++;
      } else {
        const errText = await resp.text();
        // UNREGISTERED / INVALID_ARGUMENT → stale token; purge so we stop
        // paying latency for dead devices.
        if (/UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(errText)) dead.push(t.token);
        console.warn(`[phleb-push] send failed (${resp.status}):`, errText.substring(0, 300));
      }
    }
    if (dead.length > 0) {
      await admin.from('push_tokens').delete().in('token', dead);
      console.log(`[phleb-push] purged ${dead.length} dead token(s)`);
    }

    await logDelivery(sent, `devices:${tokens.length} dead:${dead.length}`);
    return new Response(JSON.stringify({ sent, devices: tokens.length, purged: dead.length }), { status: 200, headers: corsHeaders });
  } catch (e: any) {
    console.error('[phleb-push] unhandled:', e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: corsHeaders });
  }
});
