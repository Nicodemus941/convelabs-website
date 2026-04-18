// provider-otp-send
// Partner enters their email → we look up the phone from organizations →
// we trigger Supabase's native phone OTP (which uses the configured Twilio
// provider to deliver the SMS). The phone never reaches the client —
// only a masked hint like ***-***-9027.
//
// Request:  { email }
// Response: { success: true, phone_hint: "***-***-9027", delivery: "sms" | "none" | "rate_limited" }
//
// SECURITY: always returns 200 to avoid email enumeration. "delivery: 'none'"
// means no phone on file (use email-link fallback).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return `+${d}`;
}

function maskPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  return d.length >= 4 ? `***-***-${d.slice(-4)}` : '***';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const normalizedEmail = String(email).trim().toLowerCase();

    // Phone lookup — service role only, client never sees this
    const { data: org } = await admin
      .from('organizations')
      .select('contact_phone')
      .or(`contact_email.eq.${normalizedEmail},billing_email.eq.${normalizedEmail}`)
      .eq('portal_enabled', true)
      .eq('is_active', true)
      .maybeSingle();

    if (!org?.contact_phone) {
      // Generic response — don't leak whether the email exists
      return new Response(JSON.stringify({ success: true, phone_hint: null, delivery: 'none' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phone = normalizePhone(org.contact_phone);

    // Trigger the OTP via Supabase native phone auth (Twilio under the hood).
    // Uses ANON key because signInWithOtp is a public-by-design method; the
    // service role would fail because of session semantics.
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false, channel: 'sms' },
    });

    if (error) {
      // "Rate limit exceeded" etc. — surface a generic result, log real error
      console.error('signInWithOtp error:', error);
      if ((error.message || '').toLowerCase().includes('rate')) {
        return new Response(JSON.stringify({ success: true, phone_hint: maskPhone(phone), delivery: 'rate_limited' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, phone_hint: null, delivery: 'none' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      phone_hint: maskPhone(phone),
      delivery: 'sms',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('provider-otp-send error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
