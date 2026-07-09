/**
 * ADD-COMPANION
 *
 * Self-service (and admin) "add a companion to my EXISTING appointment + pay
 * the difference." The opaque token in add_companion_tokens IS the auth for
 * the public actions; price is ALWAYS recomputed server-side.
 *
 * Actions (POST body { action, ... }):
 *   • 'create'  (admin)  — body { primaryAppointmentId }. Requires a valid
 *                          super_admin/admin/owner JWT in Authorization. Mints
 *                          a token row → { ok, token, url }.
 *   • 'details' (token)  — body { token }. Returns the primary appointment
 *                          summary + unit prices so the page can preview.
 *   • 'checkout'(token)  — body { token, companions:[{firstName,lastName,dob,
 *                          kitsCount?}], when:'same'|'different', date?, time? }.
 *                          Recomputes the amount, creates a Stripe Checkout, and
 *                          stamps metadata so stripe-webhook creates the linked
 *                          companion row(s) on payment. → { ok, stripe_url }.
 *
 * Pricing (per companion):
 *   • same slot  → discounted companion fee (tier-aware $75/$55/$45/$35), or for
 *                  a specialty-kit primary the kit-bundle companion price.
 *   • different date → FULL visit price (separate trip = separate visit), tier-aware.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.7.0?target=deno';
import { getAvailableSlotsForDate } from '../_shared/availability.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });

type Tier = 'none' | 'member' | 'vip' | 'concierge';

const VISIT_PRICE: Record<string, Record<Tier, number>> = {
  'mobile':               { none: 150, member: 130, vip: 115, concierge: 99 },
  'senior':               { none: 110, member: 85,  vip: 75,  concierge: 65 },
  'in-office':            { none: 55,  member: 49,  vip: 45,  concierge: 39 },
  'therapeutic':          { none: 200, member: 180, vip: 165, concierge: 150 },
  'specialty-kit':        { none: 185, member: 165, vip: 150, concierge: 135 },
  'specialty-kit-genova': { none: 200, member: 180, vip: 165, concierge: 150 },
};
const COMPANION_FEE: Record<Tier, number> = { none: 75, member: 55, vip: 45, concierge: 35 };

const isSpecialty = (s: string) => s === 'specialty-kit' || s === 'specialty-kit-genova';

// Mirror of pricingService.calculateSpecialtyKitBundle()'s per-extra-kit curve.
function pricePerPatientKits(kits: number, genova: boolean): number {
  if (kits <= 1) return 0;
  const curve = genova ? [50, 50, 45] : [35, 35, 30];
  let total = 0;
  for (let i = 0; i < kits - 1; i++) total += curve[Math.min(i, curve.length - 1)];
  return total;
}

/** Per-companion fee in DOLLARS. */
function companionFeeDollars(serviceType: string, tier: Tier, when: 'same' | 'different', kits: number): number {
  const genova = serviceType === 'specialty-kit-genova';
  if (when === 'different') {
    // Separate trip = a full standalone visit at this service + tier.
    const base = VISIT_PRICE[serviceType]?.[tier] ?? VISIT_PRICE['mobile'][tier];
    return base + (isSpecialty(serviceType) ? pricePerPatientKits(kits, genova) : 0);
  }
  // Same slot → discounted companion fee (rides the primary's trip).
  if (isSpecialty(serviceType)) {
    const COMP = genova ? 65 : 50;
    return COMP + pricePerPatientKits(kits, genova);
  }
  return COMPANION_FEE[tier];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function normPhone(p: string): string {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return p?.startsWith('+') ? p : `+${d}`;
}

async function sendSms(to: string, bodyText: string): Promise<boolean> {
  const SID = Deno.env.get('TWILIO_ACCOUNT_SID'); const TOK = Deno.env.get('TWILIO_AUTH_TOKEN'); const FROM = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!SID || !TOK || !FROM || !to) return false;
  try {
    const fd = new URLSearchParams({ To: normPhone(to), From: FROM, Body: bodyText });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${SID}:${TOK}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fd.toString(),
    });
    return r.ok;
  } catch { return false; }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const KEY = Deno.env.get('MAILGUN_API_KEY'); const DOMAIN = Deno.env.get('MAILGUN_DOMAIN') || 'mg.convelabs.com';
  if (!KEY || !to) return false;
  try {
    const fd = new FormData();
    fd.append('from', 'Nicodemme Jean-Baptiste <info@convelabs.com>');
    fd.append('to', to); fd.append('subject', subject); fd.append('html', html);
    fd.append('o:tracking-clicks', 'no');
    const r = await fetch(`https://api.mailgun.net/v3/${DOMAIN}/messages`, {
      method: 'POST', headers: { Authorization: `Basic ${btoa(`api:${KEY}`)}` }, body: fd,
    });
    return r.ok;
  } catch { return false; }
}

