/**
 * JOIN-WAITLIST
 *
 * Public endpoint: when a patient clicks "Join waitlist" on a tier-locked or
 * fully-booked slot, we capture their contact + desired date/time so the
 * daily 5 PM unlock sweep can notify them first.
 *
 * Body: {
 *   email: string,
 *   phone?: string,
 *   full_name?: string,
 *   desired_date: string (YYYY-MM-DD),
 *   desired_time?: string ('3:00 PM'),
 *   desired_window?: 'morning'|'afternoon'|'evening',
 *   required_tier?: string,
 *   organization_id?: string,
 *   lab_request_id?: string,
 *   access_token?: string,
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';

async function sendAck(to: string, name: string, dateIso: string, time: string | null) {
  if (!MAILGUN_API_KEY || !to) return;
  const niceDate = new Date(dateIso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;">
    <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="margin:0;font-size:20px;">You're on the waitlist</h1>
    </div>
    <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111827;">
      <p>Hi ${name || 'there'},</p>
      <p>You're queued for <strong>${niceDate}${time ? ' at ' + time : ''}</strong>.</p>
      <p>Here's how it works: at <strong>5 PM the day before</strong>, if any VIP-reserved slots are still open, we email you first with a one-tap booking link — before opening to the public.</p>
      <p style="margin-top:16px;">— Nicodemme &ldquo;Nico&rdquo; Jean-Baptiste<br/><span style="color:#6b7280;font-size:13px;">ConveLabs</span></p>
    </div>
  </div>`;
  const fd = new FormData();
  fd.append('from', `Nicodemme Jean-Baptiste <nico@${MAILGUN_DOMAIN}>`);
  fd.append('h:Reply-To', 'info@convelabs.com');
  fd.append('to', to);
  fd.append('subject', `You're on the waitlist for ${niceDate}`);
  fd.append('html', html);
  fd.append('o:tag', 'waitlist_ack');
  try {
    await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: fd,
    });
  } catch (e) {
    console.warn('[join-waitlist] mailgun ack failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      email, phone, full_name, desired_date, desired_time, desired_window,
      required_tier, organization_id, lab_request_id, access_token,
    } = body || {};

    if (!email || !desired_date) {
      return new Response(JSON.stringify({ error: 'email + desired_date required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Dedupe — same email + date + time within last 24h doesn't double-add
    const { data: existing } = await admin
      .from('slot_waitlist' as any)
      .select('id')
      .ilike('email', email)
      .eq('desired_date', desired_date)
      .eq('desired_time', desired_time || '')
      .in('status', ['waiting', 'notified'])
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, already: true, id: existing.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Expires the day after desired_date by default
    const expiresAt = new Date(desired_date + 'T23:59:59');
    expiresAt.setDate(expiresAt.getDate() + 1);

    const { data: row, error } = await admin
      .from('slot_waitlist' as any)
      .insert({
        email: email.toLowerCase().trim(),
        phone: phone || null,
        full_name: full_name || null,
        desired_date,
        desired_time: desired_time || null,
        desired_window: desired_window || null,
        required_tier: required_tier || null,
        organization_id: organization_id || null,
        lab_request_id: lab_request_id || null,
        access_token: access_token || null,
        status: 'waiting',
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;

    // Fire-and-forget ack email
    sendAck(email, full_name || '', desired_date, desired_time || null).catch(() => {});

    return new Response(JSON.stringify({ ok: true, id: (row as any)?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[join-waitlist]', e);
    return new Response(JSON.stringify({ error: 'unhandled', message: e?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
