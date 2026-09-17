/**
 * Booking-window rules by membership tier.
 *
 * Updated 2026-08-11:
 *   - Standard patient booking should not be choked by legacy morning-only
 *     or 1:30 PM cutoffs in the public flow.
 *   - Non-members + regular members can book the shared daytime window:
 *     7 AM – 6 PM.
 *   - VIP / Concierge unlock the premium early-morning lane:
 *     6 AM – 6 PM.
 *   - After-hours access beyond 6 PM is handled elsewhere in the booking
 *     flow (phleb on-duty / concierge logic), not here.
 */

export type MemberTier = 'none' | 'member' | 'vip' | 'concierge';

export interface TimeRange {
  /** "HH:MM" 24-hour, inclusive start */
  start: string;
  /** "HH:MM" 24-hour, exclusive end */
  end: string;
  /** Label for UI display (e.g. "Morning fasting") */
  label?: string;
}

export interface BookingWindow {
  /** 0=Sun, 1=Mon, ... 6=Sat */
  dayOfWeek: number;
  /** Shared slot ranges for the tier. Fasting prep never changes slot access. */
  ranges: TimeRange[];
}

// ─────────────────────────────────────────────────────────────
// TIER RULES
// ─────────────────────────────────────────────────────────────

// Shared public/member window: 7 AM – 6 PM.
const STANDARD_HOURS: BookingWindow[] = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  dayOfWeek: d,
  ranges: [{ start: '07:00', end: '18:00', label: '7 AM – 6 PM' }],
}));

// VIP / Concierge unlock the earlier 6-7 AM lane.
const VIP_HOURS: BookingWindow[] = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  dayOfWeek: d,
  ranges: [{ start: '06:00', end: '18:00', label: '6 AM – 6 PM' }],
}));

const NON_MEMBER = STANDARD_HOURS;
const REGULAR = STANDARD_HOURS;
const VIP = VIP_HOURS;
const CONCIERGE = VIP_HOURS;

