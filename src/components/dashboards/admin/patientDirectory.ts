/**
 * patientDirectory — pure helpers for the admin Patients screen.
 *
 * Every patient maps to exactly ONE bucket (see derivePatientBucket) so the
 * stat tiles, the filter chips and the list can never disagree. Flags
 * (member, protected, missing address, …) are orthogonal: they decorate the
 * row and power the secondary "flag" chips, but never change the bucket.
 *
 * Shared by PatientProfileTab (directory) and PatientChart (one patient).
 */

import { differenceInCalendarDays, format, isValid } from 'date-fns';

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────
export interface PatientRow {
  id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  gate_code: string | null;
  insurance_provider: string | null;
  insurance_member_id: string | null;
  insurance_group_number: string | null;
  insurance_card_path?: string | null;
  patient_notes?: string | null;
  preferred_day?: string | null;
  preferred_time?: string | null;
  standing_order_doctor?: string | null;
  referred_by?: string | null;
  pays_cash?: boolean | null;
  pays_cash_note?: string | null;
  organization_id?: string | null;
  household_id?: string | null;
  lab_reminder_deadline_at?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  [key: string]: any;
}

/** The slim appointment projection the directory loads for every patient. */
export interface ApptLite {
  id: string;
  patient_id: string | null;
  status: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  payment_status: string | null;
  total_amount: number | null;
  is_vip: boolean | null;
  service_type: string | null;
  service_name: string | null;
}

export interface PatientStats {
  total: number;
  completed: number;
  /** Next live visit dated today or later (soonest first). */
  next: ApptLite | null;
  /** Most recent completed visit. */
  last: ApptLite | null;
  /** Live-status visit whose date is already behind us — nobody closed it. */
  unresolved: ApptLite | null;
  /** Dollars owed on past visits (unpaid, not cancelled). */
  balanceDue: number;
  /** appointments.is_vip on any visit — protected from auto-cancel. */
  isProtected: boolean;
}

export type MemberTier = 'member' | 'vip' | 'concierge';

// ──────────────────────────────────────────────────────────────────
// Appointment status vocab (verified against live data 2026-10-02)
// ──────────────────────────────────────────────────────────────────
export const LIVE_STATUSES: ReadonlySet<string> = new Set(['scheduled', 'confirmed', 'en_route', 'in_progress']);
export const DONE_STATUSES: ReadonlySet<string> = new Set(['completed', 'specimen_delivered']);
/** Superseded rows — never owed, never "unresolved". */
export const CLOSED_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'rescheduled']);
/** payment_status values that mean "the patient owes nothing on this row". */
export const SETTLED_PAYMENT: ReadonlySet<string> = new Set(['completed', 'paid', 'org_billed', 'not_required', 'voided', 'void']);
/** payment_status values that mean the patient themselves paid. */
export const PATIENT_PAID: ReadonlySet<string> = new Set(['completed', 'paid']);

export const APPT_STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  en_route: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
  specimen_delivered: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

/** Local calendar date of an appointment (dates are stored as timestamps but
 *  the business day is the first 10 chars — matches the rest of the app). */
