import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────

export interface CoverageRequest {
  zip: string;
  serviceType: string;
}

export interface CoverageResponse {
  covered: boolean;
  serviceArea?: string;
  earliestDate?: string;
  services?: ServiceOption[];
  message?: string;
}

export interface ServiceOption {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
}

export interface AvailabilityRequest {
  zip: string;
  serviceType: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  arrivalWindow: string;
  tag?: 'soonest' | 'popular';
  providerId?: string;
  providerName?: string;
  providerPhoto?: string;
}

export interface AvailabilityResponse {
  slots: TimeSlot[];
  nextAvailableDate?: string;
}

export interface PatientDetails {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes?: string;
  insuranceCarrier?: string;
  insuranceMemberId?: string;
  labOrderPath?: string;
}

export interface BookingRequest {
  slotId: string;
  serviceType: string;
  patient: PatientDetails;
}

export interface BookingResponse {
  bookingId: string;
  confirmationNumber: string;
  appointmentDate: string;
  appointmentTime: string;
  arrivalWindow: string;
  providerName?: string;
  serviceName: string;
  price: number;
  address: string;
  status: string;
}

export interface BookingStatusResponse {
  bookingId: string;
  status: string;
  appointmentDate: string;
  appointmentTime: string;
  providerName?: string;
}

// ─── Booking Hold Types ──────────────────────────────

export interface BookingHoldResponse {
  holdId: string;
  expiresAt: string;
  slotId: string;
  serviceType: string;
  status: 'held' | 'expired' | 'converted';
}

// ─── Checkout Session Types ──────────────────────────

export interface GHSCheckoutSessionResponse {
  checkoutUrl: string;
  sessionId: string;
  holdId: string;
  expiresAt: string;
}

// ─── Service Catalog Types ──────────────────────────

export interface GHSServiceCatalogItem {
  id: string;
  public_name: string;
  short_description: string;
  starting_price: number;
  duration_minutes?: number;
  badge_text?: string;
  icon?: string;
  additional_person_price?: number;
  requires_manual_review?: boolean;
  is_featured?: boolean;
  display_order: number;
  same_day_available?: boolean;
  is_partner?: boolean;
}

export interface GHSAddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes?: number;
  icon?: string;
}

export interface ServiceCatalogResponse {
  services: GHSServiceCatalogItem[];
  addOns?: GHSAddOn[];
  partnerServices?: GHSServiceCatalogItem[];
}

// ─── Checkout Status Types ───────────────────────────

export interface CheckoutStatusResponse {
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  bookingId?: string;
  confirmationNumber?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  arrivalWindow?: string;
  providerName?: string;
  serviceName?: string;
  price?: number;
  address?: string;
  ghsSynced?: boolean;
}

// ─── Service Layer ───────────────────────────────────

async function invokeProxy<T>(action: string, data?: Record<string, unknown>, bookingId?: string, sessionId?: string): Promise<T> {
  const { data: response, error } = await supabase.functions.invoke('ghs-proxy', {
    body: { action, data, bookingId, sessionId },
  });

  if (error) {
    console.error(`GHS ${action} error:`, error);
    throw new Error(error.message || 'Failed to connect to scheduling system');
  }

  if (response?.error) {
    throw new Error(response.error);
  }

  return response as T;
}

export async function checkCoverage(zip: string, serviceType: string): Promise<CoverageResponse> {
  return invokeProxy<CoverageResponse>('coverage', { zip, serviceType });
}

export async function getAvailability(zip: string, serviceType?: string, dateFrom?: string, dateTo?: string, serviceDuration?: number): Promise<AvailabilityResponse> {
  return invokeProxy<AvailabilityResponse>('availability', { zip, serviceType: serviceType || 'blood_draw', dateFrom, dateTo, service_duration: serviceDuration });
}

export async function createBooking(slotId: string, serviceType: string, patient: PatientDetails): Promise<BookingResponse> {
  return invokeProxy<BookingResponse>('book', { slotId, serviceType, patient });
}

export async function getBookingStatus(bookingId: string): Promise<BookingStatusResponse> {
  return invokeProxy<BookingStatusResponse>('status', undefined, bookingId);
}

// ─── Booking Hold + Checkout ────────────────────────

export async function createBookingHold(
  slotId: string,
  serviceType: string,
  patient: PatientDetails,
  servicePrice?: number,
  addOnIds?: string[],
  partnerCode?: string
): Promise<BookingHoldResponse> {
  return invokeProxy<BookingHoldResponse>('booking-hold', { slotId, serviceType, patient, servicePrice, addOnIds, partnerCode });
}

export async function createGHSCheckoutSession(
  holdId: string,
  serviceType: string,
  patient: PatientDetails,
  returnUrl: string,
  cancelUrl: string,
  isSameDay?: boolean
): Promise<GHSCheckoutSessionResponse> {
  return invokeProxy<GHSCheckoutSessionResponse>('checkout-session', {
    holdId,
    serviceType,
    patient,
    returnUrl,
    cancelUrl,
    isSameDay: isSameDay || false,
  });
}

export async function getCheckoutStatus(sessionId: string): Promise<CheckoutStatusResponse> {
  return invokeProxy<CheckoutStatusResponse>('checkout-status', undefined, undefined, sessionId);
}

export async function getServiceCatalog(): Promise<ServiceCatalogResponse> {
  return invokeProxy<ServiceCatalogResponse>('services');
}

// ─── New GHS API Actions ────────────────────────────

export async function getBusinessProfile(): Promise<any> {
  return invokeProxy<any>('business_profile');
}

export async function getOfficeHours(): Promise<any> {
  return invokeProxy<any>('office_hours');
}

export async function getSchedulingConfig(): Promise<any> {
  return invokeProxy<any>('scheduling_config');
}

export async function getGHSServiceCatalog(includeAddons = true): Promise<any> {
  return invokeProxy<any>('service_catalog', { include_addons: includeAddons });
}

export async function getProviderDetails(providerId?: string): Promise<any> {
  return invokeProxy<any>('provider_details', providerId ? { provider_id: providerId } : undefined);
}

export async function getProviderSchedule(providerId?: string, dateFrom?: string, dateTo?: string): Promise<any> {
  return invokeProxy<any>('provider_schedule', { provider_id: providerId, date_from: dateFrom, date_to: dateTo });
}
