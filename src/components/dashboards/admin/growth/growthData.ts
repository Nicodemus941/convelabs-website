/**
 * growthData — the read-only data layer behind the Growth screen.
 *
 * Sources (all already in production, nothing new required):
 *   visitor_sessions  — one row per site session (track-analytics edge fn).
 *                       Has utm_* / city / state / converted columns but, as
 *                       of 2026-10-02, the tracker never populates them:
 *                       0 of 14,857 rows carry utm_source, 0 carry a city and
 *                       0 are marked converted. `referrer` IS populated, so
 *                       channel attribution here is derived from the referrer
 *                       host (instagram.com / m.facebook.com / google …) and
 *                       falls back to utm_* the day they start arriving.
 *   appointments      — bookings created in the window (booking_source split).
 *   campaign_sends    — via list_campaigns() / get_campaign_engagement().
 *   ad_spend_log      — whether spend has been logged for the current month.
 *
 * Supabase caps a single select at 1,000 rows, and a busy 30-day window is
 * ~4,000 sessions, so sessions are paged with .range(). A server-side daily
 * rollup is drafted in supabase/migrations/DRAFT_*growth_traffic_rollup.sql;
 * until that is applied this module does the aggregation client-side.
 */
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type Channel = 'social' | 'search' | 'direct' | 'referral';

export interface SessionRow {
  id: string;
  created_at: string;
  referrer: string | null;
  device_type: string | null;
  converted: boolean | null;
  conversion_value: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  total_duration_seconds: number | null;
}

export interface BookingRow {
  id: string;
  created_at: string;
  appointment_date: string | null;
  booking_source: string | null;
  status: string | null;
  payment_status: string | null;
  total_amount: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page: string | null;
  referrer_url: string | null;
  service_type: string | null;
  patient_name: string | null;
}

export interface CampaignRow {
  campaign_key: string;
  sent: number;
  last_sent_at: string | null;
}

export interface CampaignEngagement {
  campaign_key: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  complained: number;
  open_rate_pct: number;
  click_rate_pct: number;
  bounce_rate_pct: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
}

export interface AdSpendRow { channel: string; period_month: string; spend_cents: number }

export const CHANNEL_META: Record<Channel, { label: string; short: string; desc: string; color: string; pill: string; tile: string; dot: string }> = {
  social: {
    label: 'Social (Meta)', short: 'Social',
    desc: 'Instagram and Facebook referrers — where the Meta ad sets land',
    color: '#B91C1C',
    pill: 'bg-red-100 text-red-800 border-red-200',
    tile: 'border-red-300 bg-red-50 text-red-800',
    dot: 'bg-[#B91C1C]',
  },
  search: {
    label: 'Search', short: 'Search',
    desc: 'Google, Bing, DuckDuckGo, Yahoo',
    color: '#2563EB',
    pill: 'bg-blue-100 text-blue-800 border-blue-200',
    tile: 'border-blue-300 bg-blue-50 text-blue-800',
    dot: 'bg-blue-500',
  },
  direct: {
    label: 'Direct', short: 'Direct',
    desc: 'Typed the address, used a bookmark, or came from a link with no referrer (most SMS / email links)',
    color: '#6B7280',
    pill: 'bg-gray-100 text-gray-700 border-gray-200',
    tile: 'border-gray-300 bg-gray-100 text-gray-800',
    dot: 'bg-gray-400',
  },
  referral: {
    label: 'Other sites', short: 'Referral',
    desc: 'Any other referring site (partners, Stripe, ChatGPT, …)',
    color: '#0D9488',
    pill: 'bg-teal-100 text-teal-800 border-teal-200',
    tile: 'border-teal-300 bg-teal-50 text-teal-800',
    dot: 'bg-teal-500',
  },
};

export const CHANNEL_ORDER: Channel[] = ['social', 'search', 'direct', 'referral'];

const SOCIAL_HOSTS = ['instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'threads.net', 'tiktok.com', 't.co', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'pinterest.com', 'nextdoor.com', 'reddit.com'];
const SEARCH_HOSTS = ['google.', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'ecosia.org', 'brave.com', 'startpage.com'];
const OWN_HOSTS = ['convelabs.com', 'localhost'];

export function hostOf(referrer: string | null | undefined): string {
  if (!referrer) return '';
  const trimmed = referrer.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0].toLowerCase().replace(/^www\./, '');
  }
}

