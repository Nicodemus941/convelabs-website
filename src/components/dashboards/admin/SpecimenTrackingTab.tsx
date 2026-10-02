/**
 * SpecimenTrackingTab — chain of custody for every specimen we drew.
 *
 * Rendered for BOTH admin roles (super_admin + office_manager) via
 * Dashboard.tsx SECTION_SCREENS["lab/specimens"]; one component, not one per
 * role. Role-specific extras (CSV export, insights strip) gate on
 * `super_admin` inside this file, mirroring LabOrdersTab.
 *
 * Sources:
 *   specimen_deliveries — one row per confirmed drop-off / shipment, written
 *                         by the phleb app (SpecimenDeliveryModal and
 *                         AdditionalSpecimenDelivery).
 *   appointments        — completed visits in the last 60 days, so a draw
 *                         that never got a delivery row shows up as a gap
 *                         instead of silently vanishing.
 *   patient_lab_requests — joined by appointment_id for the lab-order file.
 *
 * Every item maps to exactly ONE bucket (see deriveBucket) so the stat
 * tiles, the filter chips and the list always agree:
 *
 *   missing              completed appointment, no delivery row   (needs action)
 *   shipped_no_tracking  shipping row with tracking_number NULL   (needs action)
 *   possible_duplicate   real-looking specimen_id shared by >1 row (needs action)
 *   delivered            everything else
 *   in_transit           NOT YET — see the comment on Bucket. The data to
 *                        support it (a real collected_at + an in_transit
 *                        status) is drafted in supabase/migrations/
 *                        20261002120000_specimen_chain_of_custody.sql and is
 *                        not applied. Slot it in there when it lands.
 *
 * Data caveats this file works around (verified against live data, Oct 2026):
 *   • collection_time is always == delivered_at, so it is NOT a draw time and
 *     is deliberately not shown as one.
 *   • delivered_by is free text with spelling variants of the same person;
 *     phlebName() collapses them for display only — the DB is untouched.
 *   • Shipping rows (lab_name "UPS (Shipping)" / "FedEx (Shipping)") carry the
 *     carrier number in specimen_id with tracking_number NULL. They still land
 *     in shipped_no_tracking so an admin confirms it as the tracking number
 *     (one click in the drawer pre-fills it).
 *   • AdventHealth doesn't issue IDs, so specimen_id holds placeholders like
 *     "No lab-issued ID" / "AdventHealth Orlando" — those are excluded from
 *     duplicate detection.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase, publicStorageUrl } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toDateOnly } from '@/lib/appointmentDate';
import {
  FlaskConical, Loader2, RefreshCw, Search, Calendar, AlertTriangle, ExternalLink, FileText,
  ChevronRight, Download, MoreHorizontal, Copy, Check, X, Truck, Building2, Package, Layers,
  BarChart3, MapPin,
} from 'lucide-react';
import { formatDistanceToNowStrict, isValid } from 'date-fns';
import { toast } from 'sonner';

// Untyped table access — the generated Database type for specimen_deliveries
// predates order_label / delivery_method / courier / tracking_number.
const db = supabase as any;

// ──────────────────────────────────────────────────────────────────
// Time — America/New_York day boundaries. The old screen compared the UTC
// date of delivered_at with the UTC date of "now", which made a 9 PM ET
// delivery count as "tomorrow". Everything here goes through etDateKey().
// ──────────────────────────────────────────────────────────────────
const ET = 'America/New_York';
const etKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' });
const etDateTimeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const etDateTimeYearFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const etDateFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric' });

/** YYYY-MM-DD of an instant, in Eastern time. */
export function etDateKey(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!isValid(date)) return '';
  return etKeyFmt.format(date);
}
const fmtET = (ts: string | null | undefined, withYear = false) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (!isValid(d)) return '—';
  return (withYear ? etDateTimeYearFmt : etDateTimeFmt).format(d);
};
const ago = (ts: string | Date) => {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return isValid(d) ? formatDistanceToNowStrict(d, { addSuffix: true }) : '';
};

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Couldn't copy ${what.toLowerCase()}`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────
export interface DeliveryRow {
  id: string;
  appointment_id: string;
  patient_id: string | null;
  patient_name: string | null;
  specimen_id: string;
  lab_name: string;
  lab_address: string | null;
  delivered_by: string | null;
  delivered_at: string | null;
  delivery_notes: string | null;
  tube_count: number | null;
  tube_types: string | null;
  service_type: string | null;
  collection_time: string | null;
  photo_proof_url: string | null;
  status: string | null;
  created_at: string | null;
  order_label: string | null;
  delivery_method: string | null;
  courier: string | null;
  tracking_number: string | null;
}

/** The slice of `appointments` we need for the custody timeline + gaps. */
interface ApptMeta {
  id: string;
  patient_name: string | null;
  appointment_date: string;
  appointment_time: string | null;
  completion_time: string | null;
  job_started_at: string | null;
  phlebotomist_id: string | null;
  service_type: string | null;
  lab_destination: string | null;
  lab_order_file_path: string | null;
  status: string;
  created_at: string | null;
}

/** One list item: a delivery row, or a completed visit with no delivery row. */
export type Item =
  | { kind: 'delivery'; id: string; row: DeliveryRow; appt: ApptMeta | null; labOrderPath: string | null }
  | { kind: 'missing'; id: string; appt: ApptMeta; labOrderPath: string | null };

const DELIVERY_COLUMNS = [
  'id', 'appointment_id', 'patient_id', 'patient_name', 'specimen_id', 'lab_name', 'lab_address',
  'delivered_by', 'delivered_at', 'delivery_notes', 'tube_count', 'tube_types', 'service_type',
  'collection_time', 'photo_proof_url', 'status', 'created_at', 'order_label', 'delivery_method',
  'courier', 'tracking_number',
].join(', ');

const APPT_COLUMNS = [
  'id', 'patient_name', 'appointment_date', 'appointment_time', 'completion_time', 'job_started_at',
  'phlebotomist_id', 'service_type', 'lab_destination', 'lab_order_file_path', 'status', 'created_at',
].join(', ');

/** How far back we look for completed visits with no delivery row. */
const MISSING_LOOKBACK_DAYS = 60;

// ──────────────────────────────────────────────────────────────────
// Carrier / shipping helpers
// ──────────────────────────────────────────────────────────────────
export type Carrier = 'ups' | 'fedex' | 'usps';

/** Classify a code the way the phleb app's label scanner does. */
export function carrierFromCode(value: string | null | undefined): Carrier | null {
  const s = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (!s) return null;
  if (/^1Z[A-Z0-9]{16}$/.test(s)) return 'ups';
  if (/^\d{12}$/.test(s) || /^\d{15}$/.test(s) || (/^\d{20,22}$/.test(s) && s.startsWith('96'))) return 'fedex';
  if (/^(94|93|92|420)\d{18,24}$/.test(s)) return 'usps';
  return null;
}

export function isShipping(r: DeliveryRow): boolean {
  const m = (r.delivery_method || '').toLowerCase();
  if (m === 'ship' || m === 'shipping' || m === 'shipped') return true;
  if (r.courier) return true;
  return /shipping|\bups\b|fedex|usps/i.test(r.lab_name || '');
}

