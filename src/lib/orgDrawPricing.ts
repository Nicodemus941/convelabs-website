/**
 * What a practice owes when it covers its patients' draws.
 *
 * Pulled out of ScheduleAppointmentModal so the arithmetic can be read and
 * tested on its own -- it decides what a real invoice says.
 *
 * The companion model everywhere else is a SELF-PAY idea: one primary at full
 * price plus a cheaper companion riding along. An org does not buy a household,
 * it commissions draws, and it pays its agreed rate for each one. Running the
 * self-pay maths against a partner rate priced a household of two for Elite
 * Medical at $69.50 and $75.00 instead of $72.25 each -- and the two summed to
 * the right total, which is why it went unnoticed.
 *
 * Surcharges (extended area, weekend, after-hours, same-day) are charged once
 * for the visit, on the primary, not once per person in the house.
 */
export interface OrgDrawPricing {
  /** The whole visit: every draw at the agreed rate, plus the visit surcharge. */
  finalPrice: number;
  /** What the companion ROWS carry between them. */
  companionChargeTotal: number;
  /** The primary row, which must not also carry the companions' share:
   *  send-appointment-invoice bills a line per companion. */
  primaryTotal: number;
  /** Every companion row, the agreed rate each. */
  companionAmount: number;
}

export function orgDrawPricing(
  /** The org's agreed rate per draw, in dollars. */
  flatPerDraw: number,
  /** Charged once for the visit, not once per person. */
  surchargeTotal: number,
  /** Family members drawn alongside the primary. */
  billableCompanionCount: number
): OrgDrawPricing {
  const companions = Math.max(0, billableCompanionCount);
  const companionChargeTotal = companions * flatPerDraw;
  return {
    finalPrice: flatPerDraw + surchargeTotal + companionChargeTotal,
    companionChargeTotal,
    primaryTotal: flatPerDraw + surchargeTotal,
    companionAmount: flatPerDraw
  };
}
