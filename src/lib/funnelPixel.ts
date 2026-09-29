/**
 * BOOKING FUNNEL → META PIXEL
 *
 * Until 2026-09-29 the booking page fired `PageView` and nothing else. Three
 * steps into the flow — visit type chosen, service chosen, price calculated —
 * the pixel had still sent Meta nothing. `trackLead` existed in
 * ConversionAnalytics with no callers, and the `InitiateCheckout` in
 * ConversionOptimizationContext only fires from SmartCTAButton /
 * MobileOptimization, neither of which /book-now renders.
 *
 * That is why the ad campaigns could only be built on Traffic: there was no
 * conversion signal for Meta to optimize against. These are the events that
 * make a Leads campaign possible.
 *
 * Fires browser-side only. Each event carries an `eventID` so the same events
 * can be sent server-side through the Conversions API later and deduplicated
 * against these without double-counting.
 */

type PixelParams = Record<string, unknown>;

// `fbq` is already declared as `any` on Window elsewhere in the app; redeclaring
// it here with a narrower type breaks the build, so read it off window instead.
/**
 * One booking attempt should produce at most one of each event, even though
 * React may re-run an effect and the patient may step backwards and forwards.
 * Scoped to the page instance: a genuine second booking reloads the flow.
 */
const sent = new Set<string>();

function newEventId(name: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${name}-${rand}`;
}

export function trackFunnelEvent(name: string, params: PixelParams = {}): void {
  if (sent.has(name)) return;
  sent.add(name);
  try {
    if (typeof window === 'undefined') return;
    const fbq = (window as any).fbq;
    if (typeof fbq !== 'function') return;
    fbq('track', name, params, { eventID: newEventId(name) });
  } catch {
    // Tracking must never break a booking.
  }
}

/** Patient picked a visit type and is looking at services. */
export function trackFunnelViewContent(visitType?: string): void {
  trackFunnelEvent('ViewContent', {
    content_category: 'Mobile Phlebotomy',
    content_name: visitType || 'visit',
  });
}

/**
 * The lead itself: the patient has handed over contact details and moved on.
 * This is the event a Leads campaign optimises for, so it must not fire on a
 * mere page view or a half-filled form — only once we actually hold a way to
 * reach this person.
 */
export function trackFunnelLead(params: { value?: number; visitType?: string } = {}): void {
  trackFunnelEvent('Lead', {
    content_category: 'Mobile Phlebotomy',
    content_name: params.visitType || 'booking',
    ...(params.value ? { value: params.value, currency: 'USD' } : {}),
  });
}

/** Patient reached the payment step. */
export function trackFunnelInitiateCheckout(params: { value?: number; visitType?: string } = {}): void {
  trackFunnelEvent('InitiateCheckout', {
    content_category: 'Mobile Phlebotomy',
    content_name: params.visitType || 'booking',
    ...(params.value ? { value: params.value, currency: 'USD' } : {}),
  });
}
