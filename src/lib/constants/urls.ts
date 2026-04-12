/**
 * Centralized URL constants for ConveLabs platform.
 */

// Primary booking route (internal booking flow)
export const BOOKING_URL = '/book-now';

// Booking result paths
export const BOOKING_SUCCESS_PATH = '/book-now?status=success';
export const BOOKING_CANCEL_PATH = '/book-now?status=cancel';

// Enrollment / membership (internal routes)
export const ENROLLMENT_URL = '/onboarding/plan-selection';

// Auth (internal routes)
export const AUTH_URL = '/login';

// Lab tests
export const TESTS_URL = '/lab-testing';

// Legacy GHS aliases — all point to internal routes now
/** @deprecated Use BOOKING_URL instead */
export const GHS_BOOKING_PAGE = '/book-now';
/** @deprecated No longer used */
export const EMBED_URL = '/book-now';
/** @deprecated No longer used */
export const GHS_ORIGIN = '';
/** @deprecated No longer used */
export const GHS_PRECONNECT = '';

/**
 * Helper to append UTM source to a URL
 */
export const withSource = (base: string, source: string) => {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}utm_source=${encodeURIComponent(source)}`;
};

/**
 * Helper to build booking URL with UTM parameters
 */
export const buildEmbedUrl = (params: {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
} = {}) => {
  const searchParams = new URLSearchParams();
  if (params.source) searchParams.set('utm_source', params.source);
  if (params.medium) searchParams.set('utm_medium', params.medium);
  if (params.campaign) searchParams.set('utm_campaign', params.campaign);
  if (params.content) searchParams.set('utm_content', params.content);
  const qs = searchParams.toString();
  return qs ? `${BOOKING_URL}?${qs}` : BOOKING_URL;
};