const TIER_RULES: Record<MemberTier, BookingWindow[]> = {
  'none': NON_MEMBER,
  'member': REGULAR,
  'vip': VIP,
  'concierge': CONCIERGE,
};

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/** Parse "9:00 AM", "9 AM", "09:00", "9:00:00" → 24-hour "HH:MM". */
export function normalizeTime(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // 24-hour "09:00" / "09:00:00"
  const mil = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (mil) {
    const h = Math.min(23, Math.max(0, parseInt(mil[1], 10)));
    return `${String(h).padStart(2, '0')}:${mil[2]}`;
  }
  // 12-hour "9:00 AM" or "9 PM"
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = ampm[2] || '00';
    const p = ampm[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  return null;
}

function timeInRange(hhmm: string, r: TimeRange): boolean {
  return hhmm >= r.start && hhmm < r.end;
}

function rangeToSlots(r: TimeRange): string[] {
  // Return :00 / :30 slot starts within the range (for suggestions)
  const out: string[] = [];
  const [sh, sm] = r.start.split(':').map(Number);
  const [eh, em] = r.end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  for (let m = startMin; m < endMin; m += 30) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return out;
}

function formatTo12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

export interface AllowedCheck {
  allowed: boolean;
  reason?: string;
  /** Suggestions (max 5) for nearby open slots within the patient's tier window */
  suggestions: string[];
  upgradeCTA?: { toTier: MemberTier; message: string };
}

/**
 * Given a proposed (date, time) + patient tier, returns whether
 * the booking is allowed and, if not, a short reason + alternative slots +
 * optional upgrade CTA ("Upgrade to VIP to book at 1pm").
 */
export function isBookingAllowed(opts: {
  tier: MemberTier;
  dateIso: string;     // YYYY-MM-DD
  time: string;        // any parseable
}): AllowedCheck {
  const hhmm = normalizeTime(opts.time);
  if (!hhmm) {
    return { allowed: false, reason: 'Invalid time format', suggestions: [] };
  }

  const d = new Date(opts.dateIso + 'T12:00:00');
  const dow = d.getDay();

  const rules = TIER_RULES[opts.tier] || TIER_RULES['none'];
  const dayRule = rules.find(r => r.dayOfWeek === dow);

  if (!dayRule) {
    // This tier doesn't book on this day at all
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
    return {
      allowed: false,
      reason: opts.tier === 'none'
        ? `We don't take non-member bookings on ${dayName}. Become a member to unlock.`
        : `Your tier doesn't include ${dayName} bookings.`,
      suggestions: [],
      upgradeCTA: opts.tier !== 'concierge'
        ? {
            toTier: opts.tier === 'none' ? 'member' : opts.tier === 'member' ? 'vip' : 'concierge',
            message: opts.tier === 'vip' ? 'Concierge members book any day, any time.' : 'Upgrade to unlock this day.',
          }
        : undefined,
    };
  }

  const relevantRanges = dayRule.ranges;

  // Is the time within ANY allowed range?
  const allowed = relevantRanges.some(r => timeInRange(hhmm, r));
  if (allowed) return { allowed: true, suggestions: [] };

  // Not allowed — build suggestions from the patient's OWN day windows
  const suggestions = Array.from(
    new Set(
      relevantRanges.flatMap(rangeToSlots)
    )
  ).slice(0, 5).map(formatTo12h);

  // Could a higher tier book this time? Build the upgrade CTA.
  const betterTier = nextTierThatAllows(dow, hhmm, opts.tier);

  return {
    allowed: false,
    reason: `Your tier's booking window on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow]} doesn't include ${formatTo12h(hhmm)}.`,
    suggestions,
    upgradeCTA: betterTier
      ? { toTier: betterTier, message: `Upgrade to ${betterTier.toUpperCase()} to unlock ${formatTo12h(hhmm)}.` }
      : undefined,
  };
}

function nextTierThatAllows(dow: number, hhmm: string, fromTier: MemberTier): MemberTier | null {
  const chain: MemberTier[] = ['none', 'member', 'vip', 'concierge'];
  const idx = chain.indexOf(fromTier);
  for (let i = idx + 1; i < chain.length; i++) {
    const t = chain[i];
    const rules = TIER_RULES[t];
    const day = rules.find(r => r.dayOfWeek === dow);
    if (!day) continue;
    const ranges = day.ranges;
    if (ranges.some(r => timeInRange(hhmm, r))) return t;
  }
  return null;
}

/**
 * Returns every allowed 30-min slot for a tier on a given date.
 * Used by the booking-form time picker to grey out disallowed times.
 */
export function getAllowedSlotsForDate(opts: {
  tier: MemberTier;
  dateIso: string;
}): string[] {
  const d = new Date(opts.dateIso + 'T12:00:00');
  const dow = d.getDay();
  const rules = TIER_RULES[opts.tier] || TIER_RULES['none'];
  const dayRule = rules.find(r => r.dayOfWeek === dow);
  if (!dayRule) return [];
  return Array.from(new Set(dayRule.ranges.flatMap(rangeToSlots))).map(formatTo12h);
}

// ─────────────────────────────────────────────────────────────
// FASTING DETECTION (frontend heuristic; OCR-aware)
// ─────────────────────────────────────────────────────────────

/**
 * Same logic as phlebHelpers.detectFastingRequirement — exposed here so the
 * time picker can auto-set the isFasting flag from uploaded lab order OCR.
 * Keep in sync.
 */
export function isLikelyFasting(signals: { panels?: string[] | null; ocrText?: string | null; serviceName?: string | null }): boolean {
  const everything = [
    (signals.panels || []).join(' '),
    signals.ocrText || '',
    signals.serviceName || '',
  ].join(' ').toLowerCase();
  return /\bfasting\b|\bfasted\b|\bnpo\b|lipid|cholesterol|\bcmp\b|comprehensive\s*metabolic|\bbmp\b|basic\s*metabolic|\bglucose\b(?!\s*tolerance)|fasting\s*insulin|iron\s*panel|ferritin|\bhepatic\b/.test(everything);
}
