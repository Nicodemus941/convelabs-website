// quiet-hours
// ────────────────────────────────────────────────────────────────────────
// Single source of truth for "is it OK to send this patient a message right
// now?" Every patient-facing SMS/email path MUST route through here.
//
// THE RULE:
//   No patient SMS or email between 9:00 PM and 8:00 AM Eastern Time.
//   No exceptions for reminders/dunning/marketing/post-visit sequences.
//   Three hard-carved transactional categories CAN fire any hour — see
//   NotificationCategory below.
//
// WHY (Hormozi lens):
//   Money — one pissed "why are you texting me at 2am" complaint costs more
//     than 50 legitimate sends. CAC is ~$30/patient; churn from a bad
//     text-time experience destroys months of contribution margin.
//   Trust — "We respect your sleep" is free positioning in a vertical where
//     everyone else spam-blasts at random hours.
//   Gate — centralizing the decision means no function ships a late-night
//     text because the developer forgot to add a time check. One chokepoint.
//
// WHEN TO DEFER VS. DROP:
//   We don't drop. We defer to the next 8:00 AM ET. The fasting reminder
//   due at 5am fires at 8am. The invoice dunning due at 11pm fires at 8am.
//   For patient's perspective: message received first thing, not missed.
//
// HOW TO USE:
//   import { shouldSendNow } from '../_shared/quiet-hours.ts';
//   const gate = shouldSendNow('reminder');
//   if (!gate.allow) {
//     console.log(`[quiet-hours] deferring until ${gate.nextAllowedAt}: ${gate.reason}`);
//     // optional: log to notification_deferrals for observability
//     return;
//   }
//   // proceed with send

export type NotificationCategory =
  // ── Always-send categories (no quiet-hours gate) ─────────────────────
  // Patient took an ACTION and is actively waiting for a response. Silence
  // here would be worse than a 2am buzz (they'll think the action failed).
  | 'otp'                     // phone/email verification codes
  | 'payment_confirmation'    // "your payment went through" immediately after Stripe
  | 'password_reset'          // user hit "reset" 2 seconds ago
  | 'admin_alert'             // HIPAA guard, double-booking warn, critical ops
  | 'booking_confirmation'    // "we got your booking for tomorrow at 8am"

  // ── Quiet-hours categories (deferred to 8am ET) ──────────────────────
  | 'reminder'                // fasting, appointment, lab-request
  | 'dunning'                 // invoice / payment retry follow-up
  | 'post_visit'              // post-visit sequence emails/SMS
  | 'marketing';              // campaigns, promos, referral nudges

// Category → whitelist flag. If you add a new category above, add it here
// too — TypeScript will NOT catch the omission, so this list IS the spec.
const ALWAYS_SEND_CATEGORIES: Readonly<Set<NotificationCategory>> = new Set([
  'otp',
  'payment_confirmation',
  'password_reset',
  'admin_alert',
  'booking_confirmation',
]);

// Quiet window in Eastern Time (respects DST automatically via tz string).
// Bounds are INCLUSIVE at start, EXCLUSIVE at end:
//   quiet if hour >= QUIET_START_HOUR OR hour < QUIET_END_HOUR
const QUIET_START_HOUR = 21; // 9:00 PM ET
const QUIET_END_HOUR = 8;    // 8:00 AM ET
const ET_TIMEZONE = 'America/New_York';

/**
 * Returns current hour (0-23) in ET, accounting for DST automatically.
 * Used instead of naive UTC math so EDT/EST transitions are handled.
 */
function hourInET(now: Date): number {
  // Intl.DateTimeFormat is the only Deno-safe way to coerce a tz-accurate hour
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(fmt.format(now), 10);
}

