/**
 * VISIT REASON — "What brings you here?"
 *
 * An optional, single-select reason the patient taps on the Meta landing
 * page (or at the top of the booking flow). It is persisted for the tab in
 * sessionStorage (`cl_visit_reason`), carried on the deep link as
 * `&reason=`, and echoed back in copy (hero subline, summary card, per-step
 * reassurance) so the flow feels like it heard them.
 *
 * Storage access is guarded: in-app browsers can throw on sessionStorage.
 */

export const VISIT_REASON_STORAGE_KEY = 'cl_visit_reason';

export type VisitReasonId =
  | 'skip-waiting-room'
  | 'fasting'
  | 'loved-one'
  | 'needles'
  | 'kids'
  | 'busy';

export interface VisitReasonCopy {
  /** Chip label. */
  label: string;
  /** Short echo for the hero subline / summary card. */
  echo: string;
}

export const VISIT_REASONS: Record<VisitReasonId, VisitReasonCopy> = {
  'skip-waiting-room': {
    label: 'Skip the lab waiting room',
    echo: 'Skip the waiting room — we come to you.',
  },
  fasting: {
    label: 'Fasting labs',
    echo: 'Fasting labs, done early — appointments from 6:00 AM.',
  },
  'loved-one': {
    label: 'Labs for a parent / loved one',
    echo: 'For someone you care for — we come to their home.',
  },
  needles: {
    label: 'Nervous about needles',
    echo: 'Nervous about needles? Most draws take under 10 minutes.',
  },
  kids: {
    label: "Kids' labs",
    echo: 'Labs for your child — at home, where they feel safe.',
  },
  busy: {
    label: 'Busy schedule / at work',
    echo: 'Fits your day — we come to your home or office.',
  },
};

export const VISIT_REASON_IDS = Object.keys(VISIT_REASONS) as VisitReasonId[];

export function isVisitReasonId(value: unknown): value is VisitReasonId {
  return typeof value === 'string' && value in VISIT_REASONS;
}

let memoryFallback: VisitReasonId | null = null;

export function getVisitReason(): VisitReasonId | null {
  try {
    const raw = window.sessionStorage.getItem(VISIT_REASON_STORAGE_KEY);
    if (isVisitReasonId(raw)) return raw;
  } catch {
    /* storage blocked */
  }
  return memoryFallback;
}

export function setVisitReason(reason: VisitReasonId | null): void {
  memoryFallback = reason;
  try {
    if (reason) window.sessionStorage.setItem(VISIT_REASON_STORAGE_KEY, reason);
    else window.sessionStorage.removeItem(VISIT_REASON_STORAGE_KEY);
  } catch {
    /* storage blocked — memory fallback keeps it for this page instance */
  }
}

/** Read `?reason=` off the current URL; returns null when absent/invalid. */
export function readVisitReasonFromUrl(): VisitReasonId | null {
  try {
    const raw = new URL(window.location.href).searchParams.get('reason');
    return isVisitReasonId(raw) ? raw : null;
  } catch {
    return null;
  }
}
