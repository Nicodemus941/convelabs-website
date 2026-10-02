/**
 * bookingDraft — client side of abandoned-booking recovery.
 *
 * The booking flow (via useBookingDraft) saves a draft of the form from the
 * Patient Info step onward, once the patient has typed a valid email or
 * phone. The server (booking-draft-upsert) keys it on a per-tab session id,
 * the cron (process-abandoned-bookings) sends up to three nudges with a
 * /book/resume/:token link, and this module turns that link back into form
 * state when the patient comes back.
 *
 * Nothing in here touches BookingFlow's own state directly; the hook does.
 */

import type { BookingFormValues } from '@/types/appointmentTypes';
import { getSessionAttribution } from '@/lib/attribution';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const ANON_KEY = ((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '') as string;

const SESSION_KEY = 'cl_booking_draft_session';
const RESUME_KEY = 'cl_booking_resume';

/** Verbatim consent line stored with the draft (TCPA record). Keep in sync with BookingDraftConsent. */
export const SMS_CONSENT_TEXT =
  'Text me a link to finish booking if I get interrupted. Up to 3 texts from ConveLabs; msg & data rates may apply; reply STOP to opt out.';

/**
 * Patient-facing trust claims used on the resume page. MIRROR of
 * supabase/functions/_shared/trust-claims.ts (owner-reviewed 2026-10-02) —
 * edit both. No unmeasured claims (no "99.9%", "one-try", "guarantee").
 */
export const TRUST_CLAIMS = {
  duration: 'Most draws take under 10 minutes.',
  tracked: 'Every sample tracked from your arm to the lab.',
  redraw: 'If we ever lose a sample, your redraw is free.',
} as const;

/** Form field (outside the zod schema, like labOrder.uploadedPaths) the consent checkbox writes. */
export const SMS_CONSENT_FIELD = 'draftSmsConsent';

// ── Session id ───────────────────────────────────────────────────────────
export function getDraftSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 16) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return `nostorage-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function rotateDraftSessionId(): string {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  return getDraftSessionId();
}

/**
 * "What brings you here?" answer from the landing page (feat/meta-landing-page
 * writes sessionStorage `cl_visit_reason` via src/lib/visitReason.ts). Read
 * directly so this branch does not depend on that file existing.
 */
export function getVisitReasonSafe(): string | null {
  try {
    const raw = sessionStorage.getItem('cl_visit_reason');
    if (!raw) return null;
    // Accept either a bare string or a JSON object { reason } / { id }.
    if (raw.startsWith('{')) {
      const j = JSON.parse(raw);
      const v = j?.reason || j?.id || j?.value || null;
      return v ? String(v).slice(0, 40) : null;
    }
    return raw.replace(/^"|"$/g, '').slice(0, 40) || null;
  } catch {
    return null;
  }
}

// ── Validation (mirrors bookingFormSchema's optional email / phone rules) ──
export const isValidEmail = (v: unknown): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
export const isValidPhone = (v: unknown): boolean => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
};

// ── Resume state (what we store so the flow can be restored) ─────────────
export interface BookingResumeState {
  date: string | null;          // yyyy-mm-dd (local calendar day)
  time: string;
  patientDetails: BookingFormValues['patientDetails'];
  serviceDetails: BookingFormValues['serviceDetails'] & { extendedHours?: boolean };
  locationDetails: BookingFormValues['locationDetails'];
  labOrder?: (BookingFormValues['labOrder'] & { uploadedPaths?: string[]; doctorOffice?: string }) | null;
  additionalPatients?: BookingFormValues['additionalPatients'];
  primaryKitsCount?: number;
}

const localDay = (d: unknown): string | null => {
  const dt = d instanceof Date ? d : d ? new Date(d as any) : null;
  if (!dt || isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const dobString = (v: unknown): string => {
  if (!v) return '';
  if (v instanceof Date) return localDay(v) || '';
  return String(v);
};

export function toResumeState(values: BookingFormValues): BookingResumeState {
  const v: any = values;
  return {
    date: localDay(v.date),
    time: String(v.time || ''),
    patientDetails: {
      firstName: v.patientDetails?.firstName || '',
      lastName: v.patientDetails?.lastName || '',
      email: v.patientDetails?.email || '',
      phone: v.patientDetails?.phone || '',
      dateOfBirth: dobString(v.patientDetails?.dateOfBirth) as any,
    },
    serviceDetails: {
      visitType: v.serviceDetails?.visitType || '',
      selectedService: v.serviceDetails?.selectedService || '',
      additionalNotes: v.serviceDetails?.additionalNotes || '',
      sameDay: !!v.serviceDetails?.sameDay,
      weekend: !!v.serviceDetails?.weekend,
      fasting: !!v.serviceDetails?.fasting,
      duration: v.serviceDetails?.duration,
      extendedHours: !!v.serviceDetails?.extendedHours,
    },
    locationDetails: {
      address: v.locationDetails?.address || '',
      city: v.locationDetails?.city || '',
      state: v.locationDetails?.state || 'FL',
      zipCode: v.locationDetails?.zipCode || '',
      isHomeAddress: v.locationDetails?.isHomeAddress ?? true,
      instructions: v.locationDetails?.instructions || '',
      locationType: v.locationDetails?.locationType || 'home',
      aptUnit: v.locationDetails?.aptUnit || '',
      gateCode: v.locationDetails?.gateCode || '',
      lat: v.locationDetails?.lat,
      lng: v.locationDetails?.lng,
    },
    labOrder: v.labOrder ? {
      skipped: !!v.labOrder.skipped,
      hasFile: !!v.labOrder.hasFile,
      labDestination: v.labOrder.labDestination || '',
      doctorFaxNumber: v.labOrder.doctorFaxNumber || '',
      doctorOffice: v.labOrder.doctorOffice || '',
      clientBilled: !!v.labOrder.clientBilled,
      uploadedPaths: Array.isArray(v.labOrder.uploadedPaths) ? v.labOrder.uploadedPaths.slice(0, 10) : [],
    } : null,
    additionalPatients: Array.isArray(v.additionalPatients) ? v.additionalPatients.slice(0, 6) : [],
    primaryKitsCount: v.primaryKitsCount ? Number(v.primaryKitsCount) : undefined,
  };
}

/** Partial form values to feed react-hook-form's reset(). */
export function resumeStateToForm(state: BookingResumeState, current: BookingFormValues): BookingFormValues {
  const out: any = { ...current };
  if (state.date) {
    const d = new Date(`${state.date}T12:00:00`);
    if (!isNaN(d.getTime())) out.date = d;
  }
  out.time = state.time || '';
  out.patientDetails = { ...current.patientDetails, ...state.patientDetails };
  out.serviceDetails = { ...current.serviceDetails, ...state.serviceDetails };
  out.locationDetails = { ...current.locationDetails, ...state.locationDetails };
  if (state.labOrder) out.labOrder = { ...(current as any).labOrder, ...state.labOrder };
  if (state.additionalPatients) out.additionalPatients = state.additionalPatients;
  if (state.primaryKitsCount) out.primaryKitsCount = state.primaryKitsCount;
  return out as BookingFormValues;
}

export function labOrderStatus(state: BookingResumeState): 'uploaded' | 'skipped' | 'pending' | 'unknown' {
  const lo = state.labOrder;
  if (!lo) return 'unknown';
  if (lo.hasFile || (lo.uploadedPaths && lo.uploadedPaths.length > 0)) return 'uploaded';
  if (lo.skipped) return lo.doctorOffice || lo.doctorFaxNumber ? 'pending' : 'skipped';
  return 'unknown';
}

// ── Step keys ← → BookingFlow internals ──────────────────────────────────
// Same slugs analytics.trackFunnelStage uses (STEP_LABELS in BookingFlow).
export type StepKey = 'visit_type' | 'service' | 'date_time' | 'patient_info' | 'address' | 'lab_order' | 'checkout';

export function stepKeyFromLabel(label: string): StepKey {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') as StepKey;
}

/** Internal BookingFlow state for a step key (BookingStep enum values). */
export function flowPositionForStep(key: StepKey | string | null | undefined): { step: number; showDatePicker: boolean; showLabOrder: boolean } {
  switch (key) {
    case 'date_time': return { step: 1, showDatePicker: true, showLabOrder: false };
    case 'address': return { step: 3, showDatePicker: false, showLabOrder: false };
    case 'lab_order': return { step: 3, showDatePicker: false, showLabOrder: true };
    case 'checkout': return { step: 4, showDatePicker: false, showLabOrder: false };
    case 'patient_info':
    default: return { step: 2, showDatePicker: false, showLabOrder: false };
  }
}

// ── Server calls ─────────────────────────────────────────────────────────
export interface DraftPayload {
  session_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  visit_type: string | null;
  service_type: string | null;
  selected_date: string | null;
  selected_time: string | null;
  fasting: boolean;
  visit_reason: string | null;
  lab_order_status: ReturnType<typeof labOrderStatus>;
  step_key: StepKey;
  step_reached: number;
  resume_state: BookingResumeState;
  source: string | null;
  landing_page: string | null;
  utm: Record<string, string> | null;
  sms_consent: boolean;
  sms_consent_text: string;
}

export function buildDraftPayload(values: BookingFormValues, ctx: { stepKey: StepKey; stepReached: number; source: string; smsConsent: boolean }): DraftPayload | null {
  const email = String(values.patientDetails?.email || '').trim();
  const phone = String(values.patientDetails?.phone || '').trim();
  const okEmail = isValidEmail(email);
  const okPhone = isValidPhone(phone);
  if (!okEmail && !okPhone) return null;

  const state = toResumeState(values);
  const attr = getSessionAttribution();
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer_url'] as const) {
    if ((attr as any)[k]) utm[k] = String((attr as any)[k]);
  }
  const vt = state.serviceDetails.visitType || null;
  return {
    session_id: getDraftSessionId(),
    first_name: state.patientDetails.firstName || null,
    last_name: state.patientDetails.lastName || null,
    email: okEmail ? email : null,
    phone: okPhone ? phone : null,
    visit_type: vt,
    service_type: state.serviceDetails.selectedService || vt,
    selected_date: state.date,
    selected_time: state.time || null,
    fasting: !!state.serviceDetails.fasting || vt === 'fasting-blood-draw',
    visit_reason: getVisitReasonSafe(),
    lab_order_status: labOrderStatus(state),
    step_key: ctx.stepKey,
    step_reached: ctx.stepReached,
    resume_state: state,
    source: ctx.source || null,
    landing_page: attr.landing_page || (typeof window !== 'undefined' ? window.location.pathname : null),
    utm: Object.keys(utm).length ? utm : null,
    sms_consent: !!ctx.smsConsent && okPhone,
    sms_consent_text: SMS_CONSENT_TEXT,
  };
}

const headers = () => ({ 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` });

