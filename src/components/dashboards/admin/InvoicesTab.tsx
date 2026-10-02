/**
 * InvoicesTab — every patient / organization invoice, in one screen.
 *
 * Rendered for BOTH admin roles via Dashboard.tsx SECTION_SCREENS
 * ["billing/invoices"]. Money-affecting controls (void, edit + reissue,
 * CSV export) gate on `super_admin` inside this file, mirroring LabOrdersTab.
 *
 * Source: appointments rows with an invoice_status other than null /
 * not_required. Real invoice_status vocabulary (from the edge functions —
 * NOT the 5 values the old UI assumed):
 *
 *   pending_send   → reissue created a fresh appointment row, Stripe invoice
 *                    not sent yet.
 *   missing_email  → scheduler couldn't send: no patient email on file.
 *   sent           → Stripe invoice emailed. process-invoice-reminders moves
 *                    it on from here.
 *   reminded       → first reminder went out.
 *   final_warning  → second reminder; cron may auto-cancel the appointment.
 *   paid           → Stripe webhook (or admin "Mark paid").
 *   voided         → void-stripe-invoice (Stripe voided + audit log).
 *   cancelled      → auto-cancel after the final warning.
 *
 * Every row maps to exactly ONE bucket (see deriveBucket) so the stat
 * tiles, the filter chips, the money totals and the list always agree:
 *
 *   draft    pending_send | missing_email          (nothing reached the patient)
 *   sent     sent, not past due
 *   overdue  sent past due | reminded | final_warning
 *   paid     paid
 *   void     voided | cancelled
 *
 * Outstanding = sent + overdue; Collected = paid. "Card paid, invoice open"
 * (payment_status completed while the invoice is still sent/reminded/
 * final_warning) is an orthogonal flag — the DB trigger that should flip
 * those to paid only listens for 'paid'/'succeeded', never 'completed'. It
 * drives the Needs-action lane, not the bucket, so totals stay honest.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNowStrict, differenceInCalendarDays, isValid } from 'date-fns';
import {
  FileText, Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Send, Download, Plus, Pencil,
  MoreHorizontal, ExternalLink, Copy, Building2, Calendar, Mail, CreditCard, ChevronRight, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  SectionHeader, StatTiles, FilterChips, SearchBox, LaneHeader, LoadingRows, EmptyState, ErrorBanner,
  DetailDrawer, Field, FieldGroup, Pill, fmtMoney, fmtMoneyShort, TH, TH_STICKY, TD_STICKY, rowKeyHandler, downloadCsv,
  type TileDef, type ChipDef,
} from './billing/BillingPrimitives';

// The generated Database type is stale for several of these columns, so all
// table access goes through a loosely-typed handle (same as LabOrdersTab).
const db = supabase as any;

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────
export interface Invoice {
  id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string | null;
  service_type: string;
  service_name: string | null;
  total_amount: number;
  /** Raw appointments.invoice_status. */
  invoice_status: string;
  payment_status: string;
  billed_to: 'patient' | 'org' | string | null;
  organization_id: string | null;
  organization_name: string | null;
  invoice_sent_at: string | null;
  invoice_due_at: string | null;
  invoice_reminder_sent_at: string | null;
  invoice_final_warning_at: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_status: string | null;
  is_vip: boolean;
  booking_source: string;
  stripe_invoice_id: string | null;
  stripe_invoice_url: string | null;
  notes: string | null;
  created_at: string | null;
}

export type Bucket = 'draft' | 'sent' | 'overdue' | 'paid' | 'void';

const OPEN_STATUSES = new Set(['sent', 'reminded', 'final_warning']);
const PAID_PAYMENT_STATUSES = new Set(['completed', 'paid', 'succeeded', 'org_billed']);

export function isPastDue(inv: Pick<Invoice, 'invoice_due_at'>): boolean {
  if (!inv.invoice_due_at) return false;
  const d = new Date(inv.invoice_due_at);
  return isValid(d) && d.getTime() < Date.now();
}

export function deriveBucket(inv: Pick<Invoice, 'invoice_status' | 'invoice_due_at'>): Bucket {
  const s = inv.invoice_status;
  if (s === 'paid') return 'paid';
  if (s === 'voided' || s === 'cancelled') return 'void';
  if (s === 'reminded' || s === 'final_warning') return 'overdue';
  if (s === 'sent') return isPastDue(inv) ? 'overdue' : 'sent';
  // pending_send, missing_email — and anything unknown, so nothing is ever
  // silently hidden from the tiles.
  return 'draft';
}

/** Card/Stripe payment landed but the invoice row never flipped to paid. */
export function isPaidElsewhere(inv: Pick<Invoice, 'invoice_status' | 'payment_status'>): boolean {
  return OPEN_STATUSES.has(inv.invoice_status) && PAID_PAYMENT_STATUSES.has(inv.payment_status);
}

interface BucketMeta { label: string; desc: string; pill: string; tile: string; dot: string }

const BUCKET_META: Record<Bucket, BucketMeta> = {
  draft: {
    label: 'Not sent', desc: 'Created but never reached the patient — missing email or waiting to send',
    pill: 'bg-orange-100 text-orange-800 border-orange-200', tile: 'border-orange-300 bg-orange-50 text-orange-800', dot: 'bg-orange-500',
  },
  sent: {
    label: 'Sent', desc: 'Invoice emailed and not yet due',
    pill: 'bg-blue-100 text-blue-800 border-blue-200', tile: 'border-blue-300 bg-blue-50 text-blue-800', dot: 'bg-blue-500',
  },
  overdue: {
    label: 'Overdue', desc: 'Past due, reminded, or on final warning',
    pill: 'bg-red-100 text-red-800 border-red-200', tile: 'border-red-300 bg-red-50 text-red-800', dot: 'bg-red-500',
  },
  paid: {
    label: 'Paid', desc: 'Collected',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', tile: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500',
  },
  void: {
    label: 'Void', desc: 'Voided on Stripe or cancelled after the final warning',
    pill: 'bg-white text-gray-500 border-gray-300', tile: 'border-gray-300 bg-gray-50 text-gray-700', dot: 'bg-gray-300',
  },
};

type FilterKey = 'all' | 'needs_action' | Bucket;

const FILTERS: Array<{ key: FilterKey; label: string; desc: string; match: (b: Bucket, inv: Invoice) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every invoice on file', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Overdue, never sent, or paid by card while the invoice is still open', match: (b, inv) => needsAction(b, inv) },
  { key: 'draft', label: 'Not sent', desc: BUCKET_META.draft.desc, match: b => b === 'draft' },
  { key: 'sent', label: 'Sent', desc: BUCKET_META.sent.desc, match: b => b === 'sent' },
  { key: 'overdue', label: 'Overdue', desc: BUCKET_META.overdue.desc, match: b => b === 'overdue' },
  { key: 'paid', label: 'Paid', desc: BUCKET_META.paid.desc, match: b => b === 'paid' },
  { key: 'void', label: 'Void', desc: BUCKET_META.void.desc, match: b => b === 'void' },
];