export function carrierOf(r: DeliveryRow): Carrier | null {
  const c = (r.courier || '').toLowerCase();
  if (c === 'ups' || c === 'fedex' || c === 'usps') return c;
  const n = (r.lab_name || '').toLowerCase();
  if (/\bups\b/.test(n)) return 'ups';
  if (n.includes('fedex')) return 'fedex';
  if (n.includes('usps')) return 'usps';
  return carrierFromCode(r.tracking_number) || carrierFromCode(r.specimen_id);
}

const CARRIER_LABEL: Record<Carrier, string> = { ups: 'UPS', fedex: 'FedEx', usps: 'USPS' };

export function trackingUrl(carrier: Carrier | null, code: string | null | undefined): string | null {
  const n = String(code || '').replace(/\s+/g, '');
  if (!n) return null;
  switch (carrier) {
    case 'ups': return `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`;
    case 'fedex': return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`;
    case 'usps': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`;
    default: return null;
  }
}

/** The number we can actually track on: the real column, else a specimen_id
 *  that is unmistakably a carrier code (the 2026 shipping rows). */
export function effectiveTracking(r: DeliveryRow): { code: string; carrier: Carrier | null; confirmed: boolean } | null {
  if (r.tracking_number) return { code: r.tracking_number, carrier: carrierOf(r), confirmed: true };
  if (isShipping(r)) {
    const c = carrierFromCode(r.specimen_id);
    if (c) return { code: r.specimen_id, carrier: c, confirmed: false };
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────
// Lab / phleb normalisation — display only.
// ──────────────────────────────────────────────────────────────────
export function labDisplay(name: string | null | undefined): string {
  const s = (name || '').trim();
  if (!s) return 'Unknown lab';
  return s.replace(/\s*\(shipping\)\s*$/i, '');
}

/** Collapse spelling variants of the same phlebotomist for DISPLAY only.
 *  Live data has "Nicodemme Nico Jean-Baptiste", 'Nicodemme "Nico" Jean-Baptiste'
 *  and "Nico" for one person. Strips quoted nicknames, then applies an alias
 *  table keyed on the stripped lower-case form. */
const PHLEB_ALIASES: Array<{ test: (s: string) => boolean; name: string }> = [
  { test: s => s === 'nico' || (s.includes('nicodemme') && s.includes('jean')), name: 'Nicodemme Jean-Baptiste' },
];
export function phlebName(raw: string | null | undefined): string {
  let s = String(raw || '').replace(/["“”‘’']([^"“”‘’']{1,20})["“”‘’']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '—';
  const key = s.toLowerCase();
  for (const a of PHLEB_ALIASES) if (a.test(key)) return a.name;
  // Drop a bare middle-token nickname ("First Nick Last" → "First Last") when
  // the first/last pair already reads as a full name.
  const parts = s.split(' ');
  if (parts.length === 3 && parts[1].length <= 5 && /^[A-Z]/.test(parts[1])) s = `${parts[0]} ${parts[2]}`;
  return s;
}

// ──────────────────────────────────────────────────────────────────
// Buckets — ONE per item so counts always match the list.
// ──────────────────────────────────────────────────────────────────
export type Bucket =
  | 'missing'
  | 'shipped_no_tracking'
  | 'possible_duplicate'
  // | 'in_transit'   ← reserved: "drawn, not yet delivered". Needs a real
  //                     collected_at + status='in_transit' on specimen_deliveries
  //                     (migration drafted, not applied). Add it here, in
  //                     BUCKET_META, FILTERS and TILE_KEYS, and derive it in
  //                     deriveBucket() when row.status === 'in_transit'.
  | 'delivered';

/** Placeholder specimen IDs that must never count as duplicates. */
export function looksLikeRealSpecimenId(id: string | null | undefined): boolean {
  const s = String(id || '').trim();
  if (!s) return false;
  if (/^no\s/i.test(s)) return false;                 // "No lab-issued ID", "No delivery required"
  if (!/\d/.test(s)) return false;                    // "AdventHealth Orlando", "Altamonte"
  return s.replace(/[^A-Za-z0-9]/g, '').length >= 5;
}

export function duplicateIdSet(rows: DeliveryRow[]): Set<string> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!looksLikeRealSpecimenId(r.specimen_id)) continue;
    const k = r.specimen_id.replace(/\s+/g, '').toUpperCase();
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const dupes = new Set<string>();
  seen.forEach((n, k) => { if (n > 1) dupes.add(k); });
  return dupes;
}

export function deriveBucket(item: Item, dupes: Set<string>): Bucket {
  if (item.kind === 'missing') return 'missing';
  const r = item.row;
  // Reserved: if (r.status === 'in_transit') return 'in_transit';
  if (isShipping(r) && !r.tracking_number) return 'shipped_no_tracking';
  if (looksLikeRealSpecimenId(r.specimen_id) && dupes.has(r.specimen_id.replace(/\s+/g, '').toUpperCase())) return 'possible_duplicate';
  return 'delivered';
}

const NEEDS_ACTION: ReadonlySet<Bucket> = new Set<Bucket>(['missing', 'shipped_no_tracking', 'possible_duplicate']);

interface BucketMeta { label: string; short: string; desc: string; pill: string; tile: string; dot: string }

const BUCKET_META: Record<Bucket, BucketMeta> = {
  missing: {
    label: 'Missing record', short: 'Missing',
    desc: `Visit was completed but no specimen delivery was logged (last ${MISSING_LOOKBACK_DAYS} days)`,
    pill: 'bg-red-100 text-red-800 border-red-200',
    tile: 'border-red-300 bg-red-50 text-red-800',
    dot: 'bg-red-500',
  },
  shipped_no_tracking: {
    label: 'Shipped · no tracking', short: 'No tracking',
    desc: 'Shipped by courier but no tracking number is on the record',
    pill: 'bg-amber-100 text-amber-800 border-amber-200',
    tile: 'border-amber-300 bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
  },
  possible_duplicate: {
    label: 'Possible duplicate', short: 'Duplicate',
    desc: 'The same specimen ID appears on more than one delivery',
    pill: 'bg-purple-100 text-purple-800 border-purple-200',
    tile: 'border-purple-300 bg-purple-50 text-purple-800',
    dot: 'bg-purple-500',
  },
  delivered: {
    label: 'Delivered', short: 'Delivered',
    desc: 'Dropped at the lab or handed to the courier with tracking',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    tile: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
  },
};

type FilterKey = 'all' | 'needs_action' | Bucket;

const FILTERS: Array<{ key: FilterKey; label: string; desc: string; match: (b: Bucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every specimen in the selected range', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Missing record, shipped without tracking, or a possible duplicate', match: b => NEEDS_ACTION.has(b) },
  { key: 'missing', label: 'Missing record', desc: BUCKET_META.missing.desc, match: b => b === 'missing' },
  { key: 'shipped_no_tracking', label: 'No tracking', desc: BUCKET_META.shipped_no_tracking.desc, match: b => b === 'shipped_no_tracking' },
  { key: 'possible_duplicate', label: 'Possible duplicate', desc: BUCKET_META.possible_duplicate.desc, match: b => b === 'possible_duplicate' },
  { key: 'delivered', label: 'Delivered', desc: BUCKET_META.delivered.desc, match: b => b === 'delivered' },
];

/** Tiles: needs-action roll-up, its three parts, and delivered. */
const TILE_KEYS: FilterKey[] = ['needs_action', 'missing', 'shipped_no_tracking', 'possible_duplicate', 'delivered'];
const TILE_STYLE: Record<string, string> = {
  needs_action: 'border-red-300 bg-red-50 text-red-800',
  missing: BUCKET_META.missing.tile,
  shipped_no_tracking: BUCKET_META.shipped_no_tracking.tile,
  possible_duplicate: BUCKET_META.possible_duplicate.tile,
  delivered: BUCKET_META.delivered.tile,
};

type RangeKey = 'today' | '7d' | '30d' | 'all';
const RANGES: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'all', label: 'All', days: null },
];

