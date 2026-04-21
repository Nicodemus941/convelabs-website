import React, { useState, useEffect, useCallback } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Building2, Plus, Search, RefreshCw, Send, DollarSign, Mail,
  Phone, User, FileText, Loader2, Download, Pencil, Power,
  Megaphone, Eye, Sparkles, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import OrgRoiCard from './OrgRoiCard';
import DiscoveredZipClusters from './DiscoveredZipClusters';
import MergeDuplicatesDialog from './MergeDuplicatesDialog';

interface Org {
  id: string; name: string; contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; billing_email: string | null; billing_address: string | null;
  notes: string | null; is_active: boolean; created_at: string;
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
  outreach_status?: 'untouched' | 'emailed' | 'called' | 'signed' | 'declined' | 'merged' | null;
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

const OrganizationsTab: React.FC = () => {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [invoices, setInvoices] = useState<OrgInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [showEditOrg, setShowEditOrg] = useState(false);
  const [saving, setSaving] = useState(false);

  const [orgForm, setOrgForm] = useState({ name: '', contactName: '', contactEmail: '', contactPhone: '', billingEmail: '', billingAddress: '', notes: '' });
  const [invoiceForm, setInvoiceForm] = useState({ patientName: '', serviceType: '', amount: '', memo: '' });

  // Full edit form — covers everything including partner rules
  const [editForm, setEditForm] = useState({
    name: '', contactName: '', contactEmail: '', contactPhone: '',
    billingEmail: '', billingAddress: '', notes: '',
    isActive: true, portalEnabled: false,
    defaultBilledTo: 'patient' as 'patient' | 'org',
    allowBillOverride: true,
    showPatientNameOnAppointment: true,
    lockedServiceType: '',
    lockedPriceDollars: '',
    orgInvoicePriceDollars: '',
    memberStackingRule: 'lowest_wins' as 'lowest_wins' | 'partner_only' | 'org_covers',
  });

  const openEditModal = (org: Org) => {
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
    });
    setShowEditOrg(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedOrg) return;
    if (!editForm.name.trim()) { toast.error('Organization name required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        contact_name: editForm.contactName.trim() || null,
        contact_email: editForm.contactEmail.trim() || null,
        contact_phone: editForm.contactPhone.trim() || null,
        billing_email: editForm.billingEmail.trim() || null,
        billing_address: editForm.billingAddress.trim() || null,
        notes: editForm.notes.trim() || null,
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
      const { data, error } = await supabase
        .from('organizations' as any)
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
    const { data } = await supabase.from('organizations' as any).select('*').order('name');
    setOrgs((data as unknown as Org[]) || []);
    setLoading(false);
  }, []);

