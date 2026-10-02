/**
 * OrganizationsTab — every partner organization (organizations table) in the
 * shared admin list language (see adminListKit + LabOrdersTab for the
 * reference), plus the Discovered-leads queue and the bulk Outreach composer.
 *
 * Rendered via Dashboard.tsx SECTION_SCREENS["partners/organizations"] for
 * BOTH admin roles. Outreach / dunning / discovered-lead actions / merge gate
 * on `super_admin` inside this file — the office_manager accounts are
 * partner-clinic staff.
 *
 * Directory: every org maps to exactly ONE bucket (deriveOrgBucket) so the
 * stat tiles, the filter chips and the list always agree:
 *
 *   discovered → OCR-captured lead that hasn't signed / declined / merged
 *   inactive   → is_active = false
 *   welcomed   → welcome email sent (welcomed_at)
 *   cold       → active, has a contact email, never welcomed   (needs action)
 *   no_email   → active, no contact email, never welcomed      (needs action)
 *
 * Discovered: open leads partitioned into hot / untouched / in progress /
 * unreachable (no email) so the beacon, tiles and list agree.
 *
 * Clicking an org opens the full org console (Overview / Patients / Staff /
 * Services / Invoices / Notes / Emails) — it replaces the list rather than
 * opening a drawer because the sub-tabs are full screens of their own.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Building2, Plus, Search, Send, Mail,
  Phone, User, Users, FileText, Loader2, Pencil,
  Eye, Sparkles, CheckCircle2, AlertCircle, X,
  TrendingUp, FlaskConical, StickyNote, MoreHorizontal, Copy, ChevronRight,
  Globe, Flame, PhoneCall, Link2, ArrowLeft, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ago, copyText, rowKeyHandler, plural, TH, TH_STICKY, TD_STICKY, ROW_FOCUS, CARD_FOCUS,
  PageHeader, RefreshButton, StatTiles, FilterChips, SearchBox, SegmentedControl, LaneHeader, LoadingRows,
  EmptyState, ErrorCard, ListFooter, Pill, Notice,
  type TileDef, type ChipDef,
} from './adminListKit';
import OrgRoiCard from './OrgRoiCard';
import OrgPatientsTab from '@/components/admin/OrgPatientsTab';
import OrgNotesTab from '@/components/admin/OrgNotesTab';
import OrgStaffList from '@/components/admin/OrgStaffList';
import OrgSubscriptionStatusCard from '@/components/admin/OrgSubscriptionStatusCard';
import OrgCommunicationsTab from '@/components/admin/OrgCommunicationsTab';
import DiscoveredZipClusters from './DiscoveredZipClusters';
import MergeDuplicatesDialog from './MergeDuplicatesDialog';

interface Org {
  id: string; name: string; contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; billing_email: string | null; billing_address: string | null;
  notes: string | null; is_active: boolean; created_at: string;
  cc_emails?: string[] | null;       // additional staff recipients
  welcomed_at?: string | null;        // set once the welcome email fires
  // Partner-rule fields (added by earlier migrations)
  portal_enabled?: boolean | null;
  default_billed_to?: 'patient' | 'org' | null;
  allow_bill_override?: boolean | null;
  show_patient_name_on_appointment?: boolean | null;
  locked_service_type?: string | null;
  locked_price_cents?: number | null;
  org_invoice_price_cents?: number | null;
  member_stacking_rule?: 'lowest_wins' | 'partner_only' | 'org_covers' | null;
  // Partnership flywheel fields (Phase 1 migration)
  source?: 'manual' | 'discovered_from_ocr' | 'partner_signup' | null;
  discovered_from_lab_order?: boolean | null;
  first_discovered_at?: string | null;
  last_referral_at?: string | null;
  referral_count?: number | null;
  outreach_status?: 'untouched' | 'emailed' | 'called' | 'welcomed' | 'unreachable_no_email' | 'signed' | 'declined' | 'merged' | null;
  outreached_at?: string | null;
  outreach_note?: string | null;
  npi?: string | null;
  ordering_physician?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  office_phone?: string | null;
  // Phase 4: NPI enrichment from CMS NPI Registry
  npi_taxonomy?: string | null;
  npi_registered_date?: string | null;
  npi_enriched_at?: string | null;
  followup_count?: number | null;
  last_followup_at?: string | null;
}

interface OrgInvoice {
  id: string; org_id: string; patient_name: string | null; service_type: string | null;
  amount: number; memo: string | null; status: string; sent_at: string | null;
  paid_at: string | null; created_at: string;
  dunning_stage?: number | null; last_dunning_at?: string | null; dunning_paused?: boolean | null;
}

// Untyped table access — organizations has many columns the generated
// Database type doesn't know about.
const db = supabase as any;

// ──────────────────────────────────────────────────────────────────
// Directory buckets — ONE per org.
// ──────────────────────────────────────────────────────────────────
const OPEN_LEAD = (o: Org) =>
  o.source === 'discovered_from_ocr' && o.outreach_status !== 'signed' && o.outreach_status !== 'declined' && o.outreach_status !== 'merged';

export type OrgBucket = 'discovered' | 'inactive' | 'welcomed' | 'cold' | 'no_email';

export function deriveOrgBucket(o: Org): OrgBucket {
  if (OPEN_LEAD(o)) return 'discovered';
  if (!o.is_active) return 'inactive';
  if (o.welcomed_at) return 'welcomed';
  if (o.contact_email) return 'cold';
  return 'no_email';
}

const ORG_NEEDS_ACTION: ReadonlySet<OrgBucket> = new Set<OrgBucket>(['cold', 'no_email']);

interface BucketMeta { label: string; desc: string; pill: string; tile: string; dot: string }

const ORG_META: Record<OrgBucket, BucketMeta> = {
  cold: {
    label: 'Cold', desc: 'Active with a contact email but never sent the welcome',
    pill: 'bg-amber-100 text-amber-800 border-amber-200', tile: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500',
  },
  no_email: {
    label: 'No email', desc: 'Active but no contact email on file — cannot be welcomed',
    pill: 'bg-red-100 text-red-800 border-red-200', tile: 'border-red-300 bg-red-50 text-red-800', dot: 'bg-red-500',
  },
  welcomed: {
    label: 'Welcomed', desc: 'Welcome email sent — portal activation link delivered',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', tile: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500',
  },
  discovered: {
    label: 'Discovered lead', desc: 'Auto-captured from a lab order — worked from the Discovered view',
    pill: 'bg-purple-100 text-purple-800 border-purple-200', tile: 'border-purple-300 bg-purple-50 text-purple-800', dot: 'bg-purple-500',
  },
  inactive: {
    label: 'Inactive', desc: 'Switched off — hidden from most views',
    pill: 'bg-white text-gray-500 border-gray-300', tile: 'border-gray-300 bg-gray-50 text-gray-700', dot: 'bg-gray-300',
  },
};

type OrgFilterKey = 'all' | 'needs_action' | OrgBucket;

const ORG_FILTERS: Array<ChipDef<OrgFilterKey> & { match: (b: OrgBucket) => boolean }> = [
  { key: 'all', label: 'All', desc: 'Every organization on file', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Active partners that still need a welcome or an email', match: b => ORG_NEEDS_ACTION.has(b) },
  { key: 'cold', label: 'Cold', desc: ORG_META.cold.desc, dot: ORG_META.cold.dot, match: b => b === 'cold' },
  { key: 'no_email', label: 'No email', desc: ORG_META.no_email.desc, dot: ORG_META.no_email.dot, match: b => b === 'no_email' },
  { key: 'welcomed', label: 'Welcomed', desc: ORG_META.welcomed.desc, dot: ORG_META.welcomed.dot, match: b => b === 'welcomed' },
  { key: 'discovered', label: 'Discovered', desc: ORG_META.discovered.desc, dot: ORG_META.discovered.dot, match: b => b === 'discovered' },
  { key: 'inactive', label: 'Inactive', desc: ORG_META.inactive.desc, dot: ORG_META.inactive.dot, match: b => b === 'inactive' },
];

/** Four tiles that partition every org (needs_action = cold + no_email). */
const ORG_TILES: TileDef<OrgFilterKey>[] = [
  { key: 'needs_action', label: 'Needs action', desc: ORG_FILTERS[1].desc, style: 'border-red-300 bg-red-50 text-red-800', alert: true },
  { key: 'welcomed', label: 'Welcomed', desc: ORG_META.welcomed.desc, style: ORG_META.welcomed.tile },
  { key: 'discovered', label: 'Discovered leads', desc: ORG_META.discovered.desc, style: ORG_META.discovered.tile },
  { key: 'inactive', label: 'Inactive', desc: ORG_META.inactive.desc, style: ORG_META.inactive.tile },
];

// ──────────────────────────────────────────────────────────────────
// Discovered-lead buckets — ONE per open lead.
// ──────────────────────────────────────────────────────────────────
export type LeadBucket = 'hot' | 'untouched' | 'in_progress' | 'unreachable';

const HOURS_48 = 48 * 3600 * 1000;

export function deriveLeadBucket(o: Org, now: number): LeadBucket {
  const status = o.outreach_status || 'untouched';
  if (status === 'untouched') {
    const hot = (o.referral_count || 0) >= 3;
    const fresh = !!o.last_referral_at && now - new Date(o.last_referral_at).getTime() < HOURS_48;
    return hot || fresh ? 'hot' : 'untouched';
  }
  if (status === 'unreachable_no_email') return 'unreachable';
  return 'in_progress';
}

const LEAD_NEEDS_ACTION: ReadonlySet<LeadBucket> = new Set<LeadBucket>(['hot', 'untouched']);

const LEAD_META: Record<LeadBucket, BucketMeta> = {
  hot: {
    label: 'Hot lead', desc: '3+ patient referrals (or one in the last 48h) and nobody has reached out',
    pill: 'bg-red-100 text-red-800 border-red-200', tile: 'border-red-300 bg-red-50 text-red-800', dot: 'bg-red-500',
  },
  untouched: {
    label: 'Untouched', desc: 'Captured from a lab order — no outreach yet',
    pill: 'bg-amber-100 text-amber-800 border-amber-200', tile: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500',
  },
  in_progress: {
    label: 'In progress', desc: 'Emailed, called or welcomed — waiting on the practice',
    pill: 'bg-blue-100 text-blue-800 border-blue-200', tile: 'border-blue-300 bg-blue-50 text-blue-800', dot: 'bg-blue-500',
  },
  unreachable: {
    label: 'No email', desc: 'Marked unreachable — no practice email could be found',
    pill: 'bg-gray-100 text-gray-700 border-gray-200', tile: 'border-gray-300 bg-gray-100 text-gray-800', dot: 'bg-gray-400',
  },
};

type LeadFilterKey = 'all' | 'needs_action' | LeadBucket;

const LEAD_FILTERS: Array<ChipDef<LeadFilterKey> & { match: (b: LeadBucket) => boolean }> = [
  { key: 'all', label: 'All leads', desc: 'Every open discovered practice', match: () => true },
  { key: 'needs_action', label: 'Needs action', desc: 'Hot or untouched — reach out', match: b => LEAD_NEEDS_ACTION.has(b) },
  { key: 'hot', label: 'Hot', desc: LEAD_META.hot.desc, dot: LEAD_META.hot.dot, match: b => b === 'hot' },
  { key: 'untouched', label: 'Untouched', desc: LEAD_META.untouched.desc, dot: LEAD_META.untouched.dot, match: b => b === 'untouched' },
  { key: 'in_progress', label: 'In progress', desc: LEAD_META.in_progress.desc, dot: LEAD_META.in_progress.dot, match: b => b === 'in_progress' },
  { key: 'unreachable', label: 'No email', desc: LEAD_META.unreachable.desc, dot: LEAD_META.unreachable.dot, match: b => b === 'unreachable' },
];