type MethodKey = 'all' | 'dropoff' | 'shipping';

// ──────────────────────────────────────────────────────────────────
// Item accessors — the one place that knows which side of the union to read.
// ──────────────────────────────────────────────────────────────────
const patientOf = (it: Item) => (it.kind === 'delivery' ? it.row.patient_name : it.appt.patient_name) || 'Unknown patient';
const labOf = (it: Item) => it.kind === 'delivery' ? labDisplay(it.row.lab_name) : labDisplay(it.appt.lab_destination) === 'Unknown lab' ? '—' : labDisplay(it.appt.lab_destination);
const apptIdOf = (it: Item) => it.kind === 'delivery' ? it.row.appointment_id : it.appt.id;
const shippingOf = (it: Item) => it.kind === 'delivery' && isShipping(it.row);

/** The instant a row sorts / ranges on: delivery time, or the visit day. */
function primaryKeyOf(it: Item): string {
  if (it.kind === 'delivery') return etDateKey(it.row.delivered_at || it.row.created_at);
  return toDateOnly(it.appt.completion_time || it.appt.appointment_date);
}
function primaryInstantOf(it: Item): number {
  if (it.kind === 'delivery') return new Date(it.row.delivered_at || it.row.created_at || 0).getTime();
  return new Date(it.appt.completion_time || it.appt.appointment_date).getTime();
}

