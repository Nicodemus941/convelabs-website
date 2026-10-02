import React from 'react';
import { MessageSquareText, Lock, MapPin, FileText, ShieldCheck, HeartHandshake } from 'lucide-react';
import { TRUST_CLAIMS } from '@/content/trustClaims';
import { VisitReasonId, getVisitReason } from '@/lib/visitReason';
import { FastingIntent } from '@/lib/slotGuidance';
import { useFastingIntent } from '@/hooks/useFastingIntent';

/** Display-step keys produced by BookingFlow (STEP_LABELS, slugified). */
export type BookingStageKey =
  | 'visit_type' | 'service' | 'date_time' | 'patient_info' | 'address' | 'lab_order' | 'checkout';

interface StepReassuranceProps {
  stepKey: BookingStageKey;
  /** Defaults to the persisted reason (`cl_visit_reason`). */
  reason?: VisitReasonId | null;
  className?: string;
}

type Line = { text: string; icon: React.ComponentType<{ className?: string }> };

/** One short line per step, tuned to that step's worry. */
const BASE: Partial<Record<BookingStageKey, Line>> = {
  date_time:    { icon: MessageSquareText, text: 'We text you when we’re on the way — no waiting room.' },
  patient_info: { icon: Lock,              text: 'Private and HIPAA-protected.' },
  address:      { icon: MapPin,            text: 'We come to your home or office anywhere in our service area.' },
  lab_order:    { icon: FileText,          text: 'No order yet? We’ll get it from your doctor.' },
  checkout:     { icon: ShieldCheck,       text: TRUST_CLAIMS.onTimeWaived },
};

/**
 * Reason-aware overrides, only where the reason genuinely changes the worry.
 * Every sentence here is built from owner-approved claims (trustClaims.ts)
 * or existing site copy — nothing new is promised.
 */
const BY_REASON: Partial<Record<VisitReasonId, Partial<Record<BookingStageKey, Line>>>> = {
  needles: {
    date_time: { icon: HeartHandshake, text: `Nervous about needles? ${TRUST_CLAIMS.drawTime} ${TRUST_CLAIMS.collectionAccuracy}.` },
    checkout:  { icon: HeartHandshake, text: `${TRUST_CLAIMS.drawTime} ${TRUST_CLAIMS.onTimeWaived}` },
  },
  fasting: {
    date_time: { icon: MessageSquareText, text: 'Fasting appointments from 6:00 AM — we text you when we’re on the way.' },
  },
  busy: {
    date_time: { icon: MessageSquareText, text: 'Pick the window that fits your day — we text you when we’re on the way.' },
    address:   { icon: MapPin, text: 'Home or office — we come to you anywhere in our service area.' },
  },
  'loved-one': {
    address:      { icon: MapPin, text: 'Enter their address — we come to them anywhere in our service area.' },
    patient_info: { icon: Lock,   text: 'Booking for someone else? Enter their details here. Private and HIPAA-protected.' },
  },
  kids: {
    patient_info: { icon: Lock,          text: 'Booking for your child? Add them as the patient. Private and HIPAA-protected.' },
    date_time:    { icon: HeartHandshake, text: `At home, where they feel safe — ${TRUST_CLAIMS.drawTime.charAt(0).toLowerCase()}${TRUST_CLAIMS.drawTime.slice(1)}` },
  },
  'skip-waiting-room': {
    date_time: { icon: MessageSquareText, text: 'No waiting room — we text you when we’re on the way.' },
  },
};

/**
 * Date/time step: a known fasting answer beats the reason-based line. The
 * slot grid itself shows SLOT_GUIDANCE_COPY, so this line explains the
 * ordering/badges instead of repeating it.
 */
const BY_FASTING: Record<Exclude<FastingIntent, 'unknown'>, Line> = {
  fasting:       { icon: MessageSquareText, text: 'Your earliest slots come first and are marked “Best for fasting” — we text you when we’re on the way.' },
  'not-fasting': { icon: MessageSquareText, text: '“Recommended” slots leave the early ones for fasting patients — we text you when we’re on the way.' },
};

export function reassuranceFor(
  stepKey: BookingStageKey,
  reason: VisitReasonId | null,
  fasting: FastingIntent = 'unknown',
): Line | null {
  if (stepKey === 'date_time' && fasting !== 'unknown') return BY_FASTING[fasting];
  return (reason && BY_REASON[reason]?.[stepKey]) || BASE[stepKey] || null;
}

const StepReassurance: React.FC<StepReassuranceProps> = ({ stepKey, reason, className = '' }) => {
  const r = reason === undefined ? getVisitReason() : reason;
  const fasting = useFastingIntent();
  const line = reassuranceFor(stepKey, r, fasting);
  if (!line) return null;
  const Icon = line.icon;
  return (
    <p className={`flex items-start gap-2 text-sm text-brand-gray-warm ${className}`} role="note">
      <Icon className="h-4 w-4 text-conve-red flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>{line.text}</span>
    </p>
  );
};

export default StepReassurance;
