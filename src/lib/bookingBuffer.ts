/**
 * Travel/prep buffer rules for slot blocking.
 *
 * Owner-confirmed 2026-04-27:
 *   • Default mobile / in-office / standard partner — 0 buffer.
 *   • +30 min — specialty-kit, specialty-kit-genova, therapeutic, partner-aristotle-education
 *   • +30 min — appointment in an extended-area city (additive on top of service buffer)
 *   • +15 min — same-address companion (family_group_id present)
 *
 * Mirror this exact math in `supabase/functions/_shared/availability.ts` so
 * the patient slot grid, admin modal, and server last-mile guard all agree.
 */

import { EXTENDED_AREA_CITIES } from '@/services/pricing/pricingService';

const BUFFER_HEAVY_SERVICE = 30;       // specialty-kit, therapeutic, aristotle
const BUFFER_EXTENDED_AREA = 30;       // outer-zip drive time
const BUFFER_COMPANION = 15;           // same-address second patient

// Curated zip-code fallback — kept in sync with get_busy_slots() RPC.
// Triggers the extended-area buffer even when the address text fails the
// city substring match (e.g. zip-only / missing-city addresses).
const EXTENDED_ZIPS = new Set([
  '32827','32832','34747',
  '34741','34742','34743','34744','34745','34746','34758','34759',
  // St. Cloud (added 2026-05-25 — was missing despite being further from
  // Orlando phleb base than Kissimmee. Joshua Hoskins case 3004 Ella Way
  // 34771 was checking out with $0 travel surcharge).
  '34769','34770','34771','34772',
  '32771','32772','32773',
  '32726','32727','32736',
  '34711','34712','34713','34714','34715',
  '34756','32725','32738','32732','32778','32757',
  '34748','34788','34789','34736','34753',
  '32114','32115','32117','32118','32119','32120','32121','32122','32123','32124','32125','32126','32127','32128','32129',
  '32720','32721','32722','32723','32724','32713','32763',
]);

const HEAVY_SERVICE_TYPES = new Set([
  'specialty-kit',
  'specialty-kit-genova',
  'therapeutic',
  'partner-aristotle-education',
]);

interface BufferContext {
  service_type?: string | null;
  city?: string | null;
  zipcode?: string | null;
  address?: string | null;
  family_group_id?: string | null;
  /**
   * Optional pre-computed extended-area flag (skip city normalization).
   * When provided, takes precedence over the city/address heuristic.
   */
  isExtendedArea?: boolean;
}

function detectCityFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  // Address format from booking flow: "123 Main St, Lake Nona, FL 32827"
  // Pull the second comma-separated token as the city when present.
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1].toLowerCase();
  return null;
}

export function isExtendedAreaCity(city: string | null | undefined): boolean {
  if (!city) return false;
  return EXTENDED_AREA_CITIES.includes(city.toLowerCase().trim());
}

/**
 * Robust extended-area detection mirrored from get_busy_slots() server RPC.
 * Used when the address text doesn't conform to the "<street>, <city>, ..." comma
 * format. Two-step:
 *   1. Substring match each EXTENDED_AREA_CITIES against the lowercased address,
 *      bounded so "Sanford Street" in Orlando doesn't trigger the Sanford city.
 *   2. Zip fallback — extract every standalone 5-digit number and check it
 *      against EXTENDED_ZIPS.
 */
function addressLooksExtended(addr: string | null | undefined): boolean {
  if (!addr) return false;
  const lower = addr.toLowerCase();
  // City substring with delimiter on either side
  for (const city of EXTENDED_AREA_CITIES) {
    // Match city preceded by start, space, or comma — and followed by end, comma,
    // " fl"+non-letter, or whitespace+digits (zip).
    const re = new RegExp(`(^|[ ,])${city}($|,| fl[^a-z]| fl$|\\s+\\d)`);
    if (re.test(lower)) return true;
  }
  // Zip fallback: every standalone 5-digit number
  const zipRe = /(^|[^0-9])([0-9]{5})($|[^0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = zipRe.exec(addr)) !== null) {
    if (EXTENDED_ZIPS.has(m[2])) return true;
  }
  return false;
}

/**
 * Returns the travel + prep buffer in minutes that should be appended to an
 * appointment's duration when computing slot blocking.
 *
 * Pass anything you have on the appointment row (or the booking form). Missing
 * fields are treated as "no signal" and contribute 0 buffer.
 */
export function getBufferMinutes(ctx: BufferContext): number {
  let buffer = 0;

  const serviceType = (ctx.service_type || '').toLowerCase();
  if (HEAVY_SERVICE_TYPES.has(serviceType)) {
    buffer += BUFFER_HEAVY_SERVICE;
  }

  // Detection order (each falls through if the prior misses):
  //   1. Explicit isExtendedArea flag (caller already knows)
  //   2. Structured city field
  //   3. Address-text substring + zip fallback (matches server RPC)
  //   4. Zip-only field on context
  const inExtendedArea = ctx.isExtendedArea === true
    || isExtendedAreaCity(ctx.city ?? detectCityFromAddress(ctx.address))
    || addressLooksExtended(ctx.address)
    || (typeof ctx.zipcode === 'string' && EXTENDED_ZIPS.has(ctx.zipcode.trim()));
  if (inExtendedArea) {
    buffer += BUFFER_EXTENDED_AREA;
  }

  if (ctx.family_group_id) {
    buffer += BUFFER_COMPANION;
  }

  return buffer;
}