/** When the visit was finished, for the custody timeline. */
function completedAt(appt: ApptMeta | null): string | null {
  if (!appt) return null;
  return appt.completion_time || null;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

interface RowHandlers {
  basePath: string;
  onOpen: (it: Item) => void;
}

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const SpecimenTrackingTab: React.FC = () => {
  const { user } = useAuth();
  const basePath = `/dashboard/${user?.role === 'office_manager' ? 'office_manager' : 'super_admin'}`;
  const isSuperAdmin = user?.role === 'super_admin';

  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [apptMap, setApptMap] = useState<Map<string, ApptMeta>>(new Map());
  const [missingAppts, setMissingAppts] = useState<ApptMeta[]>([]);
  const [labOrderMap, setLabOrderMap] = useState<Map<string, string>>(new Map());
  const [staffNames, setStaffNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [range, setRange] = useState<RangeKey>(() => {
    try { return (localStorage.getItem('convelabs_specimens_range') as RangeKey) || '30d'; } catch { return '30d'; }
  });
  useEffect(() => { try { localStorage.setItem('convelabs_specimens_range', range); } catch {} }, [range]);
  const [lab, setLab] = useState<string>('all');
  const [method, setMethod] = useState<MethodKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const since = new Date(Date.now() - MISSING_LOOKBACK_DAYS * 86400000).toISOString();
      const [delRes, apptRes] = await Promise.all([
        db.from('specimen_deliveries').select(DELIVERY_COLUMNS).order('delivered_at', { ascending: false }).limit(2000),
        db.from('appointments').select(APPT_COLUMNS).eq('status', 'completed').gte('appointment_date', since).order('appointment_date', { ascending: false }),
      ]);
      if (delRes.error) throw delRes.error;
      const list = ((delRes.data as any[]) || []) as DeliveryRow[];
      const recentCompleted = ((apptRes.data as any[]) || []) as ApptMeta[];
      if (apptRes.error) console.warn('[SpecimenTrackingTab] completed-appointments query failed:', apptRes.error);

      const deliveredApptIds = new Set(list.map(r => r.appointment_id));
      setMissingAppts(recentCompleted.filter(a => !deliveredApptIds.has(a.id)));

      // Appointment metadata for every delivery (timeline + lab-order link).
      const aMap = new Map<string, ApptMeta>();
      for (const a of recentCompleted) aMap.set(a.id, a);
      const need = Array.from(deliveredApptIds).filter(id => id && !aMap.has(id));
      for (const ids of chunk(need, 200)) {
        const { data } = await db.from('appointments').select(APPT_COLUMNS).in('id', ids);
        for (const a of ((data as any[]) || []) as ApptMeta[]) aMap.set(a.id, a);
      }
      setApptMap(aMap);

      // Lab-order file: patient_lab_requests first, appointments.lab_order_file_path as fallback.
      const loMap = new Map<string, string>();
      const allApptIds = Array.from(new Set([...deliveredApptIds, ...recentCompleted.map(a => a.id)])).filter(Boolean);
      for (const ids of chunk(allApptIds, 200)) {
        const { data } = await db.from('patient_lab_requests').select('appointment_id, lab_order_file_path').in('appointment_id', ids).not('lab_order_file_path', 'is', null);
        for (const r of ((data as any[]) || [])) if (r.appointment_id && r.lab_order_file_path && !loMap.has(r.appointment_id)) loMap.set(r.appointment_id, r.lab_order_file_path);
      }
      aMap.forEach((a, id) => {
        if (loMap.has(id) || !a.lab_order_file_path) return;
        // Column can hold several newline-separated paths; first one wins.
        const first = a.lab_order_file_path.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
        if (first) loMap.set(id, first);
      });
      setLabOrderMap(loMap);

      setRows(list);
    } catch (err: any) {
      console.error('[SpecimenTrackingTab] load crashed:', err);
      setLastError(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Phleb display names for gap rows. There is no client-readable name
  // source for phlebotomists (staff_profiles has no name column and the
  // admin staff RPCs only cover admin roles), so infer each phlebotomist_id's
  // name from the deliveries that phleb logged on their other visits — the
  // most frequent normalised delivered_by wins. Falls back to the signed-in
  // user's own name when they are the assigned phleb.
  useEffect(() => {
    const tally = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const pid = apptMap.get(r.appointment_id)?.phlebotomist_id;
      const name = phlebName(r.delivered_by);
      if (!pid || name === '—') continue;
      const t = tally.get(pid) || new Map<string, number>();
      t.set(name, (t.get(name) || 0) + 1);
      tally.set(pid, t);
    }
    const m = new Map<string, string>();
    tally.forEach((t, pid) => {
      let best = '', n = 0;
      t.forEach((c, name) => { if (c > n) { best = name; n = c; } });
      if (best) m.set(pid, best);
    });
    const selfName = (user as any)?.user_metadata?.full_name || (user as any)?.full_name || (user as any)?.name;
    if (user?.id && selfName && !m.has(user.id)) m.set(user.id, phlebName(selfName));
    setStaffNames(m);
  }, [rows, apptMap, user]);

  // Realtime: a phleb confirming a delivery shows up without a refresh.
  useEffect(() => {
    const ch = supabase.channel(`admin-specimens-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'specimen_deliveries' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  // ── Build the unified item list ────────────────────────────────
  const items = useMemo<Item[]>(() => {
    const out: Item[] = rows.map(r => ({
      kind: 'delivery', id: r.id, row: r, appt: apptMap.get(r.appointment_id) || null,
      labOrderPath: labOrderMap.get(r.appointment_id) || null,
    }));
    for (const a of missingAppts) out.push({ kind: 'missing', id: `missing-${a.id}`, appt: a, labOrderPath: labOrderMap.get(a.id) || null });
    return out.sort((a, b) => primaryInstantOf(b) - primaryInstantOf(a));
  }, [rows, apptMap, missingAppts, labOrderMap]);

  const dupes = useMemo(() => duplicateIdSet(rows), [rows]);
  const bucketOf = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const it of items) m.set(it.id, deriveBucket(it, dupes));
    return m;
  }, [items, dupes]);

  const labOptions = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) { const k = labDisplay(r.lab_name); c.set(k, (c.get(k) || 0) + 1); }
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  }, [rows]);

  // Keep the open drawer in sync with realtime refreshes.
  useEffect(() => {
    if (!selected) return;
    const fresh = items.find(i => i.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
    if (!fresh) setSelected(null);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Range / lab / method narrow the population the tiles count over, so the
  // numbers always describe what you're looking at. Search only trims the list.
  const scoped = useMemo(() => {
    const def = RANGES.find(r => r.key === range)!;
    const fromKey = def.days ? etDateKey(new Date(Date.now() - (def.days - 1) * 86400000)) : '';
    return items.filter(it => {
      if (fromKey && primaryKeyOf(it) < fromKey) return false;
      if (lab !== 'all' && labOf(it) !== lab) return false;
      if (method === 'shipping' && !shippingOf(it)) return false;
      if (method === 'dropoff' && (shippingOf(it) || it.kind === 'missing')) return false;
      return true;
    });
  }, [items, range, lab, method]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map(f => [f.key, 0])) as Record<FilterKey, number>;
    for (const it of scoped) {
      const b = bucketOf.get(it.id)!;
      for (const f of FILTERS) if (f.match(b)) c[f.key]++;
    }
    return c;
  }, [scoped, bucketOf]);

  const filtered = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    return scoped.filter(it => {
      if (!def.match(bucketOf.get(it.id)!)) return false;
      if (q === '') return true;
      const hay: string[] = [patientOf(it), labOf(it)];
      if (it.kind === 'delivery') {
        hay.push(it.row.specimen_id || '', it.row.tracking_number || '', it.row.order_label || '', it.row.delivery_notes || '', phlebName(it.row.delivered_by));
      } else {
        hay.push(it.appt.lab_destination || '', it.appt.service_type || '');
      }
      return hay.some(h => h.toLowerCase().includes(q));
    });
  }, [scoped, filter, search, bucketOf]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(it => NEEDS_ACTION.has(bucketOf.get(it.id)!));
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(it => !NEEDS_ACTION.has(bucketOf.get(it.id)!)) };
  }, [filtered, filter, bucketOf]);

  // ── Tracking number save (drawer). RLS: "Authenticated update specimens"
  // grants UPDATE to any authenticated user, so both admin roles can do this.
  const saveTracking = useCallback(async (row: DeliveryRow, code: string) => {
    const clean = code.replace(/\s+/g, '').trim();
    if (!clean) { toast.error('Enter a tracking number'); return false; }
    const carrier = carrierOf({ ...row, tracking_number: clean });
    const patch: Record<string, any> = { tracking_number: clean };
    if (!row.courier && carrier) patch.courier = carrier;
    if (!row.delivery_method) patch.delivery_method = 'ship';
    const { data, error } = await db.from('specimen_deliveries').update(patch).eq('id', row.id).select('id');
    if (error) { toast.error(`Couldn't save: ${error.message}`); return false; }
    if (!data || data.length === 0) { toast.error("Save was blocked — your account can't update this record."); return false; }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r));
    toast.success('Tracking number saved');
    return true;
  }, []);

  const exportCSV = () => {
    const headers = ['Status', 'Patient', 'Specimen ID', 'Lab', 'Method', 'Carrier', 'Tracking', 'Tubes', 'Tube types', 'Order label', 'Delivered (ET)', 'Delivered by', 'Appointment ID', 'Notes'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map(it => {
      const b = BUCKET_META[bucketOf.get(it.id)!].label;
      if (it.kind === 'missing') {
        return [b, patientOf(it), '', labOf(it), '', '', '', '', '', '', toDateOnly(it.appt.appointment_date), staffNames.get(it.appt.phlebotomist_id || '') || '', it.appt.id, 'No delivery row'];
      }
      const r = it.row; const t = effectiveTracking(r);
      return [b, patientOf(it), r.specimen_id, labOf(it), isShipping(r) ? 'Shipping' : 'Drop-off', t?.carrier ? CARRIER_LABEL[t.carrier] : '', r.tracking_number || '', r.tube_count ?? '', r.tube_types || '', r.order_label || '', fmtET(r.delivered_at, true), phlebName(r.delivered_by), r.appointment_id, r.delivery_notes || ''];
    });
    const csv = [headers.map(esc).join(','), ...lines.map(l => l.map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `convelabs-specimens-${etDateKey(new Date())}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} row${filtered.length === 1 ? '' : 's'} exported`);
  };

  const handlers: RowHandlers = { basePath, onOpen: setSelected };
  const activeFilter = FILTERS.find(f => f.key === filter)!;
  const total = scoped.length;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900">
            <FlaskConical className="h-6 w-6 text-[#B91C1C]" aria-hidden="true" />
            Specimen tracking
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Chain of custody for every draw — drop-offs, shipments and the visits that never got logged.
            {counts.needs_action > 0 && <span className="ml-1 font-medium text-red-700">{counts.needs_action} need attention.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 text-xs h-10 sm:h-9" disabled={filtered.length === 0} aria-label="Export CSV">
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stat tiles — click to filter. Needs action = missing + no tracking + duplicate. */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible snap-x">
        <div className="grid grid-flow-col auto-cols-[46%] sm:auto-cols-auto sm:grid-cols-5 sm:grid-flow-row gap-2" role="group" aria-label="Specimen counts">
          {TILE_KEYS.map(k => {
            const def = FILTERS.find(f => f.key === k)!;
            const active = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(active ? 'all' : k)}
                aria-pressed={active}
                title={def.desc}
                className={cn(
                  'text-left rounded-lg border px-3 py-2.5 min-h-[64px] snap-start transition shadow-sm',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  active ? cn('ring-2 ring-[#B91C1C]/30', TILE_STYLE[k]) : 'bg-white border-gray-200 hover:border-[#B91C1C]/40',
                )}
              >
                <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">{def.label}</p>
                <p className={cn('text-2xl font-bold leading-tight mt-0.5', k === 'needs_action' && counts[k] > 0 && !active && 'text-red-700')}>
                  {loading ? '–' : counts[k]}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {isSuperAdmin && !loading && rows.length > 0 && <InsightsStrip rows={rows} />}

      {lastError && (
        <Card className="border-red-300 bg-red-50" role="alert">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs flex-1">
              <p className="font-semibold text-red-800">Couldn't load specimens</p>
              <p className="text-red-700 mt-0.5 font-mono break-all">{lastError}</p>
              <p className="text-red-600 mt-1">If this says "JWT" or "401/403", log out and back in to refresh your session.</p>
            </div>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={refresh}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Search + secondary filters + status chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search patient, specimen ID, lab, tracking…"
              aria-label="Search specimens"
              className="h-10 sm:h-9 pl-8 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="Date range (Eastern time)">
            {RANGES.map((r, i) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
                className={cn('px-3 h-10 sm:h-9 text-xs font-medium transition', i > 0 && 'border-l border-gray-200', range === r.key ? 'bg-[#B91C1C] text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="Delivery method">
            {([['all', 'All', null], ['dropoff', 'Drop-off', Building2], ['shipping', 'Shipping', Truck]] as Array<[MethodKey, string, any]>).map(([k, label, Icon], i) => (
              <button
                key={k}
                type="button"
                onClick={() => setMethod(k)}
                aria-pressed={method === k}
                className={cn('inline-flex items-center gap-1 px-3 h-10 sm:h-9 text-xs font-medium transition', i > 0 && 'border-l border-gray-200', method === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
              >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{label}
              </button>
            ))}
          </div>
          <select
            value={lab}
            onChange={e => setLab(e.target.value)}
            aria-label="Filter by lab"
            className={cn('h-10 sm:h-9 rounded-md border px-2.5 text-xs font-medium bg-white', lab === 'all' ? 'border-gray-200 text-gray-700' : 'border-gray-900 text-gray-900')}
          >
            <option value="all">All labs</option>
            {labOptions.map(o => <option key={o.name} value={o.name}>{o.name} ({o.n})</option>)}
          </select>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:flex-wrap" role="group" aria-label="Status filter">
          {FILTERS.map(f => {
            const active = filter === f.key;
            const n = counts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                title={f.desc}
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40',
                  active ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
                  !active && n === 0 && 'text-gray-400',
                )}
              >
                {f.key !== 'all' && f.key !== 'needs_action' && (
                  <span className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-white' : BUCKET_META[f.key as Bucket].dot)} aria-hidden="true" />
                )}
                {f.label}
                <span className={cn('tabular-nums', active ? 'opacity-90' : 'text-gray-500')}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      {loading && rows.length === 0 ? (
        <LoadingRows />
      ) : filtered.length === 0 ? (
        <EmptyState
          filterLabel={activeFilter.label}
          filterDesc={activeFilter.desc}
          hasSearch={search.trim() !== ''}
          total={total}
          grandTotal={items.length}
          onReset={() => { setFilter('all'); setSearch(''); setLab('all'); setMethod('all'); setRange('all'); }}
        />
      ) : lanes ? (
        <div className="space-y-5">
          <section aria-labelledby="lane-action">
            <LaneHeader id="lane-action" title="Needs action" count={lanes.action.length} tone="red" />
            <SpecimenRows items={lanes.action} bucketOf={bucketOf} handlers={handlers} staffNames={staffNames} />
          </section>
          {lanes.rest.length > 0 && (
            <section aria-labelledby="lane-rest">
              <LaneHeader id="lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
              <SpecimenRows items={lanes.rest} bucketOf={bucketOf} handlers={handlers} staffNames={staffNames} />
            </section>
          )}
        </div>
      ) : (
        <SpecimenRows items={filtered} bucketOf={bucketOf} handlers={handlers} staffNames={staffNames} />
      )}

      <p className="text-[11px] text-gray-400">
        Showing {filtered.length} of {total} in range · {rows.length} deliveries on file
        {missingAppts.length > 0 ? ` · ${missingAppts.length} completed visit${missingAppts.length === 1 ? '' : 's'} with no delivery row (last ${MISSING_LOOKBACK_DAYS} days)` : ''}
        {' '}· times in Eastern
      </p>

      {selected && (
        <SpecimenDetailDrawer
          item={selected}
          bucket={bucketOf.get(selected.id) || deriveBucket(selected, dupes)}
          basePath={basePath}
          staffNames={staffNames}
          siblings={selected.kind === 'delivery' ? rows.filter(r => r.id !== selected.row.id && r.specimen_id.replace(/\s+/g, '').toUpperCase() === selected.row.specimen_id.replace(/\s+/g, '').toUpperCase()) : []}
          onClose={() => setSelected(null)}
          onSaveTracking={saveTracking}
          canEditTracking={isSuperAdmin}
        />
      )}
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Insights strip (super_admin) — volume per lab, last 7 / 30 days.
// ──────────────────────────────────────────────────────────────────
const InsightsStrip: React.FC<{ rows: DeliveryRow[] }> = ({ rows }) => {
  const [win, setWin] = useState<7 | 30>(30);
  const data = useMemo(() => {
    const fromKey = etDateKey(new Date(Date.now() - (win - 1) * 86400000));
    const c = new Map<string, number>();
    let total = 0, tubes = 0, shipped = 0;
    for (const r of rows) {
      if (etDateKey(r.delivered_at || r.created_at) < fromKey) continue;
      const k = labDisplay(r.lab_name);
      c.set(k, (c.get(k) || 0) + 1);
      total++; tubes += r.tube_count || 0; if (isShipping(r)) shipped++;
    }
    const labs = Array.from(c.entries()).sort((a, b) => b[1] - a[1]);
    return { labs, total, tubes, shipped, max: labs[0]?.[1] || 1 };
  }, [rows, win]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-[#B91C1C]" aria-hidden="true" /> Volume by lab
          <span className="normal-case tracking-normal font-normal text-gray-400">· {data.total} specimen{data.total === 1 ? '' : 's'} · {data.tubes} tubes · {data.shipped} shipped</span>
        </p>
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="Insights window">
          {([7, 30] as const).map((d, i) => (
            <button key={d} type="button" onClick={() => setWin(d)} aria-pressed={win === d}
              className={cn('px-2.5 h-7 text-[11px] font-medium', i > 0 && 'border-l border-gray-200', win === d ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      {data.labs.length === 0 ? (
        <p className="text-xs text-gray-400">No deliveries in the last {win} days.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1.5">
          {data.labs.map(([name, n]) => (
            <li key={name} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-gray-700">{name}</span>
                <span className="tabular-nums font-semibold text-gray-900">{n}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-[#B91C1C]/70" style={{ width: `${Math.max(4, Math.round((n / data.max) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────
// Small presentational pieces
// ──────────────────────────────────────────────────────────────────
const LaneHeader: React.FC<{ id: string; title: string; count: number; tone: 'red' | 'gray' }> = ({ id, title, count, tone }) => (
  <div className="flex items-center gap-2 mb-2">
    <h2 id={id} className={cn('text-sm font-bold', tone === 'red' ? 'text-red-800' : 'text-gray-700')}>{title}</h2>
    <span className={cn('inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full', tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')}>{count}</span>
  </div>
);

const LoadingRows: React.FC = () => (
  <div className="space-y-1.5" aria-busy="true" aria-label="Loading specimens">
    {[1, 2, 3, 4, 5].map(i => (
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

const EmptyState: React.FC<{ filterLabel: string; filterDesc: string; hasSearch: boolean; total: number; grandTotal: number; onReset: () => void }> = ({ filterLabel, filterDesc, hasSearch, total, grandTotal, onReset }) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
      {grandTotal === 0 ? (
        <>
          <p className="text-sm font-semibold text-gray-700">No specimens recorded yet.</p>
          <p className="text-xs text-gray-500 mt-1">Deliveries appear here the moment a phlebotomist confirms one.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-700">
            {hasSearch ? 'No specimens match your search.' : total === 0 ? 'Nothing in this date range.' : `Nothing in "${filterLabel}".`}
          </p>
          <p className="text-xs text-gray-500 mt-1">{hasSearch ? 'Try a patient name, specimen ID, lab or tracking number.' : total === 0 ? 'Widen the range or clear the lab / method filter.' : filterDesc}</p>
          <Button variant="outline" size="sm" className="mt-3 text-xs h-9" onClick={onReset}>
            Show all {grandTotal}
          </Button>
        </>
      )}
    </CardContent>
  </Card>
);

const StatusPill: React.FC<{ bucket: Bucket; className?: string }> = ({ bucket, className }) => {
  const meta = BUCKET_META[bucket];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[11px] font-semibold whitespace-nowrap', meta.pill, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
};

const MethodBadge: React.FC<{ item: Item }> = ({ item }) => {
  if (item.kind === 'missing') return <span className="text-gray-400">—</span>;
  const r = item.row;
  if (isShipping(r)) {
    const c = carrierOf(r);
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-700 min-w-0">
        <Truck className="h-3 w-3 text-blue-600 flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{c ? CARRIER_LABEL[c] : 'Courier'}{labDisplay(r.lab_name) !== (c ? CARRIER_LABEL[c] : '') && !/shipping/i.test(r.lab_name) ? ` → ${labDisplay(r.lab_name)}` : ''}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-700 min-w-0">
      <Building2 className="h-3 w-3 text-gray-500 flex-shrink-0" aria-hidden="true" />
      <span className="truncate">{labDisplay(r.lab_name)}</span>
    </span>
  );
};

const SpecimenIdCell: React.FC<{ item: Item }> = ({ item }) => {
  if (item.kind === 'missing') return <span className="text-[11px] text-red-700">No delivery logged</span>;
  const r = item.row;
  const real = looksLikeRealSpecimenId(r.specimen_id);
  return (
    <span className={cn('text-[11px] truncate block', real ? 'font-mono text-gray-700' : 'text-gray-500 italic')} title={r.specimen_id}>
      {r.specimen_id}{r.order_label ? <span className="not-italic font-sans text-gray-400"> · {r.order_label}</span> : null}
    </span>
  );
};

/** Overflow menu — every secondary action in one predictable place. */
const RowMenu: React.FC<{ item: Item; h: RowHandlers; className?: string }> = ({ item, h, className }) => {
  const apptId = apptIdOf(item);
  const t = item.kind === 'delivery' ? effectiveTracking(item.row) : null;
  const tUrl = t ? trackingUrl(t.carrier, t.code) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${patientOf(item)}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => h.onOpen(item)}>
          <FileText className="h-4 w-4 mr-2" aria-hidden="true" /> Open details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.open(`${h.basePath}/calendar?appointment=${apptId}`, '_blank', 'noopener,noreferrer')}>
          <Calendar className="h-4 w-4 mr-2" aria-hidden="true" /> Open appointment
        </DropdownMenuItem>
        {tUrl && (
          <DropdownMenuItem onSelect={() => window.open(tUrl, '_blank', 'noopener,noreferrer')}>
            <Truck className="h-4 w-4 mr-2" aria-hidden="true" /> Track with {t?.carrier ? CARRIER_LABEL[t.carrier] : 'carrier'}
          </DropdownMenuItem>
        )}
        {item.labOrderPath && (
          <DropdownMenuItem onSelect={() => window.open(publicStorageUrl('lab-orders', item.labOrderPath!), '_blank', 'noopener,noreferrer')}>
            <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" /> Open lab order
          </DropdownMenuItem>
        )}
        {item.kind === 'delivery' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => copyText(item.row.specimen_id, 'Specimen ID')}>
              <Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy specimen ID
            </DropdownMenuItem>
            {t && (
              <DropdownMenuItem onSelect={() => copyText(t.code, 'Tracking number')}>
                <Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy tracking number
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const PrimaryAction: React.FC<{ item: Item; bucket: Bucket; h: RowHandlers; className?: string }> = ({ item, bucket, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (bucket === 'missing') {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 border-red-300 text-red-800 hover:bg-red-50', className)} asChild>
        <a href={`${h.basePath}/calendar?appointment=${apptIdOf(item)}`} target="_blank" rel="noopener noreferrer" onClick={stop}>
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Open visit
        </a>
      </Button>
    );
  }
  if (bucket === 'shipped_no_tracking') {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50', className)} onClick={(e) => { stop(e); h.onOpen(item); }}>
        <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Add tracking
      </Button>
    );
  }
  if (bucket === 'possible_duplicate') {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 border-purple-300 text-purple-800 hover:bg-purple-50', className)} onClick={(e) => { stop(e); h.onOpen(item); }}>
        <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Compare
      </Button>
    );
  }
  if (item.kind === 'delivery') {
    const t = effectiveTracking(item.row);
    const url = t ? trackingUrl(t.carrier, t.code) : null;
    if (url) {
      return (
        <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} asChild>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={stop}>
            <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Track
          </a>
        </Button>
      );
    }
  }
  return null;
};

const rowKeyHandler = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
};

const rowAccent = (b: Bucket) =>
  b === 'missing' ? 'border-l-4 border-l-red-500'
  : b === 'shipped_no_tracking' ? 'border-l-4 border-l-amber-400'
  : b === 'possible_duplicate' ? 'border-l-4 border-l-purple-400'
  : '';

/** "Delivered" column: the delivery instant, or the visit day for a gap. */
const WhenCell: React.FC<{ item: Item }> = ({ item }) => {
  if (item.kind === 'missing') {
    const done = completedAt(item.appt);
    return (
      <>
        <span className="block">Visit {done ? fmtET(done) : etDateFmt.format(new Date(`${toDateOnly(item.appt.appointment_date)}T12:00:00`))}</span>
        <span className="block text-[11px] text-red-600">no delivery row</span>
      </>
    );
  }
  const ts = item.row.delivered_at || item.row.created_at;
  return (
    <>
      <span className="block">{fmtET(ts)}</span>
      <span className="block text-[11px] text-gray-400">{ts ? ago(ts) : ''}</span>
    </>
  );
};

const byOf = (item: Item, staffNames: Map<string, string>) =>
  item.kind === 'delivery' ? phlebName(item.row.delivered_by) : (staffNames.get(item.appt.phlebotomist_id || '') || '—');

// ──────────────────────────────────────────────────────────────────
// Rows — table on ≥md, cards below.
// ──────────────────────────────────────────────────────────────────
const SpecimenRows: React.FC<{
  items: Item[];
  bucketOf: Map<string, Bucket>;
  handlers: RowHandlers;
  staffNames: Map<string, string>;
}> = ({ items, bucketOf, handlers, staffNames }) => {
  const bucket = (it: Item) => bucketOf.get(it.id) || 'delivered';
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 pl-4">Patient</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Lab / carrier</TableHead>
              <TableHead className="hidden lg:table-cell h-9 text-[11px] uppercase tracking-wider text-gray-500">Tubes</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500 whitespace-nowrap">Delivered</TableHead>
              <TableHead className="hidden xl:table-cell h-9 text-[11px] uppercase tracking-wider text-gray-500">By</TableHead>
              <TableHead className="h-9 text-[11px] uppercase tracking-wider text-gray-500">Status</TableHead>
              {/* Actions stay pinned to the right edge so they are never scrolled out of view on narrower screens. */}
              <TableHead className="sticky right-0 z-10 bg-gray-50 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)] h-9 text-[11px] uppercase tracking-wider text-gray-500 text-right pr-3">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(it => {
              const b = bucket(it);
              const open = () => handlers.onOpen(it);
              return (
                <TableRow
                  key={it.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${patientOf(it)}, ${BUCKET_META[b].label}. Open details`}
                  className={cn('cursor-pointer bg-white focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40', rowAccent(b))}
                >
                  <TableCell className="py-2.5 pl-4 align-top max-w-[260px]">
                    <span className="text-sm font-semibold text-gray-800 truncate block">{patientOf(it)}</span>
                    <SpecimenIdCell item={it} />
                  </TableCell>
                  <TableCell className="py-2.5 align-top max-w-[200px]">
                    {it.kind === 'missing'
                      ? <span className="text-xs text-gray-500">{labOf(it) === '—' ? <span className="text-gray-400">No lab on order</span> : <>Ordered: {labOf(it)}</>}</span>
                      : <MethodBadge item={it} />}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell py-2.5 align-top text-xs text-gray-700 whitespace-nowrap">
                    {it.kind === 'delivery' ? <>{it.row.tube_count ?? '—'}{it.row.tube_types ? <span className="text-gray-400"> · {it.row.tube_types}</span> : null}</> : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 whitespace-nowrap">
                    <WhenCell item={it} />
                  </TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-600 max-w-[160px]">
                    <span className="truncate block">{byOf(it, staffNames)}</span>
                  </TableCell>
                  <TableCell className="py-2.5 align-top">
                    <StatusPill bucket={b} />
                  </TableCell>
                  <TableCell className="sticky right-0 z-10 py-2 align-top pr-3 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                    <div className="flex items-center justify-end gap-1">
                      <PrimaryAction item={it} bucket={b} h={handlers} className="h-9" />
                      {it.kind === 'delivery' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label="Copy specimen ID" onClick={(e) => { e.stopPropagation(); copyText(it.row.specimen_id, 'Specimen ID'); }}>
                              <Copy className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy specimen ID</TooltipContent>
                        </Tooltip>
                      )}
                      <RowMenu item={it} h={handlers} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {items.map(it => {
          const b = bucket(it);
          const open = () => handlers.onOpen(it);
          return (
            <Card
              key={it.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${patientOf(it)}, ${BUCKET_META[b].label}. Open details`}
              className={cn('shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40', rowAccent(b))}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-gray-800 block truncate">{patientOf(it)}</span>
                    <SpecimenIdCell item={it} />
                  </div>
                  <StatusPill bucket={b} />
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {it.kind === 'missing'
                    ? <span className="text-gray-500">{labOf(it) === '—' ? 'No lab on order' : `Ordered: ${labOf(it)}`}</span>
                    : <MethodBadge item={it} />}
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500"><WhenCell item={it} /></span>
                </div>
                {it.kind === 'delivery' && (
                  <div className="text-xs text-gray-600">
                    {it.row.tube_count ?? '—'} tube{it.row.tube_count === 1 ? '' : 's'}{it.row.tube_types ? ` · ${it.row.tube_types}` : ''} · {phlebName(it.row.delivered_by)}
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <PrimaryAction item={it} bucket={b} h={handlers} className="h-11 flex-1 justify-center" />
                  {it.kind === 'delivery' && (
                    <Button size="sm" variant="outline" className="h-11 w-11 p-0 flex-shrink-0" aria-label="Copy specimen ID" onClick={(e) => { e.stopPropagation(); copyText(it.row.specimen_id, 'Specimen ID'); }}>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  <RowMenu item={it} h={handlers} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
                  <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
};

// ──────────────────────────────────────────────────────────────────
// Detail drawer — centered dialog on ≥sm, bottom sheet on phones.
// ──────────────────────────────────────────────────────────────────
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <span className="text-gray-500">{label}</span>
    <span className="min-w-0 break-words">{children}</span>
  </>
);

const SpecimenDetailDrawer: React.FC<{
  item: Item;
  bucket: Bucket;
  basePath: string;
  staffNames: Map<string, string>;
  siblings: DeliveryRow[];
  onClose: () => void;
  onSaveTracking: (row: DeliveryRow, code: string) => Promise<boolean>;
  /** Only platform admins may edit rows (RLS: admin_or_logger_updates_specimens). */
  canEditTracking: boolean;
}> = ({ item, bucket, basePath, staffNames, siblings, onClose, onSaveTracking, canEditTracking }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `specimen-title-${item.id}`;
  const row = item.kind === 'delivery' ? item.row : null;
  const appt = item.kind === 'delivery' ? item.appt : item.appt;
  const t = row ? effectiveTracking(row) : null;
  const tUrl = t ? trackingUrl(t.carrier, t.code) : null;
  const apptId = apptIdOf(item);

  const [trackingDraft, setTrackingDraft] = useState<string>(() => row && !row.tracking_number && t ? t.code : '');
  const [saving, setSaving] = useState(false);
  const showTrackingEditor = canEditTracking && !!row && isShipping(row) && !row.tracking_number;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  // Chain of custody. collection_time is deliberately NOT listed as a draw
  // time — on every live row it equals delivered_at (see file header).
  const timeline: Array<{ at: string; label: string; tone?: 'red' }> = [];
  if (appt?.created_at) timeline.push({ at: appt.created_at, label: 'Appointment booked' });
  if (appt?.job_started_at) timeline.push({ at: appt.job_started_at, label: 'Phlebotomist started the visit' });
  const done = completedAt(appt);
  if (done) timeline.push({ at: done, label: 'Visit completed' });
  else if (appt) timeline.push({ at: `${toDateOnly(appt.appointment_date)}T${appt.appointment_time || '12:00:00'}`, label: 'Visit (scheduled time — no completion stamp)' });
  if (row) {
    const when = row.delivered_at || row.created_at;
    if (when) timeline.push({ at: when, label: isShipping(row) ? `Handed to ${t?.carrier ? CARRIER_LABEL[t.carrier] : 'courier'}` : `Delivered to ${labDisplay(row.lab_name)}` });
  } else {
    timeline.push({ at: new Date().toISOString(), label: 'No delivery logged', tone: 'red' });
  }
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const save = async () => {
    if (!row) return;
    setSaving(true);
    try { await onSaveTracking(row, trackingDraft); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full sm:max-w-3xl mt-auto sm:mt-0 sm:max-h-[92vh] max-h-[90vh] overflow-y-auto shadow-2xl rounded-b-none sm:rounded-lg rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-0">
          <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-4 sm:p-5 sticky top-0 z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider opacity-90">{row ? (isShipping(row) ? 'Shipment' : 'Specimen delivery') : 'Completed visit'}</p>
                <h2 id={titleId} className="text-lg sm:text-xl font-bold mt-0.5 truncate">{patientOf(item)}</h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <StatusPill bucket={bucket} className="bg-white/95" />
                  {row && (
                    <span className="text-sm opacity-95 font-mono truncate">{row.specimen_id}</span>
                  )}
                </div>
              </div>
              <Button ref={closeRef} size="sm" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10 h-10 w-10 p-0 flex-shrink-0" aria-label="Close">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {bucket === 'missing' && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p>This visit is marked completed but no specimen delivery was ever logged. Open the appointment to confirm where the specimen went, then have the phlebotomist log it from their app.</p>
              </div>
            )}
            {bucket === 'shipped_no_tracking' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                <Truck className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  Shipped by courier, but the tracking-number field is empty.
                  {t && !t.confirmed ? <> The specimen ID looks like a {CARRIER_LABEL[t.carrier!]} number — confirm it below.</> : ' Add it below so the lab can be chased.'}
                </p>
              </div>
            )}
            {bucket === 'possible_duplicate' && (
              <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 flex items-start gap-2">
                <Layers className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p>Specimen ID <span className="font-mono">{row?.specimen_id}</span> is on {siblings.length + 1} delivery records.</p>
                  {siblings.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {siblings.slice(0, 6).map(s => (
                        <li key={s.id}>{s.patient_name || 'Unknown'} · {labDisplay(s.lab_name)} · {fmtET(s.delivered_at)}{s.appointment_id === row?.appointment_id ? ' · same visit' : ''}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">
              <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
                <a href={`${basePath}/calendar?appointment=${apptId}`} target="_blank" rel="noopener noreferrer">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Open appointment
                </a>
              </Button>
              {row && (
                <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => copyText(row.specimen_id, 'Specimen ID')}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy specimen ID
                </Button>
              )}
              {tUrl && (
                <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
                  <a href={tUrl} target="_blank" rel="noopener noreferrer">
                    <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Track with {CARRIER_LABEL[t!.carrier!]}
                  </a>
                </Button>
              )}
              {item.labOrderPath && (
                <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
                  <a href={publicStorageUrl('lab-orders', item.labOrderPath)} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Lab order
                  </a>
                </Button>
              )}
            </div>

            {showTrackingEditor && (
              <div className="rounded-md border border-gray-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Tracking number</p>
                <div className="flex gap-2">
                  <Input
                    value={trackingDraft}
                    onChange={e => setTrackingDraft(e.target.value)}
                    placeholder="1Z… or 12-digit FedEx number"
                    aria-label="Tracking number"
                    className="h-10 font-mono text-sm"
                    onKeyDown={e => { if (e.key === 'Enter') save(); }}
                  />
                  <Button onClick={save} disabled={saving || !trackingDraft.trim()} className="h-10 bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5 flex-shrink-0">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t && !t.confirmed && trackingDraft === t.code ? 'Confirm' : 'Save'}
                  </Button>
                </div>
                {carrierFromCode(trackingDraft) && <p className="text-[11px] text-gray-500">Detected: {CARRIER_LABEL[carrierFromCode(trackingDraft)!]}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Patient & visit</p>
                <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                  <Field label="Patient">{patientOf(item)}</Field>
                  {row?.patient_id && <Field label="Patient ID"><span className="font-mono text-[10px]">{row.patient_id}</span></Field>}
                  <Field label="Service"><span className="capitalize">{(row?.service_type || appt?.service_type || '—').replace(/-/g, ' ')}</span></Field>
                  {appt && <Field label="Visit date">{etDateFmt.format(new Date(`${toDateOnly(appt.appointment_date)}T12:00:00`))}{appt.appointment_time ? ` · ${appt.appointment_time.slice(0, 5)}` : ''}</Field>}
                  {appt?.lab_destination && <Field label="Ordered lab">{appt.lab_destination}</Field>}
                  <Field label="Phlebotomist">{byOf(item, staffNames)}</Field>
                  <Field label="Appointment"><span className="font-mono text-[10px]">{apptId}</span></Field>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">{row ? (isShipping(row) ? 'Shipment' : 'Delivery') : 'Delivery'}</p>
                {row ? (
                  <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                    <Field label="Lab">{labDisplay(row.lab_name)}</Field>
                    {row.lab_address && <Field label="Address"><span className="inline-flex items-start gap-1"><MapPin className="h-3 w-3 mt-0.5 text-gray-400 flex-shrink-0" aria-hidden="true" />{row.lab_address}</span></Field>}
                    <Field label="Method">{isShipping(row) ? `Shipping${t?.carrier ? ` · ${CARRIER_LABEL[t.carrier]}` : ''}` : 'Drop-off'}</Field>
                    <Field label="Specimen ID"><span className="font-mono">{row.specimen_id}</span></Field>
                    {t && <Field label="Tracking"><span className="font-mono">{t.code}</span>{!t.confirmed && <span className="text-amber-700"> (unconfirmed)</span>}</Field>}
                    <Field label="Tubes">{row.tube_count ?? '—'}{row.tube_types ? ` · ${row.tube_types}` : ''}</Field>
                    {row.order_label && <Field label="Order label">{row.order_label}</Field>}
                    <Field label="Delivered">{fmtET(row.delivered_at, true)}</Field>
                    <Field label="Logged by">{phlebName(row.delivered_by)}</Field>
                    <Field label="Record status"><span className="capitalize">{row.status || 'delivered'}</span></Field>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Nothing logged for this visit.</p>
                )}
              </div>

              <div className="space-y-1.5 text-sm">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Chain of custody</p>
                <ol className="space-y-1 text-xs">
                  {timeline.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', s.tone === 'red' ? 'bg-red-500' : i === timeline.length - 1 ? 'bg-[#B91C1C]' : 'bg-gray-300')} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className={cn(s.tone === 'red' ? 'text-red-800 font-semibold' : 'text-gray-800')}>{s.label}</span>
                        {s.tone !== 'red' && <span className="block text-[10px] text-gray-400">{fmtET(s.at)} · {ago(s.at)}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {row?.delivery_notes && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Delivery notes</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded px-3 py-2">{row.delivery_notes}</p>
              </div>
            )}

            {row?.photo_proof_url && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Proof of delivery</p>
                <a href={row.photo_proof_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#B91C1C] underline">Open photo</a>
              </div>
            )}

            <p className="text-[10px] text-gray-400">
              {row ? <>Record <span className="font-mono">{row.id}</span> · created {fmtET(row.created_at, true)}</> : <>Appointment <span className="font-mono">{apptId}</span></>} · times in Eastern
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SpecimenTrackingTab;
