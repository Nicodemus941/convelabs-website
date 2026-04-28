import { supabase } from '@/integrations/supabase/client';
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

export async function createAppointmentCheckoutSession(
  params: AppointmentCheckoutParams
): Promise<AppointmentCheckoutResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // H2: pull last-touch attribution (UTMs, referrer, landing page) from
    // sessionStorage so every Stripe checkout + downstream appointment row
    // is stamped with the acquisition channel. Drives CAC-per-channel report.
    const attribution = attributionForBooking();

    // Hard 30-second timeout so the pay button can never hang indefinitely.
    // Supabase's functions.invoke has no built-in timeout; on a flaky network
    // or stuck auth refresh, the await would hang forever and the spinner
    // would never stop. With this guard, any stall surfaces a clean error
    // toast within 30s and the patient can retry.
    const TIMEOUT_MS = 30_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Checkout timed out — please try again. If it keeps happening, refresh the page or contact support.')), TIMEOUT_MS)
    );
    const invokePromise = supabase.functions.invoke('create-appointment-checkout', {
      body: {
        ...params,
        userId: user?.id || null,
        attribution,
      },
    });
    const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>;

    // CRITICAL: Supabase JS treats ANY non-2xx as `FunctionsHttpError`,
    // sets `data` to null, and surfaces the error before we can inspect
    // the structured body. That collapses our 409 slot_unavailable payload
    // (with suggested_slots) into a generic "Edge Function returned a
    // non-2xx status code" message and the SlotConflictModal never opens.
    //
    // Workaround: when the error has a `context` Response (supabase-js
    // v2.40+), read its body and unwrap. Falls back to plain error.message
    // if the context is missing or unreadable.
    if (error) {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
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
        } catch (parseErr) {
          console.warn('[checkout] could not parse error body:', parseErr);
        }
      }
      console.error('Error creating appointment checkout:', error);
      return { error: error.message };
    }

    if (!data) {
      return { error: 'No response from checkout service' };
    }

    if (data.error) {
      if (data.error === 'slot_unavailable') {
        return {
          error: (data.message as string) || 'That time slot was just claimed.',
          errorCode: 'slot_unavailable',
          suggested_slots: data.suggested_slots || [],
          original_time: data.original_time,
          original_date: data.original_date,
        };
      }
      return { error: (data.message as string) || (data.error as string) };
    }

    return { url: data.url, sessionId: data.sessionId };
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
