/**
 * On-site pay link helpers (admin side).
 *
 * The patient-facing payment page is https://www.convelabs.com/pay/<token>
 * (branded, embedded Stripe Checkout, optional tip). Every admin surface
 * that shows or sends a payment link should use this instead of the Stripe
 * hosted invoice URL. The edge function REUSES the active token by default
 * so copying the link never kills the one already in the patient's SMS.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PayLinkInfo {
  url: string;
  token: string;
  reused: boolean;
  expires_at?: string;
  emailed?: boolean;
}

export async function fetchOnsitePayLink(appointmentId: string, opts: { fresh?: boolean } = {}): Promise<PayLinkInfo> {
  const { data, error } = await supabase.functions.invoke('generate-appointment-pay-token', {
    body: { appointment_id: appointmentId, fresh: opts.fresh === true },
  });
  if (error) {
    let detail = error.message || '';
    try {
      const b = await (error as any)?.context?.json?.();
      if (b?.error === 'org_billed') detail = 'Org-billed invoice — the organization pays on the Stripe hosted invoice.';
      else if (b?.error === 'already_paid') detail = 'This appointment is already paid.';
      else if (b?.error) detail = b.error;
    } catch { /* keep generic */ }
    throw new Error(detail || 'Could not create pay link');
  }
  const url = (data as any)?.url;
  if (!url) throw new Error('No link returned');
  return { url, token: (data as any)?.token, reused: !!(data as any)?.reused, expires_at: (data as any)?.expires_at, emailed: !!(data as any)?.emailed };
}

/** Fetch (reuse) the on-site link, copy it to the clipboard, and toast. */
export async function copyOnsitePayLink(appointmentId: string, opts: { fresh?: boolean } = {}): Promise<PayLinkInfo | null> {
  try {
    const info = await fetchOnsitePayLink(appointmentId, opts);
    let copied = false;
    try { await navigator.clipboard.writeText(info.url); copied = true; } catch { /* clipboard may be blocked */ }
    if (info.emailed) toast.success('Pay link emailed to patient' + (copied ? ' (and copied)' : ''), { description: info.url, duration: 12000 });
    else toast.success(copied ? 'On-site pay link copied — paste it to the patient' : 'On-site pay link ready', { description: info.url, duration: 15000 });
    return info;
  } catch (e: any) {
    toast.error(e?.message || 'Failed to create pay link');
    return null;
  }
}
