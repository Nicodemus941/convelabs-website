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

    const { data, error } = await supabase.functions.invoke('create-appointment-checkout', {
      body: {
        ...params,
        userId: user?.id || null,
        attribution,
      },
    });

    if (error) {
      console.error('Error creating appointment checkout:', error);
      return { error: error.message };
    }

    if (!data) {
      return { error: 'No response from checkout service' };
    }

    if (data.error) {
      // Prefer the human-friendly message the edge fn provides (e.g. invalid
      // promo code, $0-total guard) so toast copy stays actionable
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
