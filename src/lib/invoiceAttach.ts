/**
 * Invoices belong on the visit they bill for.
 *
 * "Generate invoice" used to insert a standalone appointment row (address
 * 'Invoice Only', dated "now") every time. When the invoice was for a real
 * visit, the visit ended up as two rows: the visit the phleb completed, and a
 * paid "Mobile Blood Draw" placeholder that got the phleb auto-assigned, sat
 * open in Needs attention and carried the payout (Abby Ritenour, 2026-10-02).
 * These helpers let both invoice screens attach to the visit instead.
 */

export const INVOICE_ONLY_ADDRESS = 'Invoice Only';

type VisitLike = {
  id: string;
  status?: string | null;
  address?: string | null;
  service_type?: string | null;
  payment_status?: string | null;
  total_amount?: number | string | null;
  appointment_date?: string | null;
};

/** A standalone invoice row, not a visit. */
export function isInvoicePlaceholder(a: Pick<VisitLike, 'address' | 'service_type'>): boolean {
  return a.address === INVOICE_ONLY_ADDRESS || a.service_type === 'invoice';
}

/**
 * A visit an invoice can be attached to: real (not a placeholder), not
 * cancelled, and not already paid in full. A $0 visit counts as attachable
 * even when marked paid — a $0 reschedule is "paid" with nothing collected,
 * which is exactly the visit the invoice is for.
 */
export function isAttachableVisit(a: VisitLike): boolean {
  if (isInvoicePlaceholder(a)) return false;
  if (a.status === 'cancelled') return false;
  const total = Number(a.total_amount || 0);
  return a.payment_status !== 'completed' || total === 0;
}

/**
 * The visit to pre-select: the attachable one closest to today within
 * ±14 days, preferring today and the past (invoices usually follow the draw).
 */
export function pickDefaultVisit<T extends VisitLike>(visits: T[], now: Date = new Date()): T | null {
  const DAY = 86400000;
  const today = new Date(now.toISOString().slice(0, 10)).getTime();
  let best: T | null = null;
  let bestScore = Infinity;
  for (const v of visits) {
    if (!isAttachableVisit(v) || !v.appointment_date) continue;
    const day = new Date(String(v.appointment_date).slice(0, 10)).getTime();
    const diffDays = (day - today) / DAY;
    if (Math.abs(diffDays) > 14) continue;
    // Future visits rank behind past ones at the same distance.
    const score = Math.abs(diffDays) + (diffDays > 0 ? 0.5 : 0);
    if (score < bestScore) { bestScore = score; best = v; }
  }
  return best;
}
