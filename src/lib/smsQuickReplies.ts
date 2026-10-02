/**
 * Quick replies for the admin SMS inbox.
 *
 * Mirrors the house style in `supabase/functions/_shared/sms-copy.ts`:
 *   • first name + "ConveLabs here." opener, one support number,
 *   • "Reply HELP for help." tail on transactional texts,
 *   • never the word STOP as prose (carrier opt-out keyword).
 *
 * Placeholders are filled from the open thread: {{first_name}}, {{date}},
 * {{time}}, {{address}}, {{eta}}. Unknown values fall back to a neutral
 * phrase so a template never ships with a raw `{{…}}`.
 */

export const SUPPORT_PHONE = '(941) 527-9169';
export const SITE_URL = 'https://www.convelabs.com';
const HELP_TAIL = 'Reply HELP for help.';

export interface QuickReply {
  id: string;
  label: string;
  group: 'Visit' | 'Prep' | 'Billing' | 'Follow-up';
  body: string;
}

export const QUICK_REPLIES: QuickReply[] = [
  {
    id: 'on_the_way', label: 'On the way', group: 'Visit',
    body: `Hi {{first_name}} — ConveLabs here. Your phlebotomist is on the way and should arrive in about {{eta}} minutes. Please have a clean, well-lit spot ready. ${HELP_TAIL}`,
  },
  {
    id: 'running_late', label: 'Running late', group: 'Visit',
    body: `Hi {{first_name}} — ConveLabs here. We're running about {{eta}} minutes behind for your visit — thank you for your patience. We'll text when we're close. ${HELP_TAIL}`,
  },
  {
    id: 'confirm_visit', label: 'Confirm visit', group: 'Visit',
    body: `Hi {{first_name}} — ConveLabs here. Just confirming your visit on {{date}} at {{time}}. Reply YES to confirm, or let us know if you need a different time. ${HELP_TAIL}`,
  },
  {
    id: 'missed_you', label: 'Missed you / call back', group: 'Visit',
    body: `Hi {{first_name}} — ConveLabs here. Sorry we missed you. What's a good time for a quick call? You can also reach us at ${SUPPORT_PHONE}. ${HELP_TAIL}`,
  },
  {
    id: 'lab_order_needed', label: 'Lab order needed', group: 'Prep',
    body: `Hi {{first_name}} — ConveLabs here. We still need a copy of your lab order for your visit on {{date}}. Text a clear photo of it to this number, or upload it at ${SITE_URL}/dashboard. ${HELP_TAIL}`,
  },
  {
    id: 'fasting', label: 'Fasting prep', group: 'Prep',
    body: `Hi {{first_name}} — ConveLabs here. Your draw on {{date}} at {{time}} requires fasting: nothing but water (and your usual daily meds) for 8–12 hours beforehand. ${HELP_TAIL}`,
  },
  {
    id: 'no_fasting', label: 'No fasting needed', group: 'Prep',
    body: `Hi {{first_name}} — ConveLabs here. Good news: your lab order doesn't require fasting, so eat and drink normally before your visit on {{date}}. ${HELP_TAIL}`,
  },
  {
    id: 'invoice_followup', label: 'Invoice follow-up', group: 'Billing',
    body: `Hi {{first_name}} — ConveLabs here. Friendly reminder that your invoice is still open. Reply here or call ${SUPPORT_PHONE} and we'll send a fresh pay link. ${HELP_TAIL}`,
  },
  {
    id: 'payment_received', label: 'Payment received', group: 'Billing',
    body: `Hi {{first_name}} — ConveLabs here. We've received your payment — thank you! A receipt is on its way to your email. ${HELP_TAIL}`,
  },
  {
    id: 'results_timing', label: 'Results timing', group: 'Follow-up',
    body: `Hi {{first_name}} — ConveLabs here. Your specimens were delivered to the lab. Results come directly from the lab's patient portal, usually within 2–5 business days. ${HELP_TAIL}`,
  },
  {
    id: 'thanks', label: 'Thank you', group: 'Follow-up',
    body: `Hi {{first_name}} — ConveLabs here. Thank you for choosing us for your visit on {{date}}. If anything about your experience wasn't five stars, reply here and we'll make it right.`,
  },
];

export interface QuickReplyContext {
  firstName?: string | null;
  date?: string | null;     // already formatted, e.g. "Fri, Oct 3"
  time?: string | null;     // already formatted, e.g. "9:00 AM"
  address?: string | null;
  eta?: string | number | null;
}

export function renderQuickReply(body: string, ctx: QuickReplyContext): string {
  const map: Record<string, string> = {
    first_name: (ctx.firstName || '').trim().split(/\s+/)[0] || 'there',
    date: ctx.date || 'your scheduled date',
    time: ctx.time || 'your scheduled time',
    address: ctx.address || 'your address on file',
    eta: ctx.eta != null && String(ctx.eta).trim() ? String(ctx.eta) : '15',
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => (k in map ? map[k] : _m));
}

/** GSM-7 vs UCS-2 segment estimate — enough to show "2 segments" honestly. */
export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  const chars = text.length;
  // Anything outside basic GSM-7 (curly quotes, em dash, emoji) forces UCS-2.
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, segments, unicode };
}
