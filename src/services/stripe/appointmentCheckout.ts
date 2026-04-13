import { supabase } from '@/integrations/supabase/client';

export interface AppointmentCheckoutParams {
  serviceType: string;
  serviceName: string;
  amount: number; // in cents
  tipAmount: number; // in cents
  appointmentDate: string;
  appointmentTime: string;
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

    const { data, error } = await supabase.functions.invoke('create-appointment-checkout', {
      body: {
        ...params,
        userId: user?.id || null,
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
      return { error: data.error };
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
