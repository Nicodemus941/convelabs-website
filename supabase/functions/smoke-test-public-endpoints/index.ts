// smoke-test-public-endpoints
// Runs daily via pg_cron. Pings each public-facing edge function
// UNAUTHENTICATED (no JWT) and expects:
//   - Never 401 UNAUTHORIZED_NO_AUTH_HEADER (that means verify_jwt got flipped)
//   - Specific expected status per endpoint (200, 400, 404 are all fine — 401 is the bug)
// If ANY endpoint returns 401, we email info@convelabs.com immediately.
//
// This catches the exact class of bug that 401'd Stripe webhooks for hours
// on 2026-04-18 before anyone noticed. Ship it and this never happens again
// without us knowing.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

// Full coverage — mirrors supabase/functions/_PUBLIC_FUNCTIONS.md.
// Any new row added there must be added here too. Each entry sends a
// deliberately-invalid body so the function's OWN validation rejects
// with 4xx — what we care about is NOT seeing 401 (auth regression).
const PUBLIC_ENDPOINTS = [
  // Token-gated patient endpoints — pass a bogus token so the fn runs
  // the auth logic but rejects with 404 (fine, not 401)
  { name: 'get-lab-request', method: 'POST', body: { access_token: 'smoke-test-bogus' } },
  { name: 'get-lab-request-slots', method: 'POST', body: { access_token: 'smoke-test-bogus', date: '2026-04-24' } },
  { name: 'schedule-lab-request', method: 'POST', body: { access_token: 'smoke-test-bogus' } },
  { name: 'unlock-lab-request-slot', method: 'POST', body: { access_token: 'smoke-test-bogus' } },

  // Webhook endpoints — Stripe/Twilio don't send JWT
  { name: 'stripe-webhook', method: 'POST', body: {} },
  { name: 'twilio-inbound-sms', method: 'POST', body: {} },
  { name: 'twilio-voice-greeting', method: 'POST', body: {} },

  // Provider portal pre-login endpoints — caller is unauthenticated
  { name: 'send-password-reset', method: 'POST', body: { email: 'smoketest@invalid.local' } },
  { name: 'provider-otp-send', method: 'POST', body: { email: 'smoketest@invalid.local' } },
  { name: 'provider-otp-verify', method: 'POST', body: { email: 'smoketest@invalid.local', code: '000000' } },
  { name: 'member-otp-send', method: 'POST', body: { email: 'smoketest@invalid.local' } },
  { name: 'member-otp-verify', method: 'POST', body: { email: 'smoketest@invalid.local', code: '000000' } },
  { name: 'update-user-password', method: 'POST', body: { token: 'smoke-test-bogus', password: 'x' } },

  // pg_cron endpoints — invoked from Postgres, no JWT
  { name: 'send-fasting-reminders', method: 'POST', body: {} },
  { name: 'remind-lab-request-patients', method: 'POST', body: {} },

  // Note: backfill-provider-phone-auth, dev-test-lab-sms, dev-twilio-recent
  // are intentionally NOT smoke-tested. They are one-shot ops / dev tools
  // guarded by a shared secret in the body. Calling them with a wrong body
  // could log noise but wouldn't cause harm — however the signal-to-noise
  // ratio isn't worth it. If one of those ever 401s, we'll find out the
  // moment an ops person tries to run it (rare enough to not warrant a probe).
];

interface Result { name: string; status: number; ok: boolean; error?: string }

Deno.serve(async (_req) => {
  const results: Result[] = [];

  for (const endpoint of PUBLIC_ENDPOINTS) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint.name}`, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint.body),
      });
      const is401 = resp.status === 401;
      results.push({
        name: endpoint.name,
        status: resp.status,
        ok: !is401, // anything except 401 is OK
        error: is401 ? 'verify_jwt regressed — this endpoint is returning 401 to public callers' : undefined,
      });
    } catch (e: any) {
      results.push({ name: endpoint.name, status: 0, ok: false, error: e.message || String(e) });
    }
  }

  const failures = results.filter(r => !r.ok);

  // Alert if any endpoint is 401ing
  if (failures.length > 0 && MAILGUN_API_KEY) {
    try {
      const tableRows = failures.map(f =>
        `<tr><td style="padding:4px 8px;font-family:monospace;">${f.name}</td><td style="padding:4px 8px;">${f.status}</td><td style="padding:4px 8px;color:#B91C1C;">${f.error}</td></tr>`
      ).join('');
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:600px;">
  <div style="background:#B91C1C;color:#fff;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
    <h2 style="margin:0;">🚨 Smoke test FAILED — ${failures.length} endpoint${failures.length === 1 ? '' : 's'} 401'ing</h2>
  </div>
  <div style="padding:22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;line-height:1.5;">
    <p>Public-facing edge functions are returning 401 UNAUTHORIZED_NO_AUTH_HEADER. This means <code>verify_jwt</code> got flipped back to true on these functions and Stripe/Twilio/patient browsers are being rejected.</p>
    <p><strong>Fix:</strong></p>
    <pre style="background:#f3f4f6;padding:10px;border-radius:6px;font-size:12px;">npx supabase functions deploy ${failures.map(f => f.name).join(' ')} --project-ref yluyonhrxxtyuiyrdixl --no-verify-jwt</pre>
    <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px;">
      <thead><tr style="background:#f9fafb;"><th style="text-align:left;padding:6px 8px;">Endpoint</th><th style="text-align:left;padding:6px 8px;">Status</th><th style="text-align:left;padding:6px 8px;">Problem</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p style="font-size:12px;color:#6b7280;">This alert was generated by the smoke-test-public-endpoints cron. See supabase/functions/_PUBLIC_FUNCTIONS.md for details.</p>
  </div>
</div>`;
      const fd = new FormData();
      fd.append('from', `ConveLabs Ops <noreply@${MAILGUN_DOMAIN}>`);
      fd.append('to', 'info@convelabs.com');
      fd.append('subject', `🚨 ${failures.length} public endpoint${failures.length === 1 ? '' : 's'} 401'ing — verify_jwt regressed`);
      fd.append('html', html);
      fd.append('o:tracking-clicks', 'no');
      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
        body: fd,
      });
    } catch (e) { console.error('alert email failed:', e); }
  }

  return new Response(JSON.stringify({ ok: failures.length === 0, results, failure_count: failures.length }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