/** True if `now` falls inside the 9pm-8am ET quiet window. */
export function isQuietHours(now: Date = new Date()): boolean {
  const h = hourInET(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/**
 * The next instant when patient sends are allowed. If called during quiet
 * hours, returns today's (or tomorrow's, if after midnight) 8:00 AM ET as
 * a Date object. If already in-hours, returns `now`.
 */
export function nextAllowedSendAt(now: Date = new Date()): Date {
  if (!isQuietHours(now)) return new Date(now.getTime());

  // Target: 8:00 AM ET on the next calendar day that contains it
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parseInt(etParts.find(p => p.type === t)!.value, 10);
  const yearET = get('year');
  const monthET = get('month');
  const dayET = get('day');
  const hourET = get('hour');

  // If we're in the EVENING portion (>= 21), target is TOMORROW 8am ET.
  // If we're in the MORNING portion (< 8), target is TODAY 8am ET.
  let targetDay = dayET;
  let targetMonth = monthET;
  let targetYear = yearET;
  if (hourET >= QUIET_START_HOUR) {
    // advance to tomorrow via Date math on a midnight-ET anchor
    const anchor = new Date(Date.UTC(yearET, monthET - 1, dayET, 12, 0, 0));
    anchor.setUTCDate(anchor.getUTCDate() + 1);
    targetYear = anchor.getUTCFullYear();
    targetMonth = anchor.getUTCMonth() + 1;
    targetDay = anchor.getUTCDate();
  }

  // Construct 8am ET as a UTC timestamp. Because ET observes DST, we offer
  // 8:00 ET = either 12:00 UTC (EST, winter) or 12:00 UTC (EDT, summer —
  // same UTC number because DST shifts clocks not UTC). Actually EDT is
  // UTC-4 so 8am EDT = 12:00 UTC; EST is UTC-5 so 8am EST = 13:00 UTC.
  // Compute offset by rendering a known 8am-ET timestamp and diffing.
  const probe = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 12, 0, 0));
  const etHourAtProbe = hourInET(probe);
  // Adjust: if probe renders as 8am ET, we're good. If it renders as 7 or 9, shift.
  const diffHours = 8 - etHourAtProbe;
  probe.setUTCHours(probe.getUTCHours() + diffHours);
  return probe;
}

export interface SendDecision {
  allow: boolean;
  reason: string;
  nextAllowedAt?: string; // ISO, when to retry — only set when allow=false
  category: NotificationCategory;
}

/**
 * The checkpoint. Every patient-notification path calls this.
 *   - transactional categories → always allow
 *   - reminder/dunning/marketing → allow only outside quiet hours
 *
 * Returns a structured decision so callers can log uniformly.
 */
export function shouldSendNow(
  category: NotificationCategory,
  now: Date = new Date(),
): SendDecision {
  if (ALWAYS_SEND_CATEGORIES.has(category)) {
    return { allow: true, reason: 'transactional-whitelist', category };
  }
  if (isQuietHours(now)) {
    return {
      allow: false,
      reason: 'quiet-hours-9pm-8am-ET',
      nextAllowedAt: nextAllowedSendAt(now).toISOString(),
      category,
    };
  }
  return { allow: true, reason: 'outside-quiet-hours', category };
}

/**
 * Observability helper — fire-and-forget log to notification_deferrals.
 * Callers SHOULD use this when shouldSendNow returns allow=false, so we
 * can audit what we silenced and when. Do NOT await; never block send
 * paths on telemetry.
 */
export async function logDeferral(
  supabaseClient: any,
  params: {
    category: NotificationCategory;
    recipient: string;
    channel: 'sms' | 'email';
    payload_summary: string;
    next_allowed_at?: string;
    origin_function: string;
  },
): Promise<void> {
  try {
    await supabaseClient.from('notification_deferrals').insert({
      category: params.category,
      recipient: params.recipient,
      channel: params.channel,
      payload_summary: params.payload_summary.substring(0, 500),
      next_allowed_at: params.next_allowed_at || null,
      origin_function: params.origin_function,
    });
  } catch { /* telemetry never breaks UX */ }
}
