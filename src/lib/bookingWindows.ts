/**
 * Booking-window rules by membership tier.
 *
 * Time-of-day scarcity is ConveLabs's PRIMARY value lever for membership —
 * morning fasting slots are the genuinely scarce resource, so tiers unlock
 * windows of the day progressively:
 *
 * Updated 2026-04-25 (after VIP carve-out for 1:30–2:30 PM):
 *   Non-member / Regular: Mon–Sun 6 AM – 1:30 PM
 *   VIP / Concierge:      Mon–Sun 6 AM – 2:30 PM
 *   AdventHealth destination override: 6 AM – 6 PM Mon–Sun, ALL TIERS
 *   5 PM-prior unlock: if no VIP has booked tomorrow by 5 PM, the 1:30–2:30
 *   window opens to everyone (waitlist notified first).
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

// Non-member / Regular: 6 AM – 1:30 PM Mon-Sun
const PUBLIC_HOURS: BookingWindow[] = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  dayOfWeek: d,
  fastingRanges: [{ start: '06:00', end: '09:00', label: 'Morning fasting (6–9 AM)' }],
  nonFastingRanges: [{ start: '06:00', end: '13:30', label: '6 AM – 1:30 PM' }],
}));
// VIP / Concierge: extra hour 1:30–2:30 PM (the VIP after-hours)
const VIP_HOURS: BookingWindow[] = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  dayOfWeek: d,
  fastingRanges: [{ start: '06:00', end: '09:00', label: 'Morning fasting (6–9 AM)' }],
  nonFastingRanges: [{ start: '06:00', end: '14:30', label: '6 AM – 2:30 PM (VIP after-hours)' }],
}));
const NON_MEMBER = PUBLIC_HOURS;
const REGULAR = PUBLIC_HOURS;
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
