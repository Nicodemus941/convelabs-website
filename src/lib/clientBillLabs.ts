/**
 * CLIENT-BILL / PREPAID LAB SUPPORT
 *
 * Some lab orders are PREPAID by the ordering practice or the lab itself —
 * the patient's insurance will never be billed. For these we must NOT ask the
 * patient for insurance information.
 *
 * Two independent signals mark an order as client-billed:
 *   1. The destination lab is a known prepaid / direct-bill functional-medicine
 *      lab: Evexia, Access Medical Labs, Ulta Lab Tests. These labs only run
 *      orders that the practice has already paid for (client bill); they do not
 *      bill patient insurance.
 *   2. The order document itself says "Client Bill" (a billing designation on
 *      LabCorp / Quest / Access requisitions).
 *
 * This module is the single source of truth shared across the booking flow,
 * the patient lab-request upload page, and the admin scheduling modal so all
 * three agree on when insurance can be skipped. The lab-order OCR edge function
 * (`ocr-lab-order`) mirrors this logic server-side (it cannot import this file
 * from a Deno function, so keep the two in sync).
 */

export type LabBillType = 'client_bill' | 'insurance' | 'self_pay' | null;

export interface PrepaidLab {
  /** stable select value persisted as the lab destination */
  value: string;
  /** human label shown in the picker */
  label: string;
}

/**
 * Prepaid / direct-client-bill labs. Selecting one of these as the lab
 * destination means the test is already paid for — no patient insurance needed.
 */
export const PREPAID_LABS: PrepaidLab[] = [
  { value: 'evexia', label: 'Evexia Diagnostics (prepaid)' },
  { value: 'access-medical-labs', label: 'Access Medical Labs (prepaid)' },
  { value: 'ulta-lab-tests', label: 'Ulta Lab Tests (prepaid)' },
];

const PREPAID_LAB_VALUES = new Set(PREPAID_LABS.map((l) => l.value));

/** True when a lab-destination select value is one of the prepaid labs. */
export function isPrepaidLabValue(value?: string | null): boolean {
  if (!value) return false;
  return PREPAID_LAB_VALUES.has(String(value).trim().toLowerCase());
}

/**
 * Map a free-text / OCR'd lab company name to a canonical prepaid value.
 * Returns the canonical value (e.g. 'access-medical-labs') or null if the name
 * isn't a recognized prepaid lab. Tolerant of the common variants seen on
 * requisitions ("Access Medical Laboratories", "ULTA Lab Tests", "Evexia Dx").
 */
export function normalizeLabCompany(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (/\bevexia\b/.test(s)) return 'evexia';
  if (/access\s*medical\s*lab(orator(y|ies))?s?/.test(s)) return 'access-medical-labs';
  if (/\bult[ar]\s*lab(\s*tests)?\b/.test(s)) return 'ulta-lab-tests';
  return null;
}

/** True when free-text / OCR'd lab company name is a prepaid lab. */
export function isPrepaidLabCompany(raw?: string | null): boolean {
  return normalizeLabCompany(raw) !== null;
}

/**
 * True when order text contains a "Client Bill" billing designation. Matches
 * "Client Bill", "Client-Bill", "Bill to Client", "Client Billed" etc. Excludes
 * "patient bill" / "third party" to avoid false positives.
 */
export function isClientBillText(text?: string | null): boolean {
  if (!text) return false;
  const s = String(text);
  return /\bclient[\s-]*bill(ed|ing)?\b/i.test(s) || /\bbill\s*(to\s*)?client\b/i.test(s);
}

export interface ClientBillSignals {
  /** the selected lab-destination value (booking picker / admin) */
  labDestination?: string | null;
  /** OCR'd or admin-entered lab company name */
  labCompany?: string | null;
  /** explicit bill type (declared by user or OCR) */
  billType?: LabBillType;
  /** full OCR / order text to scan for "Client Bill" */
  orderText?: string | null;
  /** explicit self-declared / persisted flag */
  declared?: boolean | null;
}

/**
 * The combined decision: should we treat this order as client-billed (and
 * therefore NOT require insurance)? Any single signal is sufficient.
 */
export function impliesClientBill(signals: ClientBillSignals): boolean {
  if (signals.declared) return true;
  if (signals.billType === 'client_bill') return true;
  if (isPrepaidLabValue(signals.labDestination)) return true;
  if (isPrepaidLabCompany(signals.labCompany)) return true;
  if (isClientBillText(signals.orderText)) return true;
  return false;
}
