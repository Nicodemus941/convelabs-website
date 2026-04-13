import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Building2, Plus, Search, RefreshCw, Send, DollarSign, Mail,
  Phone, User, FileText, Loader2, Download,
} from 'lucide-react';
import { toast } from 'sonner';

interface Org {
  id: string; name: string; contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; billing_email: string | null; billing_address: string | null;
  notes: string | null; is_active: boolean; created_at: string;
}

interface OrgInvoice {
  id: string; org_id: string; patient_name: string | null; service_type: string | null;
  amount: number; memo: string | null; status: string; sent_at: string | null;
  paid_at: string | null; created_at: string;
}

const OrganizationsTab: React.FC = () => {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [invoices, setInvoices] = useState<OrgInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [saving, setSaving] = useState(false);

  const [orgForm, setOrgForm] = useState({ name: '', contactName: '', contactEmail: '', contactPhone: '', billingEmail: '', billingAddress: '', notes: '' });
  const [invoiceForm, setInvoiceForm] = useState({ patientName: '', serviceType: '', amount: '', memo: '' });

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('organizations' as any).select('*').order('name');
    setOrgs((data as Org[]) || []);
    setLoading(false);
  }, []);

  const fetchInvoices = useCallback(async (orgId: string) => {
    const { data } = await supabase.from('org_invoices' as any).select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    setInvoices((data as OrgInvoice[]) || []);
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

  const handleMarkPaid = async (invoiceId: string) => {
    await supabase.from('org_invoices' as any).update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId);
    toast.success('Marked as paid');
    if (selectedOrg) fetchInvoices(selectedOrg.id);
  };

  const filtered = orgs.filter(o => !searchQuery || o.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Organization detail view
  if (selectedOrg) {
    const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
    const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const totalOutstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedOrg(null)}>← Back</Button>
          <div>
            <h1 className="text-2xl font-bold">{selectedOrg.name}</h1>
            <p className="text-sm text-muted-foreground">{selectedOrg.contact_email || 'No email'} · {selectedOrg.contact_phone || 'No phone'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-[#B91C1C]">${totalInvoiced.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Total Invoiced</p></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-600">${totalPaid.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Paid</p></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-red-600">${totalOutstanding.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">Outstanding</p></CardContent></Card>
        </div>

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
                    <TableCell><Badge variant="outline" className={`text-xs ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : inv.status === 'sent' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'}`}>{inv.status}</Badge></TableCell>
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
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-[#B91C1C]" /> Organizations</h1>
          <p className="text-sm text-muted-foreground">Manage partner organizations and billing</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={() => setShowAddOrg(true)}><Plus className="h-4 w-4" /> Add Organization</Button>
          <Button variant="outline" size="sm" onClick={fetchOrgs}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

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
