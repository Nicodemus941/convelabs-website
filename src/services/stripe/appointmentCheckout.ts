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

export async function createAppointmentCheckoutSession(
  params: AppointmentCheckoutParams
): Promise<AppointmentCheckoutResult> {
  try {
    // H2: pull last-touch attribution (UTMs, referrer, landing page) from
    // sessionStorage so every Stripe checkout + downstream appointment row
    // is stamped with the acquisition channel. Drives CAC-per-channel report.
    const attribution = attributionForBooking();

    // Read auth token DIRECTLY from localStorage — no SDK calls, no auth
    // refresh, no async lock that can hang on mobile. Guests proceed with
    // just the anon key, exactly like the rest of the public booking flow.
    const accessToken = getAuthToken() || '';
    const userId = readUserIdFromLocalStorage();

    // 30-second hard timeout via AbortController — kills the fetch cleanly
    // if the network stalls. Spinner cannot get stuck.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/create-appointment-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          ...params,
          userId,
          attribution,
        }),
        signal: controller.signal,
      });
    } catch (netErr: any) {
      clearTimeout(timeoutId);
      if (netErr?.name === 'AbortError') {
        return { error: 'Checkout timed out — please check your connection and try again.' };
      }
      console.error('[checkout] fetch failed:', netErr);
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
