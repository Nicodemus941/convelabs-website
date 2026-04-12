/**
 * Centralized external URL constants for Green Health Systems platform.
 * All booking, enrollment, auth, and embed URLs are managed here.
 * Update this single file when URLs change.
 */

// Primary booking route (keeps users on ConveLabs, embeds GHS booking flow)
export const BOOKING_URL = '/book-now';

// Temporary external GHS booking page while availability sync is being fixed
export const GHS_BOOKING_PAGE = 'https://greenhealthsystems.com/book/convelabs';

// External URLs
export const ENROLLMENT_URL = 'https://app.greenhealthsystems.com/enroll';
export const AUTH_URL = 'https://app.greenhealthsystems.com/auth';
export const TESTS_URL = 'https://app.greenhealthsystems.com/tests';

// Embedded booking widget
export const EMBED_URL = 'https://greenhealthsystems.com/embed/convelabs';

// Origin for postMessage verification
export const GHS_ORIGIN = 'greenhealthsystems.com';

// Preconnect domain
export const GHS_PRECONNECT = 'https://greenhealthsystems.com';

/**
 * Helper to append UTM source to a URL
 */
export const withSource = (base: string, source: string) => {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}utm_source=${encodeURIComponent(source)}`;
};

/**
 * Helper to build embed URL with UTM parameters
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
  return qs ? `${EMBED_URL}?${qs}` : EMBED_URL;
};
