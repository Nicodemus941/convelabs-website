/**
 * scheduleShared — helpers + presentational pieces shared by the two
 * Schedule screens (AdminCalendar, EnhancedAppointmentsTab).
 *
 * Lives inside the Schedule section so other sections' files stay untouched.
 * Mirrors the design language of LabOrdersTab / SpecimenTrackingTab:
 * header + one-line subtitle, KPI tiles that partition every row, filter chips
 * with counts, "Needs action" lane, sticky-right Actions column, mobile cards.
 *
 * Facts about `appointments` this module relies on (verified against prod):
 *   - appointment_time is a Postgres TIME → reads back as "HH:MM:SS" (24h),
 *     even though writers insert "6:00 PM". Always go through parseApptTime.
 *   - appointment_date is a timestamptz whose time-of-day is NOT meaningful
 *     (midnight UTC, noon ET and 16:00 UTC all exist). The calendar day is the
 *     first 10 chars of the stored string; never `new Date(appointment_date)`
 *     for day math or midnight-UTC rows shift to the previous day in ET.
 *   - Real statuses in the table: scheduled, confirmed, en_route, in_progress,
 *     completed, specimen_delivered, cancelled (+ `no_show` boolean column).
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, CalendarDays } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────
// Dates & times
// ──────────────────────────────────────────────────────────────────
const ET = 'America/New_York';

/** YYYY-MM-DD for an instant, in Eastern time. */
export function etDateKey(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Calendar day of an appointment row — the stored string's date prefix. */
export function apptDateKey(appt: { appointment_date?: string | Date | null }): string {
  const v = appt?.appointment_date;
  if (!v) return '';
  if (v instanceof Date) return etDateKey(v);
  return String(v).slice(0, 10);
}

/** Shift a YYYY-MM-DD key by n days (noon-local anchor avoids DST edges). */
export function shiftKey(key: string, days: number): string {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sunday..Saturday keys of the week that contains `key`. */
export function weekBounds(key: string): { start: string; end: string } {
  const d = new Date(key + 'T12:00:00');
  const start = shiftKey(key, -d.getDay());
  return { start, end: shiftKey(start, 6) };
}

export function fmtDateKey(key: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!key || key.length < 10) return '—';
  const d = new Date(key.slice(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return key;
  return d.toLocaleDateString('en-US', opts);
}

/** Parse "HH:MM[:SS]" or "h:mm AM/PM" → minutes since midnight, or null. */
export function parseApptTime(t: string | null | undefined): { h: number; m: number } | null {
  if (!t) return null;
  const s = String(t).trim();
  const ampm = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(s);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return { h, m };
  }
  const mil = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (mil) return { h: parseInt(mil[1], 10), m: parseInt(mil[2], 10) };
  return null;
}

export function fmtTime12(t: string | null | undefined): string {
  const p = parseApptTime(t);
  if (!p) return '';
  const period = p.h >= 12 ? 'PM' : 'AM';
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.m).padStart(2, '0')} ${period}`;
}

/** "9:00 AM" → "9a", "9:30 AM" → "9:30a" — for dense calendar chips. */
export function fmtTimeShort(t: string | null | undefined): string {
  const s = fmtTime12(t);
  return s.replace(':00', '').replace(' AM', 'a').replace(' PM', 'p');
}

// ──────────────────────────────────────────────────────────────────
// Statuses
// ──────────────────────────────────────────────────────────────────
export interface StatusMeta {
  label: string;
  pill: string;
  dot: string;
  /** Solid fill used on calendar events. */
  color: string;
}

export const STATUS_META: Record<string, StatusMeta> = {
  scheduled:          { label: 'Scheduled',          pill: 'bg-blue-50 text-blue-800 border-blue-200',      dot: 'bg-blue-500',    color: '#2563eb' },
  confirmed:          { label: 'Confirmed',          pill: 'bg-blue-100 text-blue-900 border-blue-300',     dot: 'bg-blue-700',    color: '#1d4ed8' },
  en_route:           { label: 'En route',           pill: 'bg-orange-100 text-orange-800 border-orange-200', dot: 'bg-orange-500', color: '#ea580c' },
  arrived:            { label: 'Arrived',            pill: 'bg-amber-100 text-amber-800 border-amber-200',  dot: 'bg-amber-500',   color: '#d97706' },
  in_progress:        { label: 'In progress',        pill: 'bg-cyan-100 text-cyan-800 border-cyan-200',     dot: 'bg-cyan-500',    color: '#0891b2' },
  completed:          { label: 'Completed',          pill: 'bg-gray-100 text-gray-700 border-gray-200',     dot: 'bg-gray-400',    color: '#6b7280' },
  specimen_delivered: { label: 'Specimen delivered', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', color: '#059669' },
  cancelled:          { label: 'Cancelled',          pill: 'bg-white text-gray-500 border-gray-300',        dot: 'bg-gray-300',    color: '#fca5a5' },
  'no-show':          { label: 'No-show',            pill: 'bg-red-50 text-red-700 border-red-200',         dot: 'bg-red-400',     color: '#f87171' },
  no_show:            { label: 'No-show',            pill: 'bg-red-50 text-red-700 border-red-200',         dot: 'bg-red-400',     color: '#f87171' },
};

const FALLBACK_STATUS: StatusMeta = { label: 'Unknown', pill: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-300', color: '#1e293b' };

export function statusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return FALLBACK_STATUS;
  return STATUS_META[status] || { ...FALLBACK_STATUS, label: humanize(status) };
}

/** Statuses that mean "the visit still has to happen / be closed out". */
export const OPEN_STATUSES: ReadonlySet<string> = new Set(['scheduled', 'confirmed', 'en_route', 'arrived', 'in_progress']);
export const DONE_STATUSES: ReadonlySet<string> = new Set(['completed', 'specimen_delivered']);
export const CLOSED_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'no-show', 'no_show']);

export function isOpenStatus(s: string | null | undefined): boolean { return !!s && OPEN_STATUSES.has(s); }

export function humanize(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ──────────────────────────────────────────────────────────────────
// Buckets — ONE per row so tiles, chips and the list always agree.
// ──────────────────────────────────────────────────────────────────
export type ApptBucket = 'overdue' | 'today' | 'upcoming' | 'completed' | 'cancelled';

export interface BucketMeta { label: string; desc: string; pill: string; tile: string; dot: string }

export const BUCKET_META: Record<ApptBucket, BucketMeta> = {
  overdue: {
    label: 'Past due', desc: 'Visit date has passed and it was never completed or cancelled',
    pill: 'bg-red-100 text-red-800 border-red-200', tile: 'border-red-300 bg-red-50 text-red-800', dot: 'bg-red-500',
  },
  today: {
    label: 'Today', desc: "Today's visits (Eastern time) that still need to happen or be closed out",
    pill: 'bg-amber-100 text-amber-800 border-amber-200', tile: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500',
  },
  upcoming: {
    label: 'Upcoming', desc: 'Booked for a future date',
    pill: 'bg-blue-100 text-blue-800 border-blue-200', tile: 'border-blue-300 bg-blue-50 text-blue-800', dot: 'bg-blue-500',
  },
  completed: {
    label: 'Completed', desc: 'Draw done (including specimen delivered)',
    pill: 'bg-gray-100 text-gray-700 border-gray-200', tile: 'border-gray-300 bg-gray-100 text-gray-800', dot: 'bg-gray-400',
  },
  cancelled: {
    label: 'Cancelled', desc: 'Cancelled or no-show — no further action',
    pill: 'bg-white text-gray-500 border-gray-300', tile: 'border-gray-300 bg-gray-50 text-gray-700', dot: 'bg-gray-300',
  },
};

export function deriveApptBucket(appt: { status?: string | null; appointment_date?: string | Date | null; no_show?: boolean | null }, todayKey: string): ApptBucket {
  const s = appt.status || '';
  if (CLOSED_STATUSES.has(s) || appt.no_show) return 'cancelled';
  if (DONE_STATUSES.has(s)) return 'completed';
  const key = apptDateKey(appt);
  if (!key) return 'upcoming';
  if (key < todayKey) return 'overdue';
  if (key === todayKey) return 'today';
  return 'upcoming';
}

export type ApptFilterKey = 'all' | 'needs_action' | ApptBucket;

export const NEEDS_ACTION: ReadonlySet<ApptBucket> = new Set<ApptBucket>(['overdue', 'today']);

export const APPT_FILTERS: Array<{ key: ApptFilterKey; label: string; desc: string; match: (b: ApptBucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every appointment in view', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Past due or happening today', match: (b) => NEEDS_ACTION.has(b) },
  { key: 'overdue', label: 'Past due', desc: BUCKET_META.overdue.desc, match: (b) => b === 'overdue' },
  { key: 'today', label: 'Today', desc: BUCKET_META.today.desc, match: (b) => b === 'today' },
  { key: 'upcoming', label: 'Upcoming', desc: BUCKET_META.upcoming.desc, match: (b) => b === 'upcoming' },
  { key: 'completed', label: 'Completed', desc: BUCKET_META.completed.desc, match: (b) => b === 'completed' },
  { key: 'cancelled', label: 'Cancelled', desc: BUCKET_META.cancelled.desc, match: (b) => b === 'cancelled' },
];

/** Four tiles that partition every row (needs_action = overdue + today). */
export const APPT_TILE_KEYS: ApptFilterKey[] = ['needs_action', 'upcoming', 'completed', 'cancelled'];

export const APPT_TILE_STYLE: Record<string, string> = {
  needs_action: 'border-red-300 bg-red-50 text-red-800',
  upcoming: BUCKET_META.upcoming.tile,
  completed: BUCKET_META.completed.tile,
  cancelled: BUCKET_META.cancelled.tile,
};

// ──────────────────────────────────────────────────────────────────
// Payment
// ──────────────────────────────────────────────────────────────────
export interface PaymentMeta { label: string; pill: string }

export function paymentMeta(appt: { payment_status?: string | null; invoice_status?: string | null; total_amount?: number | null }): PaymentMeta {
  const p = appt.payment_status || '';
  const inv = appt.invoice_status || '';
  if (p === 'org_billed') return { label: 'Org billed', pill: 'bg-purple-50 text-purple-700 border-purple-200' };
  if (p === 'completed' || p === 'paid') return { label: 'Paid', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (p === 'refunded') return { label: 'Refunded', pill: 'bg-gray-50 text-gray-600 border-gray-200' };
  if (p === 'partial_refund') return { label: 'Partial refund', pill: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (p === 'voided' || p === 'void' || inv === 'voided') return { label: 'Voided', pill: 'bg-gray-50 text-gray-500 border-gray-200' };
  if (p === 'not_required' || (!p && inv === 'not_required')) return { label: 'No charge', pill: 'bg-gray-50 text-gray-500 border-gray-200' };
  if (p === 'pending') {
    if (inv === 'sent' || inv === 'reminded' || inv === 'final_warning') return { label: 'Invoice sent', pill: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (inv === 'missing_email') return { label: 'Unpaid · no email', pill: 'bg-red-50 text-red-700 border-red-200' };
    return { label: 'Unpaid', pill: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (!p) return { label: '—', pill: 'bg-gray-50 text-gray-400 border-gray-200' };
  return { label: humanize(p), pill: 'bg-gray-50 text-gray-600 border-gray-200' };
}

export function isUnpaid(appt: { payment_status?: string | null }): boolean {
  return appt.payment_status === 'pending';
}

// ──────────────────────────────────────────────────────────────────
// Services
// ──────────────────────────────────────────────────────────────────
const SERVICE_LABELS: Record<string, string> = {
  mobile: 'At-home blood draw',
  senior: 'Senior (65+) draw',
  'in-office': 'Office visit',
  therapeutic: 'Therapeutic phlebotomy',
  'specialty-kit': 'Specialty kit',
  invoice: 'Invoice only',
  'specimen-collection-stool-urine': 'Stool / urine collection',
  'couples-wellness-stack': 'Couples wellness stack',
  'blood-draw-and-specialty-collection-kit': 'Draw + specialty kit',
  'partner-restoration-place': 'Restoration Place (partner)',
  'partner-elite-medical-concierge': 'Elite Medical Concierge (partner)',
  'partner-nd-wellness': 'ND Wellness (partner)',
  'partner-naturamed': 'NaturaMed (partner)',
  'partner-aristotle-education': 'Aristotle Education (partner)',
  'dev-testing': 'Dev testing',
};

export function serviceLabel(appt: { service_type?: string | null; service_name?: string | null }): string {
  const t = (appt.service_type || '').trim();
  if (t && SERVICE_LABELS[t]) return SERVICE_LABELS[t];
  if (appt.service_name) return shortServiceName(appt.service_name);
  if (t) return humanize(t);
  return 'Blood draw';
}

export function shortServiceName(name: string): string {
  return name
    .replace('At-Home Blood Work (Seminole, Orange, & Volusia County)', 'At-Home Blood Work')
    .replace('Mobile Blood Draw', 'At-Home Blood Work')
    .replace('Specialty Collection Kit', 'Specialty Kit')
    .replace('Therapeutic Phlebotomy', 'Therapeutic Blood Work')
    .replace('Senior Blood Draw', 'Senior (65+)')
    .replace("Patient's Pricing ONLY", "Patient's Pricing");
}

export function serviceTypeLabel(t: string): string {
  if (!t) return 'No service type';
  return SERVICE_LABELS[t] || humanize(t);
}

// ──────────────────────────────────────────────────────────────────
// Misc
// ──────────────────────────────────────────────────────────────────
export function patientNameOf(appt: { patient_name?: string | null; notes?: string | null; service_name?: string | null }): string {
  if (appt.patient_name) return appt.patient_name;
  const m = appt.notes?.match(/Patient:\s*([^|]+)/);
  if (m) return m[1].trim();
  return appt.service_name || 'Appointment';
}

export const money = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function downloadCsv(headers: string[], lines: Array<Array<string | number | null | undefined>>, filename: string) {
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...lines.map(l => l.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const rowKeyHandler = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
};

// ──────────────────────────────────────────────────────────────────
// Presentational pieces (same classes as LabOrdersTab / SpecimenTrackingTab)
// ──────────────────────────────────────────────────────────────────
export const StatusPill: React.FC<{ status: string | null | undefined; className?: string; text?: string }> = ({ status, className, text }) => {
  const meta = statusMeta(status);
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap', meta.pill, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {text || meta.label}
    </span>
  );
};

export const PaymentPill: React.FC<{ appt: any; className?: string }> = ({ appt, className }) => {
  const meta = paymentMeta(appt);
  return (
    <span className={cn('inline-flex items-center px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap', meta.pill, className)}>
      {meta.label}
    </span>
  );
};

export const StatTiles: React.FC<{
  keys: string[];
  defs: Array<{ key: string; label: string; desc: string }>;
  counts: Record<string, number>;
  active: string;
  loading: boolean;
  styles: Record<string, string>;
  hotKey?: string;
  onPick: (key: string, isActive: boolean) => void;
  ariaLabel: string;
  cols?: 4 | 5;
}> = ({ keys, defs, counts, active, loading, styles, hotKey = 'needs_action', onPick, ariaLabel, cols = 4 }) => (
  <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
    <div className={cn('grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-flow-row gap-2', cols === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4')} role="group" aria-label={ariaLabel}>
      {keys.map(k => {
        const def = defs.find(f => f.key === k)!;
        const isActive = active === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k, isActive)}
            aria-pressed={isActive}
            title={def.desc}
            className={cn(
              'text-left rounded-lg border px-3 py-2.5 min-h-[64px] snap-start transition shadow-sm',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
              isActive ? cn('ring-2 ring-[#B91C1C]/30', styles[k]) : 'bg-white border-gray-200 hover:border-[#B91C1C]/40',
            )}
          >
            <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{def.label}</p>
            <p className={cn('text-2xl font-bold leading-tight mt-0.5', k === hotKey && (counts[k] || 0) > 0 && !isActive && 'text-red-700')}>
              {loading ? '–' : (counts[k] ?? 0)}
            </p>
          </button>
        );
      })}
    </div>
  </div>
);

export const FilterChips: React.FC<{
  defs: Array<{ key: string; label: string; desc: string }>;
  counts: Record<string, number>;
  active: string;
  dotFor?: (key: string) => string | null;
  onPick: (key: string) => void;
  ariaLabel: string;
}> = ({ defs, counts, active, dotFor, onPick, ariaLabel }) => (
  <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label={ariaLabel}>
    {defs.map(f => {
      const isActive = active === f.key;
      const n = counts[f.key] ?? 0;
      const dot = dotFor ? dotFor(f.key) : null;
      return (
        <button
          key={f.key}
          type="button"
          onClick={() => onPick(f.key)}
          aria-pressed={isActive}
          title={f.desc}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
            isActive ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
            !isActive && n === 0 && 'text-gray-400',
          )}
        >
          {dot && <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-white' : dot)} aria-hidden="true" />}
          {f.label}
          <span className={cn('tabular-nums', isActive ? 'opacity-90' : 'text-gray-500')}>{n}</span>
        </button>
      );
    })}
  </div>
);

export const LaneHeader: React.FC<{ id: string; title: string; count: number; tone: 'red' | 'gray'; hint?: string }> = ({ id, title, count, tone, hint }) => (
  <div className="flex items-center gap-2 mb-2 flex-wrap">
    <h2 id={id} className={cn('text-sm font-bold', tone === 'red' ? 'text-red-800' : 'text-gray-700')}>{title}</h2>
    <span className={cn('inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full', tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')}>{count}</span>
    {hint && <span className="text-[11px] text-gray-500">{hint}</span>}
  </div>
);

export const LoadingRows: React.FC<{ label: string; n?: number }> = ({ label, n = 5 }) => (
  <div className="space-y-1.5" aria-busy="true" aria-label={label}>
    {Array.from({ length: n }, (_, i) => (
      <Card key={i} className="shadow-sm">
        <CardContent className="p-3 flex items-center gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="h-3.5 bg-gray-200 rounded w-32" />
              <div className="h-3 bg-gray-100 rounded w-16" />
            </div>
            <div className="h-2.5 bg-gray-100 rounded w-48" />
          </div>
          <div className="h-7 w-20 bg-gray-100 rounded flex-shrink-0 hidden sm:block" />
        </CardContent>
      </Card>
    ))}
  </div>
);

export const EmptyState: React.FC<{
  title: string; hint: string; total: number; onReset?: () => void; resetLabel?: string; children?: React.ReactNode;
}> = ({ title, hint, total, onReset, resetLabel, children }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <CalendarDays className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
      {onReset && total > 0 && (
        <Button variant="outline" size="sm" className="mt-3 text-xs h-9" onClick={onReset}>
          {resetLabel || `Show all ${total}`}
        </Button>
      )}
      {children}
    </CardContent>
  </Card>
);

export const ErrorCard: React.FC<{ title: string; message: string; onRetry: () => void }> = ({ title, message, onRetry }) => (
  <Card className="border-red-300 bg-red-50" role="alert">
    <CardContent className="p-3 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-xs flex-1">
        <p className="font-semibold text-red-800">{title}</p>
        <p className="text-red-700 mt-0.5 font-mono break-all">{message}</p>
        <p className="text-red-600 mt-1">If this says "JWT" or "401/403", log out and back in to refresh your session.</p>
      </div>
      <Button variant="outline" size="sm" className="h-9 text-xs" onClick={onRetry}>Retry</Button>
    </CardContent>
  </Card>
);
