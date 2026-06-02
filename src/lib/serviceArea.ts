/**
 * SERVICE AREA — single source of truth for "do we cover this address?"
 *
 * ConveLabs serves a fixed radius around its Orlando base (ZIP 32810).
 * The rule is one number: SERVICE_RADIUS_MILES. Change it here and every
 * surface that imports this (the booking gate today, the server guard later)
 * updates at once — no hand-curated ZIP lists to maintain.
 *
 * Distance is great-circle (haversine) from the base. Road distance runs a
 * bit longer, so the radius is intentionally the straight-line figure the
 * owner set.
 */

// ConveLabs base — 32810 (Pembrook Dr, Orlando). Adjust if the base moves.
export const SERVICE_BASE = { lat: 28.602, lng: -81.401, zip: '32810' } as const;

// The one knob. Owner-set 2026-06: cover a 39-mile radius from the base.
export const SERVICE_RADIUS_MILES = 39;

/** Great-circle distance in miles between two lat/lng points. */
export function milesBetween(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Miles from the ConveLabs base to a given point. */
export function milesFromBase(lat: number, lng: number): number {
  return milesBetween(SERVICE_BASE.lat, SERVICE_BASE.lng, lat, lng);
}

/** True if the point is within the service radius of the base. */
export function isWithinServiceRadius(lat: number, lng: number): boolean {
  return milesFromBase(lat, lng) <= SERVICE_RADIUS_MILES;
}
