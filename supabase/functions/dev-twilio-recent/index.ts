// dev-twilio-recent — fetches the last N messages from Twilio to see delivery status
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const DEV_SECRET = 'convelabs-sms-test-2026';

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body.secret !== DEV_SECRET) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });

  const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?From=${encodeURIComponent(TWILIO_FROM)}&PageSize=10`,
    { headers: { 'Authorization': `Basic ${twilioAuth}` } },
  );
  const j = await r.json();
  const simplified = (j.messages || []).map((m: any) => ({
    sid: m.sid,
    to: m.to,
    from: m.from,
    status: m.status,
    error_code: m.error_code,
    error_message: m.error_message,
    body: m.body?.substring(0, 80),
    date_sent: m.date_sent,
    date_updated: m.date_updated,
  }));
  return new Response(JSON.stringify({ from_secret: TWILIO_FROM, messages: simplified }, null, 2), { headers: { 'Content-Type': 'application/json' } });
});
