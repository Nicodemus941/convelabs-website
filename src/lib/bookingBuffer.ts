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

  const inExtendedArea = ctx.isExtendedArea === true
    || isExtendedAreaCity(ctx.city ?? detectCityFromAddress(ctx.address));
  if (inExtendedArea) {
    buffer += BUFFER_EXTENDED_AREA;
  }

  if (ctx.family_group_id) {
    buffer += BUFFER_COMPANION;
  }

  return buffer;
}
