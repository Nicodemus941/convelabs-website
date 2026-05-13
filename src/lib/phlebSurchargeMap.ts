/**
 * phlebSurchargeMap — extract per-type surcharge cents from an
 * appointment's `pricing_breakdown.surcharges[]` array so we can pass
 * them to compute_phleb_take_cents as the p_surcharges JSON.
 *
 * Why this lib exists:
 *   The RPC compute_phleb_take_cents accepts a p_surcharges JSON map
 *   like { same_day_cents: 10000, weekend_cents: 7500, ... } and
 *   matches each entry against phleb_pay_surcharge_rules (which has
 *   one row per surcharge_type per staff). Without this map, the RPC
 *   silently returns base + companion + tip with ZERO surcharge cut —
 *   which is exactly what was happening before 2026-05-13 (every
 *   AppointmentEarningPill / DaySummaryBanner / PhlebEarningsCard call
 *   omitted p_surcharges entirely).
 *
 * Source of truth: pricing_breakdown.surcharges[] — array of
 *   { label: string, amount: number }
 * where `label` matches the strings defined in pricingService.SURCHARGES.
 * We translate label substrings → snake_case keys the RPC understands.
 */

export type SurchargeCentsMap = Record<string, number>;

interface LabelAmount { label?: string; amount?: number }

/**
 * Given a pricing_breakdown JSON (or a raw surcharges array), return a
 * `{ <type>_cents: N }` map suitable for passing to
 * compute_phleb_take_cents as `p_surcharges`.
 *
 * Unknown labels are dropped silently — never raise from this function;
 * the earning pill should never block on a pricing-breakdown shape
 * surprise.
 */
export function extractSurchargeCents(
  pricingBreakdown: any,
  fallbackSurchargeAmount?: number | null,
): SurchargeCentsMap {
  const out: SurchargeCentsMap = {};

  const surchargesArr: LabelAmount[] = Array.isArray(pricingBreakdown?.surcharges)
    ? pricingBreakdown.surcharges
    : [];

  for (const s of surchargesArr) {
    const label = String(s?.label || '').toLowerCase();
    const amount = Number(s?.amount || 0);
    if (!label || !amount) continue;
    const cents = Math.round(amount * 100);

    // Map label keywords → surcharge_type keys used in the
    // phleb_pay_surcharge_rules table.
    if (label.includes('same-day') || label.includes('same day') || label.includes('stat')) {
      out.same_day_cents = (out.same_day_cents || 0) + cents;
    } else if (label.includes('weekend')) {
      out.weekend_cents = (out.weekend_cents || 0) + cents;
    } else if (label.includes('extended hours') || label.includes('after-hours') || label.includes('after hours')) {
      out.after_hours_cents = (out.after_hours_cents || 0) + cents;
    } else if (label.includes('extended service area') || label.includes('extended area') || label.includes('distance') || label.includes('travel')) {
      out.extended_area_cents = (out.extended_area_cents || 0) + cents;
    } else if (label.includes('admin override') || label.includes('custom price')) {
      out.admin_override_cents = (out.admin_override_cents || 0) + cents;
    }
    // Other labels (additional patient, lab destination, etc.) are
    // intentionally NOT mapped here — companion pay is handled by
    // p_has_companion / companion_addon_cents in the RPC, not surcharges.
  }

  // If we have a single `surcharge_amount` total but no breakdown
  // (older appointments before pricing_breakdown was captured), there's
  // no way to know WHICH surcharge it was — so we leave it out. The
  // earning pill simply doesn't see it; the day-end payroll
  // reconciliation can be run on the raw appointments.surcharge_amount
  // for those older rows separately.
  void fallbackSurchargeAmount;

  return out;
}
