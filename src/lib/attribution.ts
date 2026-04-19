/**
 * Attribution capture — H2 of Part H Level 0 foundation.
 *
 * Hormozi gate: "CAC documented per channel" — can't be done retroactively.
 * Capture UTM + referrer + landing-page on every page load, persist across
 * the browser session, and surface to every booking/signup handler.
 *
 * Two time horizons:
 *   - sessionStorage `cv_attribution_session` — cleared on tab close;
 *     represents THIS visit's touch. Stamped on appointment rows for
 *     last-touch attribution.
 *   - localStorage   `cv_attribution_first`   — never cleared by us;
 *     represents the FIRST time this device saw ConveLabs. Stamped on
 *     tenant_patients on signup for first-touch attribution.
 *
 * Both are JSON {utm_source, utm_medium, utm_campaign, utm_content,
 * utm_term, referrer_url, landing_page, captured_at}. All fields
 * optional; nulls are legitimate ("direct" traffic).
 */

export interface Attribution {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer_url?: string | null;
  landing_page?: string | null;
  captured_at?: string;
}

const SESSION_KEY = 'cv_attribution_session';
const FIRST_TOUCH_KEY = 'cv_attribution_first';

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

/**
 * Call once on app mount. Reads URL params + referrer, writes to storage.
 * Subsequent calls on the same session update session storage (last touch)
 * but leave first-touch storage alone.
 */
export function captureAttribution(): Attribution {
  if (typeof window === 'undefined') return {};

  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    const hasAnyUTM = UTM_PARAMS.some(k => params.get(k));
    const referrerExternal = document.referrer && !document.referrer.includes(window.location.host);

    // Only update session if we see fresh attribution signal
    const fresh: Attribution = {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content'),
      utm_term: params.get('utm_term'),
      referrer_url: referrerExternal ? document.referrer : null,
      landing_page: url.pathname + url.search,
      captured_at: new Date().toISOString(),
    };

    if (hasAnyUTM || referrerExternal) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(fresh));

      // First-touch: only write if not already set
      if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
        localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(fresh));
      }
    }

    return fresh;
  } catch {
    return {};
  }
}

/**
 * Pull the current session's attribution (last-touch, for appointment rows).
 * Returns empty object if never captured — means "direct" traffic.
 */
export function getSessionAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Pull this device's first-touch attribution (for tenant_patients on signup).
 * Persists across sessions on the same browser/device.
 */
export function getFirstTouchAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Shape to attach to Stripe checkout metadata + appointment row. Uses
 * session (last-touch) because bookings go through in ONE session.
 */
export function attributionForBooking(): Record<string, string> {
  const attr = getSessionAttribution();
  const out: Record<string, string> = {};
  if (attr.utm_source)   out.utm_source = attr.utm_source;
  if (attr.utm_medium)   out.utm_medium = attr.utm_medium;
  if (attr.utm_campaign) out.utm_campaign = attr.utm_campaign;
  if (attr.utm_content)  out.utm_content = attr.utm_content;
  if (attr.utm_term)     out.utm_term = attr.utm_term;
  if (attr.referrer_url) out.referrer_url = attr.referrer_url;
  if (attr.landing_page) out.landing_page = attr.landing_page;
  return out;
}