/** Collapse the many Meta hosts (m./l./lm. prefixes) onto their family. */
export function sourceLabel(host: string): string {
  if (!host) return 'Direct / none';
  if (host.endsWith('instagram.com')) return 'Instagram';
  if (host.endsWith('facebook.com') || host.endsWith('fb.com') || host.endsWith('fb.me')) return 'Facebook';
  if (host.includes('google.')) return 'Google';
  if (host.endsWith('bing.com')) return 'Bing';
  if (host.endsWith('duckduckgo.com')) return 'DuckDuckGo';
  if (host.endsWith('yahoo.com')) return 'Yahoo';
  if (host.endsWith('convelabs.com')) return 'convelabs.com (internal)';
  if (host.startsWith('android-app')) return 'Android app link';
  return host;
}

export function classify(referrer: string | null, utmSource?: string | null, utmMedium?: string | null): Channel {
  const src = (utmSource || '').toLowerCase();
  const med = (utmMedium || '').toLowerCase();
  if (src) {
    if (/(instagram|meta|facebook|^fb$|^ig$|tiktok|linkedin)/.test(src) || /social/.test(med)) return 'social';
    if (/(google|bing|yahoo|duckduckgo)/.test(src) || /(cpc|ppc|paid_search|search)/.test(med)) return 'search';
    if (/(sms|email|newsletter|direct)/.test(src) || /(sms|email)/.test(med)) return 'direct';
    return 'referral';
  }
  const host = hostOf(referrer);
  if (!host) return 'direct';
  if (OWN_HOSTS.some(h => host.endsWith(h))) return 'direct';
  if (SOCIAL_HOSTS.some(h => host.endsWith(h))) return 'social';
  if (SEARCH_HOSTS.some(h => host.includes(h))) return 'search';
  return 'referral';
}

const SESSION_COLUMNS = 'id, created_at, referrer, device_type, converted, conversion_value, utm_source, utm_medium, utm_campaign, city, state, zip_code, total_duration_seconds';
const PAGE = 1000;
const MAX_PAGES = 20; // 20k sessions — comfortably above any 90-day window today

export async function fetchSessions(sinceIso: string): Promise<{ rows: SessionRow[]; truncated: boolean }> {
  const rows: SessionRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await db
      .from('visitor_sessions')
      .select(SESSION_COLUMNS)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data as SessionRow[]) || [];
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function fetchBookings(sinceIso: string): Promise<BookingRow[]> {
  const { data, error } = await db
    .from('appointments')
    .select('id, created_at, appointment_date, booking_source, status, payment_status, total_amount, utm_source, utm_medium, utm_campaign, landing_page, referrer_url, service_type, patient_name')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (error) throw error;
  return (data as BookingRow[]) || [];
}

export async function fetchCampaigns(): Promise<CampaignRow[]> {
  const { data, error } = await db.rpc('list_campaigns');
  if (error) throw error;
  return ((data as CampaignRow[]) || []).map(c => ({ ...c, sent: Number(c.sent) || 0 }));
}

export async function fetchCampaignEngagement(key: string): Promise<CampaignEngagement | null> {
  const { data, error } = await db.rpc('get_campaign_engagement', { p_campaign_key: key });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as CampaignEngagement) || null;
}

export async function fetchAdSpend(monthIso: string): Promise<AdSpendRow[]> {
  const { data, error } = await db
    .from('ad_spend_log')
    .select('channel, period_month, spend_cents')
    .eq('period_month', monthIso);
  if (error) throw error;
  return (data as AdSpendRow[]) || [];
}

export async function fetchCampaignEmailLogCount(sinceIso: string): Promise<number> {
  const { count, error } = await db
    .from('email_logs')
    .select('id', { count: 'exact', head: true })
    .filter('metadata->campaign', 'eq', true)
    .gte('sent_at', sinceIso);
  if (error) throw error;
  return count || 0;
}

/** Human labels for the campaign keys we know; falls back to the key. */
export const CAMPAIGN_LABELS: Record<string, string> = {
  memorial_day_2026: 'Memorial Day 2026 promo',
  patient_feature_update_2026_04_25: 'New ConveLabs hours announcement',
  patient_announce_2026_04_19: 'Patient portal launch blast',
  partner_announce_2026_04_19: 'Partner portal launch blast',
  outreach_preview_self_test: 'Outreach preview (self test)',
};

export const campaignLabel = (key: string): string =>
  CAMPAIGN_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** "online" is the self-serve booking flow; everything else is staff-created. */
export const isOnlineBooking = (b: BookingRow): boolean => (b.booking_source || '') === 'online';

export const localDayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
