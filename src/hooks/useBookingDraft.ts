/**
 * useBookingDraft — the one hook BookingFlow calls for abandoned-booking
 * recovery. Two jobs:
 *
 *   1. Capture. From the Patient Info step onward, once the form holds a
 *      valid email or phone, debounce 1.5s and save a draft through
 *      booking-draft-upsert. Re-saves on every field change and on every
 *      step change, so the draft always reflects the furthest step and the
 *      latest values. Stops once the booking completes.
 *
 *   2. Restore. When the patient arrives from /book/resume/:token, the
 *      resume page stashes the resolved draft in sessionStorage; on mount we
 *      reset the form from it and jump to the step they left on (or to the
 *      date picker when their slot is gone and they chose to pick another).
 *
 * All BookingFlow state it needs is passed in, so the only edit to
 * BookingFlow.tsx is one import and one call.
 */

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { BookingFormValues } from '@/types/appointmentTypes';
import {
  SMS_CONSENT_FIELD, buildDraftPayload, flowPositionForStep, resumeStateToForm, stepKeyFromLabel,
  takeResume, upsertBookingDraft, rotateDraftSessionId,
} from '@/lib/bookingDraft';

const DEBOUNCE_MS = 1500;
/** Display-step index of "Patient Info" in BookingFlow's STEP_LABELS. */
const FIRST_CAPTURE_DISPLAY_STEP = 3;

export interface UseBookingDraftArgs {
  methods: UseFormReturn<BookingFormValues>;
  /** BookingStep enum value currently rendered. */
  currentStep: number;
  /** 0..6 marker index (computeDisplayStep). */
  displayStep: number;
  /** STEP_LABELS[displayStep]. */
  stepLabel: string;
  bookingSource: string;
  bookingComplete: boolean;
  restore: {
    setCurrentStep: (s: number) => void;
    setShowDatePicker: (v: boolean) => void;
    setShowLabOrder: (v: boolean) => void;
    prevStepRef: MutableRefObject<number>;
  };
}

export function useBookingDraft({ methods, currentStep, displayStep, stepLabel, bookingSource, bookingComplete, restore }: UseBookingDraftArgs): void {
  const timerRef = useRef<number | null>(null);
  const lastSentRef = useRef<string>('');
  const restoredRef = useRef(false);

  // ── 2. Restore (once, on mount) ─────────────────────────────────────
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const handoff = takeResume();
    if (!handoff?.draft) return;
    try {
      const { draft, override, pickNewTime } = handoff;
      const state = draft.resume_state;
      const current = methods.getValues();
      const next = state ? resumeStateToForm(state, current) : { ...current };
      // Fill identity even when the stored state is thin.
      next.patientDetails = {
        ...next.patientDetails,
        firstName: next.patientDetails.firstName || draft.first_name || '',
        lastName: next.patientDetails.lastName || draft.last_name || '',
        email: next.patientDetails.email || draft.email || '',
        phone: next.patientDetails.phone || draft.phone || '',
      };
      if (!next.serviceDetails.visitType && draft.visit_type) {
        next.serviceDetails = { ...next.serviceDetails, visitType: draft.visit_type, selectedService: next.serviceDetails.selectedService || draft.service_type || draft.visit_type };
      }
      if (override) {
        const d = new Date(`${override.date}T12:00:00`);
        if (!isNaN(d.getTime())) next.date = d;
        next.time = override.time;
      }
      (next as any)[SMS_CONSENT_FIELD] = !!draft.sms_consent;
      methods.reset(next as any);

      // A fresh session for this attempt — the old draft row keeps its own
      // sequence and is closed by the webhook when this one books.
      rotateDraftSessionId();

      const pos = pickNewTime
        ? flowPositionForStep('date_time')
        : flowPositionForStep(draft.step_key || 'patient_info');
      restore.prevStepRef.current = currentStep;
      restore.setShowDatePicker(pos.showDatePicker);
      restore.setShowLabOrder(pos.showLabOrder);
      restore.setCurrentStep(pos.step);

      const first = (draft.first_name || '').trim();
      toast.success(first ? `Welcome back, ${first} — we picked up where you left off.` : 'Welcome back — we picked up where you left off.');
    } catch (e) {
      console.warn('[booking-draft] restore failed:', e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 1. Capture ──────────────────────────────────────────────────────
  const schedule = (immediate = false) => {
    if (bookingComplete) return;
    if (displayStep < FIRST_CAPTURE_DISPLAY_STEP) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const values = methods.getValues();
      const payload = buildDraftPayload(values, {
        stepKey: stepKeyFromLabel(stepLabel),
        stepReached: displayStep,
        source: bookingSource,
        smsConsent: !!(values as any)[SMS_CONSENT_FIELD],
      });
      if (!payload) return;
      // Skip identical re-sends (step + fields unchanged).
      const sig = JSON.stringify([payload.step_key, payload.email, payload.phone, payload.first_name, payload.last_name, payload.selected_date, payload.selected_time, payload.sms_consent, payload.lab_order_status, payload.resume_state]);
      if (sig === lastSentRef.current) return;
      lastSentRef.current = sig;
      void upsertBookingDraft(payload);
    }, immediate ? 50 : DEBOUNCE_MS);
  };

  // Field changes.
  useEffect(() => {
    const sub = methods.watch((_values, info) => {
      // draftSmsConsent lives outside the zod schema, so widen the name.
      const name = String(info?.name || '');
      if (!name) return;
      if (
        name.startsWith('patientDetails') || name.startsWith('serviceDetails') || name.startsWith('locationDetails') ||
        name.startsWith('labOrder') || name.startsWith('additionalPatients') || name === 'date' || name === 'time' ||
        name === SMS_CONSENT_FIELD
      ) schedule();
    });
    return () => sub.unsubscribe();
  }, [methods, displayStep, stepLabel, bookingSource, bookingComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step changes — save right away so step_reached is never stale.
  useEffect(() => {
    schedule(true);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [displayStep, bookingComplete]); // eslint-disable-line react-hooks/exhaustive-deps
}
