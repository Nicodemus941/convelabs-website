/**
 * LAB-ORDER-REQUIRED — single source of truth for "should we chase this
 * patient for a lab order?"
 *
 * Some services never need the patient to hand us a requisition:
 *
 *   therapeutic  — therapeutic phlebotomy. The standing physician order lives
 *                  with us / the ordering provider; there is no per-visit
 *                  requisition for the patient to upload. Texting them to
 *                  "upload your lab order" is confusing and makes them think
 *                  their appointment is at risk.
 *   in-office    — doctor's-office visit. The requisition is handed over at
 *                  the office; patients arrive WITH it.
 *
 * Every lab-order nag surface (auto-request cron, manual request button,
 * reminder cron) must call this before sending. Keep the list here — do not
 * re-inline service_type checks at call sites.
 */

const NO_LAB_ORDER_REQUEST_SERVICE_TYPES = new Set([
  'therapeutic',
  'in-office',
]);

/**
 * True when we may ask the patient to upload a lab order for this service.
 * Unknown / null / blank service types default to TRUE (chase it) — the
 * failure mode of an extra nudge is far cheaper than showing up without a
 * requisition.
 */
export function serviceRequiresLabOrder(serviceType: string | null | undefined): boolean {
  const s = String(serviceType || '').trim().toLowerCase();
  if (!s) return true;
  return !NO_LAB_ORDER_REQUEST_SERVICE_TYPES.has(s);
}

/** Human-readable reason for skip logs / API responses. */
export function labOrderSkipReason(serviceType: string | null | undefined): string {
  const s = String(serviceType || '').trim().toLowerCase();
  if (s === 'therapeutic') return 'therapeutic_no_lab_order_needed';
  if (s === 'in-office') return 'in_office_arrives_with_requisition';
  return 'service_exempt_from_lab_order_request';
}
