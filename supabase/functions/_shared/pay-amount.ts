/**
 * PAY-AMOUNT — server-authoritative "what does the patient owe" for the
 * on-site /pay/:token page. Shared by get-appointment-pay-details (display)
 * and proceed-to-stripe-checkout (charge) so the two can never disagree.
 *
 * An invoice can cover MORE than one appointment row (family/companion
 * line items, consolidated series): every row carrying the same
 * stripe_invoice_id is part of the bill. We sum the unpaid rows, then
 * cross-check against the open Stripe invoice (amount_due is what the
 * patient was told) and prefer Stripe's number when they differ.
 */

export interface PayLine { label: string; cents: number; appointment_id?: string | null }

export interface AmountDue {
  status: 'unpaid' | 'paid' | 'voided';
  subtotal_cents: number;
  lines: PayLine[];
  appointment_ids: string[];      // every row this payment settles
  stripe_invoice_id: string | null;
  invoice_mismatch?: { db_cents: number; stripe_cents: number };
}

const PAID = new Set(['completed', 'paid', 'succeeded']);
const DEAD = new Set(['cancelled', 'no_show']);

export async function resolveAmountDue(admin: any, stripe: any, appt: any): Promise<AmountDue> {
  const invoiceId: string | null = appt.stripe_invoice_id || null;

  // Rows on this bill.
  let rows: any[] = [appt];
  if (invoiceId) {
    const { data } = await admin
      .from('appointments')
      .select('id, patient_name, appointment_date, appointment_time, service_name, service_type, total_amount, tip_amount, payment_status, status, companion_role')
      .eq('stripe_invoice_id', invoiceId)
      .order('appointment_date', { ascending: true });
    if (data && data.length > 0) {
      // Keep the primary first for labelling.
      rows = [...data].sort((a: any, b: any) => (a.id === appt.id ? -1 : b.id === appt.id ? 1 : 0));
    }
  }

  const live = rows.filter((r) => !DEAD.has(String(r.status)));
  if (live.length === 0) return { status: 'voided', subtotal_cents: 0, lines: [], appointment_ids: [], stripe_invoice_id: invoiceId };

  const unpaid = live.filter((r) => !PAID.has(String(r.payment_status)));
  if (unpaid.length === 0) return { status: 'paid', subtotal_cents: 0, lines: [], appointment_ids: live.map((r) => r.id), stripe_invoice_id: invoiceId };

  const lines: PayLine[] = unpaid.map((r) => {
    const cents = Math.max(0, Math.round((Number(r.total_amount || 0) - Number(r.tip_amount || 0)) * 100));
    const svc = r.service_name || r.service_type || 'Mobile Blood Draw';
    const who = String(r.patient_name || '').split(' ')[0];
    const label = rows.length > 1 && who ? `${svc} — ${who}` : svc;
    return { label, cents, appointment_id: r.id };
  });
  let subtotal = lines.reduce((s, l) => s + l.cents, 0);
  const result: AmountDue = { status: 'unpaid', subtotal_cents: subtotal, lines, appointment_ids: unpaid.map((r) => r.id), stripe_invoice_id: invoiceId };

  // Cross-check with the open Stripe invoice (the number the patient saw).
  if (invoiceId && stripe) {
    try {
      const inv: any = await stripe.invoices.retrieve(invoiceId);
      if (inv?.status === 'paid') return { ...result, status: 'paid', subtotal_cents: 0 };
      if (inv?.status === 'void' || inv?.status === 'uncollectible') return { ...result, status: 'voided', subtotal_cents: 0 };
      if (inv?.status === 'open' && Number.isFinite(inv.amount_due) && inv.amount_due > 0 && inv.amount_due !== subtotal) {
        result.invoice_mismatch = { db_cents: subtotal, stripe_cents: inv.amount_due };
        console.warn(`[pay-amount] invoice ${invoiceId} amount_due ${inv.amount_due}¢ != db ${subtotal}¢ — using Stripe`);
        subtotal = inv.amount_due;
        result.subtotal_cents = subtotal;
        const invLines: any[] = inv.lines?.data || [];
        if (invLines.length > 0) {
          result.lines = invLines.map((l: any) => ({ label: String(l.description || 'Visit').replace(/\s+—\s+\d{4}-\d{2}-\d{2}.*$/, ''), cents: Number(l.amount || 0), appointment_id: null }));
        }
      }
    } catch (e) {
      console.warn('[pay-amount] stripe invoice retrieve failed (using DB total):', (e as Error)?.message || e);
    }
  }

  return result;
}

/** Phleb first name for the tip prompt. Name lives in auth user metadata. */
export async function phlebFirstName(admin: any, phlebotomistUserId: string | null): Promise<string | null> {
  if (!phlebotomistUserId) return null;
  try {
    const { data } = await admin.auth.admin.getUserById(phlebotomistUserId);
    const full = String((data?.user?.user_metadata as any)?.full_name || (data?.user?.user_metadata as any)?.name || '').trim();
    return full ? full.split(' ')[0] : null;
  } catch { return null; }
}
