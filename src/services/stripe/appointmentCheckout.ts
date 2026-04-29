import { supabase, getAuthToken } from '@/integrations/supabase/client';
import { attributionForBooking } from '@/lib/attribution';

export interface AppointmentCheckoutParams {
  serviceType: string;
  serviceName: string;
  amount: number; // in cents
  tipAmount: number; // in cents
  appointmentDate: string;
  appointmentTime: string;
  /** Detected member tier — server re-verifies and overrides amount if mismatched */
  memberTier?: 'none' | 'member' | 'vip' | 'concierge';
  patientDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  locationDetails: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    locationType?: string;
    instructions?: string;
    aptUnit?: string;
    gateCode?: string;
  };
  serviceDetails?: {
    sameDay?: boolean;
    weekend?: boolean;
    additionalNotes?: string;
  };
  /** Optional promo code entered by the patient. Server validates + applies the discount. */
  promoCode?: string | null;
  /** Optional referral code (typically captured from URL ?ref= or sessionStorage).
   *  Server re-validates against referral_codes table and applies the discount.
   *  Front-end value is suggestive only — the server is authoritative. */
  referralCode?: string | null;
  /** Itemized cart at checkout — service + surcharges + companions + discounts.
   *  Server stashes in pending_pricing_breakdowns keyed by Stripe session id;
   *  the webhook copies it to appointments.pricing_breakdown so any future
   *  pricing-drift alert can be triaged in one query. */
  pricingBreakdown?: Record<string, unknown> | null;
}

export interface AppointmentCheckoutResult {
  url?: string;
  sessionId?: string;
  error?: string;
  // Slot-conflict structured payload (Hormozi: never let a buyer leave
  // empty-handed). When error === 'slot_unavailable', the UI shows a
  // suggestion modal with these alternatives + a "use this time" button.
  errorCode?: string;
  suggested_slots?: Array<{ time: string }>;
  original_time?: string;
  original_date?: string;
}

// Pull the Supabase function URL + anon key from the existing client config
// so we can call /functions/v1/create-appointment-checkout via plain fetch.
// We bypass supabase.functions.invoke() because it triggers an auth refresh
// on every call — and that refresh hangs on mobile Safari / iOS PWAs when
// the Service Worker has the page backgrounded, leaving the pay button
// spinning until our 30s timeout fires. Direct fetch with the existing
// session token is reliable across every browser we support.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '') as string;

// Read the user_id from the same localStorage entry that the auth client
// uses, without going through the SDK at all. Avoids any Auth lock
// contention that hangs on mobile.
function readUserIdFromLocalStorage(): string | null {
  try {
    const stored = localStorage.getItem('sb-yluyonhrxxtyuiyrdixl-auth-token');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.user?.id || null;
  } catch { return null; }
}

// Build version marker — bump this any time we ship a checkout-flow fix.
// Lets you confirm in DevTools whether a stale bundle is being served.
const CHECKOUT_VERSION = '2026-04-28-v4-aggressive-bypass';

