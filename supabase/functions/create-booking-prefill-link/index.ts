/**
 * CREATE-BOOKING-PREFILL-LINK
 *
 * Admin/owner-fired: takes a patient identity + a service type, generates a
 * one-shot pre-fill token, fires SMS + email with the booking URL, and
 * returns the URL to the caller (so admin can copy/paste if SMS bounces).
 *
 * Body: {
 *   patientId?: string,                  // tenant_patients.id (optional)
 *   firstName?, lastName?, email?, phone?,  // explicit overrides
 *   serviceType: string,                 // e.g. 'mobile' | 'specialty-kit' | 'partner-restoration-place'
 *   serviceName?: string,
 *   organizationId?: string,
 *   billedTo?: 'patient' | 'org',
 * }
 *
 * Response: {
 *   ok, token, url, sms_sent, email_sent, channels[], expires_at
 * }
 *
 * verify_jwt=true (admin-only).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
const FROM_EMAIL = `Nicodemme Jean-Baptiste <info@convelabs.com>`;

function normPhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p && p.startsWith('+') ? p : `+${d}`;
}

function makeToken(): string {
  // ~40 chars URL-safe — collision-safe + short enough for SMS
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Tier-friendly service price preview ($) — keeps SMS copy honest.
// Mirrors a small subset of pricingService.TIER_PRICING; full math runs
// at checkout. This is just the "anchor" the owner shows in the SMS.
const SERVICE_PRICE_HINT: Record<string, { name: string; price: number }> = {
  'mobile': { name: 'Mobile Blood Draw', price: 150 },
  'in-office': { name: 'Office Visit', price: 55 },
  'senior': { name: 'Senior Blood Draw', price: 100 },
  'specialty-kit': { name: 'Specialty Collection Kit', price: 185 },
  'specialty-kit-genova': { name: 'Genova Diagnostics Kit', price: 200 },
  'therapeutic': { name: 'Therapeutic Phlebotomy', price: 200 },
  'partner-nd-wellness': { name: 'ND Wellness Partner Visit', price: 85 },
  'partner-naturamed': { name: 'NaturaMed Partner Visit', price: 85 },
  'partner-restoration-place': { name: 'Restoration Place Partner Visit', price: 125 },
  'partner-elite-medical-concierge': { name: 'Elite Medical Concierge Visit', price: 0 }, // org-billed
  'partner-aristotle-education': { name: 'Aristotle Education Visit', price: 0 },         // org-billed
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userResp } = await admin.auth.getUser(jwt);
    const requester = userResp?.user;
    if (!requester) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      patientId,
      firstName: firstNameIn,
      lastName: lastNameIn,
      email: emailIn,
      phone: phoneIn,
      serviceType,
      serviceName: serviceNameIn,
      organizationId,
      billedTo = 'patient',
    } = body || {};

    if (!serviceType) {
      return new Response(JSON.stringify({ error: 'serviceType_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve patient identity
    let firstName = firstNameIn || null;
    let lastName = lastNameIn || null;
    let email = emailIn ? String(emailIn).toLowerCase().trim() : null;
    let phone = phoneIn ? String(phoneIn).trim() : null;
    let resolvedPatientId: string | null = null;

    if (patientId) {
      const { data: tp } = await admin
        .from('tenant_patients')
        .select('id, first_name, last_name, email, phone')
        .eq('id', patientId)
        .maybeSingle();
      if (tp) {
        resolvedPatientId = (tp as any).id;
        firstName = firstName || (tp as any).first_name;
        lastName = lastName || (tp as any).last_name;
        email = email || ((tp as any).email ? String((tp as any).email).toLowerCase() : null);
        phone = phone || ((tp as any).phone ? String((tp as any).phone) : null);
      }
    }

    if (!email && !phone) {
      return new Response(JSON.stringify({
        error: 'no_contact',
        message: 'Patient has no email or phone — add one before sending the link.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const hint = SERVICE_PRICE_HINT[serviceType] || { name: serviceNameIn || serviceType, price: 0 };
    const serviceName = serviceNameIn || hint.name;
    const servicePriceCents = Math.round(hint.price * 100);

    // Insert token
    const token = makeToken();
    const { data: row, error: insErr } = await admin
      .from('booking_prefill_tokens')
      .insert({
        token,
        patient_id: resolvedPatientId,
        patient_first_name: firstName,
        patient_last_name: lastName,
        patient_email: email,
        patient_phone: phone,
        service_type: serviceType,
        service_name: serviceName,
        service_price_cents: servicePriceCents,
        organization_id: organizationId || null,
        billed_to: billedTo,
        created_by: requester.id,
      })
      .select('id, token, expires_at')
      .single();
    if (insErr || !row) throw insErr || new Error('insert_failed');

    const url = `${PUBLIC_SITE_URL}/book-now?prefill=${encodeURIComponent(token)}`;
    const greetingName = firstName || 'there';
    const priceLine = servicePriceCents > 0
      ? ` Your ${serviceName.toLowerCase()} is ${(servicePriceCents / 100).toFixed(0) === '0' ? 'covered' : `$${(servicePriceCents / 100).toFixed(0)}`}.`
      : ` Your ${serviceName.toLowerCase()} is covered.`;

    let smsSent = false;
    let emailSent = false;
    const sendErrors: string[] = [];

    // SMS — Hormozi loss-aversion + low-friction copy
    if (phone && TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      try {
        const smsBody = `ConveLabs: Hi ${greetingName} —${priceLine} Tap to pick a time + book in 90 sec: ${url}`;
        const fd = new URLSearchParams({ To: normPhone(phone), From: TWILIO_FROM, Body: smsBody });
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: fd.toString(),
        });
        if (r.ok) smsSent = true;
        else sendErrors.push(`twilio_${r.status}`);
      } catch (e: any) { sendErrors.push(`twilio_exception:${e?.message || e}`); }
    }

    // Email — same content, prettier
    if (email && MAILGUN_API_KEY) {
      try {
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:540px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px 24px;text-align:center;border-radius:12px 12px 0 0;">
    <h2 style="margin:0;font-size:20px;font-weight:700;">Your booking link is ready</h2>
    <p style="margin:6px 0 0;font-size:13px;opacity:0.95;">${serviceName}${servicePriceCents > 0 ? ` · $${(servicePriceCents / 100).toFixed(2)}` : ' · covered'}</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.55;color:#111827;">
    <p style="margin:0 0 14px;">Hi ${greetingName},</p>
    <p style="margin:0 0 14px;">Tap the button below — your service + info are pre-loaded. Pick a time, pay, and you're done in under 90 seconds.</p>
    <div style="text-align:center;margin:22px 0;">
      <a href="${url}" style="display:inline-block;background:#B91C1C;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Book my draw →</a>
    </div>
    <p style="margin:14px 0 0;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;">
      Link expires in 7 days. Reply or call (941) 527-9169 if anything looks off.
    </p>
  </div>
</div>`;
        const fd = new FormData();
        fd.append('from', FROM_EMAIL);
        fd.append('to', email);
        fd.append('subject', `Your ConveLabs booking link${servicePriceCents > 0 ? ` · $${(servicePriceCents / 100).toFixed(0)}` : ''}`);
        fd.append('html', html);
        fd.append('o:tracking-clicks', 'no');
        const r = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
          body: fd,
        });
        if (r.ok) emailSent = true;
        else sendErrors.push(`mailgun_${r.status}`);
      } catch (e: any) { sendErrors.push(`mailgun_exception:${e?.message || e}`); }
    }

    // Update row with send status
    await admin.from('booking_prefill_tokens')
      .update({
        sent_at: new Date().toISOString(),
        sms_sent: smsSent,
        email_sent: emailSent,
        send_error: sendErrors.length > 0 ? sendErrors.join('|').substring(0, 500) : null,
      })
      .eq('id', (row as any).id);

    const channels: string[] = [];
    if (smsSent) channels.push('SMS');
    if (emailSent) channels.push('email');

    return new Response(JSON.stringify({
      ok: true,
      token,
      url,
      sms_sent: smsSent,
      email_sent: emailSent,
      channels,
      expires_at: (row as any).expires_at,
      send_error: sendErrors.length > 0 ? sendErrors.join('|') : null,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[create-booking-prefill-link] unhandled:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
