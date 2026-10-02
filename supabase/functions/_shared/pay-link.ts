/**
 * PAY-LINK — single source of truth for the PATIENT-facing payment link.
 *
 * Every patient invoice / reminder message must point at the branded,
 * on-site checkout (`https://www.convelabs.com/pay/<token>`), never at
 * Stripe's hosted invoice page. The on-site page is the only place the
 * patient can add a tip, and it keeps the whole flow on convelabs.com.
 *
 * Rules:
 *   - One ACTIVE token per appointment (partial unique index
 *     `uniq_pay_token_active_per_appt`). We REUSE the active token so a
 *     link already sitting in the patient's SMS inbox keeps working when a
 *     reminder goes out or an admin clicks "copy pay link". Pass
 *     `fresh: true` to revoke + mint (reissued invoice, amount change).
 *   - Expiry = max(appointment date + 1 day, now + 7 days), capped at
 *     now + 30 days. The old rule (min(appt+1d, now+30d)) produced
 *     already-expired tokens for post-visit invoices.
 *   - Org-billed invoices NEVER get an on-site link (ACH / net-30 stay on
 *     Stripe's hosted page). `resolvePatientPayLink` returns the hosted URL
 *     for those.
 *   - If token creation fails for any reason we fall back to the hosted
 *     invoice URL AND write an error_logs row so it is visible.
 */

const SITE = Deno.env.get('PUBLIC_SITE_URL') || 'https://www.convelabs.com';

export interface PayLinkResult {
  url: string;
  kind: 'onsite' | 'hosted' | 'none';
  token?: string;
  reused?: boolean;
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function payPageUrl(token: string): string {
  return `${SITE}/pay/${token}`;
}

export function computeTokenExpiry(appointmentDate: string | null | undefined, now = new Date()): Date {
  const nowPlus7 = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  const nowPlus30 = now.getTime() + 30 * 24 * 60 * 60 * 1000;
  let apptPlus1 = 0;
  if (appointmentDate) {
    const d = new Date(String(appointmentDate).substring(0, 10) + 'T23:59:59-04:00');
    if (!Number.isNaN(d.getTime())) apptPlus1 = d.getTime() + 24 * 60 * 60 * 1000;
  }
  return new Date(Math.min(nowPlus30, Math.max(nowPlus7, apptPlus1)));
}

/**
 * Get (reuse) or create the active on-site pay token for an appointment.
 * Service-role client required. Returns null on failure (caller falls back).
 */
export async function getOrCreatePayToken(
  admin: any,
  appointmentId: string,
  opts: { fresh?: boolean; source?: string; appointmentDate?: string | null } = {},
): Promise<{ token: string; url: string; reused: boolean; expires_at: string } | null> {
  const nowIso = new Date().toISOString();

  // Reuse an active, not-about-to-expire token unless explicitly told not to.
  if (!opts.fresh) {
    const { data: active } = await admin
      .from('appointment_pay_tokens')
      .select('access_token, expires_at')
      .eq('appointment_id', appointmentId)
      .is('revoked_at', null)
      .is('paid_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active?.access_token) {
      const msLeft = new Date(active.expires_at).getTime() - Date.now();
      if (msLeft > 24 * 60 * 60 * 1000) {
        return { token: active.access_token, url: payPageUrl(active.access_token), reused: true, expires_at: active.expires_at };
      }
    }
  }

  let apptDate = opts.appointmentDate ?? null;
  if (apptDate === null) {
    const { data: appt } = await admin.from('appointments').select('appointment_date').eq('id', appointmentId).maybeSingle();
    apptDate = appt?.appointment_date ?? null;
  }

  // Revoke any prior active token (unique index: one active per appointment).
  await admin.from('appointment_pay_tokens')
    .update({ revoked_at: nowIso, notes: `superseded ${nowIso}${opts.source ? ` by ${opts.source}` : ''}` })
    .eq('appointment_id', appointmentId)
    .is('revoked_at', null)
    .is('paid_at', null);

  const token = newToken();
  const expiresAt = computeTokenExpiry(apptDate).toISOString();
  const { error } = await admin.from('appointment_pay_tokens').insert({
    appointment_id: appointmentId,
    access_token: token,
    expires_at: expiresAt,
    notes: opts.source ? `created by ${opts.source}` : null,
  });
  if (error) {
    console.error('[pay-link] token insert failed:', error.message);
    return null;
  }
  return { token, url: payPageUrl(token), reused: false, expires_at: expiresAt };
}

/**
 * Resolve the link to put in a PATIENT message. Prefers the on-site page;
 * falls back to Stripe's hosted invoice URL (logged) and finally to the
 * generic booking page so a message never goes out with a dead link.
 *
 * `appt` needs: id, billed_to, organization_id, appointment_date,
 * stripe_invoice_url (optional).
 */
export async function resolvePatientPayLink(
  admin: any,
  appt: {
    id: string;
    billed_to?: string | null;
    organization_id?: string | null;
    appointment_date?: string | null;
    stripe_invoice_url?: string | null;
  },
  opts: { source: string; fresh?: boolean },
): Promise<PayLinkResult> {
  const hosted = appt.stripe_invoice_url || null;
  const orgBilled = appt.billed_to === 'org' && !!appt.organization_id;
  if (orgBilled) {
    return hosted ? { url: hosted, kind: 'hosted' } : { url: `${SITE}/book-now`, kind: 'none' };
  }

  try {
    const tok = await getOrCreatePayToken(admin, appt.id, { fresh: opts.fresh, source: opts.source, appointmentDate: appt.appointment_date });
    if (tok) return { url: tok.url, kind: 'onsite', token: tok.token, reused: tok.reused };
  } catch (e) {
    console.error('[pay-link] getOrCreatePayToken threw:', (e as Error)?.message || e);
  }

  // Fallback — make it visible.
  try {
    await admin.from('error_logs').insert({
      error_type: 'pay_token_fallback_to_hosted',
      component: opts.source,
      action: 'resolvePatientPayLink',
      error_message: `Could not mint /pay token for appointment ${appt.id}; ${hosted ? 'fell back to Stripe hosted invoice URL' : 'NO hosted URL either — sent book-now link'}`,
      payload: { appointment_id: appt.id, hosted_url: hosted },
      resolved: false,
    });
  } catch { /* telemetry never blocks */ }

  return hosted ? { url: hosted, kind: 'hosted' } : { url: `${SITE}/book-now`, kind: 'none' };
}

/** Revoke every active token for the given appointment ids (paid elsewhere, voided, cancelled). */
export async function revokePayTokens(admin: any, appointmentIds: string[], reason: string): Promise<void> {
  const ids = appointmentIds.filter(Boolean);
  if (ids.length === 0) return;
  try {
    const nowIso = new Date().toISOString();
    await admin.from('appointment_pay_tokens')
      .update({ revoked_at: nowIso, notes: `revoked ${nowIso}: ${reason}`.substring(0, 500) })
      .in('appointment_id', ids)
      .is('revoked_at', null)
      .is('paid_at', null);
  } catch (e) {
    console.warn('[pay-link] revokePayTokens failed (non-blocking):', (e as Error)?.message || e);
  }
}