const LEAD_TILES: TileDef<LeadFilterKey>[] = [
  { key: 'hot', label: 'Hot leads', desc: LEAD_META.hot.desc, style: LEAD_META.hot.tile, alert: true },
  { key: 'untouched', label: 'Untouched', desc: LEAD_META.untouched.desc, style: LEAD_META.untouched.tile },
  { key: 'in_progress', label: 'In progress', desc: LEAD_META.in_progress.desc, style: LEAD_META.in_progress.tile },
  { key: 'unreachable', label: 'No email', desc: LEAD_META.unreachable.desc, style: LEAD_META.unreachable.tile },
];

const humanStatus = (s: string | null | undefined) => (s || 'untouched').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
const orgAddress = (o: Org) => [o.address_street, o.address_city, o.address_state, o.address_zip].filter(Boolean).join(', ');
const lastActivityOf = (o: Org) => (o as any).updated_at || o.welcomed_at || o.last_referral_at || o.created_at;

const OrganizationsTab: React.FC = () => {
  const { user } = useAuth();
  // Outreach emails, dunning sweeps, lead actions and merges are admin-only.
  const canManage = user?.role === 'super_admin';

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [invoices, setInvoices] = useState<OrgInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [showEditOrg, setShowEditOrg] = useState(false);
  const [saving, setSaving] = useState(false);

  const [orgForm, setOrgForm] = useState<{
    name: string; contactName: string; contactEmail: string; contactPhone: string;
    billingEmail: string; billingAddress: string; notes: string;
    ccEmails: { email: string; label: string }[];
  }>({ name: '', contactName: '', contactEmail: '', contactPhone: '', billingEmail: '', billingAddress: '', notes: '', ccEmails: [] });
  const [invoiceForm, setInvoiceForm] = useState({ patientName: '', serviceType: '', amount: '', memo: '' });

  // Full edit form — covers everything including partner rules
  const [editForm, setEditForm] = useState<{
    name: string; contactName: string; contactEmail: string; contactPhone: string;
    billingEmail: string; billingAddress: string; notes: string;
    isActive: boolean; portalEnabled: boolean;
    defaultBilledTo: 'patient' | 'org';
    allowBillOverride: boolean;
    showPatientNameOnAppointment: boolean;
    lockedServiceType: string;
    lockedPriceDollars: string;
    orgInvoicePriceDollars: string;
    memberStackingRule: 'lowest_wins' | 'partner_only' | 'org_covers';
    ccEmails: { email: string; label: string }[];
  }>({
    name: '', contactName: '', contactEmail: '', contactPhone: '',
    billingEmail: '', billingAddress: '', notes: '',
    isActive: true, portalEnabled: false,
    defaultBilledTo: 'patient',
    allowBillOverride: true,
    showPatientNameOnAppointment: true,
    lockedServiceType: '',
    lockedPriceDollars: '',
    orgInvoicePriceDollars: '',
    memberStackingRule: 'lowest_wins',
    ccEmails: [],
  });

  const openEditModal = (org: Org) => {
    // Hydrate existing cc_emails into editable rows; keep label empty since
    // we only stored the address (phase 2 could add a labels table).
    const existingCcs: { email: string; label: string }[] = Array.isArray((org as any).cc_emails)
      ? ((org as any).cc_emails as string[]).map(e => ({ email: e, label: '' }))
      : [];
    setEditForm({
      name: org.name || '',
      contactName: org.contact_name || '',
      contactEmail: org.contact_email || '',
      contactPhone: org.contact_phone || '',
      billingEmail: org.billing_email || '',
      billingAddress: org.billing_address || '',
      notes: org.notes || '',
      isActive: org.is_active ?? true,
      portalEnabled: org.portal_enabled ?? false,
      defaultBilledTo: (org.default_billed_to as 'patient' | 'org') || 'patient',
      allowBillOverride: org.allow_bill_override ?? true,
      showPatientNameOnAppointment: org.show_patient_name_on_appointment ?? true,
      lockedServiceType: org.locked_service_type || '',
      lockedPriceDollars: org.locked_price_cents != null ? (org.locked_price_cents / 100).toFixed(2) : '',
      orgInvoicePriceDollars: org.org_invoice_price_cents != null ? (org.org_invoice_price_cents / 100).toFixed(2) : '',
      memberStackingRule: (org.member_stacking_rule as any) || 'lowest_wins',
      ccEmails: existingCcs,
    });
    setShowEditOrg(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedOrg) return;
    if (!editForm.name.trim()) { toast.error('Organization name required'); return; }
    setSaving(true);
    try {
      // Clean CC emails: dedupe, lowercase, drop empties + the primary contact
      const ccClean = Array.from(new Set(
        editForm.ccEmails
          .map(r => (r.email || '').trim().toLowerCase())
          .filter(e => e && e.includes('@') && e !== editForm.contactEmail.trim().toLowerCase())
      ));

      const payload = {
        name: editForm.name.trim(),
        contact_name: editForm.contactName.trim() || null,
        contact_email: editForm.contactEmail.trim() || null,
        contact_phone: editForm.contactPhone.trim() || null,
        billing_email: editForm.billingEmail.trim() || null,
        billing_address: editForm.billingAddress.trim() || null,
        notes: editForm.notes.trim() || null,
        cc_emails: ccClean,
        is_active: editForm.isActive,
        portal_enabled: editForm.portalEnabled,
        default_billed_to: editForm.defaultBilledTo,
        allow_bill_override: editForm.allowBillOverride,
        show_patient_name_on_appointment: editForm.showPatientNameOnAppointment,
        locked_service_type: editForm.lockedServiceType.trim() || null,
        locked_price_cents: editForm.lockedPriceDollars ? Math.round(parseFloat(editForm.lockedPriceDollars) * 100) : null,
        org_invoice_price_cents: editForm.orgInvoicePriceDollars ? Math.round(parseFloat(editForm.orgInvoicePriceDollars) * 100) : null,
        member_stacking_rule: editForm.memberStackingRule,
      };
      const { data, error } = await db
        .from('organizations')
        .update(payload)
        .eq('id', selectedOrg.id)
        .select('*')
        .single();
      if (error) throw error;
      toast.success('Organization updated');
      setShowEditOrg(false);
      setSelectedOrg(data as unknown as Org);
      fetchOrgs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const { data, error } = await db.from('organizations').select('*').order('name');
      if (error) throw error;
      setOrgs((data as Org[]) || []);
    } catch (err: any) {
      console.error('[OrganizationsTab] load failed:', err);
      setLastError(err?.message || String(err));
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async (orgId: string) => {
    const { data } = await db.from('org_invoices').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    setInvoices((data as unknown as OrgInvoice[]) || []);
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);
  useEffect(() => { if (selectedOrg) fetchInvoices(selectedOrg.id); }, [selectedOrg, fetchInvoices]);

  // Save the org row — no email auto-fires. Admin triggers the welcome
  // sequence manually via a per-row button (see handleSendWelcome below).
  // `sendWelcomeImmediately` = user clicked "Save & send welcome" CTA.
  const handleAddOrg = async (sendWelcomeImmediately = false) => {
    if (!orgForm.name.trim()) { toast.error('Organization name required'); return; }
    setSaving(true);
    try {
      // Clean CC emails: dedupe, lowercase, drop empties + the primary contact
      const ccClean = Array.from(new Set(
        orgForm.ccEmails
          .map(r => (r.email || '').trim().toLowerCase())
          .filter(e => e && e.includes('@') && e !== orgForm.contactEmail.trim().toLowerCase())
      ));

      const { data: newOrg, error } = await db.from('organizations').insert({
        name: orgForm.name, contact_name: orgForm.contactName || null,
        contact_email: orgForm.contactEmail || null, contact_phone: orgForm.contactPhone || null,
        billing_email: orgForm.billingEmail || null, billing_address: orgForm.billingAddress || null,
        notes: orgForm.notes || null,
        cc_emails: ccClean,
        portal_enabled: true,
      }).select('id, contact_email').single();
      if (error) throw error;

      if (sendWelcomeImmediately && (newOrg as any)?.contact_email) {
        await handleSendWelcome((newOrg as any).id, (newOrg as any).contact_email);
      } else {
        toast.success('Organization added');
      }

      setShowAddOrg(false);
      setOrgForm({ name: '', contactName: '', contactEmail: '', contactPhone: '', billingEmail: '', billingAddress: '', notes: '', ccEmails: [] });
      fetchOrgs();
    } catch (err: any) { toast.error(err.message || 'Failed'); }
    finally { setSaving(false); }
  };

  // Fires the send-org-welcome edge fn for a specific org. Idempotent —
  // if already welcomed, the server returns skipped:true unless resend=true.
  const handleSendWelcome = async (orgId: string, recipient: string | null, resend = false) => {
    if (!recipient) { toast.error('Add a contact email before sending'); return; }
    const verb = resend ? 'Resending' : 'Sending';
    toast.info(`${verb} welcome email to ${recipient}…`);
    try {
      const { data, error } = await supabase.functions.invoke('send-org-welcome', {
        body: { organization_id: orgId, resend },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      if ((data as any)?.skipped) {
        toast.info('Already welcomed — use "Resend" to send again');
        return;
      }
      toast.success(`Welcome email sent to ${recipient}`);
      fetchOrgs();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send welcome email');
    }
  };

  const handleAddInvoice = async () => {
    if (!invoiceForm.amount || !selectedOrg) { toast.error('Amount required'); return; }
    setSaving(true);
    try {
      const { error } = await db.from('org_invoices').insert({
        org_id: selectedOrg.id,
        patient_name: invoiceForm.patientName || null,
        service_type: invoiceForm.serviceType || null,
        amount: parseFloat(invoiceForm.amount),
        memo: invoiceForm.memo || null,
        status: 'draft',
      });
      if (error) throw error;
      toast.success('Invoice created');
      setShowAddInvoice(false);
      setInvoiceForm({ patientName: '', serviceType: '', amount: '', memo: '' });
      fetchInvoices(selectedOrg.id);
    } catch (err: any) { toast.error(err.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleSendInvoice = async (invoice: OrgInvoice) => {
    if (!selectedOrg?.billing_email) { toast.error('No billing email for this organization'); return; }
    try {
      await supabase.functions.invoke('send-email', {
        body: {
          to: selectedOrg.billing_email,
          subject: `ConveLabs Invoice - $${invoice.amount.toFixed(2)}${invoice.patient_name ? ` for ${invoice.patient_name}` : ''}`,
          html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;">
            <div style="background:#B91C1C;color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center;"><h2 style="margin:0;">Invoice from ConveLabs</h2></div>
            <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 12px 12px;">
              <p>Dear ${selectedOrg.contact_name || selectedOrg.name},</p>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:16px 0;">
                <table style="width:100%;font-size:14px;">
                  <tr><td style="padding:4px 0;color:#6b7280;">Organization</td><td style="text-align:right;font-weight:600;">${selectedOrg.name}</td></tr>
                  ${invoice.patient_name ? `<tr><td style="padding:4px 0;color:#6b7280;">Patient</td><td style="text-align:right;">${invoice.patient_name}</td></tr>` : ''}
                  ${invoice.service_type ? `<tr><td style="padding:4px 0;color:#6b7280;">Service</td><td style="text-align:right;">${invoice.service_type}</td></tr>` : ''}
                  ${invoice.memo ? `<tr><td style="padding:4px 0;color:#6b7280;">Memo</td><td style="text-align:right;">${invoice.memo}</td></tr>` : ''}
                  <tr><td colspan="2" style="padding:8px 0;"><hr style="border:none;border-top:1px solid #fecaca;"></td></tr>
                  <tr><td style="padding:4px 0;color:#B91C1C;font-weight:700;font-size:16px;">Amount Due</td><td style="text-align:right;font-weight:700;font-size:20px;color:#B91C1C;">$${invoice.amount.toFixed(2)}</td></tr>
                </table>
              </div>
              <p style="font-size:13px;color:#6b7280;">Please remit payment within 30 days.</p>
              <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">ConveLabs - 1800 Pembrook Drive, Suite 300, Orlando, FL 32810<br>(941) 527-9169</p>
            </div>
          </div>`,
        },
      });
      await db.from('org_invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoice.id);
      toast.success(`Invoice sent to ${selectedOrg.billing_email}`);
      fetchInvoices(selectedOrg.id);
    } catch (err: any) { toast.error(err.message || 'Failed to send'); }
  };

  const handleRunDunning = async () => {
    const t = toast.loading('Running dunning sweep...');
    try {
      const { data, error } = await supabase.functions.invoke('process-org-invoice-dunning', { body: {} });
      toast.dismiss(t);
      if (error) throw error;
      toast.success(`Dunning sweep complete: ${data?.sent || 0} emails sent`);
      if (selectedOrg) fetchInvoices(selectedOrg.id);
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message || 'Dunning failed');
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    await db.from('org_invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId);
    toast.success('Marked as paid');
    if (selectedOrg) fetchInvoices(selectedOrg.id);
  };

  // ── Directory: bucket every org once; tiles / chips / list derive from
  //    the same map so they can never disagree. Every org is listed —
  //    including OCR-discovered leads that haven't signed yet — so the
  //    operator never asks "where's {discovered org}?". The state is tagged.
  const [listFilter, setListFilter] = useState<OrgFilterKey>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'welcomed_first'>('recent');

  const orgBucketOf = useMemo(() => {
    const m = new Map<string, OrgBucket>();
    for (const o of orgs) m.set(o.id, deriveOrgBucket(o));
    return m;
  }, [orgs]);

  const orgCounts = useMemo(() => {
    const c = Object.fromEntries(ORG_FILTERS.map(f => [f.key, 0])) as Record<OrgFilterKey, number>;
    for (const o of orgs) {
      const b = orgBucketOf.get(o.id)!;
      for (const f of ORG_FILTERS) if (f.match(b)) c[f.key]++;
    }
    return c;
  }, [orgs, orgBucketOf]);

  const filtered = useMemo(() => {
    const def = ORG_FILTERS.find(f => f.key === listFilter)!;
    const q = searchQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return orgs.filter(o => def.match(orgBucketOf.get(o.id)!) && (q === '' ||
      o.name.toLowerCase().includes(q) ||
      (o.contact_name || '').toLowerCase().includes(q) ||
      (o.contact_email || '').toLowerCase().includes(q) ||
      (o.billing_email || '').toLowerCase().includes(q) ||
      (o.ordering_physician || '').toLowerCase().includes(q) ||
      (o.address_city || '').toLowerCase().includes(q) ||
      (o.npi || '').includes(q) ||
      (digits.length >= 3 && ((o.contact_phone || '') + (o.office_phone || '')).replace(/\D/g, '').includes(digits))
    )).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'welcomed_first') {
        const aw = a.welcomed_at ? 1 : 0;
        const bw = b.welcomed_at ? 1 : 0;
        if (aw !== bw) return bw - aw;
      }
      // Default: most-recently-updated first
      return new Date(lastActivityOf(b) || 0).getTime() - new Date(lastActivityOf(a) || 0).getTime();
    });
  }, [orgs, listFilter, searchQuery, sortBy, orgBucketOf]);

  const orgLanes = useMemo(() => {
    if (listFilter !== 'all') return null;
    const action = filtered.filter(o => ORG_NEEDS_ACTION.has(orgBucketOf.get(o.id)!));
    if (action.length === 0) return null;
    return { action, rest: filtered.filter(o => !ORG_NEEDS_ACTION.has(orgBucketOf.get(o.id)!)) };
  }, [filtered, listFilter, orgBucketOf]);

  // ── Organizations list views: Directory / Discovered / Outreach.
  //    Detail view (when an org is clicked) bypasses views entirely.
  const [activeTab, setActiveTab] = useState<'directory' | 'discovered' | 'outreach'>('directory');
  const [leadFilter, setLeadFilter] = useState<LeadFilterKey>('all');
  const [leadSearch, setLeadSearch] = useState('');

  // Discovered = auto-created from lab order OCR. Still needs admin to
  // reach out → confirm → activate → promote to real partner.
  const nowMs = Date.now();
  const discoveredOrgs = useMemo(() => orgs.filter(OPEN_LEAD), [orgs]);
  const leadBucketOf = useMemo(() => {
    const m = new Map<string, LeadBucket>();
    for (const o of discoveredOrgs) m.set(o.id, deriveLeadBucket(o, nowMs));
    return m;
  }, [discoveredOrgs]); // eslint-disable-line react-hooks/exhaustive-deps
  const leadCounts = useMemo(() => {
    const c = Object.fromEntries(LEAD_FILTERS.map(f => [f.key, 0])) as Record<LeadFilterKey, number>;
    for (const o of discoveredOrgs) {
      const b = leadBucketOf.get(o.id)!;
      for (const f of LEAD_FILTERS) if (f.match(b)) c[f.key]++;
    }
    return c;
  }, [discoveredOrgs, leadBucketOf]);
  const filteredLeads = useMemo(() => {
    const def = LEAD_FILTERS.find(f => f.key === leadFilter)!;
    const q = leadSearch.trim().toLowerCase();
    return discoveredOrgs
      .filter(o => def.match(leadBucketOf.get(o.id)!) && (q === '' ||
        o.name.toLowerCase().includes(q) ||
        (o.ordering_physician || '').toLowerCase().includes(q) ||
        (o.address_city || '').toLowerCase().includes(q) ||
        (o.npi || '').includes(q) ||
        (o.npi_taxonomy || '').toLowerCase().includes(q) ||
        (o.contact_email || '').toLowerCase().includes(q)
      ))
      .sort((a, b) => (b.referral_count || 0) - (a.referral_count || 0));
  }, [discoveredOrgs, leadFilter, leadSearch, leadBucketOf]);
  const leadLanes = useMemo(() => {
    if (leadFilter !== 'all') return null;
    const action = filteredLeads.filter(o => LEAD_NEEDS_ACTION.has(leadBucketOf.get(o.id)!));
    if (action.length === 0) return null;
    return { action, rest: filteredLeads.filter(o => !LEAD_NEEDS_ACTION.has(leadBucketOf.get(o.id)!)) };
  }, [filteredLeads, leadFilter, leadBucketOf]);
  // Beacon: red if any lead is hot (≥3 referrals untouched, or a referral in the last 48h).
  const hotBeacon = leadCounts.hot > 0;

  // Outreach modal state for a single discovered org
  const [outreachOrg, setOutreachOrg] = useState<Org | null>(null);
  const [outreachDraftSubject, setOutreachDraftSubject] = useState('');
  const [outreachDraftBody, setOutreachDraftBody] = useState('');
  const [outreachSending, setOutreachSending] = useState(false);
  const [discoveredPatientsMap, setDiscoveredPatientsMap] = useState<Record<string, string[]>>({});

  // Load patient names linked to each discovered org so the outreach
  // template can reference real names ("James, Sandra, Diana"). Runs
  // whenever the discovered list changes.
  useEffect(() => {
    if (discoveredOrgs.length === 0) { setDiscoveredPatientsMap({}); return; }
    (async () => {
      const ids = discoveredOrgs.map(o => o.id);
      const { data } = await db
        .from('appointment_organizations')
        .select('organization_id, appointment_id')
        .in('organization_id', ids);
      if (!data) return;
      const apptIds = Array.from(new Set((data as any[]).map(r => r.appointment_id).filter(Boolean)));
      if (apptIds.length === 0) return;
      const { data: appts } = await supabase
        .from('appointments')
        .select('id, patient_name')
        .in('id', apptIds);
      const apptName = new Map((appts || []).map((a: any) => [a.id, a.patient_name]));
      const map: Record<string, string[]> = {};
      for (const link of (data as any[])) {
        const nm = apptName.get(link.appointment_id);
        if (!nm) continue;
        if (!map[link.organization_id]) map[link.organization_id] = [];
        if (!map[link.organization_id].includes(nm)) map[link.organization_id].push(nm);
      }
      setDiscoveredPatientsMap(map);
    })();
  }, [discoveredOrgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const openOutreachModal = (org: Org) => {
    const names = discoveredPatientsMap[org.id] || [];
    const physicianFirstName = (org.ordering_physician || '').split(',').slice(-1)[0]?.trim().split(/\s+/)[0] || 'Dr.';
    const physicianLastName = (org.ordering_physician || '').split(',')[0]?.trim() || org.name;
    const greetingName = (org.ordering_physician || '').includes(',')
      ? `Dr. ${physicianLastName}`
      : (org.ordering_physician || `the team at ${org.name}`);
    const patientList = names.length > 0
      ? (names.length === 1 ? names[0] : names.slice(0, 3).join(', ') + (names.length > 3 ? `, +${names.length - 3} more` : ''))
      : 'several patients';

    setOutreachDraftSubject(`Your patients are using ConveLabs — a quick partnership idea`);
    setOutreachDraftBody(
`Hi ${greetingName},

I noticed we've drawn blood for ${names.length > 0 ? names.length : 'a handful'} of your patients recently (${patientList})${names.length > 0 ? '' : ''}.

Each was paying $125-150 out of pocket for a mobile draw. We'd like to discuss a partnership rate for your practice — your patients pay $85, you get a priority line + on-site STAT draws when you need them, results routed to your EMR.

Thursday 2 PM or Friday 10 AM — 10 minutes either way.

Thanks,
Nico Jean-Baptiste
ConveLabs · (941) 527-9169`
    );
    setOutreachOrg(org);
  };

  const sendOutreach = async () => {
    if (!outreachOrg) return;
    const recipient = outreachOrg.contact_email || outreachOrg.billing_email;
    if (!recipient) {
      toast.error('No email on file for this practice yet. Add contact_email first, or use the phone to reach out.');
      return;
    }
    setOutreachSending(true);
    try {
      const { error: emailErr } = await supabase.functions.invoke('send-one-off-email', {
        body: {
          to: recipient,
          subject: outreachDraftSubject,
          body: outreachDraftBody.replace(/\n/g, '<br/>'),
        },
      });
      if (emailErr) throw emailErr;
      await db.from('organizations').update({
        outreach_status: 'emailed',
        outreached_at: new Date().toISOString(),
        outreach_note: `Sent to ${recipient} · subject: ${outreachDraftSubject}`,
      }).eq('id', outreachOrg.id);
      toast.success(`Outreach sent to ${recipient}`);
      setOutreachOrg(null);
      fetchOrgs();
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally {
      setOutreachSending(false);
    }
  };

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  const markDiscoveredStatus = async (org: Org, status: 'declined' | 'called' | 'signed') => {
    await db.from('organizations').update({
      outreach_status: status,
      ...(status === 'signed' ? { is_active: true } : {}),
    }).eq('id', org.id);
    toast.success(status === 'signed' ? `${org.name} marked active partner` : `Marked ${status}`);
    fetchOrgs();
  };

  // ── Outreach tab state ─────────────────────────────────────────
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<Record<string, { email: string; firstName?: string; practiceName?: string }>>({});
  const [outreachSubject, setOutreachSubject] = useState('A concierge lab partner for your patients');
  const [outreachIntro, setOutreachIntro] = useState('');
  const [addCustomEmail, setAddCustomEmail] = useState('');
  const [addCustomName, setAddCustomName] = useState('');
  const [addCustomPractice, setAddCustomPractice] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [sendingOutreach, setSendingOutreach] = useState(false);
  const [lastSendResult, setLastSendResult] = useState<any>(null);

  // Fetch recent partnership inquiries when the Outreach tab becomes active
  useEffect(() => {
    if (activeTab !== 'outreach') return;
    (async () => {
      setLoadingInquiries(true);
      const { data } = await db
        .from('provider_partnership_inquiries')
        .select('id, practice_name, contact_name, contact_email, status, created_at')
        .in('status', ['new', 'contacted'])
        .order('created_at', { ascending: false })
        .limit(50);
      setInquiries((data as any[]) || []);
      setLoadingInquiries(false);
    })();
  }, [activeTab]);

  const toggleRecipient = (key: string, recipient: { email: string; firstName?: string; practiceName?: string }) => {
    setSelectedRecipients(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = recipient;
      return next;
    });
  };

  const addCustomRecipient = () => {
    const email = addCustomEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { toast.error('Invalid email'); return; }
    const key = `custom:${email}`;
    setSelectedRecipients(prev => ({
      ...prev,
      [key]: {
        email,
        firstName: addCustomName.trim() || undefined,
        practiceName: addCustomPractice.trim() || undefined,
      },
    }));
    setAddCustomEmail(''); setAddCustomName(''); setAddCustomPractice('');
    toast.success(`Added ${email}`);
  };

  const handlePreviewOutreach = async () => {
    const list = Object.values(selectedRecipients);
    if (list.length === 0) { toast.error('Pick at least one recipient'); return; }
    try {
      const { data, error } = await supabase.functions.invoke('send-partner-outreach', {
        body: { recipients: list, customSubject: outreachSubject || undefined, customIntro: outreachIntro || undefined, dryRun: true },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      setPreviewHtml((data as any).preview_html);
    } catch (e: any) {
      toast.error(`Preview failed: ${e.message}`);
    }
  };

  const handleSendOutreach = async () => {
    const list = Object.values(selectedRecipients);
    if (list.length === 0) { toast.error('Pick at least one recipient'); return; }
    if (!window.confirm(`Send outreach email to ${list.length} recipient${list.length === 1 ? '' : 's'}?`)) return;
    setSendingOutreach(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-partner-outreach', {
        body: { recipients: list, customSubject: outreachSubject || undefined, customIntro: outreachIntro || undefined },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      setLastSendResult(data);
      const sent = (data as any)?.sent || 0;
      const skipped = (data as any)?.skipped_already_contacted || 0;
      toast.success(`Sent ${sent} · skipped ${skipped} already contacted`);
      setSelectedRecipients({});
    } catch (e: any) {
      toast.error(`Send failed: ${e.message}`);
    } finally {
      setSendingOutreach(false);
    }
  };

  // Organization detail view
  if (selectedOrg) {
    const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
    const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const totalOutstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);

    return (
      <div className="space-y-4">
        {/* Back — always visible, always alone on mobile */}
        <Button variant="ghost" size="sm" onClick={() => setSelectedOrg(null)} className="gap-1.5 -ml-2 h-10 sm:h-9 text-xs">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All organizations
        </Button>

        {/* Hero — same chrome as the shared detail drawer, inline because the
            org console is a full screen of sub-tabs rather than a dialog. */}
        <div className="rounded-lg bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider opacity-90">{OPEN_LEAD(selectedOrg) ? 'Discovered lead' : 'Partner organization'}</p>
              <h1 className="text-lg sm:text-xl font-bold mt-0.5 leading-tight break-words">{selectedOrg.name}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <OrgStatusPill o={selectedOrg} bucket={deriveOrgBucket(selectedOrg)} className="bg-white/95" />
                {selectedOrg.portal_enabled && <Pill className="bg-white/15 text-white border-white/30"><Globe className="h-3 w-3" aria-hidden="true" /> Portal enabled</Pill>}
                <span className="text-sm opacity-95 min-w-0 truncate">
                  {selectedOrg.contact_name ? `${selectedOrg.contact_name} · ` : ''}
                  {selectedOrg.contact_email || 'No email'}
                  {selectedOrg.contact_phone && ` · ${selectedOrg.contact_phone}`}
                </span>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0 flex-col xs:flex-row sm:flex-row w-full sm:w-auto">
              {selectedOrg.contact_email && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const alreadyWelcomed = !!selectedOrg.welcomed_at;
                    handleSendWelcome(selectedOrg.id, selectedOrg.contact_email, alreadyWelcomed);
                  }}
                  className={cn('gap-1.5 w-full sm:w-auto h-10 sm:h-9 text-xs', selectedOrg.welcomed_at
                    ? 'bg-white/10 hover:bg-white/20 border border-white/30 text-white'
                    : 'bg-white hover:bg-gray-100 text-[#B91C1C] shadow-sm')}
                  title={selectedOrg.welcomed_at ? 'Resend the welcome email' : 'Send the branded welcome email now'}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  {selectedOrg.welcomed_at ? 'Resend welcome' : 'Send welcome'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => openEditModal(selectedOrg)} className="gap-1.5 w-full sm:w-auto h-10 sm:h-9 text-xs text-white hover:bg-white/10 border border-white/30">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
              </Button>
            </div>
          </div>
        </div>
        {!selectedOrg.contact_email && selectedOrg.is_active && (
          <Notice tone="red" icon={AlertTriangle}><p>No contact email on file — the welcome email and portal activation can't be sent. Add one with <strong>Edit</strong>.</p></Notice>
        )}

        <Tabs defaultValue="overview">
          {/* Horizontally scrollable tab rail on mobile — swipe to reveal
              Staff/Services/Notes/Activity without cramping the labels. */}
          <div className="-mx-2 sm:mx-0 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex min-w-max px-2 sm:px-0 gap-0.5">
              <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm px-2.5 sm:px-3 whitespace-nowrap"><TrendingUp className="h-3.5 w-3.5" /> Overview</TabsTrigger>
              <TabsTrigger value="patients" className="gap-1 text-xs sm:text-sm px-2.5 sm:px-3 whitespace-nowrap"><User className="h-3.5 w-3.5" /> Patients</TabsTrigger>
              <TabsTrigger value="staff" className="gap-1 text-xs sm:text-sm px-2.5 sm:px-3 whitespace-nowrap"><Users className="h-3.5 w-3.5" /> Staff</TabsTrigger>
              <TabsTrigger value="services" className="gap-1 text-xs sm:text-sm px-2.5 sm:px-3 whitespace-nowrap"><FlaskConical className="h-3.5 w-3.5" /> Services</TabsTrigger>
              <TabsTrigger value="invoices" className="gap-1 text-xs sm:text-sm px-2.5 sm:px-3 whitespace-nowrap">
                <FileText className="h-3.5 w-3.5" /> Invoices
                {invoices.length > 0 && <span className="ml-1 text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-full">{invoices.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-1 text-xs sm:text-sm px-2.5 sm:px-3 whitespace-nowrap"><StickyNote className="h-3.5 w-3.5" /> Notes</TabsTrigger>
              <TabsTrigger value="emails" className="gap-1 text-xs sm:text-sm px-2.5 sm:px-3 whitespace-nowrap"><Mail className="h-3.5 w-3.5" /> Emails</TabsTrigger>
            </TabsList>
          </div>

          {/* ─── OVERVIEW ─────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <OrgSubscriptionStatusCard orgId={selectedOrg.id} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-[#B91C1C]">${totalInvoiced.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Total Invoiced</p></CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-600">${totalPaid.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Paid</p></CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-red-600">${totalOutstanding.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Outstanding</p></CardContent></Card>
            </div>
            <OrgRoiCard orgId={selectedOrg.id} />
          </TabsContent>

          {/* ─── PATIENTS ─────────────────────────────────────────── */}
          <TabsContent value="patients" className="mt-4">
            <OrgPatientsTab orgId={selectedOrg.id} orgName={selectedOrg.name} />
          </TabsContent>

          {/* ─── STAFF — invite + manage org portal users ─────────── */}
          <TabsContent value="staff" className="mt-4">
            <OrgStaffList
              organizationId={selectedOrg.id}
              organizationName={selectedOrg.name}
            />
          </TabsContent>

          {/* ─── SERVICES (stub) ──────────────────────────────────── */}
          <TabsContent value="services" className="mt-4">
            <Card className="shadow-sm border-dashed">
              <CardContent className="p-10 text-center">
                <FlaskConical className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="font-semibold text-sm">Custom services — coming soon</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Define per-org services with custom pricing (e.g. "Monthly Hormone Panel — $145"). One-click presets from common templates. Phase 2 of the org console rollout.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── INVOICES ─────────────────────────────────────────── */}
          <TabsContent value="invoices" className="space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Invoices ({invoices.length})</h2>
              <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={() => setShowAddInvoice(true)}>
                <Plus className="h-4 w-4" /> Create Invoice
              </Button>
            </div>

            {invoices.length === 0 ? (
              <Card className="shadow-sm border-dashed"><CardContent className="p-8 text-center"><FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" /><p className="text-muted-foreground">No invoices yet</p></CardContent></Card>
            ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Service</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm">{inv.patient_name || '—'}</TableCell>
                    <TableCell className="text-sm">{inv.service_type || '—'}</TableCell>
                    <TableCell className="font-semibold">${inv.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={`text-xs ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : inv.status === 'sent' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'}`}>{inv.status}</Badge>
                        {inv.status === 'sent' && (inv.dunning_stage || 0) > 0 && (
                          <Badge variant="outline" className={`text-[10px] ${inv.dunning_stage === 3 ? 'bg-red-50 text-red-700 border-red-200' : inv.dunning_stage === 2 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                            Dunning {inv.dunning_stage}/3
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inv.sent_at ? format(new Date(inv.sent_at), 'MMM d') : '—'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {inv.status === 'draft' && <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleSendInvoice(inv)}><Send className="h-3 w-3 mr-1" /> Send</Button>}
                      {inv.status !== 'paid' && <Button variant="ghost" size="sm" className="text-xs h-7 text-emerald-600" onClick={() => handleMarkPaid(inv.id)}>Paid</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
          </TabsContent>

          {/* ─── NOTES ────────────────────────────────────────────── */}
          <TabsContent value="notes" className="mt-4">
            <OrgNotesTab orgId={selectedOrg.id} />
          </TabsContent>

          {/* ─── EMAILS (communication log) ───────────────────────── */}
          <TabsContent value="emails" className="mt-4">
            <OrgCommunicationsTab orgId={selectedOrg.id} />
          </TabsContent>
        </Tabs>

        {/* Edit Organization Modal — covers contact info + billing + partner rules */}
        <Dialog open={showEditOrg} onOpenChange={setShowEditOrg}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit {selectedOrg.name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {/* Contact section */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contact</p>
                <div>
                  <Label>Organization Name *</Label>
                  <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Contact Name</Label>
                    <Input value={editForm.contactName} onChange={e => setEditForm(p => ({ ...p, contactName: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Contact Phone</Label>
                    <Input value={editForm.contactPhone} onChange={e => setEditForm(p => ({ ...p, contactPhone: e.target.value }))} placeholder="407-555-1234" />
                  </div>
                </div>
                <div>
                  <Label>Contact Email</Label>
                  <Input type="email" value={editForm.contactEmail} onChange={e => setEditForm(p => ({ ...p, contactEmail: e.target.value }))} />
                </div>

                {/* CC additional staff — parity with Add Org modal */}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold">
                      Also CC staff <span className="text-gray-400 font-normal">· optional</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditForm(p => ({ ...p, ccEmails: [...p.ccEmails, { email: '', label: '' }] }))}
                      disabled={saving}
                      className="h-7 text-xs text-[#B91C1C] hover:text-[#991B1B]"
                    >
                      <Plus className="h-3 w-3 mr-0.5" /> Add recipient
                    </Button>
                  </div>
                  {editForm.ccEmails.length === 0 ? (
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      Primary contact gets the welcome. Add extra staff (MA, front desk, billing) to CC on welcome + outreach emails.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editForm.ccEmails.map((r, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <Input
                            type="email"
                            value={r.email}
                            onChange={(e) => setEditForm(p => {
                              const next = [...p.ccEmails];
                              next[i] = { ...next[i], email: e.target.value };
                              return { ...p, ccEmails: next };
                            })}
                            placeholder="email@practicename.com"
                            className="flex-1 h-9 text-sm"
                            disabled={saving}
                          />
                          <Input
                            value={r.label}
                            onChange={(e) => setEditForm(p => {
                              const next = [...p.ccEmails];
                              next[i] = { ...next[i], label: e.target.value };
                              return { ...p, ccEmails: next };
                            })}
                            placeholder="Role"
                            className="w-28 h-9 text-sm"
                            disabled={saving}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditForm(p => ({
                              ...p,
                              ccEmails: p.ccEmails.filter((_, idx) => idx !== i),
                            }))}
                            disabled={saving}
                            className="h-9 w-9 p-0 text-gray-400 hover:text-red-600"
                            aria-label="Remove recipient"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <p className="text-[11px] text-gray-500">
                        {editForm.ccEmails.filter(r => r.email.trim()).length} extra recipient{editForm.ccEmails.filter(r => r.email.trim()).length === 1 ? '' : 's'} will be CC'd on welcome + outreach emails
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Billing section */}
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Billing</p>
                <div>
                  <Label>Billing Email</Label>
                  <Input type="email" value={editForm.billingEmail} onChange={e => setEditForm(p => ({ ...p, billingEmail: e.target.value }))} placeholder="Invoices route here when org-billed" />
                </div>
                <div>
                  <Label>Billing Address</Label>
                  <Input value={editForm.billingAddress} onChange={e => setEditForm(p => ({ ...p, billingAddress: e.target.value }))} />
                </div>
              </div>

              {/* Access + Status section */}
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Access &amp; status</p>
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium">Provider portal</p>
                    <p className="text-xs text-gray-600">Allow this org's contact to log in at /provider</p>
                  </div>
                  <input type="checkbox" checked={editForm.portalEnabled} onChange={e => setEditForm(p => ({ ...p, portalEnabled: e.target.checked }))} className="h-5 w-5" />
                </div>
                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium">Active</p>
                    <p className="text-xs text-gray-600">Inactive orgs are hidden from most views</p>
                  </div>
                  <input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm(p => ({ ...p, isActive: e.target.checked }))} className="h-5 w-5" />
                </div>
              </div>

              {/* Partner rules section */}
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Partner rules</p>
                <div>
                  <Label>Default billed to</Label>
                  <select value={editForm.defaultBilledTo} onChange={e => setEditForm(p => ({ ...p, defaultBilledTo: e.target.value as 'patient' | 'org' }))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="patient">Patient pays</option>
                    <option value="org">Organization pays</option>
                  </select>
                </div>
                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium">Allow per-visit billing override</p>
                    <p className="text-xs text-gray-600">Admin can flip bill-payer per appointment</p>
                  </div>
                  <input type="checkbox" checked={editForm.allowBillOverride} onChange={e => setEditForm(p => ({ ...p, allowBillOverride: e.target.checked }))} className="h-5 w-5" />
                </div>
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium">Show patient name on appointment</p>
                    <p className="text-xs text-gray-600">Disable for trial sites / masked orgs (CAO)</p>
                  </div>
                  <input type="checkbox" checked={editForm.showPatientNameOnAppointment} onChange={e => setEditForm(p => ({ ...p, showPatientNameOnAppointment: e.target.checked }))} className="h-5 w-5" />
                </div>
                <div>
                  <Label>Locked service type (optional)</Label>
                  <Input value={editForm.lockedServiceType} onChange={e => setEditForm(p => ({ ...p, lockedServiceType: e.target.value }))} placeholder="e.g. in-office, specialty-kit, mobile" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Locked price (patient)</Label>
                    <Input type="number" step="0.01" value={editForm.lockedPriceDollars} onChange={e => setEditForm(p => ({ ...p, lockedPriceDollars: e.target.value }))} placeholder="e.g. 125.00" />
                  </div>
                  <div>
                    <Label>Org invoice price</Label>
                    <Input type="number" step="0.01" value={editForm.orgInvoicePriceDollars} onChange={e => setEditForm(p => ({ ...p, orgInvoicePriceDollars: e.target.value }))} placeholder="e.g. 55.00" />
                  </div>
                </div>
                <div>
                  <Label>Member stacking rule</Label>
                  <select value={editForm.memberStackingRule} onChange={e => setEditForm(p => ({ ...p, memberStackingRule: e.target.value as any }))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="lowest_wins">Lowest price wins (partner OR member, whichever is cheaper)</option>
                    <option value="partner_only">Partner price only (ignore member tier)</option>
                    <option value="org_covers">Org covers (patient pays $0 regardless of membership)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="pt-2 border-t">
                <Label>Notes</Label>
                <Textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowEditOrg(false)}>Cancel</Button>
              <Button className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Invoice Modal */}
        <Dialog open={showAddInvoice} onOpenChange={setShowAddInvoice}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Invoice for {selectedOrg.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Patient Name</Label><Input value={invoiceForm.patientName} onChange={e => setInvoiceForm(p => ({ ...p, patientName: e.target.value }))} placeholder="Patient name" /></div>
              <div><Label>Service Type</Label><Input value={invoiceForm.serviceType} onChange={e => setInvoiceForm(p => ({ ...p, serviceType: e.target.value }))} placeholder="e.g. Mobile Blood Draw" /></div>
              <div><Label>Amount *</Label><Input type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm(p => ({ ...p, amount: e.target.value }))} placeholder="150.00" /></div>
              <div><Label>Memo</Label><Textarea value={invoiceForm.memo} onChange={e => setInvoiceForm(p => ({ ...p, memo: e.target.value }))} placeholder="Invoice details..." rows={2} /></div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowAddInvoice(false)}>Cancel</Button>
              <Button className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={handleAddInvoice} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Organization list
  const orgsWithEmail = orgs.filter(o => o.contact_email && o.is_active);
  const selectedCount = Object.keys(selectedRecipients).length;
  const activeOrgFilter = ORG_FILTERS.find(f => f.key === listFilter)!;
  const activeLeadFilter = LEAD_FILTERS.find(f => f.key === leadFilter)!;

  const orgHandlers: OrgRowHandlers = {
    onOpen: (o) => setSelectedOrg(o),
    onEdit: (o) => { setSelectedOrg(o); openEditModal(o); },
    onSendWelcome: (o) => handleSendWelcome(o.id, o.contact_email, !!o.welcomed_at),
  };
  const leadHandlers: LeadRowHandlers = {
    canManage,
    onReachOut: openOutreachModal,
    onMark: markDiscoveredStatus,
    onOpen: (o) => setSelectedOrg(o),
    patientsOf: (o) => discoveredPatientsMap[o.id] || [],
  };

  const viewOptions: Array<{ key: 'directory' | 'discovered' | 'outreach'; label: string }> = [
    { key: 'directory', label: 'Directory' },
    { key: 'discovered', label: discoveredOrgs.length > 0 ? `Discovered · ${discoveredOrgs.length}` : 'Discovered' },
    ...(canManage ? [{ key: 'outreach' as const, label: 'Outreach' }] : []),
  ];

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      <PageHeader
        icon={Building2}
        title="Organizations"
        subtitle={
          <>
            Partner practices, discovered leads, billing and outreach.
            {!loading && orgCounts.needs_action > 0 && <span className="ml-1 font-medium text-red-700">{orgCounts.needs_action} need a welcome or an email.</span>}
            {!loading && hotBeacon && <span className="ml-1 font-medium text-red-700">{plural(leadCounts.hot, 'hot lead')}.</span>}
          </>
        }
        actions={
          <>
            <SegmentedControl options={viewOptions} value={activeTab} onChange={(v) => setActiveTab(v)} ariaLabel="Organizations view" />
            <RefreshButton onClick={fetchOrgs} loading={loading} />
            {canManage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleRunDunning} className="gap-1.5 text-xs h-10 sm:h-9">
                    <Send className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Run dunning</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send 7/14/30-day reminders for every unpaid sent invoice</TooltipContent>
              </Tooltip>
            )}
            <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 text-xs h-10 sm:h-9" onClick={() => setShowAddOrg(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Add organization</span><span className="sm:hidden">Add</span>
            </Button>
          </>
        }
      />

      {lastError && <ErrorCard what="organizations" message={lastError} onRetry={fetchOrgs} />}

      {/* ─── DIRECTORY ─────────────────────────────────────────── */}
      {activeTab === 'directory' && (
        <>
          <StatTiles tiles={ORG_TILES} counts={orgCounts} active={listFilter} onSelect={k => setListFilter(k)} loading={loading} ariaLabel="Organization counts" />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder="Search name, contact, email, phone, physician, city, NPI…" ariaLabel="Search organizations" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-10 sm:h-9 text-xs font-medium border border-gray-200 rounded-md px-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/40"
                aria-label="Sort organizations"
              >
                <option value="recent">Most recent</option>
                <option value="name">Name A–Z</option>
                <option value="welcomed_first">Welcomed first</option>
              </select>
            </div>
            <FilterChips filters={ORG_FILTERS} counts={orgCounts} active={listFilter} onSelect={k => setListFilter(k)} ariaLabel="Organization filter" />
          </div>

          {loading && orgs.length === 0 ? (
            <LoadingRows label="Loading organizations" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Building2}
              emptyTitle="No organizations yet."
              emptyHint="Add a partner practice, or let lab-order OCR discover one for you."
              filterLabel={activeOrgFilter.label}
              filterDesc={activeOrgFilter.desc}
              hasSearch={searchQuery.trim() !== ''}
              searchHint="Try a practice name, contact, email, phone, physician, city or NPI."
              total={orgs.length}
              noun="organizations"
              onReset={() => { setListFilter('all'); setSearchQuery(''); }}
            />
          ) : orgLanes ? (
            <div className="space-y-5">
              <section aria-labelledby="lane-action">
                <LaneHeader id="lane-action" title="Needs action" count={orgLanes.action.length} tone="red" />
                <OrgRows rows={orgLanes.action} bucketOf={orgBucketOf} handlers={orgHandlers} />
              </section>
              {orgLanes.rest.length > 0 && (
                <section aria-labelledby="lane-rest">
                  <LaneHeader id="lane-rest" title="Everything else" count={orgLanes.rest.length} tone="gray" />
                  <OrgRows rows={orgLanes.rest} bucketOf={orgBucketOf} handlers={orgHandlers} />
                </section>
              )}
            </div>
          ) : (
            <OrgRows rows={filtered} bucketOf={orgBucketOf} handlers={orgHandlers} />
          )}

          <ListFooter shown={filtered.length} total={orgs.length} noun="organization" />
        </>
      )}

      {/* ─── DISCOVERED ────────────────────────────────────────────
            Every lab order's ordering-provider block is parsed via
            extractProviderBlock() in ocr-lab-order, then routed into
            `organizations` via discover_or_link_provider_org RPC. */}
      {activeTab === 'discovered' && (
        <>
          <StatTiles tiles={LEAD_TILES} counts={leadCounts} active={leadFilter} onSelect={k => setLeadFilter(k)} loading={loading} ariaLabel="Discovered lead counts" />

          <Notice tone="amber" icon={Sparkles}>
            <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Partnership leads from lab orders</p>
                <p className="mt-0.5">Every uploaded lab order names the ordering practice. We auto-extract it here so referral signal turns into partnership revenue.</p>
              </div>
              {canManage && (
                <Button size="sm" variant="outline" className="text-xs h-9 w-full sm:w-auto flex-shrink-0 gap-1.5" onClick={() => setMergeDialogOpen(true)}>
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Find duplicates
                </Button>
              )}
            </div>
          </Notice>

          <DiscoveredZipClusters />

          <div className="space-y-2">
            <SearchBox value={leadSearch} onChange={setLeadSearch} placeholder="Search practice, physician, city, NPI, specialty…" ariaLabel="Search discovered leads" />
            <FilterChips filters={LEAD_FILTERS} counts={leadCounts} active={leadFilter} onSelect={k => setLeadFilter(k)} ariaLabel="Discovered lead filter" />
          </div>

          {loading && orgs.length === 0 ? (
            <LoadingRows label="Loading discovered leads" />
          ) : filteredLeads.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              emptyTitle="No discovered practices yet."
              emptyHint="The moment a patient uploads a lab order, the ordering practice gets auto-captured here. Keep booking."
              filterLabel={activeLeadFilter.label}
              filterDesc={activeLeadFilter.desc}
              hasSearch={leadSearch.trim() !== ''}
              searchHint="Try a practice name, physician, city, NPI or specialty."
              total={discoveredOrgs.length}
              noun="leads"
              onReset={() => { setLeadFilter('all'); setLeadSearch(''); }}
            />
          ) : leadLanes ? (
            <div className="space-y-5">
              <section aria-labelledby="lead-lane-action">
                <LaneHeader id="lead-lane-action" title="Needs action" count={leadLanes.action.length} tone="red" />
                <LeadRows rows={leadLanes.action} bucketOf={leadBucketOf} handlers={leadHandlers} now={nowMs} />
              </section>
              {leadLanes.rest.length > 0 && (
                <section aria-labelledby="lead-lane-rest">
                  <LaneHeader id="lead-lane-rest" title="Everything else" count={leadLanes.rest.length} tone="gray" />
                  <LeadRows rows={leadLanes.rest} bucketOf={leadBucketOf} handlers={leadHandlers} now={nowMs} />
                </section>
              )}
            </div>
          ) : (
            <LeadRows rows={filteredLeads} bucketOf={leadBucketOf} handlers={leadHandlers} now={nowMs} />
          )}

          <ListFooter shown={filteredLeads.length} total={discoveredOrgs.length} noun="open lead" />
        </>
      )}

        {/* ─── OUTREACH TAB ─────────────────────────────────────── */}
      {activeTab === 'outreach' && canManage && (
        <div className="space-y-5">
          <Card className="border-conve-red/20 bg-gradient-to-br from-conve-red/5 to-rose-50">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-conve-red/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-conve-red" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">High-converting partner outreach</h3>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                    Pick recipients below, customize the subject/intro, preview, then send. Every email's CTA routes to <code className="bg-white px-1.5 py-0.5 rounded text-[11px]">/partner-with-us</code>.
                    Dedup via <code className="bg-white px-1.5 py-0.5 rounded text-[11px]">campaign_sends</code> — same address won't get the same campaign twice.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Composer */}
          <Card className="shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Subject line</Label>
                <Input value={outreachSubject} onChange={e => setOutreachSubject(e.target.value)} placeholder="A concierge lab partner for your patients" />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Custom intro <span className="normal-case text-gray-400 font-normal">(optional — leave blank to use the default Hormozi template)</span>
                </Label>
                <Textarea
                  value={outreachIntro}
                  onChange={e => setOutreachIntro(e.target.value)}
                  rows={4}
                  placeholder="Leave blank for the default. Or add something personal: &quot;I saw your practice has a focus on X — we've served several similar clinics and think we could take the collection step off your plate.&quot;"
                />
              </div>

              {/* Selected recipients summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">
                    {selectedCount === 0 ? 'No recipients selected yet' : `${selectedCount} recipient${selectedCount === 1 ? '' : 's'} selected`}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handlePreviewOutreach} disabled={selectedCount === 0}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                    </Button>
                    <Button size="sm" className="bg-conve-red hover:bg-conve-red-dark text-white" onClick={handleSendOutreach} disabled={selectedCount === 0 || sendingOutreach}>
                      {sendingOutreach ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Sending…</> : <><Send className="h-3.5 w-3.5 mr-1" /> Send to {selectedCount}</>}
                    </Button>
                  </div>
                </div>
                {selectedCount > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(selectedRecipients).slice(0, 10).map(([key, r]) => (
                      <span key={key} className="inline-flex items-center gap-1 text-[11px] bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                        {r.email}
                        <button onClick={() => toggleRecipient(key, r)} className="text-gray-400 hover:text-red-600">×</button>
                      </span>
                    ))}
                    {selectedCount > 10 && <span className="text-[11px] text-gray-500">+{selectedCount - 10} more</span>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recipient pickers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Existing organizations */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  From Directory ({orgsWithEmail.length} with email)
                </p>
                {orgsWithEmail.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No orgs with contact emails yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {orgsWithEmail.map(o => {
                      const key = `org:${o.id}`;
                      const checked = !!selectedRecipients[key];
                      return (
                        <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleRecipient(key, {
                              email: o.contact_email!,
                              firstName: (o.contact_name || '').split(' ')[0] || undefined,
                              practiceName: o.name,
                            })}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{o.name}</p>
                            <p className="text-[11px] text-gray-500 truncate">{o.contact_email} {o.contact_name ? `· ${o.contact_name}` : ''}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent inquiries */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center justify-between">
                  From Inquiries ({inquiries.length})
                  {loadingInquiries && <Loader2 className="h-3 w-3 animate-spin" />}
                </p>
                {!loadingInquiries && inquiries.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No new partner inquiries.</p>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {inquiries.map((inq: any) => {
                      const key = `inq:${inq.id}`;
                      const checked = !!selectedRecipients[key];
                      return (
                        <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleRecipient(key, {
                              email: inq.contact_email,
                              firstName: (inq.contact_name || '').split(' ')[0] || undefined,
                              practiceName: inq.practice_name,
                            })}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{inq.practice_name}</p>
                            <p className="text-[11px] text-gray-500 truncate">{inq.contact_email} · {inq.status}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Custom recipient add */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Add a custom recipient</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input placeholder="email@practice.com" value={addCustomEmail} onChange={e => setAddCustomEmail(e.target.value)} />
                <Input placeholder="First name" value={addCustomName} onChange={e => setAddCustomName(e.target.value)} />
                <Input placeholder="Practice name" value={addCustomPractice} onChange={e => setAddCustomPractice(e.target.value)} />
                <Button variant="outline" onClick={addCustomRecipient}><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </div>
            </CardContent>
          </Card>

          {/* Last send result */}
          {lastSendResult && (
            <Card className={`shadow-sm ${lastSendResult.sent > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <CardContent className="p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  {lastSendResult.sent > 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                  Last send — campaign <code className="text-xs bg-white px-1.5 py-0.5 rounded">{lastSendResult.campaign_key}</code>
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-gray-600">Attempted:</span> <strong>{lastSendResult.attempted}</strong></div>
                  <div><span className="text-gray-600">Sent:</span> <strong className="text-emerald-700">{lastSendResult.sent}</strong></div>
                  <div><span className="text-gray-600">Already contacted:</span> <strong>{lastSendResult.skipped_already_contacted}</strong></div>
                  <div><span className="text-gray-600">Failed:</span> <strong className={lastSendResult.failed > 0 ? 'text-red-700' : ''}>{lastSendResult.failed}</strong></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview modal */}
          <Dialog open={!!previewHtml} onOpenChange={(v) => { if (!v) setPreviewHtml(null); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Email preview</DialogTitle>
              </DialogHeader>
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div dangerouslySetInnerHTML={{ __html: previewHtml || '' }} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewHtml(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <MergeDuplicatesDialog open={mergeDialogOpen} onClose={() => setMergeDialogOpen(false)} onMerged={fetchOrgs} />

      {/* Outreach modal — pre-filled Hormozi template, editable before send */}
      <Dialog open={!!outreachOrg} onOpenChange={(v) => !v && setOutreachOrg(null)}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#B91C1C]" />
              Reach out to {outreachOrg?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
              <div className="font-semibold text-amber-900 mb-1">Lead signal</div>
              <div className="text-amber-800">
                {outreachOrg?.referral_count || 0} patient referral{(outreachOrg?.referral_count || 0) !== 1 ? 's' : ''} · discovered {outreachOrg?.first_discovered_at ? format(new Date(outreachOrg.first_discovered_at), 'MMM d') : '—'}
                {outreachOrg?.office_phone && <span className="block mt-0.5">📞 {outreachOrg.office_phone}</span>}
              </div>
            </div>
            <div>
              <Label className="text-xs">Send to</Label>
              <Input
                value={outreachOrg?.contact_email || outreachOrg?.billing_email || ''}
                onChange={(e) => setOutreachOrg(outreachOrg ? { ...outreachOrg, contact_email: e.target.value } : null)}
                placeholder="(add practice email before sending)"
                className="h-9"
              />
              {!outreachOrg?.contact_email && !outreachOrg?.billing_email && (
                <p className="text-[11px] text-amber-700 mt-1">
                  No email on file yet. Try the office phone → ask the front desk for the practice manager's email, then paste it here.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={outreachDraftSubject} onChange={e => setOutreachDraftSubject(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea value={outreachDraftBody} onChange={e => setOutreachDraftBody(e.target.value)} rows={10} className="text-xs font-mono" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOutreachOrg(null)}>Cancel</Button>
            <Button
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white"
              onClick={async () => {
                // If admin typed in a new email above, save it to the org first
                if (outreachOrg && outreachOrg.contact_email) {
                  await db.from('organizations')
                    .update({ contact_email: outreachOrg.contact_email })
                    .eq('id', outreachOrg.id);
                }
                await sendOutreach();
              }}
              disabled={outreachSending || !(outreachOrg?.contact_email || outreachOrg?.billing_email)}
            >
              {outreachSending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Sending…</> : <><Send className="h-4 w-4 mr-1" /> Send outreach</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Organization Modal — luxury redesign */}
      <Dialog open={showAddOrg} onOpenChange={(v) => { if (!saving) setShowAddOrg(v); }}>
        <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] sm:w-full p-0 overflow-hidden max-h-[92vh] overflow-y-auto">
          {/* Hero */}
          <div className="bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] px-4 sm:px-6 py-4 sm:py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] tracking-[0.25em] uppercase text-rose-100" style={{ fontFamily: 'Georgia, serif' }}>
                  New partner practice
                </p>
                <DialogTitle className="text-lg sm:text-xl font-normal text-white leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
                  Register an organization
                </DialogTitle>
              </div>
            </div>
            <p className="mt-3 text-[12px] sm:text-[13px] leading-relaxed text-rose-50/90">
              Register the practice and — if they're ready — fire the welcome email right away. The link they get activates their provider portal in one click.
            </p>
          </div>

          {/* Body */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-5">

            {/* Section 1 — Identity */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B91C1C] mb-3" style={{ fontFamily: 'Georgia, serif' }}>
                · Practice identity
              </p>
              <div>
                <Label className="text-xs font-semibold">Organization name <span className="text-red-500">*</span></Label>
                <Input
                  value={orgForm.name}
                  onChange={e => setOrgForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Elite Medical Concierge"
                  autoFocus
                  className="mt-1"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Section 2 — Primary contact */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B91C1C] mb-3" style={{ fontFamily: 'Georgia, serif' }}>
                · Primary contact
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Contact name</Label>
                    <Input
                      value={orgForm.contactName}
                      onChange={e => setOrgForm(p => ({ ...p, contactName: e.target.value }))}
                      placeholder="Dr. Monica Sher"
                      className="mt-1"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Contact phone</Label>
                    <Input
                      type="tel"
                      value={orgForm.contactPhone}
                      onChange={e => setOrgForm(p => ({ ...p, contactPhone: e.target.value }))}
                      placeholder="(407) 555-1234"
                      className="mt-1"
                      disabled={saving}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-semibold">Contact email</Label>
                    {orgForm.contactEmail
                      ? <span className="text-[11px] text-emerald-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> welcome ready</span>
                      : <span className="text-[11px] text-gray-400">required to send welcome</span>}
                  </div>
                  <Input
                    type="email"
                    value={orgForm.contactEmail}
                    onChange={e => setOrgForm(p => ({ ...p, contactEmail: e.target.value }))}
                    placeholder="dr.sher@practicename.com"
                    className={`transition ${orgForm.contactEmail ? 'border-emerald-300 bg-emerald-50/30' : ''}`}
                    disabled={saving}
                  />
                  <p className="mt-1 text-[11px] text-gray-500">This is where the activation link lands. Double-check spelling before sending.</p>
                </div>

                {/* CC additional staff — dynamic list */}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold">
                      Also CC staff <span className="text-gray-400 font-normal">· optional</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOrgForm(p => ({ ...p, ccEmails: [...p.ccEmails, { email: '', label: '' }] }))}
                      disabled={saving}
                      className="h-7 text-xs text-[#B91C1C] hover:text-[#991B1B]"
                    >
                      <Plus className="h-3 w-3 mr-0.5" /> Add recipient
                    </Button>
                  </div>
                  {orgForm.ccEmails.length === 0 ? (
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      Primary contact receives the welcome. Add extra staff (MA, front desk, billing) to CC on all outreach and operational notifications.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {orgForm.ccEmails.map((r, i) => (
                        <div key={i} className="bg-gray-50 border border-gray-200 rounded-md p-2 sm:p-0 sm:bg-transparent sm:border-0 sm:rounded-none">
                          <div className="flex gap-2 items-center">
                            <Input
                              type="email"
                              value={r.email}
                              onChange={(e) => setOrgForm(p => {
                                const next = [...p.ccEmails];
                                next[i] = { ...next[i], email: e.target.value };
                                return { ...p, ccEmails: next };
                              })}
                              placeholder="email@practicename.com"
                              inputMode="email"
                              className="flex-1 h-9 text-sm min-w-0"
                              disabled={saving}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setOrgForm(p => ({
                                ...p,
                                ccEmails: p.ccEmails.filter((_, idx) => idx !== i),
                              }))}
                              disabled={saving}
                              className="h-9 w-9 p-0 text-gray-400 hover:text-red-600 flex-shrink-0"
                              aria-label="Remove recipient"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <Input
                            value={r.label}
                            onChange={(e) => setOrgForm(p => {
                              const next = [...p.ccEmails];
                              next[i] = { ...next[i], label: e.target.value };
                              return { ...p, ccEmails: next };
                            })}
                            placeholder="Role (MA, billing…)"
                            className="h-8 text-sm mt-1.5 sm:mt-0 sm:ml-0"
                            disabled={saving}
                          />
                        </div>
                      ))}
                      <p className="text-[11px] text-gray-500">
                        {orgForm.ccEmails.filter(r => r.email.trim()).length} extra recipient{orgForm.ccEmails.filter(r => r.email.trim()).length === 1 ? '' : 's'} · they'll be CC'd on welcome + outreach emails
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 3 — Billing */}
            <details className="border border-gray-200 rounded-lg group">
              <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-700" style={{ fontFamily: 'Georgia, serif' }}>
                  · Billing &amp; notes
                </span>
                <span className="text-[11px] text-gray-400 group-open:hidden">Optional · tap to expand</span>
                <span className="text-[11px] text-gray-400 hidden group-open:inline">Collapse ↑</span>
              </summary>
              <div className="px-4 pb-4 pt-1 space-y-3 border-t">
                <div>
                  <Label className="text-xs font-semibold">Billing email</Label>
                  <Input
                    type="email"
                    value={orgForm.billingEmail}
                    onChange={e => setOrgForm(p => ({ ...p, billingEmail: e.target.value }))}
                    placeholder="Where invoices get sent (if different)"
                    className="mt-1"
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Billing address</Label>
                  <Input
                    value={orgForm.billingAddress}
                    onChange={e => setOrgForm(p => ({ ...p, billingAddress: e.target.value }))}
                    placeholder="Street, city, state, zip"
                    className="mt-1"
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Internal notes</Label>
                  <Textarea
                    value={orgForm.notes}
                    onChange={e => setOrgForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    placeholder="How you met, referral source, anything the team should know"
                    className="mt-1"
                    disabled={saving}
                  />
                </div>
              </div>
            </details>

            {/* Preview panel — shows exactly what will happen on Save & Send */}
            <div className={`rounded-lg p-3.5 border transition ${
              orgForm.contactEmail
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-amber-50/60 border-amber-200'
            }`}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ fontFamily: 'Georgia, serif' }}>
                {orgForm.contactEmail
                  ? <><Send className="h-3 w-3 text-emerald-700" /><span className="text-emerald-900">Ready to welcome</span></>
                  : <><AlertCircle className="h-3 w-3 text-amber-700" /><span className="text-amber-900">Next step</span></>}
              </p>
              <p className={`text-xs leading-relaxed ${orgForm.contactEmail ? 'text-emerald-900' : 'text-amber-900'}`}>
                {orgForm.contactEmail
                  ? <>Clicking <strong>Save &amp; Send Welcome</strong> creates the org and emails <strong>{orgForm.contactEmail}</strong> the branded activation link immediately. They click → set a password → land in their provider dashboard.</>
                  : <>Add a contact email above to enable the welcome email. If you just want to register the org for later, use <strong>Save only</strong>.</>}
              </p>
            </div>
          </div>

          {/* Footer — buttons full-width + stacked on mobile, inline on desktop */}
          <DialogFooter className="gap-2 flex-col-reverse sm:flex-row px-4 sm:px-6 pb-4 sm:pb-6 pt-3 bg-gray-50 border-t">
            <Button variant="outline" onClick={() => setShowAddOrg(false)} className="w-full sm:w-auto" disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAddOrg(false)}
              disabled={saving || !orgForm.name.trim()}
              className="w-full sm:w-auto"
              title="Save the row but don't email them — you can send the welcome later from the org card"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save only'}
            </Button>
            <Button
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white w-full sm:w-auto gap-1.5 shadow-sm"
              onClick={() => handleAddOrg(true)}
              disabled={saving || !orgForm.name.trim() || !orgForm.contactEmail.trim()}
              title={!orgForm.contactEmail.trim() ? 'Enter a contact email first' : 'Save and fire the welcome email right now'}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Save &amp; Send Welcome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
};

// ──────────────────────────────────────────────────────────────────
// Directory rows — table on ≥md, cards below.
// ──────────────────────────────────────────────────────────────────
interface OrgRowHandlers {
  onOpen: (o: Org) => void;
  onEdit: (o: Org) => void;
  onSendWelcome: (o: Org) => void;
}

const OrgStatusPill: React.FC<{ o: Org; bucket: OrgBucket; className?: string }> = ({ o, bucket, className }) => {
  const meta = ORG_META[bucket];
  let text: React.ReactNode = meta.label;
  if (bucket === 'discovered') text = `Lead · ${humanStatus(o.outreach_status).toLowerCase()}`;
  return <Pill className={cn(meta.pill, className)} dot={meta.dot} title={meta.desc}>{text}</Pill>;
};

const BillingCell: React.FC<{ o: Org }> = ({ o }) => {
  const parts: string[] = [];
  parts.push(o.default_billed_to === 'org' ? 'Org pays' : 'Patient pays');
  if (o.locked_price_cents != null) parts.push(`$${(o.locked_price_cents / 100).toFixed(0)} locked`);
  else if (o.org_invoice_price_cents != null) parts.push(`$${(o.org_invoice_price_cents / 100).toFixed(0)}/visit`);
  return (
    <>
      <span className="block">{parts[0]}</span>
      {parts[1] && <span className="block text-[11px] text-gray-500">{parts[1]}</span>}
    </>
  );
};

const OrgPrimaryAction: React.FC<{ o: Org; bucket: OrgBucket; h: OrgRowHandlers; className?: string }> = ({ o, bucket, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (bucket === 'cold') {
    return (
      <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onSendWelcome(o); }}>
        <Send className="h-3.5 w-3.5" aria-hidden="true" /> Send welcome
      </Button>
    );
  }
  if (bucket === 'no_email') {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5 border-red-300 text-red-800 hover:bg-red-50', className)} onClick={(e) => { stop(e); h.onEdit(o); }}>
        <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Add email
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onOpen(o); }}>
      Open
    </Button>
  );
};

const OrgRowMenu: React.FC<{ o: Org; h: OrgRowHandlers; className?: string }> = ({ o, h, className }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${o.name}`} onClick={(e) => e.stopPropagation()}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => h.onOpen(o)}><Building2 className="h-4 w-4 mr-2" aria-hidden="true" /> Open organization</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => h.onEdit(o)}><Pencil className="h-4 w-4 mr-2" aria-hidden="true" /> Edit details</DropdownMenuItem>
      {o.contact_email && (
        <DropdownMenuItem onSelect={() => h.onSendWelcome(o)}>
          <Send className="h-4 w-4 mr-2" aria-hidden="true" /> {o.welcomed_at ? 'Resend welcome' : 'Send welcome'}
        </DropdownMenuItem>
      )}
      {(o.contact_phone || o.office_phone || o.contact_email) && <DropdownMenuSeparator />}
      {(o.contact_phone || o.office_phone) && (
        <DropdownMenuItem asChild><a href={`tel:${o.contact_phone || o.office_phone}`}><Phone className="h-4 w-4 mr-2" aria-hidden="true" /> Call {o.contact_phone || o.office_phone}</a></DropdownMenuItem>
      )}
      {o.contact_email && (
        <DropdownMenuItem asChild><a href={`mailto:${o.contact_email}`}><Mail className="h-4 w-4 mr-2" aria-hidden="true" /> Email contact</a></DropdownMenuItem>
      )}
      {o.contact_email && <DropdownMenuItem onSelect={() => copyText(o.contact_email!, 'Email')}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy email</DropdownMenuItem>}
      <DropdownMenuItem onSelect={() => copyText(o.id, 'Organization ID')}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy organization ID</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const OrgRows: React.FC<{ rows: Org[]; bucketOf: Map<string, OrgBucket>; handlers: OrgRowHandlers }> = ({ rows, bucketOf, handlers }) => {
  const bucket = (o: Org) => bucketOf.get(o.id) || deriveOrgBucket(o);
  const accent = (b: OrgBucket) => b === 'no_email' ? 'border-l-4 border-l-red-500' : b === 'cold' ? 'border-l-4 border-l-amber-500' : '';
  return (
    <>
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className={cn(TH, 'pl-4')}>Organization</TableHead>
              <TableHead className={TH}>Contact</TableHead>
              <TableHead className={TH}>Portal</TableHead>
              <TableHead className={TH}>Billing</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={cn('hidden xl:table-cell', TH, 'whitespace-nowrap')}>Last activity</TableHead>
              <TableHead className={TH_STICKY}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(o => {
              const b = bucket(o);
              const open = () => handlers.onOpen(o);
              const last = lastActivityOf(o);
              return (
                <TableRow
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${o.name}, ${ORG_META[b].label}. Open organization`}
                  className={cn(ROW_FOCUS, 'bg-white', accent(b))}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                        <Building2 className="h-4 w-4 text-[#B91C1C]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-800 truncate block">{o.name}</span>
                        <p className="text-[11px] text-gray-500 truncate">
                          {o.contact_name || o.ordering_physician || (o.address_city ? o.address_city : <span className="text-gray-400">No contact name</span>)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[220px]">
                    <span className="block truncate">{o.contact_email || <span className="text-gray-400">No email</span>}</span>
                    <span className="block text-[11px] text-gray-500">{o.contact_phone || o.office_phone || <span className="text-gray-400">No phone</span>}</span>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs whitespace-nowrap">
                    {o.portal_enabled
                      ? <span className="text-emerald-700 inline-flex items-center gap-1"><Globe className="h-3 w-3" aria-hidden="true" /> Enabled</span>
                      : <span className="text-gray-400">Off</span>}
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 whitespace-nowrap"><BillingCell o={o} /></TableCell>
                  <TableCell className="py-2.5 align-top"><OrgStatusPill o={o} bucket={b} /></TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">
                    {last ? (
                      <>
                        <span className="block">{o.welcomed_at && last === o.welcomed_at ? 'Welcomed' : o.last_referral_at && last === o.last_referral_at ? 'Referral' : 'Updated'}</span>
                        <span className="block text-[11px] text-gray-400">{ago(last)}</span>
                      </>
                    ) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className={TD_STICKY}>
                    <div className="flex items-center justify-end gap-1">
                      <OrgPrimaryAction o={o} bucket={b} h={handlers} className="h-9" />
                      {b === 'welcomed' && o.contact_email && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label={`Resend welcome to ${o.name}`} onClick={(e) => { e.stopPropagation(); handlers.onSendWelcome(o); }}>
                              <Send className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Resend welcome email</TooltipContent>
                        </Tooltip>
                      )}
                      <OrgRowMenu o={o} h={handlers} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {rows.map(o => {
          const b = bucket(o);
          const open = () => handlers.onOpen(o);
          return (
            <Card
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${o.name}, ${ORG_META[b].label}. Open organization`}
              className={cn(CARD_FOCUS, accent(b))}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-gray-800 block truncate">{o.name}</span>
                    <p className="text-[11px] text-gray-500 truncate">{o.contact_email || o.contact_phone || o.office_phone || 'No contact on file'}</p>
                  </div>
                  <OrgStatusPill o={o} bucket={b} />
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>{o.portal_enabled ? 'Portal on' : 'Portal off'}</span>
                  <span className="text-gray-300">·</span>
                  <span>{o.default_billed_to === 'org' ? 'Org pays' : 'Patient pays'}</span>
                  {lastActivityOf(o) && <><span className="text-gray-300">·</span><span className="text-gray-500">{ago(lastActivityOf(o))}</span></>}
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <OrgPrimaryAction o={o} bucket={b} h={handlers} className="h-11 flex-1 justify-center" />
                  <OrgRowMenu o={o} h={handlers} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
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
// Discovered-lead rows
// ──────────────────────────────────────────────────────────────────
interface LeadRowHandlers {
  canManage: boolean;
  onReachOut: (o: Org) => void;
  onMark: (o: Org, status: 'declined' | 'called' | 'signed') => void;
  onOpen: (o: Org) => void;
  patientsOf: (o: Org) => string[];
}

const LeadStatusPill: React.FC<{ o: Org; bucket: LeadBucket; className?: string }> = ({ o, bucket, className }) => {
  const meta = LEAD_META[bucket];
  const text = bucket === 'in_progress' ? humanStatus(o.outreach_status) : meta.label;
  return (
    <Pill className={cn(meta.pill, className)} dot={meta.dot} title={meta.desc}>
      {bucket === 'hot' && <Flame className="h-3 w-3" aria-hidden="true" />}{text}
    </Pill>
  );
};

const LeadPrimaryAction: React.FC<{ o: Org; bucket: LeadBucket; h: LeadRowHandlers; className?: string }> = ({ o, bucket, h, className }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (!h.canManage) {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onOpen(o); }}>Open</Button>
    );
  }
  if (bucket === 'unreachable' && o.office_phone) {
    return (
      <Button size="sm" variant="outline" className={cn('text-xs gap-1.5', className)} asChild onClick={stop}>
        <a href={`tel:${o.office_phone}`}><PhoneCall className="h-3.5 w-3.5" aria-hidden="true" /> Call office</a>
      </Button>
    );
  }
  return (
    <Button size="sm" className={cn('bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs gap-1.5', className)} onClick={(e) => { stop(e); h.onReachOut(o); }}>
      <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Reach out
    </Button>
  );
};

const LeadRowMenu: React.FC<{ o: Org; h: LeadRowHandlers; className?: string }> = ({ o, h, className }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className={cn('h-9 w-9 p-0', className)} aria-label={`More actions for ${o.name}`} onClick={(e) => e.stopPropagation()}>
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => h.onOpen(o)}><Building2 className="h-4 w-4 mr-2" aria-hidden="true" /> Open organization</DropdownMenuItem>
      {h.canManage && (
        <>
          <DropdownMenuItem onSelect={() => h.onReachOut(o)}><Mail className="h-4 w-4 mr-2" aria-hidden="true" /> Reach out by email</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => h.onMark(o, 'called')}><PhoneCall className="h-4 w-4 mr-2" aria-hidden="true" /> Log a call</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => h.onMark(o, 'signed')}><CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" /> Mark signed · activate</DropdownMenuItem>
          <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => h.onMark(o, 'declined')}><X className="h-4 w-4 mr-2" aria-hidden="true" /> Not interested</DropdownMenuItem>
        </>
      )}
      {(o.office_phone || o.contact_email) && <DropdownMenuSeparator />}
      {o.office_phone && <DropdownMenuItem asChild><a href={`tel:${o.office_phone}`}><Phone className="h-4 w-4 mr-2" aria-hidden="true" /> Call {o.office_phone}</a></DropdownMenuItem>}
      {o.contact_email && <DropdownMenuItem asChild><a href={`mailto:${o.contact_email}`}><Mail className="h-4 w-4 mr-2" aria-hidden="true" /> Email {o.contact_email}</a></DropdownMenuItem>}
      {o.npi && <DropdownMenuItem onSelect={() => copyText(o.npi!, 'NPI')}><Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy NPI {o.npi}</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>
);

const LeadRows: React.FC<{ rows: Org[]; bucketOf: Map<string, LeadBucket>; handlers: LeadRowHandlers; now: number }> = ({ rows, bucketOf, handlers, now }) => {
  const bucket = (o: Org) => bucketOf.get(o.id) || deriveLeadBucket(o, now);
  const accent = (b: LeadBucket) => b === 'hot' ? 'border-l-4 border-l-red-500' : b === 'untouched' ? 'border-l-4 border-l-amber-500' : '';
  const lastRef = (o: Org) => {
    if (!o.last_referral_at) return null;
    const d = Math.floor((now - new Date(o.last_referral_at).getTime()) / (1000 * 3600 * 24));
    return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
  };
  return (
    <>
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className={cn(TH, 'pl-4')}>Practice</TableHead>
              <TableHead className={TH}>Physician</TableHead>
              <TableHead className={cn(TH, 'text-right whitespace-nowrap')}>Referrals</TableHead>
              <TableHead className={TH}>Contact</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={cn('hidden xl:table-cell', TH, 'whitespace-nowrap')}>Follow-ups</TableHead>
              <TableHead className={TH_STICKY}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(o => {
              const b = bucket(o);
              const open = () => handlers.onOpen(o);
              const names = handlers.patientsOf(o);
              return (
                <TableRow
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={rowKeyHandler(open)}
                  aria-label={`${o.name}, ${LEAD_META[b].label}. Open organization`}
                  className={cn(ROW_FOCUS, 'bg-white', accent(b))}
                >
                  <TableCell className="py-2.5 pl-4 align-top">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-gray-800 truncate block">{o.name}</span>
                      <p className="text-[11px] text-gray-500 truncate">{orgAddress(o) || (o.npi_taxonomy ? o.npi_taxonomy : <span className="text-gray-400">No address</span>)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[200px]">
                    <span className="block truncate">{o.ordering_physician || <span className="text-gray-400">—</span>}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{o.npi ? `NPI ${o.npi}` : ''}{o.npi && o.npi_taxonomy ? ' · ' : ''}{o.npi_taxonomy || ''}</span>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-right whitespace-nowrap">
                    <span className="text-sm font-medium tabular-nums block">{o.referral_count || 0}</span>
                    <span className="text-[11px] text-gray-400 block">{lastRef(o) ? `last ${lastRef(o)}` : ''}</span>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs text-gray-700 max-w-[200px]">
                    <span className="block truncate">{o.contact_email || <span className="text-amber-700">No email</span>}</span>
                    <span className="block text-[11px] text-gray-500">{o.office_phone || <span className="text-gray-400">No phone</span>}</span>
                  </TableCell>
                  <TableCell className="py-2.5 align-top"><LeadStatusPill o={o} bucket={b} /></TableCell>
                  <TableCell className="hidden xl:table-cell py-2.5 align-top text-xs text-gray-600 whitespace-nowrap">
                    {o.followup_count ? (
                      <>
                        <span className="block">{plural(o.followup_count, 'follow-up')}</span>
                        <span className="block text-[11px] text-gray-400">{o.last_followup_at ? ago(o.last_followup_at) : ''}</span>
                      </>
                    ) : o.outreached_at ? (
                      <><span className="block">Outreach</span><span className="block text-[11px] text-gray-400">{ago(o.outreached_at)}</span></>
                    ) : <span className="text-gray-400">None</span>}
                  </TableCell>
                  <TableCell className={TD_STICKY}>
                    <div className="flex items-center justify-end gap-1">
                      <LeadPrimaryAction o={o} bucket={b} h={handlers} className="h-9" />
                      {handlers.canManage && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label={`Log a call with ${o.name}`} onClick={(e) => { e.stopPropagation(); handlers.onMark(o, 'called'); }}>
                              <PhoneCall className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Log a call{names.length > 0 ? ` · patients: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : ''}</TooltipContent>
                        </Tooltip>
                      )}
                      <LeadRowMenu o={o} h={handlers} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {rows.map(o => {
          const b = bucket(o);
          const open = () => handlers.onOpen(o);
          return (
            <Card
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={rowKeyHandler(open)}
              aria-label={`${o.name}, ${LEAD_META[b].label}. Open organization`}
              className={cn(CARD_FOCUS, accent(b))}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-gray-800 block truncate">{o.name}</span>
                    <p className="text-[11px] text-gray-500 truncate">{o.ordering_physician || orgAddress(o) || 'No details'}</p>
                  </div>
                  <LeadStatusPill o={o} bucket={b} />
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="font-medium text-gray-900">{plural(o.referral_count || 0, 'patient')}</span>
                  {lastRef(o) && <><span className="text-gray-300">·</span><span className="text-gray-500">last {lastRef(o)}</span></>}
                  {o.office_phone && <><span className="text-gray-300">·</span><a href={`tel:${o.office_phone}`} onClick={(e) => e.stopPropagation()} className="text-[#B91C1C]">{o.office_phone}</a></>}
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <LeadPrimaryAction o={o} bucket={b} h={handlers} className="h-11 flex-1 justify-center" />
                  <LeadRowMenu o={o} h={handlers} className="h-11 w-11 flex-shrink-0 border border-gray-200" />
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

export default OrganizationsTab;