/** Fire-and-forget safe: resolves false on any failure, never throws. */
export async function upsertBookingDraft(payload: DraftPayload, retry = true): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/booking-draft-upsert`, {
      method: 'POST', headers: headers(), body: JSON.stringify(payload), keepalive: true,
    });
    const j = await r.json().catch(() => ({}));
    if (j?.closed && retry) {
      // This tab's previous draft was already booked / stopped — start a new one.
      return upsertBookingDraft({ ...payload, session_id: rotateDraftSessionId() }, false);
    }
    return !!j?.ok;
  } catch {
    return false;
  }
}

export interface ResolvedDraft {
  ok: boolean;
  expired?: boolean;
  booked?: boolean;
  error?: string;
  draft?: {
    id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
    visit_type: string | null; service_type: string | null; selected_date: string | null; selected_time: string | null;
    fasting: boolean | null; visit_reason: string | null; lab_order_status: string | null; step_key: StepKey | null; step_reached: number | null;
    resume_state: BookingResumeState | null; sms_consent: boolean; expires_at: string | null;
  };
  slot?: { requested: { date: string; time: string | null } | null; available: boolean; alternatives: Array<{ date: string; time: string; label: string }> };
}

export async function resolveBookingDraft(token: string): Promise<ResolvedDraft> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/booking-draft-resolve?token=${encodeURIComponent(token)}`, { headers: headers() });
    return await r.json();
  } catch (e: any) {
    return { ok: false, error: e?.message || 'network' };
  }
}

// ── Hand-off from /book/resume/:token to /book-now ──────────────────────
export interface ResumeHandoff {
  draft: NonNullable<ResolvedDraft['draft']>;
  /** Slot the patient picked on the resume page when their original was gone. */
  override?: { date: string; time: string } | null;
  /** Land on the date/time step instead of where they left off. */
  pickNewTime?: boolean;
}

export function stashResume(h: ResumeHandoff): void {
  try { sessionStorage.setItem(RESUME_KEY, JSON.stringify(h)); } catch { /* ignore */ }
}

export function takeResume(): ResumeHandoff | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESUME_KEY);
    const parsed = JSON.parse(raw);
    return parsed?.draft ? parsed : null;
  } catch {
    return null;
  }
}
