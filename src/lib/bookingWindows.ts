/**
 * Booking-window rules by membership tier.
 *
 * Time-of-day scarcity is ConveLabs's PRIMARY value lever for membership —
 * morning fasting slots are the genuinely scarce resource, so tiers unlock
 * windows of the day progressively:
 *
 *   Non-member:  9am–1:30pm non-fasting, 6am–9am fasting ONLY (Mon–Fri)
 *   Regular:     6am–1:30pm Mon–Fri + 6am–9am Saturday
 *   VIP:         6am–6:30pm Mon–Fri + 6am–11am Saturday  (2pm+ is VIP-only
 *                until daily 5pm-prior unlock opens it to everyone)
 *   Concierge:   anytime, any day (incl. same-day + Sunday-by-request)
 *   AdventHealth destination:  6am–7:30pm Mon–Sun (specimen routes only to
 *                AdventHealth; bypasses tier windows entirely)
 *
 * The server (create-appointment-checkout) MUST mirror this logic — this
 * file is the source of truth for the frontend; the server duplicates
 * the relevant checks inline since edge fns can't import from src/.
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
  /** Ranges allowed when patient IS fasting. Empty = no fasting slots that day. */
  fastingRanges: TimeRange[];
  /** Ranges allowed when patient is NOT fasting. */
  nonFastingRanges: TimeRange[];
}

// ─────────────────────────────────────────────────────────────
// TIER RULES
// ─────────────────────────────────────────────────────────────

const NON_MEMBER: BookingWindow[] = [
  // Mon–Fri: fasting 6–9am, non-fasting 9am–1:30pm (extended 2026-04-25)
  ...[1, 2, 3, 4, 5].map(d => ({
    dayOfWeek: d,
    fastingRanges: [{ start: '06:00', end: '09:00', label: 'Morning fasting' }],
    nonFastingRanges: [{ start: '09:00', end: '13:30', label: 'Routine (9 AM – 1:30 PM)' }],
  })),
  // Sat/Sun: no non-member booking
];

const REGULAR: BookingWindow[] = [
  ...[1, 2, 3, 4, 5].map(d => ({
    dayOfWeek: d,
    fastingRanges: [{ start: '06:00', end: '09:00', label: 'Morning fasting' }],
    nonFastingRanges: [{ start: '06:00', end: '13:30', label: 'Morning + early afternoon' }],
  })),
  // Saturday 6–9am only
  {
    dayOfWeek: 6,
    fastingRanges: [{ start: '06:00', end: '09:00', label: 'Saturday morning fasting' }],
    nonFastingRanges: [{ start: '06:00', end: '09:00', label: 'Saturday morning' }],
  },
];

const VIP: BookingWindow[] = [
  ...[1, 2, 3, 4, 5].map(d => ({
    dayOfWeek: d,
    fastingRanges: [{ start: '06:00', end: '09:00', label: 'Morning fasting' }],
    nonFastingRanges: [{ start: '06:00', end: '18:30', label: 'All day (until 6:30 PM)' }],
  })),
  // Saturday 6–11am
  {
    dayOfWeek: 6,
    fastingRanges: [{ start: '06:00', end: '09:00', label: 'Saturday morning fasting' }],
    nonFastingRanges: [{ start: '06:00', end: '11:00', label: 'Saturday morning' }],
  },
];

const CONCIERGE: BookingWindow[] = [
  // Every day, all day — 6am–8pm on-demand
  ...[0, 1, 2, 3, 4, 5, 6].map(d => ({
    dayOfWeek: d,
    fastingRanges: [{ start: '06:00', end: '20:00', label: 'Concierge — anytime' }],
    nonFastingRanges: [{ start: '06:00', end: '20:00', label: 'Concierge — anytime' }],
  })),
];

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
 * Given a proposed (date, time) + patient tier + fasting flag, returns whether
 * the booking is allowed and, if not, a short reason + alternative slots +
 * optional upgrade CTA ("Upgrade to VIP to book at 1pm").
 */
export function isBookingAllowed(opts: {
  tier: MemberTier;
  dateIso: string;     // YYYY-MM-DD
  time: string;        // any parseable
  isFasting: boolean;
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

  const relevantRanges = opts.isFasting ? dayRule.fastingRanges : dayRule.nonFastingRanges;

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
  const betterTier = nextTierThatAllows(dow, hhmm, opts.isFasting, opts.tier);

  const fastingLabel = opts.isFasting ? 'fasting' : 'non-fasting';
  return {
    allowed: false,
    reason: `Your tier's ${fastingLabel} booking windows on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow]} don't include ${formatTo12h(hhmm)}.`,
    suggestions,
    upgradeCTA: betterTier
      ? { toTier: betterTier, message: `Upgrade to ${betterTier.toUpperCase()} to unlock ${formatTo12h(hhmm)}.` }
      : undefined,
  };
}

function nextTierThatAllows(dow: number, hhmm: string, isFasting: boolean, fromTier: MemberTier): MemberTier | null {
  const chain: MemberTier[] = ['none', 'member', 'vip', 'concierge'];
  const idx = chain.indexOf(fromTier);
  for (let i = idx + 1; i < chain.length; i++) {
    const t = chain[i];
    const rules = TIER_RULES[t];
    const day = rules.find(r => r.dayOfWeek === dow);
    if (!day) continue;
    const ranges = isFasting ? day.fastingRanges : day.nonFastingRanges;
    if (ranges.some(r => timeInRange(hhmm, r))) return t;
  }
  return null;
}

/**
 * Returns every allowed 30-min slot for a tier on a given date + fasting flag.
 * Used by the booking-form time picker to grey out disallowed times.
 */
export function getAllowedSlotsForDate(opts: {
  tier: MemberTier;
  dateIso: string;
  isFasting: boolean;
}): string[] {
  const hhmm = normalizeTime('06:00')!;
  const d = new Date(opts.dateIso + 'T12:00:00');
  const dow = d.getDay();
  const rules = TIER_RULES[opts.tier] || TIER_RULES['none'];
  const dayRule = rules.find(r => r.dayOfWeek === dow);
  if (!dayRule) return [];
  const ranges = opts.isFasting ? dayRule.fastingRanges : dayRule.nonFastingRanges;
  return Array.from(new Set(ranges.flatMap(rangeToSlots))).map(formatTo12h);
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
