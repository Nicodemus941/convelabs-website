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
      // Slot-conflict gets the structured payload through so the UI can
      // render alternatives. Other errors (invalid promo, $0-total guard)
      // collapse to the friendly message.
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
