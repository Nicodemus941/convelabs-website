/**
 * Owner-tier alert routing.
 *
 * Replaces the franchise-blocking pattern of hardcoded `OWNER_PHONE` env
 * vars across edge functions. Lookup order:
 *
 *   1. staff_profiles WHERE receives_owner_alerts = true (DB-first)
 *      — optionally scoped to a tenant_id for multi-tenant alert routing
 *   2. Deno.env.OWNER_PHONE (legacy fallback)
 *   3. hardcoded brand support number (last-resort)
 *
 * Returns an array of E.164-normalized phone numbers. Use `sendOwnerAlert`
 * to fan out a single SMS to all recipients in one call.
 *
 * Migration path: today every alert fires to the env var. As we add new
 * super_admins, mark them receives_owner_alerts=true in staff_profiles
 * and they get the alerts automatically. When Tampa launches, the Tampa
 * super_admin gets only Tampa alerts (tenant-scoped).
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const FALLBACK_PHONE = '9415279169';

export function normalizePhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (p.startsWith('+')) return p;
  return d ? `+${d}` : '';
}

/**
 * Resolve the list of phone numbers that should receive owner-tier alerts.
 * @param admin Supabase service-role client
 * @param tenantId Optional tenant to scope alerts to (multi-tenant ready)
 */
export async function getOwnerAlertPhones(
  admin: SupabaseClient,
  tenantId?: string | null,
): Promise<string[]> {
  try {
    const { data } = await admin.rpc('get_owner_alert_phones' as any, {
      p_tenant_id: tenantId || null,
    });
    const phones = Array.isArray(data) ? (data as string[]) : [];
    if (phones.length > 0) {
      return phones.map(normalizePhone).filter(Boolean);
    }
  } catch (e) {
    console.warn('[alert-recipients] DB lookup failed, using env fallback:', e);
  }
  // Fallback: env var or hardcoded brand support phone
  const envPhone = Deno.env.get('OWNER_PHONE') || FALLBACK_PHONE;
  return [normalizePhone(envPhone)].filter(Boolean);
}

/**
 * Convenience: fan out one SMS body to every owner-tier recipient.
 * Returns count successfully sent.
 */
export async function sendOwnerAlert(
  admin: SupabaseClient,
  body: string,
  opts?: { tenantId?: string | null },
): Promise<{ sent: number; recipients: string[]; errors: string[] }> {
  const phones = await getOwnerAlertPhones(admin, opts?.tenantId);
  const errors: string[] = [];
  let sent = 0;
  const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
  const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
  const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return { sent: 0, recipients: phones, errors: ['twilio_creds_missing'] };
  }

  for (const To of phones) {
    try {
      const fd = new URLSearchParams({ To, From: TWILIO_FROM, Body: body });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: fd.toString(),
      });
      if (r.ok) {
        sent++;
      } else {
        errors.push(`${To}: ${r.status}`);
      }
    } catch (e: any) {
      errors.push(`${To}: ${e?.message || String(e)}`);
    }
  }
  return { sent, recipients: phones, errors };
}

/**
 * Legacy single-phone helper for fns that haven't been migrated yet.
 * Returns the FIRST owner phone (or env fallback). Prefer sendOwnerAlert
 * for new code.
 */
export async function getPrimaryOwnerPhone(
  admin: SupabaseClient,
  tenantId?: string | null,
): Promise<string> {
  const phones = await getOwnerAlertPhones(admin, tenantId);
  return phones[0] || normalizePhone(Deno.env.get('OWNER_PHONE') || FALLBACK_PHONE);
}