const TILE_KEYS: Bucket[] = ['draft', 'sent', 'overdue', 'paid', 'void'];

function needsAction(b: Bucket, inv: Invoice): boolean {
  return b === 'draft' || b === 'overdue' || isPaidElsewhere(inv);
}

function statusLabel(inv: Invoice, b: Bucket): string {
  switch (inv.invoice_status) {
    case 'missing_email': return 'Missing email';
    case 'pending_send': return 'Pending send';
    case 'reminded': return 'Reminded';
    case 'final_warning': return 'Final warning';
    case 'voided': return 'Voided';
    case 'cancelled': return 'Cancelled';
    case 'sent': return b === 'overdue' ? 'Overdue' : 'Sent';
    case 'paid': return 'Paid';
    default: return inv.invoice_status || 'Unknown';
  }
}

const ago = (d: Date | string) => formatDistanceToNowStrict(typeof d === 'string' ? new Date(d) : d, { addSuffix: true });
const fmtDate = (s: string | null | undefined, withTime = true) => {
  if (!s) return '—';
  const d = new Date(s);
  return isValid(d) ? format(d, withTime ? 'MMM d, h:mm a' : 'MMM d, yyyy') : '—';
};
const serviceLabel = (inv: Invoice) => inv.service_name || (inv.service_type || '').replace(/_|-/g, ' ');

async function copyText(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); }
  catch { toast.error(`Couldn't copy ${what.toLowerCase()}`); }
}

/** Pull a structured message out of a supabase.functions.invoke error. */
async function fnErrorMessage(error: any, fallback: string): Promise<string> {
  let msg = error?.message || fallback;
  const ctx = error?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const body = await ctx.json(); msg = body?.message || body?.error || msg; } catch { /* keep */ }
  }
  return msg;
}

interface RowHandlers {
  basePath: string;
  isSuperAdmin: boolean;
  onOpen: (inv: Invoice) => void;
  onMarkPaid: (inv: Invoice) => void;
  onResend: (inv: Invoice) => void;
  onEdit: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
}

const SERVICE_PRICES: Record<string, { label: string; price: number }> = {
  mobile: { label: 'Mobile Blood Draw', price: 150 },
  'in-office': { label: 'Office Visit', price: 55 },
  senior: { label: 'Senior (65+)', price: 110 },
  'specialty-kit': { label: 'Specialty Kit', price: 185 },
  therapeutic: { label: 'Therapeutic Phlebotomy', price: 200 },
  custom: { label: 'Custom Amount', price: 0 },
};