  const fetchInvoices = useCallback(async (orgId: string) => {
    const { data } = await supabase.from('org_invoices' as any).select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    setInvoices((data as unknown as OrgInvoice[]) || []);
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);
  useEffect(() => { if (selectedOrg) fetchInvoices(selectedOrg.id); }, [selectedOrg, fetchInvoices]);

  const handleAddOrg = async () => {
    if (!orgForm.name.trim()) { toast.error('Organization name required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('organizations' as any).insert({
        name: orgForm.name, contact_name: orgForm.contactName || null,
        contact_email: orgForm.contactEmail || null, contact_phone: orgForm.contactPhone || null,
        billing_email: orgForm.billingEmail || null, billing_address: orgForm.billingAddress || null,
        notes: orgForm.notes || null,
      });
      if (error) throw error;
      toast.success('Organization added');
      setShowAddOrg(false);
      setOrgForm({ name: '', contactName: '', contactEmail: '', contactPhone: '', billingEmail: '', billingAddress: '', notes: '' });
      fetchOrgs();
    } catch (err: any) { toast.error(err.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleAddInvoice = async () => {
    if (!invoiceForm.amount || !selectedOrg) { toast.error('Amount required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('org_invoices' as any).insert({
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
      await supabase.from('org_invoices' as any).update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoice.id);
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
    await supabase.from('org_invoices' as any).update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId);
    toast.success('Marked as paid');
    if (selectedOrg) fetchInvoices(selectedOrg.id);
  };

  // Directory excludes unconfirmed discovered rows — those live in the
  // Discovered tab until the admin approves/signs them.
  const filtered = orgs.filter(o => {
    if (o.source === 'discovered_from_ocr' && !['signed'].includes(String(o.outreach_status))) return false;
    return !searchQuery || o.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // ── Organizations list view tabs: Directory / Discovered / Outreach.
  //    Detail view (when an org is clicked) bypasses tabs entirely.
  const [activeTab, setActiveTab] = useState<'directory' | 'discovered' | 'outreach'>('directory');

  // Discovered = auto-created from lab order OCR. Still needs admin to
  // reach out → confirm → activate → promote to real partner.
  const discoveredOrgs = orgs.filter(o =>
    o.source === 'discovered_from_ocr' && o.outreach_status !== 'signed' && o.outreach_status !== 'declined' && o.outreach_status !== 'merged'
  );
  // Beacon: red if any discovered org has ≥3 referrals still untouched
  // OR any untouched org with a referral within the last 48h.
  const nowMs = Date.now();
  const hotBeacon = discoveredOrgs.some(o => {
    const isHot = (o.referral_count || 0) >= 3 && o.outreach_status === 'untouched';
    const isFresh = o.last_referral_at && (nowMs - new Date(o.last_referral_at).getTime()) < 48 * 3600 * 1000 && o.outreach_status === 'untouched';
    return isHot || isFresh;
  });

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
      const { data } = await supabase
        .from('appointment_organizations' as any)
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

Each was paying $125-150 out of pocket for a mobile draw. We'd like to discuss a partnership rate for your practice — your patients pay $85, you get a priority line + on-site STAT draws when you need them, same-day results routing to your EMR.

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
      await supabase.from('organizations' as any).update({
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
    await supabase.from('organizations' as any).update({
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
      const { data } = await supabase
        .from('provider_partnership_inquiries' as any)
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
      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setSelectedOrg(null)}>← Back</Button>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{selectedOrg.name}</h1>
              {selectedOrg.portal_enabled && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Portal enabled</Badge>}
              {!selectedOrg.is_active && <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-200 text-[10px]">Inactive</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedOrg.contact_name ? `${selectedOrg.contact_name} · ` : ''}
              {selectedOrg.contact_email || 'No email'} · {selectedOrg.contact_phone || 'No phone'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => openEditModal(selectedOrg)} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-[#B91C1C]">${totalInvoiced.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Total Invoiced</p></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-600">${totalPaid.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Paid</p></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-red-600">${totalOutstanding.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Outstanding</p></CardContent></Card>
        </div>

        {/* Partnership ROI rollup — calls get_org_roi RPC, shows lifetime
            revenue + visit count + outstanding. Negotiation ammo. */}
        <OrgRoiCard orgId={selectedOrg.id} />

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-[#B91C1C]" /> Organizations</h1>
          <p className="text-sm text-muted-foreground">Manage partner organizations, billing, and outreach</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={() => setShowAddOrg(true)}><Plus className="h-4 w-4" /> Add Organization</Button>
          <Button variant="outline" size="sm" onClick={handleRunDunning} title="Send 7/14/30-day reminders for all unpaid sent invoices">
            <Send className="h-4 w-4 mr-1" /> Run Dunning
          </Button>
          <Button variant="outline" size="sm" onClick={fetchOrgs}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="directory" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Directory</TabsTrigger>
          <TabsTrigger value="discovered" className="gap-1.5 relative">
            <Sparkles className="h-3.5 w-3.5" /> Discovered
            {discoveredOrgs.length > 0 && (
              <span className={`ml-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none min-w-[18px] h-[18px] px-1 ${hotBeacon ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-100 text-amber-800'}`}>
                {discoveredOrgs.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="outreach" className="gap-1.5"><Megaphone className="h-3.5 w-3.5" /> Outreach</TabsTrigger>
        </TabsList>

        {/* ─── DIRECTORY TAB (existing content) ─────────────────── */}
        <TabsContent value="directory" className="space-y-6 mt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search organizations..." className="pl-9" />
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" /></div>
          ) : filtered.length === 0 ? (
            <Card className="shadow-sm border-dashed"><CardContent className="p-12 text-center"><Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="font-semibold">No organizations</p><p className="text-sm text-muted-foreground">Add an organization to start billing.</p></CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map(org => (
                <Card key={org.id} className="shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setSelectedOrg(org)}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg bg-[#B91C1C]/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-[#B91C1C]" /></div>
                    <div className="flex-1">
                      <p className="font-semibold">{org.name}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {org.contact_name && <span><User className="h-3 w-3 inline mr-1" />{org.contact_name}</span>}
                        {org.contact_email && <span><Mail className="h-3 w-3 inline mr-1" />{org.contact_email}</span>}
                        {org.contact_phone && <span><Phone className="h-3 w-3 inline mr-1" />{org.contact_phone}</span>}
                      </div>
                    </div>
                    <Badge variant="outline" className={org.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}>{org.is_active ? 'Active' : 'Inactive'}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── DISCOVERED TAB ──────────────────────────────────────
              Every lab order's ordering-provider block is parsed via
              extractProviderBlock() in ocr-lab-order, then routed into
              `organizations` via discover_or_link_provider_org RPC.
              Hormozi beacon: untouched rows with ≥3 referrals pulse red. */}
        <TabsContent value="discovered" className="space-y-4 mt-4">
          <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">Partnership leads from lab orders</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Every lab order uploaded by a patient includes their ordering practice. We auto-extract it and surface it here so you can convert referral signal into partnership revenue.
                  </p>
                </div>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setMergeDialogOpen(true)}>
                  🔗 Find duplicates
                </Button>
              </div>
            </CardContent>
          </Card>

          <DiscoveredZipClusters />

          {discoveredOrgs.length === 0 ? (
            <Card className="shadow-sm border-dashed">
              <CardContent className="p-12 text-center">
                <Sparkles className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="font-semibold">No discovered practices yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The moment a patient uploads a lab order, the ordering practice gets auto-captured here. Keep booking.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {discoveredOrgs
                .sort((a, b) => (b.referral_count || 0) - (a.referral_count || 0))
                .map(org => {
                  const linkedNames = discoveredPatientsMap[org.id] || [];
                  const lastRefDays = org.last_referral_at
                    ? Math.floor((nowMs - new Date(org.last_referral_at).getTime()) / (1000 * 3600 * 24))
                    : null;
                  const isHot = (org.referral_count || 0) >= 3 && org.outreach_status === 'untouched';
                  const statusColor = org.outreach_status === 'emailed' ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : org.outreach_status === 'called' ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200';
                  return (
                    <Card key={org.id} className={`shadow-sm transition ${isHot ? 'ring-2 ring-red-400 border-red-200' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${isHot ? 'bg-red-100' : 'bg-amber-100'}`}>
                            <Building2 className={`h-5 w-5 ${isHot ? 'text-red-600' : 'text-amber-600'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold">{org.name}</p>
                              <Badge variant="outline" className={`text-[10px] ${statusColor}`}>
                                {(org.outreach_status || 'untouched').toUpperCase()}
                              </Badge>
                              {isHot && (
                                <Badge variant="outline" className="text-[10px] bg-red-500 text-white border-red-500 animate-pulse">
                                  🔥 HOT LEAD
                                </Badge>
                              )}
                            </div>
                            {org.ordering_physician && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                <User className="h-3 w-3 inline mr-1" />{org.ordering_physician}
                                {org.npi && <span className="ml-2 text-gray-400">NPI {org.npi}</span>}
                              </p>
                            )}
                            {org.npi_taxonomy && (
                              <p className="text-[11px] mt-0.5">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                                  {org.npi_taxonomy}
                                </span>
                                {org.npi_registered_date && (
                                  <span className="ml-2 text-gray-500">
                                    practicing since {new Date(org.npi_registered_date).getFullYear()}
                                  </span>
                                )}
                              </p>
                            )}
                            {org.followup_count && org.followup_count > 0 && (
                              <p className="text-[11px] text-blue-700 mt-0.5">
                                🔁 {org.followup_count} follow-up{org.followup_count > 1 ? 's' : ''} sent
                                {org.last_followup_at && ` · last ${Math.floor((nowMs - new Date(org.last_followup_at).getTime()) / (1000 * 3600 * 24))}d ago`}
                              </p>
                            )}
                            {(org.address_street || org.address_city) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {[org.address_street, org.address_city, org.address_state, org.address_zip].filter(Boolean).join(', ')}
                              </p>
                            )}
                            {org.office_phone && (
                              <p className="text-xs mt-0.5">
                                <a href={`tel:${org.office_phone}`} className="text-[#B91C1C] hover:underline"><Phone className="h-3 w-3 inline mr-1" />{org.office_phone}</a>
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="font-semibold text-gray-900">{org.referral_count || 0} patient{(org.referral_count || 0) !== 1 ? 's' : ''}</span>
                              {lastRefDays !== null && (
                                <span>last referral {lastRefDays === 0 ? 'today' : lastRefDays === 1 ? 'yesterday' : `${lastRefDays}d ago`}</span>
                              )}
                            </div>
                            {linkedNames.length > 0 && (
                              <p className="text-[11px] text-gray-500 mt-1">Linked: {linkedNames.slice(0, 3).join(', ')}{linkedNames.length > 3 ? ` +${linkedNames.length - 3}` : ''}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white h-8 text-xs" onClick={() => openOutreachModal(org)}>
                              <Mail className="h-3.5 w-3.5 mr-1" /> Reach out
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => markDiscoveredStatus(org, 'called')}>
                              <Phone className="h-3.5 w-3.5 mr-1" /> Logged call
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs text-emerald-700 border-emerald-300" onClick={() => markDiscoveredStatus(org, 'signed')}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Signed
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] text-gray-500" onClick={() => markDiscoveredStatus(org, 'declined')}>
                              Not interested
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </TabsContent>

        {/* ─── OUTREACH TAB ─────────────────────────────────────── */}
        <TabsContent value="outreach" className="space-y-5 mt-4">
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
        </TabsContent>
      </Tabs>

      <MergeDuplicatesDialog open={mergeDialogOpen} onClose={() => setMergeDialogOpen(false)} onMerged={fetchOrgs} />

      {/* Outreach modal — pre-filled Hormozi template, editable before send */}
      <Dialog open={!!outreachOrg} onOpenChange={(v) => !v && setOutreachOrg(null)}>
        <DialogContent className="max-w-lg">
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
                  await supabase.from('organizations' as any)
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

      {/* Add Organization Modal */}
      <Dialog open={showAddOrg} onOpenChange={setShowAddOrg}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Organization</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Organization Name *</Label><Input value={orgForm.name} onChange={e => setOrgForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={orgForm.contactName} onChange={e => setOrgForm(p => ({ ...p, contactName: e.target.value }))} /></div>
              <div><Label>Contact Phone</Label><Input value={orgForm.contactPhone} onChange={e => setOrgForm(p => ({ ...p, contactPhone: e.target.value }))} /></div>
            </div>
            <div><Label>Contact Email</Label><Input type="email" value={orgForm.contactEmail} onChange={e => setOrgForm(p => ({ ...p, contactEmail: e.target.value }))} /></div>
            <div><Label>Billing Email</Label><Input type="email" value={orgForm.billingEmail} onChange={e => setOrgForm(p => ({ ...p, billingEmail: e.target.value }))} placeholder="Where invoices get sent" /></div>
            <div><Label>Billing Address</Label><Input value={orgForm.billingAddress} onChange={e => setOrgForm(p => ({ ...p, billingAddress: e.target.value }))} /></div>
            <div><Label>Notes</Label><Textarea value={orgForm.notes} onChange={e => setOrgForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddOrg(false)}>Cancel</Button>
            <Button className="bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={handleAddOrg} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationsTab;