export async function createAppointmentCheckoutSession(
  params: AppointmentCheckoutParams
): Promise<AppointmentCheckoutResult> {
  console.log(`[checkout ${CHECKOUT_VERSION}] starting at ${new Date().toISOString()}`);
  try {
    // H2: pull last-touch attribution (UTMs, referrer, landing page) from
    // sessionStorage so every Stripe checkout + downstream appointment row
    // is stamped with the acquisition channel. Drives CAC-per-channel report.
    const attribution = attributionForBooking();

    // Read auth token DIRECTLY from localStorage — no SDK calls, no auth
    // refresh, no async lock that can hang on mobile. Guests proceed with
    // just the anon key, exactly like the rest of the public booking flow.
    let accessToken = '';
    let userId: string | null = null;
    try {
      accessToken = getAuthToken() || '';
      userId = readUserIdFromLocalStorage();
    } catch (lsErr) {
      // Some private-browsing modes (Chrome incognito, Brave strict mode)
      // throw on localStorage access. Proceed as guest — the booking is
      // still anonymous-allowed.
      console.warn('[checkout] localStorage unavailable, proceeding as guest:', lsErr);
    }

    // Sanity-check the anon key. If env var missing, Bearer header would be
    // empty → server returns 401 → spinner stops with confusing message.
    // Fail fast with a clear message instead.
    if (!SUPABASE_ANON_KEY) {
      console.error('[checkout] VITE_SUPABASE_PUBLISHABLE_KEY missing from env');
      return { error: 'Configuration error — please refresh and try again, or contact support.' };
    }

    // 30-second hard timeout via AbortController — kills the fetch cleanly
    // if the network stalls. Spinner cannot get stuck.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('[checkout] 30s timeout fired — aborting fetch');
      controller.abort();
    }, 30_000);

    const fetchUrl = `${SUPABASE_URL}/functions/v1/create-appointment-checkout`;
    console.log(`[checkout] POST → ${fetchUrl}`);
    const fetchStart = Date.now();

    let response: Response;
    try {
      response = await fetch(fetchUrl, {
        method: 'POST',
        // CRITICAL: 'omit' so PWA/Service-Worker can't attach stale cookies
        // that some auth proxies reject; we send Authorization explicitly.
        credentials: 'omit',
        // 'no-store' so any aggressive HTTP cache (Chrome PWA cache layer)
        // can never serve a stale POST response.
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
          'X-Client-Info': 'convelabs-checkout-direct-fetch',
        },
        body: JSON.stringify({
          ...params,
          userId,
          attribution,
        }),
        signal: controller.signal,
      });
      console.log(`[checkout] response status=${response.status} after ${Date.now() - fetchStart}ms`);
    } catch (netErr: any) {
      clearTimeout(timeoutId);
      const elapsed = Date.now() - fetchStart;
      if (netErr?.name === 'AbortError') {
        console.error(`[checkout] aborted after ${elapsed}ms`);
        return { error: 'Checkout timed out — please check your connection and try again.' };
      }
      console.error(`[checkout] fetch failed after ${elapsed}ms:`, netErr);
      return { error: `Network error: ${netErr?.message || 'unknown'}. Please try again.` };
    }
    clearTimeout(timeoutId);

    // Parse body even on non-2xx so we can surface structured errors
    // (slot_unavailable suggestions, friendly promo failure messages, etc.)
    let body: any = null;
    try {
      body = await response.json();
    } catch (parseErr) {
      console.warn('[checkout] could not parse response body:', parseErr);
    }

    if (!response.ok) {
      if (body?.error === 'slot_unavailable') {
        return {
          error: (body.message as string) || 'That time slot was just claimed.',
          errorCode: 'slot_unavailable',
          suggested_slots: body.suggested_slots || [],
          original_time: body.original_time,
          original_date: body.original_date,
        };
      }
      if (body?.error) {
        return { error: (body.message as string) || (body.error as string), errorCode: body.error };
      }
      return { error: `Checkout failed (HTTP ${response.status}). Please try again.` };
    }

    if (!body) {
      return { error: 'No response from checkout service' };
    }

    if (body.error) {
      if (body.error === 'slot_unavailable') {
        return {
          error: (body.message as string) || 'That time slot was just claimed.',
          errorCode: 'slot_unavailable',
          suggested_slots: body.suggested_slots || [],
          original_time: body.original_time,
          original_date: body.original_date,
        };
      }
      return { error: (body.message as string) || (body.error as string) };
    }

    return { url: body.url, sessionId: body.sessionId };
  } catch (err) {
    console.error('Error in createAppointmentCheckoutSession:', err);
    return { error: (err as Error).message };
  }
}

export async function verifyAppointmentCheckout(
  sessionId: string
): Promise<{ status: string; appointment?: any; bookingId?: string }> {
  const { data, error } = await supabase.functions.invoke('verify-appointment-checkout', {
    body: { session_id: sessionId },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