const freshGenForm = () => ({
  recipientType: 'patient' as 'patient' | 'organization',
  patientName: '', patientEmail: '', patientPhone: '',
  orgName: '', orgEmail: '',
  serviceType: 'mobile', customAmount: '', customDescription: '',
  dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  memo: '',
});

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────
const InvoicesTab: React.FC = () => {
  const { user } = useAuth();
  const basePath = `/dashboard/${user?.role === 'office_manager' ? 'office_manager' : 'super_admin'}`;
  const isSuperAdmin = user?.role === 'super_admin';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Invoice | null>(null);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [genForm, setGenForm] = useState(freshGenForm);
  const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);
  const [orgSearchResults, setOrgSearchResults] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Edit-invoice modal — voids the old Stripe invoice + reissues fresh
  // (Stripe forbids editing sent invoices). Calls reissue-stripe-invoice.
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState({
    newTotal: '', newPatientEmail: '', newPatientName: '',
    newServiceName: '', newBilledTo: 'patient' as 'patient' | 'org',
    newOrgEmail: '', reason: '',
  });
  const [isReissuing, setIsReissuing] = useState(false);

  const invoiceAmount = genForm.serviceType === 'custom'
    ? parseFloat(genForm.customAmount || '0')
    : SERVICE_PRICES[genForm.serviceType]?.price || 150;
  const invoiceRecipientName = genForm.recipientType === 'organization' ? genForm.orgName : genForm.patientName;
  const invoiceRecipientEmail = genForm.recipientType === 'organization' ? genForm.orgEmail : genForm.patientEmail;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const { data, error } = await db
        .from('appointments')
        .select('*')
        .not('invoice_status', 'is', null)
        .not('invoice_status', 'eq', 'not_required')
        .order('invoice_sent_at', { ascending: false });
      if (error) throw error;
      const list: any[] = data || [];

      // Organization names for org-billed rows — one round-trip.
      const orgIds = Array.from(new Set(list.map(a => a.organization_id).filter(Boolean) as string[]));
      const orgNames = new Map<string, string>();
      if (orgIds.length > 0) {
        const { data: orgs } = await db.from('organizations').select('id, name').in('id', orgIds);
        ((orgs as any[]) || []).forEach(o => orgNames.set(o.id, o.name));
      }

      const mapped: Invoice[] = list.map((a: any) => {
        // Direct columns first, fall back to the legacy notes format.
        let patientName = a.patient_name || 'Unknown';
        let patientEmail = a.patient_email || '';
        if (patientName === 'Unknown' && a.notes) {
          const m = a.notes.match(/Patient:\s*([^|]+)/);
          if (m) patientName = m[1].trim();
        }
        if (!patientEmail && a.notes) {
          const m = a.notes.match(/Email:\s*([^|\s]+)/);
          if (m) patientEmail = m[1].trim();
        }
        return {
          id: a.id,
          patient_name: patientName,
          patient_email: patientEmail,
          patient_phone: a.patient_phone || null,
          service_type: a.service_type || 'mobile',
          service_name: a.service_name || null,
          total_amount: Number(a.total_amount) || 0,
          invoice_status: a.invoice_status || 'sent',
          payment_status: a.payment_status || 'pending',
          billed_to: a.billed_to || null,
          organization_id: a.organization_id || null,
          organization_name: a.organization_id ? orgNames.get(a.organization_id) || null : null,
          invoice_sent_at: a.invoice_sent_at,
          invoice_due_at: a.invoice_due_at,
          invoice_reminder_sent_at: a.invoice_reminder_sent_at,
          invoice_final_warning_at: a.invoice_final_warning_at || null,
          appointment_date: a.appointment_date?.substring(0, 10) || '',
          appointment_time: a.appointment_time,
          appointment_status: a.status || null,
          is_vip: !!a.is_vip,
          booking_source: a.booking_source || 'online',
          stripe_invoice_id: a.stripe_invoice_id,
          stripe_invoice_url: a.stripe_invoice_url || null,
          notes: a.notes,
          created_at: a.created_at || null,
        };
      });

      // Newest first by "when it mattered": sent time, else the appointment
      // date. Rows that were never sent used to float to the top as NULLs.
      const sortKey = (i: Invoice) => new Date(i.invoice_sent_at || (i.appointment_date ? i.appointment_date + 'T12:00:00' : 0) || 0).getTime();
      mapped.sort((a, b) => sortKey(b) - sortKey(a));
      setInvoices(mapped);
    } catch (err: any) {
      console.error('[InvoicesTab] load failed:', err);
      setLastError(err?.message || String(err));
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // Keep the open drawer in sync after a refresh.
  useEffect(() => {
    if (!selected) return;
    const fresh = invoices.find(i => i.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [invoices]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────
  const bucketOf = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const i of invoices) m.set(i.id, deriveBucket(i));
    return m;
  }, [invoices]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map(f => [f.key, 0])) as Record<FilterKey, number>;
    for (const i of invoices) {
      const b = bucketOf.get(i.id)!;
      for (const f of FILTERS) if (f.match(b, i)) c[f.key]++;
    }
    return c;
  }, [invoices, bucketOf]);

  const sums = useMemo(() => {
    const s: Record<Bucket, number> = { draft: 0, sent: 0, overdue: 0, paid: 0, void: 0 };
    let paidElsewhere = 0, paidElsewhereAmt = 0;
    for (const i of invoices) {
      s[bucketOf.get(i.id)!] += i.total_amount;
      if (isPaidElsewhere(i)) { paidElsewhere++; paidElsewhereAmt += i.total_amount; }
    }
    return { ...s, outstanding: s.sent + s.overdue, paidElsewhere, paidElsewhereAmt };
  }, [invoices, bucketOf]);

  const filtered = useMemo(() => {
    const def = FILTERS.find(f => f.key === filter)!;
    const q = search.trim().toLowerCase();
    return invoices.filter(i => def.match(bucketOf.get(i.id)!, i) && (q === '' ||
      (i.patient_name || '').toLowerCase().includes(q) ||
      (i.patient_email || '').toLowerCase().includes(q) ||
      (i.organization_name || '').toLowerCase().includes(q) ||
      serviceLabel(i).toLowerCase().includes(q) ||
      (i.stripe_invoice_id || '').toLowerCase().includes(q) ||
      i.id.includes(q)
    ));
  }, [invoices, filter, search, bucketOf]);

  const lanes = useMemo(() => {
    if (filter !== 'all') return null;
    const action = filtered.filter(i => needsAction(bucketOf.get(i.id)!, i));
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(i => !needsAction(bucketOf.get(i.id)!, i)) };
  }, [filtered, filter, bucketOf]);

  // ── Actions (unchanged behaviour from the previous screen) ────────
  const handleMarkPaid = useCallback(async (inv: Invoice) => {
    const { error } = await db.from('appointments').update({ payment_status: 'completed', invoice_status: 'paid' }).eq('id', inv.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success('Invoice marked as paid');
    fetchInvoices();
  }, [fetchInvoices]);

  const handleVoid = useCallback(async (inv: Invoice) => {
    if (!confirm('Void this invoice? The appointment will remain but the invoice will be cancelled on Stripe + ConveLabs.')) return;
    const reason = prompt('Reason for voiding (optional, for audit log):') || '';
    try {
      // Real void: Stripe.invoices.voidInvoice() + DB update + invoice_audit_log.
      const { data, error } = await supabase.functions.invoke('void-stripe-invoice', { body: { appointmentId: inv.id, reason } });
      if (error) { toast.error(await fnErrorMessage(error, 'Void failed'), { duration: 8000 }); return; }
      const before = (data as any)?.stripe_status_before;
      const after = (data as any)?.stripe_status_after;
      toast.success(inv.stripe_invoice_id ? `Invoice voided · Stripe: ${before || 'unknown'} → ${after || 'void'}` : 'Invoice marked voided in ConveLabs');
      fetchInvoices();
    } catch (e: any) {
      console.error('[void-invoice]', e);
      toast.error(`Void failed: ${e?.message || 'unknown'}. Try again or check Stripe directly.`, { duration: 8000 });
    }
  }, [fetchInvoices]);

  const handleResend = useCallback(async (inv: Invoice) => {
    if (!inv.patient_email) { toast.error('No email on file — edit the invoice to add one.'); return; }
    try {
      const { data, error } = await supabase.functions.invoke('send-appointment-invoice', {
        body: {
          appointmentId: inv.id,
          patientName: inv.patient_name,
          patientEmail: inv.patient_email,
          serviceType: inv.service_type,
          serviceName: inv.service_type?.replace(/_|-/g, ' '),
          servicePrice: inv.total_amount,
          appointmentDate: inv.appointment_date,
          appointmentTime: inv.appointment_time || '',
          address: 'See appointment details',
          isVip: inv.is_vip,
        },
      });
      if (error) throw new Error(await fnErrorMessage(error, 'Failed to resend invoice'));
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Invoice resent to ' + inv.patient_email);
      fetchInvoices();
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to resend invoice');
    }
  }, [fetchInvoices]);

  const openEdit = useCallback((inv: Invoice) => {
    setEditForm({
      newTotal: String(inv.total_amount || ''),
      newPatientEmail: inv.patient_email || '',
      newPatientName: inv.patient_name || '',
      newServiceName: inv.service_type || '',
      newBilledTo: 'patient',
      newOrgEmail: '',
      reason: '',
    });
    setEditing(inv);
  }, []);

  const handleReissue = async () => {
    if (!editing) return;
    const body: any = { appointmentId: editing.id, reason: editForm.reason || 'admin edit' };
    const newTotalNum = parseFloat(editForm.newTotal);
    if (!isNaN(newTotalNum) && newTotalNum !== editing.total_amount) body.newTotal = newTotalNum;
    if (editForm.newPatientEmail && editForm.newPatientEmail !== editing.patient_email) body.newPatientEmail = editForm.newPatientEmail;
    if (editForm.newPatientName && editForm.newPatientName !== editing.patient_name) body.newPatientName = editForm.newPatientName;
    if (editForm.newServiceName && editForm.newServiceName !== editing.service_type) body.newServiceName = editForm.newServiceName;
    if (editForm.newBilledTo === 'org') {
      body.newBilledTo = 'org';
      if (editForm.newOrgEmail) body.newOrgEmail = editForm.newOrgEmail;
    }
    if (!body.newTotal && !body.newPatientEmail && !body.newPatientName && !body.newServiceName && !body.newBilledTo) {
      toast.error('No changes to apply. Use Resend to send the same invoice again.');
      return;
    }
    setIsReissuing(true);
    try {
      const { error } = await supabase.functions.invoke('reissue-stripe-invoice', { body });
      if (error) { toast.error(await fnErrorMessage(error, 'Reissue failed'), { duration: 8000 }); return; }
      toast.success('Invoice reissued · old voided, new sent');
      setEditing(null);
      fetchInvoices();
    } catch (e: any) {
      console.error('[reissue-invoice]', e);
      toast.error(`Reissue failed: ${e?.message || 'unknown'}`, { duration: 8000 });
    } finally {
      setIsReissuing(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const svcLabel = genForm.serviceType === 'custom' ? (genForm.customDescription || 'Custom Service') : SERVICE_PRICES[genForm.serviceType]?.label || 'Service';
      const { data: appt, error: apptErr } = await db.from('appointments').insert([{
        appointment_date: new Date().toISOString(),
        patient_name: invoiceRecipientName,
        patient_email: invoiceRecipientEmail,
        service_type: genForm.serviceType === 'custom' ? 'invoice' : genForm.serviceType,
        service_name: svcLabel,
        status: 'scheduled', address: 'Invoice Only', zipcode: '32801',
        total_amount: invoiceAmount, service_price: invoiceAmount,
        booking_source: 'manual', invoice_status: 'sent',
        invoice_sent_at: new Date().toISOString(),
        invoice_due_at: genForm.dueDate ? new Date(genForm.dueDate + 'T23:59:59').toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        payment_status: 'pending',
        notes: [genForm.memo, genForm.recipientType === 'organization' ? `Org: ${genForm.orgName}` : ''].filter(Boolean).join(' | ') || null,
      }]).select().single();
      if (apptErr) throw apptErr;

      await supabase.functions.invoke('send-appointment-invoice', {
        body: {
          appointmentId: appt.id, patientName: invoiceRecipientName,
          patientEmail: invoiceRecipientEmail, serviceName: svcLabel,
          servicePrice: invoiceAmount, memo: genForm.memo,
          orgName: genForm.recipientType === 'organization' ? genForm.orgName : undefined,
        },
      });

      toast.success(`Invoice for ${fmtMoney(invoiceAmount)} sent to ${invoiceRecipientEmail}`);
      setGenForm(freshGenForm());
      setGenerateOpen(false);
      fetchInvoices();
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate invoice');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportCSV = () => {
    const rows = filtered.map(i => [
      BUCKET_META[bucketOf.get(i.id)!].label, statusLabel(i, bucketOf.get(i.id)!), i.patient_name, i.patient_email,
      i.billed_to === 'org' ? (i.organization_name || 'Organization') : 'Patient',
      serviceLabel(i), i.total_amount.toFixed(2), i.payment_status,
      i.invoice_sent_at || '', i.invoice_due_at || '', i.appointment_date, i.stripe_invoice_id || '', i.id,
    ]);
    downloadCsv(
      `convelabs-invoices-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      ['Bucket', 'Status', 'Patient', 'Email', 'Billed to', 'Service', 'Amount', 'Payment status', 'Sent', 'Due', 'Appointment date', 'Stripe invoice', 'Appointment ID'],
      rows,
    );
    toast.success(`${rows.length} invoice${rows.length === 1 ? '' : 's'} exported`);
  };

  const handlers: RowHandlers = {
    basePath, isSuperAdmin,
    onOpen: setSelected, onMarkPaid: handleMarkPaid, onResend: handleResend, onEdit: openEdit, onVoid: handleVoid,
  };

  const tiles: Array<TileDef<Bucket>> = TILE_KEYS.map(k => ({
    key: k, label: BUCKET_META[k].label, desc: BUCKET_META[k].desc, tile: BUCKET_META[k].tile,
    sub: fmtMoneyShort(sums[k]), alert: k === 'overdue' || k === 'draft',
  }));
  const chips: Array<ChipDef<FilterKey>> = FILTERS.map(f => ({
    key: f.key, label: f.label, desc: f.desc,
    dot: f.key === 'all' || f.key === 'needs_action' ? undefined : BUCKET_META[f.key as Bucket].dot,
  }));
  const activeFilter = FILTERS.find(f => f.key === filter)!;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      <SectionHeader
        icon={FileText}
        title="Invoices"
        subtitle={<>
          Every patient and organization invoice — Stripe status, reminders and collections.
          {!loading && counts.needs_action > 0 && <span className="ml-1 font-medium text-red-700">{counts.needs_action} need attention.</span>}
        </>}
        actions={<>
          <Button variant="outline" size="sm" onClick={fetchInvoices} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={loading} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 text-xs h-10 sm:h-9" disabled={filtered.length === 0} aria-label="Export CSV">
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          )}
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 text-xs h-10 sm:h-9" onClick={() => setGenerateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Generate invoice</span>
            <span className="sm:hidden">New</span>
          </Button>
        </>}
      />

      {/* Stat tiles — the five buckets partition every row; the money line
          under each tile is the sum of that bucket. */}
      <StatTiles
        tiles={tiles}
        counts={counts}
        active={filter}
        loading={loading}
        onSelect={k => setFilter(filter === k ? 'all' : k)}
        ariaLabel="Invoice counts"
      />

      {/* Money strip — Outstanding = Sent + Overdue, Collected = Paid. */}
      {!loading && invoices.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
          <span><span className="text-gray-500">Outstanding</span> <strong className="text-red-700 tabular-nums">{fmtMoney(sums.outstanding)}</strong> <span className="text-gray-400">({counts.sent + counts.overdue})</span></span>
          <span><span className="text-gray-500">Collected</span> <strong className="text-emerald-700 tabular-nums">{fmtMoney(sums.paid)}</strong> <span className="text-gray-400">({counts.paid})</span></span>
          <span><span className="text-gray-500">Never sent</span> <strong className="tabular-nums">{fmtMoney(sums.draft)}</strong> <span className="text-gray-400">({counts.draft})</span></span>
          {sums.paidElsewhere > 0 && (
            <button type="button" onClick={() => setFilter('needs_action')} className="inline-flex items-center gap-1 text-amber-800 hover:underline">
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              {sums.paidElsewhere} paid by card but invoice still open · {fmtMoney(sums.paidElsewhereAmt)} counted in Outstanding
            </button>
          )}
        </div>
      )}

      {lastError && <ErrorBanner title="Couldn't load invoices" message={lastError} onRetry={fetchInvoices} />}

      <div className="space-y-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search patient, email, organization, service, Stripe ID…" ariaLabel="Search invoices" />
        <FilterChips chips={chips} counts={counts} active={filter} onSelect={setFilter} ariaLabel="Invoice status filter" />
      </div>

      {loading && invoices.length === 0 ? (
        <LoadingRows label="Loading invoices" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          total={invoices.length}
          hasSearch={search.trim() !== ''}
          filterLabel={activeFilter.label}
          filterDesc={activeFilter.desc}
          nothingTitle="No invoices yet."
          nothingHint="Invoices appear here when you schedule an appointment with an invoice, or generate one directly."
          searchHint="Try a patient name, email, organization, service or Stripe invoice ID."
          noun="invoices"
          onReset={() => { setFilter('all'); setSearch(''); }}
          action={<Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 text-xs h-9" onClick={() => setGenerateOpen(true)}><Plus className="h-4 w-4" /> Generate invoice</Button>}
        />
      ) : lanes ? (
        <div className="space-y-5">
          <section aria-labelledby="inv-lane-action">
            <LaneHeader id="inv-lane-action" title="Needs action" count={lanes.action.length} tone="red" hint="overdue · never sent · card paid but invoice open" />
            <InvoiceRows rows={lanes.action} bucketOf={bucketOf} h={handlers} />
          </section>
          {lanes.rest.length > 0 && (
            <section aria-labelledby="inv-lane-rest">
              <LaneHeader id="inv-lane-rest" title="Everything else" count={lanes.rest.length} tone="gray" />
              <InvoiceRows rows={lanes.rest} bucketOf={bucketOf} h={handlers} />
            </section>
          )}
        </div>
      ) : (
        <InvoiceRows rows={filtered} bucketOf={bucketOf} h={handlers} />
      )}

      <p className="text-[11px] text-gray-400">
        Showing {filtered.length} of {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
      </p>

      {selected && (
        <InvoiceDetailDrawer
          inv={selected}
          bucket={bucketOf.get(selected.id) || deriveBucket(selected)}
          h={handlers}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Edit / Reissue — voids old + sends fresh */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Edit & reissue invoice</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
                Editing voids the existing Stripe invoice and issues a fresh one with your changes. Paid invoices must be refunded first.
              </div>
              <div>
                <Label className="text-xs">Recipient type</Label>
                <Select value={editForm.newBilledTo} onValueChange={(v: any) => setEditForm(p => ({ ...p, newBilledTo: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patient">Patient</SelectItem>
                    <SelectItem value="org">Organization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Patient name</Label>
                  <Input className="h-9 text-sm" value={editForm.newPatientName} onChange={(e) => setEditForm(p => ({ ...p, newPatientName: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Patient email</Label>
                  <Input className="h-9 text-sm" type="email" value={editForm.newPatientEmail} onChange={(e) => setEditForm(p => ({ ...p, newPatientEmail: e.target.value }))} />
                </div>
              </div>
              {editForm.newBilledTo === 'org' && (
                <div>
                  <Label className="text-xs">Organization billing email</Label>
                  <Input className="h-9 text-sm" type="email" value={editForm.newOrgEmail} onChange={(e) => setEditForm(p => ({ ...p, newOrgEmail: e.target.value }))} placeholder="billing@org.com" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Amount ($)</Label>
                  <Input className="h-9 text-sm" type="number" step="0.01" value={editForm.newTotal} onChange={(e) => setEditForm(p => ({ ...p, newTotal: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Service / line-item label</Label>
                  <Input className="h-9 text-sm" value={editForm.newServiceName} onChange={(e) => setEditForm(p => ({ ...p, newServiceName: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Reason (audit log)</Label>
                <Input className="h-9 text-sm" value={editForm.reason} onChange={(e) => setEditForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. patient corrected email, price adjustment" />
              </div>
              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={isReissuing}>Cancel</Button>
                <Button onClick={handleReissue} disabled={isReissuing} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                  {isReissuing ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" /> : <Send className="h-3 w-3 mr-1" aria-hidden="true" />}
                  Void old + reissue
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate invoice */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-[#B91C1C]" aria-hidden="true" /> Generate & send invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Recipient type">
              {(['patient', 'organization'] as const).map(t => (
                <button key={t} type="button" onClick={() => setGenForm(p => ({ ...p, recipientType: t }))} aria-pressed={genForm.recipientType === t}
                  className={cn('p-3 rounded-lg border-2 text-sm font-medium text-left transition', genForm.recipientType === t ? 'border-[#B91C1C] bg-[#B91C1C]/5 text-[#B91C1C]' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                  <span className="block font-semibold">{t === 'patient' ? 'Patient' : 'Organization'}</span>
                  <span className="text-[10px] opacity-70">{t === 'patient' ? 'Bill an individual' : 'Bill a practice/company'}</span>
                </button>
              ))}
            </div>

            {genForm.recipientType === 'patient' && (
              <div className="space-y-3">
                <div className="relative">
                  <Label>Search patient</Label>
                  <Input value={genForm.patientName} placeholder="Type name or email…"
                    onChange={async (e) => {
                      const v = e.target.value;
                      setGenForm(p => ({ ...p, patientName: v }));
                      if (v.length >= 2) {
                        const { data } = await db.from('tenant_patients').select('first_name, last_name, email, phone')
                          .or(`first_name.ilike.%${v}%,last_name.ilike.%${v}%,email.ilike.%${v}%`).limit(5);
                        setPatientSearchResults(data || []);
                      } else setPatientSearchResults([]);
                    }} />
                  {patientSearchResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {patientSearchResults.map((p, i) => (
                        <button key={i} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-0 text-sm"
                          onClick={() => {
                            setGenForm(prev => ({ ...prev, patientName: `${p.first_name} ${p.last_name}`, patientEmail: p.email || '', patientPhone: p.phone || '' }));
                            setPatientSearchResults([]);
                          }}>
                          <p className="font-medium">{p.first_name} {p.last_name}</p>
                          <p className="text-xs text-muted-foreground">{p.email || 'No email'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div><Label>Email *</Label><Input type="email" value={genForm.patientEmail} onChange={e => setGenForm(p => ({ ...p, patientEmail: e.target.value }))} /></div>
              </div>
            )}

            {genForm.recipientType === 'organization' && (
              <div className="space-y-3">
                <div className="relative">
                  <Label>Search organization</Label>
                  <Input value={genForm.orgName} placeholder="Type org name…"
                    onChange={async (e) => {
                      const v = e.target.value;
                      setGenForm(p => ({ ...p, orgName: v }));
                      if (v.length >= 2) {
                        const { data } = await db.from('organizations').select('name, billing_email').ilike('name', `%${v}%`).limit(5);
                        setOrgSearchResults(data || []);
                      } else setOrgSearchResults([]);
                    }} />
                  {orgSearchResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {orgSearchResults.map((o: any, i: number) => (
                        <button key={i} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-0 text-sm"
                          onClick={() => { setGenForm(prev => ({ ...prev, orgName: o.name, orgEmail: o.billing_email || '' })); setOrgSearchResults([]); }}>
                          <p className="font-medium">{o.name}</p>
                          <p className="text-xs text-muted-foreground">{o.billing_email || 'No email'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div><Label>Billing email *</Label><Input type="email" value={genForm.orgEmail} onChange={e => setGenForm(p => ({ ...p, orgEmail: e.target.value }))} /></div>
              </div>
            )}

            <div>
              <Label>Service</Label>
              <Select value={genForm.serviceType} onValueChange={v => setGenForm(p => ({ ...p, serviceType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_PRICES).map(([key, svc]) => (
                    <SelectItem key={key} value={key}>{svc.label}{svc.price > 0 ? ` — $${svc.price}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {genForm.serviceType === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount ($) *</Label><Input type="number" min="0" step="0.01" value={genForm.customAmount} onChange={e => setGenForm(p => ({ ...p, customAmount: e.target.value }))} placeholder="0.00" /></div>
                <div><Label>Description</Label><Input value={genForm.customDescription} onChange={e => setGenForm(p => ({ ...p, customDescription: e.target.value }))} placeholder="Service description" /></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Due date</Label><Input type="date" value={genForm.dueDate} onChange={e => setGenForm(p => ({ ...p, dueDate: e.target.value }))} /></div>
              <div><Label>Memo</Label><Input value={genForm.memo} onChange={e => setGenForm(p => ({ ...p, memo: e.target.value }))} placeholder="Optional notes" /></div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span className="font-medium">{invoiceRecipientName || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{invoiceRecipientEmail || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span>{SERVICE_PRICES[genForm.serviceType]?.label || 'Custom'}</span></div>
              <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Total</span><span className="font-bold text-[#B91C1C] text-lg">{fmtMoney(invoiceAmount)}</span></div>
            </div>

            <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11" disabled={!invoiceRecipientName || !invoiceRecipientEmail || invoiceAmount <= 0 || isGenerating} onClick={handleGenerate}>
              {isGenerating ? 'Sending…' : `Send invoice — ${fmtMoney(invoiceAmount)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Presentational pieces
// ──────────────────────────────────────────────────────────────────
const StatusPill: React.FC<{ inv: Invoice; bucket: Bucket; className?: string }> = ({ inv, bucket, className }) => {
  const meta = BUCKET_META[bucket];
  let text = statusLabel(inv, bucket);
  if (bucket === 'overdue' && inv.invoice_due_at) {
    const late = differenceInCalendarDays(new Date(), new Date(inv.invoice_due_at));
    if (late > 0) text = `${text} · ${late}d`;
  }
  return <Pill className={cn(meta.pill, className)} dot={meta.dot} title={meta.desc}>{text}</Pill>;
};

const PaidElsewherePill: React.FC<{ inv: Invoice }> = ({ inv }) => isPaidElsewhere(inv) ? (
  <Tooltip>
    <TooltipTrigger asChild>
      <span><Pill className="bg-amber-100 text-amber-800 border-amber-200"><CreditCard className="h-3 w-3" aria-hidden="true" /> Card paid</Pill></span>
    </TooltipTrigger>
    <TooltipContent className="max-w-xs text-xs">
      payment_status is "{inv.payment_status}" but the invoice is still {statusLabel(inv, deriveBucket(inv)).toLowerCase()}. Mark it paid (or void it) so it stops counting as outstanding.
    </TooltipContent>
  </Tooltip>
) : null;

const BilledTo: React.FC<{ inv: Invoice }> = ({ inv }) => inv.billed_to === 'org' ? (
  <span className="inline-flex items-center gap-1 text-purple-700 min-w-0">
    <Building2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
    <span className="truncate">{inv.organization_name || 'Organization'}</span>
  </span>
) : <span className="text-gray-500">Patient</span>;

const DueCell: React.FC<{ inv: Invoice; bucket: Bucket }> = ({ inv, bucket }) => {
  if (!inv.invoice_due_at) return <span className="text-gray-400">—</span>;
  const d = format(new Date(inv.invoice_due_at), 'MMM d');
  if (bucket === 'overdue') {
    const late = differenceInCalendarDays(new Date(), new Date(inv.invoice_due_at));
    return <span className="text-red-700 font-semibold">{d} {late > 0 && <span className="font-normal">· {late}d late</span>}</span>;
  }
  if (bucket === 'sent') {
    const left = differenceInCalendarDays(new Date(inv.invoice_due_at), new Date());
    if (left <= 2) return <span className="text-amber-700 font-semibold">{d} <span className="font-normal">· {left <= 0 ? 'today' : `${left}d left`}</span></span>;
  }
  return <span className="text-gray-700">{d}</span>;
};

const canAct = (b: Bucket) => b === 'sent' || b === 'overdue';

const PrimaryAction: React.FC<{ inv: Invoice; bucket: Bucket; h: RowHandlers; className?: string }> = ({ inv, bucket, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (canAct(bucket) && isPaidElsewhere(inv)) {
    return (
      <Button size="sm" className={cn('bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onMarkPaid(inv); }}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Mark paid
      </Button>
    );
  }
  if (bucket === 'overdue') {
    return (
      <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onResend(inv); }}>
        <Send className="h-3.5 w-3.5" aria-hidden="true" /> Resend
      </Button>
    );
  }
  if (bucket === 'draft') {
    if (!inv.patient_email) {
      return h.isSuperAdmin ? (
        <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 border-orange-300 text-orange-800 hover:bg-orange-50', className)} onClick={(e) => { stop(e); h.onEdit(inv); }}>
          <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Add email
        </Button>
      ) : null;
    }
    return (
      <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onResend(inv); }}>
        <Send className="h-3.5 w-3.5" aria-hidden="true" /> Send
      </Button>
    );
  }
  if (bucket === 'sent') {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50', className)} onClick={(e) => { stop(e); h.onMarkPaid(inv); }}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Mark paid
      </Button>
    );
  }
  if (inv.stripe_invoice_url) {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} asChild>
        <a href={inv.stripe_invoice_url} target="_blank" rel="noopener noreferrer" onClick={stop}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Stripe
        </a>
      </Button>
    );
  }
  return null;
};

const RowMenu: React.FC<{ inv: Invoice; bucket: Bucket; h: RowHandlers; className?: string }> = ({ inv, bucket, h, className }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${inv.patient_name}`} onClick={(e) => e.stopPropagation()}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => h.onOpen(inv)}>
        <FileText className="h-4 w-4 mr-2" aria-hidden="true" /> Open invoice
      </DropdownMenuItem>
      {canAct(bucket) && (
        <>
          <DropdownMenuItem onSelect={() => h.onMarkPaid(inv)}>
            <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" /> Mark paid
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => h.onResend(inv)}>
            <Send className="h-4 w-4 mr-2" aria-hidden="true" /> Resend invoice
          </DropdownMenuItem>
          {h.isSuperAdmin && (
            <DropdownMenuItem onSelect={() => h.onEdit(inv)}>
              <Pencil className="h-4 w-4 mr-2" aria-hidden="true" /> Edit & reissue
            </DropdownMenuItem>
          )}
        </>
      )}
      {bucket === 'draft' && inv.patient_email && (
        <DropdownMenuItem onSelect={() => h.onResend(inv)}>
          <Send className="h-4 w-4 mr-2" aria-hidden="true" /> Send invoice
        </DropdownMenuItem>
      )}
      {bucket === 'draft' && h.isSuperAdmin && (
        <DropdownMenuItem onSelect={() => h.onEdit(inv)}>
          <Pencil className="h-4 w-4 mr-2" aria-hidden="true" /> Edit & reissue
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      {inv.stripe_invoice_url && (
        <DropdownMenuItem onSelect={() => window.open(inv.stripe_invoice_url!, '_blank', 'noopener,noreferrer')}>
          <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" /> Open hosted invoice
        </DropdownMenuItem>
      )}
      {inv.stripe_invoice_url && (
        <DropdownMenuItem onSelect={() => copyText(inv.stripe_invoice_url!, 'Payment link')}>
          <Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy payment link
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => window.open(`${h.basePath}/calendar?appointment=${inv.id}`, '_blank', 'noopener,noreferrer')}>
        <Calendar className="h-4 w-4 mr-2" aria-hidden="true" /> View appointment
      </DropdownMenuItem>
      {inv.patient_email && (
        <DropdownMenuItem asChild>
          <a href={`mailto:${inv.patient_email}`}><Mail className="h-4 w-4 mr-2" aria-hidden="true" /> Email patient</a>
        </DropdownMenuItem>
      )}
      {canAct(bucket) && h.isSuperAdmin && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => h.onVoid(inv)}>
            <XCircle className="h-4 w-4 mr-2" aria-hidden="true" /> Void invoice
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

// ──────────────────────────────────────────────────────────────────
// Rows — table on ≥md, cards below.
// ──────────────────────────────────────────────────────────────────
const InvoiceRows: React.FC<{ rows: Invoice[]; bucketOf: Map<string, Bucket>; h: RowHandlers }> = ({ rows, bucketOf, h }) => {
  const bucket = (i: Invoice) => bucketOf.get(i.id) || deriveBucket(i);
  const rowAccent = (b: Bucket) =>
    b === 'overdue' ? 'border-l-4 border-l-red-500' :
    b === 'draft' ? 'border-l-4 border-l-orange-400' : '';

  return (
    <>
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className={cn(TH, 'pl-4')}>Patient</TableHead>
              <TableHead className={TH}>Billed to</TableHead>
              <TableHead className={TH}>Service</TableHead>
              <TableHead className={cn(TH, 'text-right')}>Amount</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={cn(TH, 'whitespace-nowrap')}>Sent</TableHead>
              <TableHead className={cn(TH, 'whitespace-nowrap')}>Due</TableHead>
              <TableHead className={cn(TH, 'hidden xl:table-cell whitespace-nowrap')}>Appointment</TableHead>
              <TableHead className={TH_STICKY}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(inv => {
              const b = bucket(inv);
              const open = () => h.onOpen(inv);
              return (
                <TableRow
                  key={inv.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${inv.patient_name}, ${statusLabel(inv, b)}. Open invoice`}
                  className={cn('cursor-pointer bg-white focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B91C1C]/40', rowAccent(b))}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800 truncate">{inv.patient_name}</span>
                        {inv.is_vip && <Pill className="bg-amber-50 text-amber-700 border-amber-200">VIP</Pill>}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">{inv.patient_email || <span className="text-orange-700">No email on file</span>}</p>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs max-w-[160px]"><BilledTo inv={inv} /></TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 capitalize max-w-[180px] truncate">{serviceLabel(inv)}</TableCell>
                  <TableCell className="py-2.5 align-top text-sm font-semibold text-right tabular-nums whitespace-nowrap">{fmtMoney(inv.total_amount)}</TableCell>
                  <TableCell className="py-2.5 align-top">
                    <div className="flex items-center gap-1 flex-wrap">
                      <StatusPill inv={inv} bucket={b} />
                      <PaidElsewherePill inv={inv} />
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">{fmtDate(inv.invoice_sent_at)}</TableCell>
                  <TableCell className="py-2.5 align-top text-xs whitespace-nowrap"><DueCell inv={inv} bucket={b} /></TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">
                    {inv.appointment_date ? format(new Date(inv.appointment_date + 'T12:00:00'), 'MMM d') : '—'}
                    {inv.appointment_time && <span className="text-gray-400 ml-1">{inv.appointment_time}</span>}
                  </TableCell>
                  <TableCell className={TD_STICKY}>
                    <div className="flex items-center justify-end gap-1">
                      <PrimaryAction inv={inv} bucket={b} h={h} className="h-9" />
                      <RowMenu inv={inv} bucket={b} h={h} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {rows.map(inv => {
          const b = bucket(inv);
          const open = () => h.onOpen(inv);
          return (
            <Card
              key={inv.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${inv.patient_name}, ${statusLabel(inv, b)}. Open invoice`}
              className={cn('shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40', rowAccent(b))}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{inv.patient_name}</span>
                      {inv.is_vip && <Pill className="bg-amber-50 text-amber-700 border-amber-200">VIP</Pill>}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">{inv.patient_email || <span className="text-orange-700">No email on file</span>}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums whitespace-nowrap">{fmtMoney(inv.total_amount)}</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <StatusPill inv={inv} bucket={b} />
                  <PaidElsewherePill inv={inv} />
                  <span className="text-[11px] text-gray-500 ml-auto"><BilledTo inv={inv} /></span>
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="capitalize truncate">{serviceLabel(inv)}</span>
                  <span className="text-gray-300">·</span>
                  <span>Sent {fmtDate(inv.invoice_sent_at)}</span>
                  <span className="text-gray-300">·</span>
                  <span>Due <DueCell inv={inv} bucket={b} /></span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <PrimaryAction inv={inv} bucket={b} h={h} className="h-11 flex-1 justify-center" />
                  <RowMenu inv={inv} bucket={b} h={h} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
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
// Detail drawer
// ──────────────────────────────────────────────────────────────────
interface AuditEntry {
  id: string; action: string; actor_email: string | null; reason: string | null; created_at: string;
  amount_before_cents: number | null; amount_after_cents: number | null; email_before: string | null; email_after: string | null;
  stripe_status_before: string | null; stripe_status_after: string | null;
}

const InvoiceDetailDrawer: React.FC<{ inv: Invoice; bucket: Bucket; h: RowHandlers; onClose: () => void }> = ({ inv, bucket, h, onClose }) => {
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    setAudit(null);
    db.from('invoice_audit_log')
      .select('id, action, actor_email, reason, created_at, amount_before_cents, amount_after_cents, email_before, email_after, stripe_status_before, stripe_status_after')
      .eq('appointment_id', inv.id)
      .order('created_at', { ascending: true })
      .then(({ data }: any) => { if (alive) setAudit((data as AuditEntry[]) || []); });
    return () => { alive = false; };
  }, [inv.id]);

  const timeline = [
    { at: inv.created_at, label: 'Appointment created' },
    { at: inv.invoice_sent_at, label: 'Invoice sent' },
    { at: inv.invoice_reminder_sent_at, label: 'Reminder sent' },
    { at: inv.invoice_final_warning_at, label: 'Final warning sent' },
    { at: inv.invoice_due_at, label: isPastDue(inv) ? 'Due date passed' : 'Due' },
  ].filter(t => !!t.at && isValid(new Date(t.at!))).sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());

  return (
    <DetailDrawer
      eyebrow="Invoice"
      title={inv.patient_name}
      titleId={`invoice-title-${inv.id}`}
      onClose={onClose}
      headerExtra={<>
        <StatusPill inv={inv} bucket={bucket} className="bg-white/95" />
        {isPaidElsewhere(inv) && <Pill className="bg-amber-100 text-amber-800 border-amber-200"><CreditCard className="h-3 w-3" aria-hidden="true" /> Card paid</Pill>}
        <span className="text-lg font-bold tabular-nums">{fmtMoney(inv.total_amount)}</span>
        {inv.billed_to === 'org' && (
          <span className="text-sm opacity-95 flex items-center gap-1.5 min-w-0">
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> <span className="truncate">{inv.organization_name || 'Organization'}</span>
          </span>
        )}
      </>}
    >
      {isPaidElsewhere(inv) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <CreditCard className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p>The appointment's payment status is <strong>{inv.payment_status}</strong> but this invoice is still <strong>{statusLabel(inv, bucket).toLowerCase()}</strong>, so it is counted as outstanding and reminders may keep going out. If the card charge is real, mark it paid; if the invoice was the real payment path, void it.</p>
        </div>
      )}
      {bucket === 'overdue' && !isPaidElsewhere(inv) && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p>Past due{inv.invoice_status === 'final_warning' ? ' — final warning sent; the reminder cron may auto-cancel the appointment' : ''}. Resend the invoice or reach out to the patient.</p>
        </div>
      )}
      {bucket === 'draft' && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900 flex items-start gap-2">
          <Mail className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p>{inv.invoice_status === 'missing_email' ? 'No email on file, so the invoice was never sent. Add an email, then send it.' : 'The invoice has not been sent yet.'}</p>
        </div>
      )}

      <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible -mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0">
        {canAct(bucket) && (
          <>
            <Button onClick={() => h.onMarkPaid(inv)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-10 text-xs flex-shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Mark paid
            </Button>
            <Button onClick={() => h.onResend(inv)} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 text-xs flex-shrink-0">
              <Send className="h-3.5 w-3.5" aria-hidden="true" /> Resend
            </Button>
          </>
        )}
        {bucket === 'draft' && inv.patient_email && (
          <Button onClick={() => h.onResend(inv)} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 h-10 text-xs flex-shrink-0">
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> Send invoice
          </Button>
        )}
        {(canAct(bucket) || bucket === 'draft') && h.isSuperAdmin && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => h.onEdit(inv)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit & reissue
          </Button>
        )}
        {inv.stripe_invoice_url && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
            <a href={inv.stripe_invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Hosted invoice</a>
          </Button>
        )}
        {inv.stripe_invoice_url && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" onClick={() => copyText(inv.stripe_invoice_url!, 'Payment link')}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy link
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
          <a href={`${h.basePath}/calendar?appointment=${inv.id}`} target="_blank" rel="noopener noreferrer"><Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Appointment</a>
        </Button>
        {inv.patient_email && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0" asChild>
            <a href={`mailto:${inv.patient_email}`}><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email</a>
          </Button>
        )}
        {canAct(bucket) && h.isSuperAdmin && (
          <Button variant="outline" size="sm" className="h-10 text-xs gap-1.5 flex-shrink-0 text-red-600 border-red-200 hover:bg-red-50" onClick={() => h.onVoid(inv)}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Void
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <FieldGroup title="Recipient">
          <Field label="Billed to">{inv.billed_to === 'org' ? `Organization · ${inv.organization_name || '—'}` : 'Patient'}</Field>
          <Field label="Email">{inv.patient_email || <span className="text-orange-700">None on file</span>}</Field>
          <Field label="Phone">{inv.patient_phone || '—'}</Field>
          <Field label="VIP">{inv.is_vip ? 'Yes' : 'No'}</Field>
          <Field label="Booked via"><span className="capitalize">{inv.booking_source}</span></Field>
        </FieldGroup>
        <FieldGroup title="Invoice">
          <Field label="Amount"><span className="font-semibold tabular-nums">{fmtMoney(inv.total_amount)}</span></Field>
          <Field label="Status"><span className="font-medium">{statusLabel(inv, bucket)}</span> <span className="text-gray-400 font-mono text-[10px]">({inv.invoice_status})</span></Field>
          <Field label="Payment"><span className="capitalize">{inv.payment_status.replace(/_/g, ' ')}</span></Field>
          <Field label="Service"><span className="capitalize">{serviceLabel(inv)}</span></Field>
          <Field label="Appointment">{inv.appointment_date ? format(new Date(inv.appointment_date + 'T12:00:00'), 'MMM d, yyyy') : '—'}{inv.appointment_time ? ` · ${inv.appointment_time}` : ''}{inv.appointment_status ? <span className="text-gray-400"> · {inv.appointment_status}</span> : null}</Field>
          <Field label="Stripe">{inv.stripe_invoice_id ? <span className="font-mono text-[10px] break-all">{inv.stripe_invoice_id}</span> : '—'}</Field>
        </FieldGroup>
        <div className="space-y-1.5 text-sm">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Activity</p>
          {timeline.length === 0 ? <p className="text-xs text-gray-500">No activity yet.</p> : (
            <ol className="space-y-1 text-xs">
              {timeline.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', i === timeline.length - 1 ? 'bg-[#B91C1C]' : 'bg-gray-300')} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="text-gray-800">{t.label}</span>
                    <span className="block text-[10px] text-gray-400">{format(new Date(t.at!), 'MMM d, h:mm a')} · {ago(t.at!)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {audit === null ? (
            <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-2"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Loading audit log…</p>
          ) : audit.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Audit log</p>
              <ol className="space-y-1 text-xs">
                {audit.map(a => (
                  <li key={a.id} className="bg-gray-50 border border-gray-200 rounded px-2 py-1">
                    <span className="font-medium capitalize">{a.action.replace(/_/g, ' ')}</span>
                    {a.amount_before_cents != null && a.amount_after_cents != null && <span className="text-gray-600"> · {fmtMoney(a.amount_before_cents, { cents: true })} → {fmtMoney(a.amount_after_cents, { cents: true })}</span>}
                    {a.email_before && a.email_after && a.email_before !== a.email_after && <span className="text-gray-600"> · {a.email_before} → {a.email_after}</span>}
                    {a.stripe_status_before && a.stripe_status_after && <span className="text-gray-600"> · Stripe {a.stripe_status_before} → {a.stripe_status_after}</span>}
                    {a.reason && <span className="block text-gray-500 italic">“{a.reason}”</span>}
                    <span className="block text-[10px] text-gray-400">{a.actor_email || 'system'} · {format(new Date(a.created_at), 'MMM d, h:mm a')}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {inv.notes && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Notes</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap bg-amber-50 border border-amber-200 rounded px-3 py-2">{inv.notes}</p>
        </div>
      )}

      <p className="text-[10px] text-gray-400">Appointment ID <span className="font-mono">{inv.id}</span></p>
    </DetailDrawer>
  );
};

export default InvoicesTab;
