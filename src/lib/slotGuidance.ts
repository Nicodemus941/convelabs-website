/**
 * FASTING-AWARE SLOT GUIDANCE — order + labels only, never availability.
 *
 * Owner data (last 12 months, non-cancelled appointments):
 *   fasting:     64% book before 9 AM, 24% 9 AM–noon, 11% noon+
 *   not fasting: 46% before 9 AM, 41% 9 AM–noon, 14% noon+
 * Non-fasting patients take the early slots fasting patients need, and the
 * afternoons sit underused. So: fasting → earliest first ("Best for
 * fasting"); not fasting → late-morning/afternoon featured first
 * ("Recommended") with every early slot still shown; unknown → untouched.
 *
 * Pure functions; the step passes its already-computed window list in and
 * renders whatever comes back. Nothing here touches slot generation,
 * booked/held sets, cutoffs or tier gating.
 */

export type FastingIntent = 'fasting' | 'not-fasting' | 'unknown';
export type SlotBucket = 'early' | 'late_morning' | 'afternoon';

export interface SlotWindow { time: string; label: string }

export interface SlotGuidance<W extends SlotWindow = SlotWindow> {
  intent: FastingIntent;
  /** Windows in the order to render. Same members as the input, no drops. */
  ordered: W[];
  /** time → badge text for the 1–2 featured slots. */
  badges: Record<string, string>;
  /** Short line shown above the grid (null when intent is unknown). */
  message: string | null;
  /** Bucket the guidance steered toward — for booking_slot_guidance_shown. */
  recommendedBucket: SlotBucket | null;
}

/** "9:15 AM" → minutes of day. Returns null for anything unparsable. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + mm;
}

/** <9 AM = early · 9–noon = late_morning · noon+ = afternoon (the owner's buckets). */
export function slotBucket(time: string | null | undefined): SlotBucket | null {
  const min = timeToMinutes(time);
  if (min === null) return null;
  if (min < 9 * 60) return 'early';
  if (min < 12 * 60) return 'late_morning';
  return 'afternoon';
}

/**
 * Service selection is the explicit answer and wins; the landing-page reason
 * ("Fasting labs") is a strong hint; an explicit form flag is honoured too.
 */
export function resolveFastingIntent(input: {
  selectedService?: string | null;
  fastingField?: boolean | null;
  reason?: string | null;
}): FastingIntent {
  const svc = input.selectedService || '';
  if (svc === 'fasting-blood-draw' || svc === 'glucose-tolerance') return 'fasting';
  if (svc === 'routine-blood-draw' || svc === 'stat-blood-draw') return 'not-fasting';
  if (input.fastingField === true) return 'fasting';
  if (input.reason === 'fasting') return 'fasting';
  return 'unknown';
}

export const SLOT_GUIDANCE_COPY: Record<FastingIntent, string | null> = {
  fasting: 'Fasting? Our earliest visits let you eat sooner.',
  'not-fasting': 'No fasting needed — any time works.',
  unknown: null,
};

/** Summary-card line. */
export const SLOT_GUIDANCE_SUMMARY: Record<FastingIntent, string | null> = {
  fasting: 'Fasting visit — earliest slot',
  'not-fasting': 'No fasting needed',
  unknown: null,
};

export function buildSlotGuidance<W extends SlotWindow>(
  windows: W[],
  intent: FastingIntent,
  isAvailable: (time: string) => boolean,
  featuredCount = 2,
): SlotGuidance<W> {
  const message = SLOT_GUIDANCE_COPY[intent];
  if (intent === 'unknown') {
    return { intent, ordered: windows, badges: {}, message, recommendedBucket: null };
  }

  if (intent === 'fasting') {
    // Chronological already; feature the first available ones.
    const badges: Record<string, string> = {};
    for (const w of windows) {
      if (Object.keys(badges).length >= featuredCount) break;
      if (isAvailable(w.time)) badges[w.time] = 'Best for fasting';
    }
    return { intent, ordered: windows, badges, message, recommendedBucket: 'early' };
  }

  // not-fasting: late-morning + afternoon first (each group stays
  // chronological), early slots follow — all of them, nothing hidden.
  const later = windows.filter(w => slotBucket(w.time) !== 'early');
  const early = windows.filter(w => slotBucket(w.time) === 'early');
  const badges: Record<string, string> = {};
  for (const w of later) {
    if (Object.keys(badges).length >= featuredCount) break;
    if (isAvailable(w.time)) badges[w.time] = 'Recommended';
  }
  const recommendedBucket: SlotBucket = later.some(w => slotBucket(w.time) === 'afternoon' && isAvailable(w.time))
    ? 'afternoon'
    : 'late_morning';
  return { intent, ordered: [...later, ...early], badges, message, recommendedBucket };
}