/** Resolve the patient's membership tier from their email (best-effort). */
async function resolveTier(admin: any, email: string | null): Promise<Tier> {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return 'none';
  try {
    const { data: tp } = await admin.from('tenant_patients')
      .select('membership_tier').ilike('email', e).limit(1).maybeSingle();
    const t = String((tp as any)?.membership_tier || '').toLowerCase();
    if (t === 'concierge' || t === 'vip' || t === 'member') return t as Tier;
  } catch { /* default none */ }
  return 'none';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body?.action || '';

    // ─── CREATE (admin) ──────────────────────────────────────────────────
    if (action === 'create') {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace(/^Bearer\s+/i, '');
      if (!jwt) return json({ error: 'auth_required' }, 401);
      // Authorize against the user_roles TABLE — the app's source of truth
      // (same signal is_admin() uses), NOT user_metadata.role. The old
      // metadata check + no-arg getUser() 403'd legitimate admins because the
      // role claim drifts / getUser() doesn't resolve reliably server-side.
      // Validate the caller's token explicitly with the service client, then
      // look up their role. Mirrors add-companion-with-invoice.
      const { data: u } = await admin.auth.getUser(jwt);
      const uid = u?.user?.id;
      if (!uid) return json({ error: 'auth_required' }, 401);
      const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', uid);
      const isAdmin = (roleRows || []).some((r: any) =>
        ['super_admin', 'admin', 'owner', 'office_manager'].includes(String(r.role).toLowerCase()));
      if (!isAdmin) return json({ error: 'forbidden' }, 403);
      const role = String((roleRows || [])[0]?.role || 'admin');
      const primaryAppointmentId = String(body?.primaryAppointmentId || '');
      if (!primaryAppointmentId) return json({ error: 'appointment_required' }, 400);
      const { data: appt } = await admin.from('appointments')
        .select('id, status, patient_name, patient_email, patient_phone, appointment_date, service_name')
        .eq('id', primaryAppointmentId).maybeSingle();
      if (!appt) return json({ error: 'appointment_not_found' }, 404);

      const token = `addc_${crypto.randomUUID().replace(/-/g, '')}`;
      const { error: insErr } = await admin.from('add_companion_tokens').insert({
        token, primary_appointment_id: primaryAppointmentId, created_by: role,
      });
      if (insErr) return json({ error: insErr.message }, 500);
      const url = `${SITE}/add-companion/${token}`;

      // Auto-send the link to the patient unless explicitly suppressed.
      let sentSms = false, sentEmail = false;
      if (body?.send !== false) {
        const fn = String((appt as any).patient_name || 'there').split(' ')[0];
        const niceDate = (() => {
          try { return new Date(`${String((appt as any).appointment_date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); }
          catch { return 'your upcoming'; }
        })();
        if ((appt as any).patient_phone) {
          sentSms = await sendSms((appt as any).patient_phone,
            `ConveLabs: Want to add someone to your ${niceDate} visit? Tap to add them and pay — same time as you or a different day: ${url}`);
        }
        if ((appt as any).patient_email) {
          const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;">
  <div style="background:#B91C1C;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;"><h2 style="margin:0;font-size:18px;">Add someone to your visit</h2></div>
  <div style="padding:22px;border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;line-height:1.6;color:#111;">
    <p>Hi ${fn},</p>
    <p>Bringing a partner, parent, or family member to your <strong>${niceDate}</strong> appointment? Add them and pay in under a minute — at the same time as you (discounted) or on a different day.</p>
    <p style="margin:22px 0;"><a href="${url}" style="background:#B91C1C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Add a companion</a></p>
    <p style="font-size:13px;color:#666;">Questions? Call (941) 527-9169.</p>
    <p style="margin-top:16px;">— Nico at ConveLabs</p>
  </div></div>`;
          sentEmail = await sendEmail((appt as any).patient_email, 'Add someone to your ConveLabs visit', html);
        }
      }
      return json({ ok: true, token, url, sent_sms: sentSms, sent_email: sentEmail });
    }

    // ─── Token-gated actions (details / checkout) ────────────────────────
    const token: string = body?.token || '';
    if (!token) return json({ error: 'token_required' }, 400);

    const { data: tok } = await admin.from('add_companion_tokens')
      .select('id, primary_appointment_id, status, expires_at')
      .eq('token', token).maybeSingle();
    if (!tok) return json({ error: 'token_not_found' }, 404);
    if (tok.status === 'consumed') return json({ error: 'already_used' }, 409);
    if (new Date(tok.expires_at) < new Date()) return json({ error: 'expired' }, 410);

    const { data: primary } = await admin.from('appointments')
      .select('id, patient_name, patient_email, patient_phone, family_group_id, appointment_date, appointment_time, service_type, service_name, address, zipcode, organization_id, status, lab_destination, lab_destination_pending')
      .eq('id', tok.primary_appointment_id).maybeSingle();
    if (!primary) return json({ error: 'appointment_not_found' }, 404);
    if (['cancelled', 'no_show'].includes(String(primary.status))) return json({ error: 'voided' }, 410);

    const serviceType = String(primary.service_type || 'mobile');
    const tier = await resolveTier(admin, primary.patient_email);
    const firstName = String(primary.patient_name || 'there').split(' ')[0];

    if (action === 'details') {
      return json({
        ok: true,
        primary: {
          first_name: firstName,
          date: primary.appointment_date,
          time: primary.appointment_time,
          service_type: serviceType,
          service_name: primary.service_name || serviceType,
          lab_destination: primary.lab_destination || null,
        },
        is_specialty: isSpecialty(serviceType),
        tier,
        // Unit prices the page previews; checkout recomputes authoritatively.
        same_slot_fee_cents: Math.round(companionFeeDollars(serviceType, tier, 'same', 1) * 100),
        different_date_fee_cents: Math.round(companionFeeDollars(serviceType, tier, 'different', 1) * 100),
      });
    }

    // Available time slots for a chosen different-date (live availability).
    if (action === 'slots') {
      const date = String(body?.date || '').slice(0, 10);
      if (!date) return json({ error: 'date_required' }, 400);
      try {
        const all = await getAvailableSlotsForDate(
          admin, (primary as any).organization_id || '', date, null,
          (primary as any).lab_destination, serviceType,
        );
        const times = (all || []).filter((s: any) => s?.available).map((s: any) => s.time);
        return json({ ok: true, slots: times });
      } catch (e: any) {
        console.warn('[add-companion] slots failed:', e?.message);
        return json({ ok: true, slots: [] }); // fail open — page falls back to full grid
      }
    }

    if (action === 'checkout') {
      const companions: any[] = Array.isArray(body?.companions) ? body.companions : [];
      const when: 'same' | 'different' = body?.when === 'different' ? 'different' : 'same';
      const newDate = String(body?.date || '');
      const newTime = String(body?.time || '');
      if (companions.length === 0) return json({ error: 'no_companions' }, 400);
      if (companions.length > 6) return json({ error: 'too_many' }, 400);
      if (when === 'different' && (!newDate || !newTime)) return json({ error: 'date_required' }, 400);

      // Recompute the total server-side. Never trust a client amount.
      let totalCents = 0;
      const normalized = companions.map((c: any) => {
        const kits = isSpecialty(serviceType) ? Math.max(1, Number(c?.kitsCount || 1)) : 1;
        const feeCents = Math.round(companionFeeDollars(serviceType, tier, when, kits) * 100);
        totalCents += feeCents;
        return {
          firstName: String(c?.firstName || '').slice(0, 60),
          lastName: String(c?.lastName || '').slice(0, 60),
          dob: c?.dob ? String(c.dob).slice(0, 10) : null,
          kits, fee_cents: feeCents,
        };
      });
      if (totalCents <= 0) return json({ error: 'nothing_due' }, 409);

      const label = when === 'different'
        ? `Companion visit${companions.length > 1 ? `s ×${companions.length}` : ''} — ${primary.service_name || serviceType}`
        : `Add ${companions.length} companion${companions.length > 1 ? 's' : ''} to your visit`;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: primary.patient_email || undefined,
        payment_method_types: ['card', 'us_bank_account'],
        line_items: [{
          price_data: { currency: 'usd', product_data: { name: label }, unit_amount: totalCents },
          quantity: 1,
        }],
        success_url: `${SITE}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE}/add-companion/${token}`,
        metadata: {
          flow: 'add_companion',
          add_token: token,
          primary_appointment_id: primary.id,
          when,
          new_date: when === 'different' ? newDate : '',
          new_time: when === 'different' ? newTime : '',
          service_type: serviceType,
          companions_json: JSON.stringify(normalized).slice(0, 480),
        },
      });

      // Keep status 'pending' — the webhook flips it to 'consumed' only after
      // payment actually clears. We just record the latest session id.
      await admin.from('add_companion_tokens')
        .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
        .eq('id', tok.id);

      return json({ ok: true, stripe_url: session.url });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e: any) {
    console.error('[add-companion] error:', e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
