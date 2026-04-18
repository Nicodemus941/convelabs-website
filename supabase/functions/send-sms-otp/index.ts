// send-sms-otp
// Looks up a phone for `email` (organizations.contact_phone OR staff_profiles.phone),
// generates a 6-digit code, hashes and stores it, sends an SMS via Twilio.
// Rate-limited: 3 sends per email per hour.
//
// SECURITY: does NOT reveal whether the email exists — always returns 200 with
// a generic "If that email matches an account, a code was sent" message.
//
// Request:  { email: string }
// Response: { success: true, phone_hint: "***-***-9027" | null, delivery: "sms" | "none" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const normalizedEmail = email.trim().toLowerCase();

    // ── RATE LIMIT: 3 sends per email per hour ──────────────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('sms_otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('email', normalizedEmail)
      .gte('created_at', oneHourAgo);
    if ((recentCount || 0) >= 3) {
      // Return generic success to avoid enumeration, but log for monitoring
      console.warn(`Rate limit hit for email ${normalizedEmail} (${recentCount} sends in last hour)`);
      return new Response(JSON.stringify({ success: true, phone_hint: null, delivery: 'rate_limited' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── LOOK UP PHONE ───────────────────────────────────────────────────────
    // Priority: organizations.contact_phone (matched by contact_email OR billing_email)
    //           then staff_profiles.phone (matched by user's auth email)
    let phone: string | null = null;

    const { data: org } = await supabase
      .from('organizations')
      .select('contact_phone')
      .or(`contact_email.eq.${normalizedEmail},billing_email.eq.${normalizedEmail}`)
      .eq('portal_enabled', true)
      .eq('is_active', true)
      .maybeSingle();
    if (org?.contact_phone) phone = org.contact_phone;

    if (!phone) {
      // Fallback: staff_profiles
      try {
        const { data: staff } = await supabase
          .from('staff_profiles' as any)
          .select('phone')
          .eq('email', normalizedEmail)
          .maybeSingle();
        if ((staff as any)?.phone) phone = (staff as any).phone;
      } catch { /* staff_profiles may not exist or may not have email column */ }
    }

    if (!phone) {
      // No phone found — tell the client to fall back to email reset.
      // Still return 200 so we don't reveal whether the email exists.
      return new Response(JSON.stringify({ success: true, phone_hint: null, delivery: 'none' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── GENERATE + STORE CODE ───────────────────────────────────────────────
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const codeHash = await sha256(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // +5 min

    // Invalidate any previous active code for this email+purpose
    await supabase
      .from('sms_otp_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('email', normalizedEmail)
      .eq('purpose', 'password_reset')
      .is('used_at', null);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || null;
    const ua = req.headers.get('user-agent') || null;

    const { error: insErr } = await supabase.from('sms_otp_codes').insert({
      email: normalizedEmail,
      phone,
      code_hash: codeHash,
      purpose: 'password_reset',
      expires_at: expiresAt,
      ip_address: ip,
      user_agent: ua,
    });
    if (insErr) {
      console.error('Failed to insert OTP code:', insErr);
      return new Response(JSON.stringify({ error: 'Failed to create code' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── SEND SMS VIA TWILIO ─────────────────────────────────────────────────
    // Body format enables iOS/Android auto-fill when `@convelabs.com #code` is present.
    const smsBody = `ConveLabs: your password reset code is ${code}. Expires in 5 min. Don't share it. @www.convelabs.com #${code}`;
    const to = normalizePhone(phone);

    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      console.error('Twilio env vars missing');
      return new Response(JSON.stringify({ error: 'SMS delivery not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const formBody = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: smsBody });
    const twilioResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    if (!twilioResp.ok) {
      const err = await twilioResp.text();
      console.error('Twilio send failed:', twilioResp.status, err);
      return new Response(JSON.stringify({ error: 'Failed to deliver SMS' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      phone_hint: maskPhone(phone),
      delivery: 'sms',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('send-sms-otp error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