export function apptDay(a: { appointment_date: string | null }): string | null {
  const d = a.appointment_date?.substring(0, 10);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function fmtDay(day: string | null, pattern = 'MMM d, yyyy'): string {
  if (!day) return '';
  const d = new Date(day + 'T12:00:00');
  return isValid(d) ? format(d, pattern) : '';
}

/** Calendar days from today to the given day (negative = past). */
export function daysFromToday(day: string | null): number | null {
  if (!day) return null;
  const d = new Date(day + 'T12:00:00');
  return isValid(d) ? differenceInCalendarDays(d, new Date()) : null;
}

// ──────────────────────────────────────────────────────────────────
// Stats — one pass over every appointment, bucketed by patient.
// ──────────────────────────────────────────────────────────────────
export function emptyStats(): PatientStats {
  return { total: 0, completed: 0, next: null, last: null, unresolved: null, balanceDue: 0, isProtected: false };
}

export function computeStats(appts: ApptLite[]): Map<string, PatientStats> {
  const today = todayKey();
  const m = new Map<string, PatientStats>();
  for (const a of appts) {
    if (!a.patient_id) continue;
    let s = m.get(a.patient_id);
    if (!s) { s = emptyStats(); m.set(a.patient_id, s); }
    s.total++;
    if (a.is_vip) s.isProtected = true;
    const day = apptDay(a);
    const status = a.status || '';
    const isPast = !!day && day < today;
    if (DONE_STATUSES.has(status)) {
      s.completed++;
      if (!s.last || (day && (apptDay(s.last) || '') < day)) s.last = a;
    } else if (LIVE_STATUSES.has(status)) {
      if (day && day >= today) {
        if (!s.next || day < (apptDay(s.next) || '')) s.next = a;
      } else if (day) {
        if (!s.unresolved || day > (apptDay(s.unresolved) || '')) s.unresolved = a;
      }
    }
    if (!CLOSED_STATUSES.has(status) && (isPast || DONE_STATUSES.has(status)) && !SETTLED_PAYMENT.has(a.payment_status || '')) {
      s.balanceDue += Number(a.total_amount) || 0;
    }
  }
  return m;
}

// ──────────────────────────────────────────────────────────────────
// Buckets — ONE per patient, in priority order.
// ──────────────────────────────────────────────────────────────────
export type PatientBucket = 'balance_due' | 'unresolved_visit' | 'upcoming' | 'active' | 'never_booked';

export function derivePatientBucket(stats: PatientStats | undefined): PatientBucket {
  if (!stats || stats.total === 0) return 'never_booked';
  if (stats.balanceDue > 0) return 'balance_due';
  if (stats.unresolved) return 'unresolved_visit';
  if (stats.next) return 'upcoming';
  return 'active';
}

export const NEEDS_ACTION: ReadonlySet<PatientBucket> = new Set<PatientBucket>(['balance_due', 'unresolved_visit']);

export interface BucketMeta {
  label: string;
  short: string;
  desc: string;
  pill: string;
  tile: string;
  dot: string;
}

export const BUCKET_META: Record<PatientBucket, BucketMeta> = {
  balance_due: {
    label: 'Balance due', short: 'Balance due',
    desc: 'A past visit is still unpaid — collect or write it off',
    pill: 'bg-red-100 text-red-800 border-red-200',
    tile: 'border-red-300 bg-red-50 text-red-800',
    dot: 'bg-red-500',
  },
  unresolved_visit: {
    label: 'Unresolved visit', short: 'Unresolved',
    desc: 'A visit date has passed but nobody completed or cancelled it',
    pill: 'bg-orange-100 text-orange-800 border-orange-200',
    tile: 'border-orange-300 bg-orange-50 text-orange-800',
    dot: 'bg-orange-500',
  },
  upcoming: {
    label: 'Upcoming', short: 'Upcoming',
    desc: 'Has a visit booked today or later',
    pill: 'bg-blue-100 text-blue-800 border-blue-200',
    tile: 'border-blue-300 bg-blue-50 text-blue-800',
    dot: 'bg-blue-500',
  },
  active: {
    label: 'Active', short: 'Active',
    desc: 'Has visited before — nothing booked right now',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    tile: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  never_booked: {
    label: 'Never booked', short: 'Never booked',
    desc: 'On file but has never had a visit',
    pill: 'bg-gray-100 text-gray-700 border-gray-200',
    tile: 'border-gray-300 bg-gray-100 text-gray-800',
    dot: 'bg-gray-400',
  },
};

export type PatientFilterKey = 'all' | 'needs_action' | PatientBucket;

export const PATIENT_FILTERS: Array<{ key: PatientFilterKey; label: string; desc: string; match: (b: PatientBucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every patient on file', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Unpaid past visits or visits nobody closed out', match: (b) => NEEDS_ACTION.has(b) },
  { key: 'balance_due', label: 'Balance due', desc: BUCKET_META.balance_due.desc, match: (b) => b === 'balance_due' },
  { key: 'unresolved_visit', label: 'Unresolved', desc: BUCKET_META.unresolved_visit.desc, match: (b) => b === 'unresolved_visit' },
  { key: 'upcoming', label: 'Upcoming', desc: BUCKET_META.upcoming.desc, match: (b) => b === 'upcoming' },
  { key: 'active', label: 'Active', desc: BUCKET_META.active.desc, match: (b) => b === 'active' },
  { key: 'never_booked', label: 'Never booked', desc: BUCKET_META.never_booked.desc, match: (b) => b === 'never_booked' },
];

/** The four tiles partition every patient (needs_action = balance_due + unresolved_visit). */
export const PATIENT_TILE_KEYS: PatientFilterKey[] = ['needs_action', 'upcoming', 'active', 'never_booked'];

export const PATIENT_TILE_STYLE: Record<string, string> = {
  needs_action: 'border-red-300 bg-red-50 text-red-800',
  upcoming: BUCKET_META.upcoming.tile,
  active: BUCKET_META.active.tile,
  never_booked: BUCKET_META.never_booked.tile,
};

// ──────────────────────────────────────────────────────────────────
// Data quality — detect records that are not really a patient, or whose
// identity fields can't be trusted. Pure detection: nothing here edits data.
// (Counts verified against live tenant_patients 2026-10-02: 1 org-as-patient,
// 2 Jan-1 DOBs, 8 DOBs within the last year, 30 shared phones, 11 same
// name+DOB pairs, 2 malformed emails.)
// ──────────────────────────────────────────────────────────────────
export type DataQualityKey = 'org_name' | 'dob_future' | 'dob_recent' | 'dob_placeholder' | 'dob_implausible' | 'bad_email' | 'bad_phone' | 'missing_name' | 'test_record' | 'duplicate';

export interface DataQualityIssue {
  key: DataQualityKey;
  /** Short chip text. */
  label: string;
  /** One sentence for the notice / tooltip. */
  detail: string;
  severity: 'warn' | 'error';
}

/** Words that mean "this is an office, not a person". Whole-word, case-insensitive. */
const ORG_WORDS = /\b(clinic|clinical|associates|medical|health|healthcare|center|centre|practice|group|llc|inc|pllc|corp|wellness|hospital|physicians?|cardiology|pediatrics|dermatology|urgent care|laboratory|labs?|office|institute|partners|services)\b/i;

export function looksLikeOrganization(p: { first_name?: string | null; last_name?: string | null; email?: string | null }): boolean {
  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  if (!name) return false;
  if (ORG_WORDS.test(name)) return true;
  // "Dr. Smith's Office" style, or an "of"/"&" business name with 3+ words.
  if (/\bof\b|&/.test(name) && name.split(/\s+/).length >= 3) return true;
  return false;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Problems with a DOB string (yyyy-mm-dd). `null` means it looks fine or is blank. */
export function dobIssue(dob: string | null | undefined, now: Date = new Date()): DataQualityIssue | null {
  if (!dob) return null;
  const d = new Date(dob.substring(0, 10) + 'T12:00:00');
  if (!isValid(d)) return { key: 'dob_implausible', label: 'Bad DOB', detail: 'Date of birth is not a valid date.', severity: 'error' };
  // Compare calendar days so a DOB of "today" (newborn) is not flagged as future.
  if (dob.substring(0, 10) > format(now, 'yyyy-MM-dd')) return { key: 'dob_future', label: 'DOB in future', detail: `Date of birth ${fmtDay(dob.substring(0, 10))} is in the future.`, severity: 'error' };
  const ageYears = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (ageYears > 115) return { key: 'dob_implausible', label: 'DOB implausible', detail: `Date of birth ${fmtDay(dob.substring(0, 10))} would make them over 115.`, severity: 'error' };
  if (ageYears < 1) return { key: 'dob_recent', label: 'DOB < 1 yr', detail: `Date of birth ${fmtDay(dob.substring(0, 10))} is within the last year — usually the booking date was typed by mistake.`, severity: 'warn' };
  if (/-01-01$/.test(dob.substring(0, 10))) return { key: 'dob_placeholder', label: 'Jan 1 DOB', detail: `Date of birth ${fmtDay(dob.substring(0, 10))} is January 1 — often a placeholder. Confirm with the patient before it goes on a requisition.`, severity: 'warn' };
  return null;
}

export interface DuplicateHit {
  /** Why the two records collide. */
  reason: 'email' | 'phone' | 'name_dob' | 'name';
  other: PatientRow;
}

/**
 * Index every patient by the identity keys that should be unique. Returns a
 * map patientId → hits (other records sharing a key). Exact-name-only
 * collisions are included as the weakest signal and only when neither row
 * has a DOB to disambiguate.
 */
export function buildDuplicateIndex(rows: PatientRow[]): Map<string, DuplicateHit[]> {
  const byEmail = new Map<string, PatientRow[]>();
  const byPhone = new Map<string, PatientRow[]>();
  const byNameDob = new Map<string, PatientRow[]>();
  const byName = new Map<string, PatientRow[]>();
  const push = (m: Map<string, PatientRow[]>, k: string, p: PatientRow) => { const l = m.get(k); if (l) l.push(p); else m.set(k, [p]); };
  for (const p of rows) {
    const e = (p.email || '').trim().toLowerCase();
    if (e) push(byEmail, e, p);
    const ph = digits(p.phone);
    if (ph.length >= 10) push(byPhone, ph.slice(-10), p);
    const n = fullName(p).toLowerCase().replace(/\s+/g, ' ');
    if (n && n !== 'unnamed patient') {
      push(byName, n, p);
      if (p.date_of_birth) push(byNameDob, `${n}|${p.date_of_birth.substring(0, 10)}`, p);
    }
  }
  const out = new Map<string, DuplicateHit[]>();
  const add = (p: PatientRow, hit: DuplicateHit) => {
    const l = out.get(p.id) || [];
    if (!l.some(h => h.other.id === hit.other.id)) { l.push(hit); out.set(p.id, l); }
  };
  const sweep = (m: Map<string, PatientRow[]>, reason: DuplicateHit['reason'], guard?: (a: PatientRow, b: PatientRow) => boolean) => {
    for (const list of m.values()) {
      if (list.length < 2) continue;
      for (const a of list) for (const b of list) {
        if (a.id === b.id) continue;
        if (guard && !guard(a, b)) continue;
        add(a, { reason, other: b });
      }
    }
  };
  sweep(byEmail, 'email');
  sweep(byPhone, 'phone');
  sweep(byNameDob, 'name_dob');
  // Same name, and at least one side has no DOB (so we can't rule it out).
  sweep(byName, 'name', (a, b) => !a.date_of_birth || !b.date_of_birth || a.date_of_birth === b.date_of_birth);
  return out;
}

export const DUP_REASON_LABEL: Record<DuplicateHit['reason'], string> = {
  email: 'same email',
  phone: 'same phone',
  name_dob: 'same name and DOB',
  name: 'same name',
};

/** Every data-quality issue on one record (not counting duplicates — pass `dups` for those). */
export function dataQualityIssues(p: PatientRow, dups?: DuplicateHit[]): DataQualityIssue[] {
  const out: DataQualityIssue[] = [];
  if (looksLikeOrganization(p)) {
    out.push({ key: 'org_name', label: 'Looks like a clinic', detail: `"${fullName(p)}" reads like an organization, not a person. Visits for a practice belong under Organizations; the people drawn should each be their own patient.`, severity: 'error' });
  }
  const dob = dobIssue(p.date_of_birth);
  if (dob) out.push(dob);
  const email = (p.email || '').trim();
  if (email && !EMAIL_RE.test(email)) out.push({ key: 'bad_email', label: 'Bad email', detail: `"${email}" is not a valid email address — sends will fail.`, severity: 'error' });
  const ph = digits(p.phone);
  if ((p.phone || '').trim() && ph.length < 10) out.push({ key: 'bad_phone', label: 'Bad phone', detail: `"${p.phone}" has fewer than 10 digits — texts will fail.`, severity: 'error' });
  if (!(p.first_name || '').trim() || !(p.last_name || '').trim()) out.push({ key: 'missing_name', label: 'Name incomplete', detail: 'First or last name is blank.', severity: 'warn' });
  if (/\btest\b/i.test(`${p.first_name || ''} ${p.last_name || ''}`)) out.push({ key: 'test_record', label: 'Test record', detail: 'The name contains "test" — probably not a real patient.', severity: 'warn' });
  if (dups && dups.length > 0) {
    const strong = dups.filter(d => d.reason !== 'name');
    out.push({
      key: 'duplicate',
      label: strong.length > 0 ? 'Possible duplicate' : 'Same name',
      detail: `${dups.length} other record${dups.length === 1 ? '' : 's'} with the ${Array.from(new Set(dups.map(d => DUP_REASON_LABEL[d.reason]))).join(' / ')}.`,
      severity: strong.length > 0 ? 'warn' : 'warn',
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Flags — orthogonal to buckets. Multi-select AND filter.
// ──────────────────────────────────────────────────────────────────
export type PatientFlag = 'member' | 'protected' | 'missing_address' | 'no_contact' | 'no_dob' | 'lab_overdue' | 'data_quality' | 'duplicate';

export interface FlagContext {
  stats: PatientStats | undefined;
  tier: MemberTier | undefined;
  /** From buildDuplicateIndex — optional so older callers keep working. */
  dups?: DuplicateHit[];
}

export const FLAG_META: Record<PatientFlag, { label: string; desc: string; chip: string; test: (p: PatientRow, c: FlagContext) => boolean }> = {
  member: {
    label: 'Members', desc: 'Has an active paid membership',
    chip: 'border-emerald-300 text-emerald-800 bg-emerald-50',
    test: (_p, c) => !!c.tier,
  },
  protected: {
    label: 'Protected', desc: 'Flagged on a visit as protected from auto-cancel (not a paid member)',
    chip: 'border-slate-300 text-slate-700 bg-slate-50',
    test: (_p, c) => !!c.stats?.isProtected && !c.tier,
  },
  missing_address: {
    label: 'Missing address', desc: 'No street address on the patient record',
    chip: 'border-amber-300 text-amber-800 bg-amber-50',
    test: (p) => !(p.address || '').trim(),
  },
  no_contact: {
    label: 'No contact', desc: 'Neither a phone number nor an email on file',
    chip: 'border-red-300 text-red-800 bg-red-50',
    test: (p) => !(p.phone || '').trim() && !(p.email || '').trim(),
  },
  no_dob: {
    label: 'No DOB', desc: 'Date of birth missing — labs need it on the requisition',
    chip: 'border-gray-300 text-gray-700 bg-gray-50',
    test: (p) => !p.date_of_birth,
  },
  lab_overdue: {
    label: 'Lab deadline passed', desc: 'Provider-set lab reminder deadline is behind us',
    chip: 'border-purple-300 text-purple-800 bg-purple-50',
    test: (p) => !!p.lab_reminder_deadline_at && new Date(p.lab_reminder_deadline_at).getTime() < Date.now(),
  },
  data_quality: {
    label: 'Data check', desc: 'Looks like a clinic, placeholder or impossible DOB, malformed email/phone, or a test record',
    chip: 'border-amber-400 text-amber-900 bg-amber-50',
    test: (p) => dataQualityIssues(p).length > 0,
  },
  duplicate: {
    label: 'Possible duplicate', desc: 'Shares an email, phone, or name + DOB with another patient record',
    chip: 'border-fuchsia-300 text-fuchsia-800 bg-fuchsia-50',
    test: (_p, c) => !!c.dups && c.dups.length > 0,
  },
};

export const FLAG_KEYS: PatientFlag[] = ['member', 'protected', 'data_quality', 'duplicate', 'missing_address', 'no_contact', 'no_dob', 'lab_overdue'];

// ──────────────────────────────────────────────────────────────────
// Misc helpers
// ──────────────────────────────────────────────────────────────────
export const fullName = (p: { first_name?: string | null; last_name?: string | null }) =>
  `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unnamed patient';

export const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

/** Inline validation shared by Add patient / Edit patient. Empty = valid (optional field). */
export function validatePatientFields(f: { email?: string; phone?: string; dob?: string; firstName?: string; lastName?: string }): Partial<Record<'email' | 'phone' | 'dob' | 'firstName' | 'lastName', string>> {
  const errs: Partial<Record<'email' | 'phone' | 'dob' | 'firstName' | 'lastName', string>> = {};
  if (f.firstName !== undefined && !f.firstName.trim()) errs.firstName = 'First name is required.';
  if (f.lastName !== undefined && !f.lastName.trim()) errs.lastName = 'Last name is required.';
  const email = (f.email || '').trim();
  if (email && !EMAIL_RE.test(email)) errs.email = 'That email address does not look right.';
  const ph = digits(f.phone);
  if ((f.phone || '').trim() && ph.length < 10) errs.phone = 'Enter a 10-digit phone number.';
  const dob = dobIssue(f.dob || null);
  if (dob && dob.severity === 'error') errs.dob = dob.detail;
  return errs;
}

export const tierBadgeClass = (tier: string | undefined) => {
  switch (tier) {
    case 'concierge': return 'bg-gradient-to-r from-purple-600 to-pink-500 text-white';
    case 'vip': return 'bg-gradient-to-r from-amber-500 to-yellow-400 text-white';
    case 'member': return 'bg-emerald-100 text-emerald-700 border border-emerald-300';
    default: return 'bg-gray-100 text-gray-600';
  }
};

export const serviceLabel = (a: { service_name?: string | null; service_type?: string | null }) =>
  (a.service_name || a.service_type || '').replace(/_|-/g, ' ');

/** Does this patient match the free-text search? Name, email, phone digits,
 *  address/city/zip and DOB all count. */
export function matchesSearch(p: PatientRow, q: string, qDigits: string): boolean {
  if (!q) return true;
  if (fullName(p).toLowerCase().includes(q)) return true;
  if ((p.email || '').toLowerCase().includes(q)) return true;
  if (qDigits.length >= 3 && digits(p.phone).includes(qDigits)) return true;
  if ((p.phone || '').includes(q)) return true;
  const addr = [p.address, p.city, p.zipcode].filter(Boolean).join(' ').toLowerCase();
  if (addr && addr.includes(q)) return true;
  if (p.date_of_birth && p.date_of_birth.includes(q)) return true;
  return false;
}

/** The prefill BookingFlow consumes on mount when admin books on a
 *  patient's behalf (cleared after one consumption). */
export function stashAdminPrefill(p: PatientRow) {
  try {
    sessionStorage.setItem('convelabs_admin_prefill_patient', JSON.stringify({
      firstName: p.first_name || '',
      lastName: p.last_name || '',
      email: p.email || '',
      phone: p.phone || '',
      address: p.address || '',
      city: p.city || '',
      state: p.state || 'FL',
      zipCode: p.zipcode || '',
      gateCode: p.gate_code || '',
      patientId: p.id,
      insuranceProvider: p.insurance_provider || '',
      insuranceMemberId: p.insurance_member_id || '',
    }));
  } catch { /* non-blocking */ }
}

/** Shape ScheduleAppointmentModal expects for `prefilledPatient`. */
export function toPrefilledPatient(p: PatientRow) {
  return {
    id: p.id,
    firstName: p.first_name || '',
    lastName: p.last_name || '',
    email: p.email || null,
    phone: p.phone || null,
    address: p.address || '',
    city: p.city || '',
    state: p.state || 'FL',
    zipCode: p.zipcode || '',
    gateCode: p.gate_code || '',
    insuranceProvider: p.insurance_provider || '',
    insuranceMemberId: p.insurance_member_id || '',
  };
}

/** Open the native SMS / mail composer. Nothing is sent by us. */
export function openMessageThread(phone?: string | null, email?: string | null): boolean {
  if (phone) { window.open(`sms:${phone}`, '_blank'); return true; }
  if (email) { window.open(`mailto:${email}`, '_blank'); return true; }
  return false;
}
