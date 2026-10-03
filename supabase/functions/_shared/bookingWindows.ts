/**
 * Booking-window + premium-hours rules.
 *
 * SINGLE SOURCE OF TRUTH for *when* a patient may book and whether the slot
 * carries the premium-hours fee. The server copy lives at
 * supabase/functions/_shared/bookingWindows.ts and MUST stay byte-identical
 * (edge functions can't import from src/). No imports here on purpose so the
 * same file runs in the browser, in Jest and in Deno.
 *
 * Owner-approved model (2026-10-02) — replaces the tier padlocks:
 *
 *   WEEKDAYS (Mon–Fri)
 *     05:00–07:00  premium   anyone · +$10 non-members · free for every paid member
 *     07:00–13:00  standard  anyone · normal price
 *     13:00–15:00  premium   anyone · +$10 non-members · free for every paid member
 *                            (replaces the old VIP-only 1:30–2:30 PM hour)
 *     Fasting starts must be before 12:00 (05:00–12:00). Non-fasting 05:00–15:00.
 *
 *   WEEKENDS (Sat/Sun) 06:00–11:00
 *     VIP + Concierge only, normal price.
 *     Within 24 h of the slot start every still-open slot opens to everyone:
 *     Regular members pay nothing extra, non-members +$10.
 *     Outside 24 h non-VIP users see "VIP & Concierge — opens to everyone
 *     24 hrs before" (waitlist / upsell, never a dead-end padlock).
 *
 *   ONE TIMING FEE PER VISIT — see resolveTimingFee():
 *     same-day $100  >  after-hours $50  >  weekend $75  >  premium hours $10
 *   The first fee that applies to the tier wins; the rest are not added.
 *   AdventHealth-destination visits never carry the premium fee.
 *
 *   OFFICE HOURS WIN: pass the day's saved office hours (system_settings
 *   'office_hours' → days[dow]) as `officeDay`; a closed day, or a start
 *   outside open–close, is closed for online booking for every tier — the
 *   weekend VIP window and the AdventHealth override included.
 *
 *   LEFT ALONE (handled by the callers, not here):
 *     • the AdventHealth destination access override (6 AM–6 PM, all tiers)
 */

export type MemberTier = 'none' | 'member' | 'vip' | 'concierge';

/** One saved office day: system_settings 'office_hours' → value.days[dow]. */
export interface OfficeDay {
  /** 'HH:MM' 24-hour */
  open: string;
  close: string;
  closed: boolean;
}

export const SAME_DAY_FEE_CENTS = 10000;
export const AFTER_HOURS_FEE_CENTS = 5000;
export const WEEKEND_FEE_CENTS = 7500;
export const PREMIUM_FEE_CENTS = 1000;
export const PREMIUM_FEE_DOLLARS = PREMIUM_FEE_CENTS / 100;
/** A weekend slot opens to everyone this many hours before its start. */
export const WEEKEND_RELEASE_HOURS = 24;
/** Fasting starts must be strictly before this (24h "HH:MM"). */
export const FASTING_LAST_START = '12:00';

export const WEEKDAY_WINDOWS = {
  open: '05:00',
  standardStart: '07:00',
  standardEnd: '13:00',
  close: '15:00',
} as const;

export const WEEKEND_WINDOWS = {
  open: '06:00',
  close: '11:00',
} as const;

export const VIP_HOLD_LABEL = 'VIP & Concierge — opens to everyone 24 hrs before';
export const PREMIUM_BADGE_NON_MEMBER = `+$${PREMIUM_FEE_DOLLARS} · Free for members`;
export const PREMIUM_BADGE_MEMBER = 'Premium hours';

export type SlotWindow = 'standard' | 'premium' | 'weekend' | 'closed';

export interface SlotRule {
  /** Can THIS tier book THIS slot right now? */
  bookable: boolean;
  window: SlotWindow;
  /** The office is closed then (saved office hours) — closed for every tier and destination. */
  officeClosed?: boolean;
  /** Premium fee in cents for this tier at this slot, before stacking rules. 0 for paid members. */
  feeCents: number;
  /** The slot carries the premium fee for non-members (members see "Premium hours"). */
  premiumEligible: boolean;
  /** Weekend slot still reserved for VIP/Concierge (outside the 24 h release). */
  vipHold: boolean;
  /** ISO instant at which a vipHold slot opens to everyone. */
  releaseAt?: string;
  /** Short human reason when not bookable. */
  reason?: string;
  /** Membership upsell when a higher tier could book it. */
  upgradeCTA?: { toTier: MemberTier; message: string };
}

export function isPaidMember(tier: MemberTier | string | null | undefined): boolean {
  return tier === 'member' || tier === 'vip' || tier === 'concierge';
}

export function isVipOrConcierge(tier: MemberTier | string | null | undefined): boolean {
  return tier === 'vip' || tier === 'concierge';
}

/**
 * Is the office open for a start at `hhmm` on a day with these saved hours?
 * No saved hours (undefined/null) → open (the caller has no settings yet).
 */
export function isOfficeOpenAt(officeDay: OfficeDay | null | undefined, hhmm: string): boolean {
  if (!officeDay) return true;
  if (officeDay.closed) return false;
  const ok = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
  if (!ok(officeDay.open) || !ok(officeDay.close)) return true;
  return hhmm >= officeDay.open && hhmm < officeDay.close;
}

// ─────────────────────────────────────────────────────────────
// TIME HELPERS
// ─────────────────────────────────────────────────────────────

/** Parse "9:00 AM", "9 AM", "09:00", "9:00:00" → 24-hour "HH:MM". */
export function normalizeTime(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // 24-hour "09:00" / "09:00:00"
  const mil = s.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
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

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatTo12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

/** 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD" calendar date (no TZ shift). */
export function dayOfWeek(dateIso: string): number {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
  // Date.UTC avoids the local-midnight DST edge; weekday is TZ-independent for a noon stamp.
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function isWeekendDate(dateIso: string): boolean {
  const dow = dayOfWeek(dateIso);
  return dow === 0 || dow === 6;
}

// US Eastern offset, computed from the DST rules (stable since 2007) so the
// release clock is the same on a Deno edge worker (UTC) and in the browser.
function isUSEasternDST(utcMs: number): boolean {
  const year = new Date(utcMs).getUTCFullYear();
  const secondSundayMarch = (() => {
    const dow = new Date(Date.UTC(year, 2, 1)).getUTCDay();
    const firstSun = 1 + ((7 - dow) % 7);
    return Date.UTC(year, 2, firstSun + 7, 7); // 2 AM EST = 07:00 UTC
  })();
  const firstSundayNov = (() => {
    const dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
    const firstSun = 1 + ((7 - dow) % 7);
    return Date.UTC(year, 10, firstSun, 6); // 2 AM EDT = 06:00 UTC
  })();
  return utcMs >= secondSundayMarch && utcMs < firstSundayNov;
}

/** The absolute instant (UTC ms) a slot starts, interpreting date+time as US Eastern wall-clock. */
export function slotStartUtcMs(dateIso: string, hhmm: string): number {
  const [y, mo, d] = dateIso.slice(0, 10).split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Resolve the offset using the naive stamp; a DST switch at 2 AM never
  // lands inside a bookable window so a single pass is enough.
  const offsetHours = isUSEasternDST(naive) ? 4 : 5;
  return naive + offsetHours * 3600 * 1000;
}

/** "YYYY-MM-DD" for the current US Eastern calendar day. */
export function todayIsoET(now: Date = new Date()): string {
  const ms = now.getTime();
  const offsetHours = isUSEasternDST(ms) ? 4 : 5;
  const shifted = new Date(ms - offsetHours * 3600 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** True once the weekend slot is within WEEKEND_RELEASE_HOURS of starting. */
export function isWeekendReleased(dateIso: string, hhmm: string, now: Date = new Date()): boolean {
  return slotStartUtcMs(dateIso, hhmm) - now.getTime() <= WEEKEND_RELEASE_HOURS * 3600 * 1000;
}

// ─────────────────────────────────────────────────────────────
// CORE RULE
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate one (tier, date, time, fasting) combination. Pure. `now` is only
 * used for the weekend 24 h release; pass it in tests.
 */
export function evaluateSlot(opts: {
  tier: MemberTier;
  dateIso: string;   // YYYY-MM-DD
  time: string;      // any parseable
  isFasting: boolean;
  now?: Date;
  /** Saved office hours for this weekday. Closed means closed, for everyone. */
  officeDay?: OfficeDay | null;
}): SlotRule {
  const hhmm = normalizeTime(opts.time);
  if (!hhmm) {
    return { bookable: false, window: 'closed', feeCents: 0, premiumEligible: false, vipHold: false, reason: 'Invalid time format' };
  }
  const tier: MemberTier = (['none', 'member', 'vip', 'concierge'] as string[]).includes(opts.tier) ? opts.tier : 'none';
  const now = opts.now || new Date();
  const min = toMinutes(hhmm);
  const paid = isPaidMember(tier);
  const feeForTier = paid ? 0 : PREMIUM_FEE_CENTS;

  // Office hours come first: a day switched off in Settings has no online
  // slots for any tier or destination.
  if (!isOfficeOpenAt(opts.officeDay, hhmm)) {
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek(opts.dateIso)];
    return {
      bookable: false, window: 'closed', officeClosed: true, feeCents: 0, premiumEligible: false, vipHold: false,
      reason: opts.officeDay?.closed
        ? `We're closed on ${dayName}s for online booking.`
        : `We're not open at ${formatTo12h(hhmm)} on ${dayName}s.`,
    };
  }

  // Fasting cutoff applies every day: the patient has been fasting since
  // the night before, so afternoon fasting draws are not offered.
  if (opts.isFasting && min >= toMinutes(FASTING_LAST_START)) {
    return {
      bookable: false, window: 'closed', feeCents: 0, premiumEligible: false, vipHold: false,
      reason: `Fasting visits start before ${formatTo12h(FASTING_LAST_START)} so you can eat sooner.`,
    };
  }

  if (isWeekendDate(opts.dateIso)) {
    if (min < toMinutes(WEEKEND_WINDOWS.open) || min >= toMinutes(WEEKEND_WINDOWS.close)) {
      return {
        bookable: false, window: 'closed', feeCents: 0, premiumEligible: false, vipHold: false,
        reason: `Weekend visits run ${formatTo12h(WEEKEND_WINDOWS.open)} – ${formatTo12h(WEEKEND_WINDOWS.close)}.`,
      };
    }
    if (isVipOrConcierge(tier)) {
      return { bookable: true, window: 'weekend', feeCents: 0, premiumEligible: false, vipHold: false };
    }
    const releaseAt = new Date(slotStartUtcMs(opts.dateIso, hhmm) - WEEKEND_RELEASE_HOURS * 3600 * 1000).toISOString();
    if (isWeekendReleased(opts.dateIso, hhmm, now)) {
      // Released to everyone: Regular members free, non-members +$10.
      return { bookable: true, window: 'weekend', feeCents: feeForTier, premiumEligible: true, vipHold: false, releaseAt };
    }
    return {
      bookable: false, window: 'weekend', feeCents: feeForTier, premiumEligible: true, vipHold: true, releaseAt,
      reason: VIP_HOLD_LABEL,
      upgradeCTA: { toTier: 'vip', message: 'VIP and Concierge members book weekends any time.' },
    };
  }

  // Weekday
  if (min < toMinutes(WEEKDAY_WINDOWS.open) || min >= toMinutes(WEEKDAY_WINDOWS.close)) {
    return {
      bookable: false, window: 'closed', feeCents: 0, premiumEligible: false, vipHold: false,
      reason: `Weekday visits run ${formatTo12h(WEEKDAY_WINDOWS.open)} – ${formatTo12h(WEEKDAY_WINDOWS.close)}.`,
    };
  }
  const premium = min < toMinutes(WEEKDAY_WINDOWS.standardStart) || min >= toMinutes(WEEKDAY_WINDOWS.standardEnd);
  if (premium) {
    return { bookable: true, window: 'premium', feeCents: feeForTier, premiumEligible: true, vipHold: false };
  }
  return { bookable: true, window: 'standard', feeCents: 0, premiumEligible: false, vipHold: false };
}

// ─────────────────────────────────────────────────────────────
// TIMING FEES — one per visit
// ─────────────────────────────────────────────────────────────

export type TimingFeeKind = 'same_day' | 'after_hours' | 'weekend' | 'premium';

export interface TimingFeeInputs {
  tier: MemberTier;
  /** Founding-50 VIP seat (server: user_memberships.founding_member). */
  isFoundingMember?: boolean;
  /** The visit is booked for today (ET). */
  sameDay?: boolean;
  /** The start is at/after office_hours.afterHoursFrom (5:30 PM by default). */
  afterHours?: boolean;
  /** The date is Sat/Sun. */
  weekend?: boolean;
  /** The slot sits in a premium window (evaluateSlot().premiumEligible). */
  premiumEligible?: boolean;
  /** Specimen goes to AdventHealth — never carries the premium fee. */
  adventHealth?: boolean;
}

/** Tier waivers, one place for both sides. */
export function isSameDayFeeWaived(tier: MemberTier, isFoundingMember = false): boolean {
  return tier === 'concierge' || (tier === 'vip' && isFoundingMember);
}
export function isWeekendFeeWaived(tier: MemberTier): boolean {
  return isVipOrConcierge(tier);
}
export function isPremiumFeeWaived(tier: MemberTier): boolean {
  return isPaidMember(tier);
}

/**
 * The ONE timing fee this visit carries, or null. Precedence (owner,
 * 2026-10-02): same-day $100 > after-hours $50 > weekend $75 > premium $10.
 * A fee the tier is exempt from does not "apply", so the next one is tried.
 */
export function resolveTimingFee(f: TimingFeeInputs): { kind: TimingFeeKind; cents: number } | null {
  if (f.sameDay && !isSameDayFeeWaived(f.tier, !!f.isFoundingMember)) return { kind: 'same_day', cents: SAME_DAY_FEE_CENTS };
  if (f.afterHours) return { kind: 'after_hours', cents: AFTER_HOURS_FEE_CENTS };
  if (f.weekend && !isWeekendFeeWaived(f.tier)) return { kind: 'weekend', cents: WEEKEND_FEE_CENTS };
  if (f.premiumEligible && !f.adventHealth && !isPremiumFeeWaived(f.tier)) return { kind: 'premium', cents: PREMIUM_FEE_CENTS };
  return null;
}

/**
 * Premium fee actually charged for a (tier, date, time), with the one-fee
 * rule applied. Weekend / premium eligibility come from the slot itself;
 * same-day and after-hours from the caller (they depend on the clock and on
 * office_hours.afterHoursFrom).
 */
export function premiumFeeCents(opts: {
  tier: MemberTier;
  dateIso: string;
  time: string;
  now?: Date;
  isFoundingMember?: boolean;
  /** The visit is booked for today (ET). */
  sameDayFeeApplies?: boolean;
  /** The start is in the after-hours set. */
  afterHoursFeeApplies?: boolean;
  /** Specimen goes to AdventHealth. */
  adventHealth?: boolean;
}): number {
  const rule = evaluateSlot({ tier: opts.tier, dateIso: opts.dateIso, time: opts.time, isFasting: false, now: opts.now });
  // Keyed on the window, not on `bookable`: callers that bypass the access
  // rules (AdventHealth destination) still classify the slot the same way,
  // and a held weekend slot is rejected by the caller before any fee matters.
  const fee = resolveTimingFee({
    tier: opts.tier,
    isFoundingMember: opts.isFoundingMember,
    sameDay: !!opts.sameDayFeeApplies,
    afterHours: !!opts.afterHoursFeeApplies,
    weekend: isWeekendDate(opts.dateIso),
    premiumEligible: rule.premiumEligible,
    adventHealth: !!opts.adventHealth,
  });
  return fee?.kind === 'premium' ? fee.cents : 0;
}

/** Badge text for a bookable premium-eligible slot, or null when there is nothing to say. */
export function premiumBadge(rule: SlotRule, tier: MemberTier): string | null {
  if (!rule.premiumEligible || rule.vipHold) return null;
  // A released weekend slot carries the $75 weekend fee (non-VIP), which
  // outranks the premium fee, so there is no "+$10" to announce there.
  if (rule.window === 'weekend') return null;
  return isPaidMember(tier) ? PREMIUM_BADGE_MEMBER : PREMIUM_BADGE_NON_MEMBER;
}

// ─────────────────────────────────────────────────────────────
// COMPATIBILITY API (older call sites)
// ─────────────────────────────────────────────────────────────

export interface AllowedCheck {
  allowed: boolean;
  reason?: string;
  /** Suggestions (max 5) for nearby open slots within the patient's window */
  suggestions: string[];
  upgradeCTA?: { toTier: MemberTier; message: string };
  /** Premium fee (cents) this tier pays at this slot, before stacking. */
  feeCents?: number;
}

export function isBookingAllowed(opts: {
  tier: MemberTier;
  dateIso: string;
  time: string;
  isFasting: boolean;
  now?: Date;
  officeDay?: OfficeDay | null;
}): AllowedCheck {
  const rule = evaluateSlot(opts);
  if (rule.bookable) return { allowed: true, suggestions: [], feeCents: rule.feeCents };
  const suggestions = getAllowedSlotsForDate({ tier: opts.tier, dateIso: opts.dateIso, isFasting: opts.isFasting, now: opts.now, officeDay: opts.officeDay }).slice(0, 5);
  return { allowed: false, reason: rule.reason, suggestions, upgradeCTA: rule.upgradeCTA, feeCents: rule.feeCents };
}

/**
 * Every bookable :00 / :30 start for a tier on a date (12-hour labels).
 * Used for suggestions; the live grid uses office hours + evaluateSlot.
 */
export function getAllowedSlotsForDate(opts: {
  tier: MemberTier;
  dateIso: string;
  isFasting: boolean;
  now?: Date;
  officeDay?: OfficeDay | null;
}): string[] {
  const out: string[] = [];
  for (let m = 5 * 60; m < 15 * 60; m += 30) {
    const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (evaluateSlot({ tier: opts.tier, dateIso: opts.dateIso, time: hhmm, isFasting: opts.isFasting, now: opts.now, officeDay: opts.officeDay }).bookable) {
      out.push(formatTo12h(hhmm));
    }
  }
  return out;
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
