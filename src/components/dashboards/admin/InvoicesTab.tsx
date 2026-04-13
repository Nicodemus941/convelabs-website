import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  FileText, Search, RefreshCw, DollarSign, Clock, AlertTriangle,
  CheckCircle2, XCircle, Send, Download, Filter, Eye, Plus,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  patient_name: string;
  patient_email: string;
  service_type: string;
  total_amount: number;
  invoice_status: string;
  payment_status: string;
  invoice_sent_at: string | null;
  invoice_due_at: string | null;
  invoice_reminder_sent_at: string | null;
  appointment_date: string;
  appointment_time: string | null;
  is_vip: boolean;
  booking_source: string;
  stripe_invoice_id: string | null;
  notes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  sent: { label: 'Sent', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Send className="h-3 w-3" /> },
  reminded: { label: 'Reminded', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle className="h-3 w-3" /> },
  paid: { label: 'Paid', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', color: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="h-3 w-3" /> },
  not_required: { label: 'No Invoice', color: 'bg-gray-50 text-gray-500 border-gray-200', icon: <FileText className="h-3 w-3" /> },
  overdue: { label: 'Overdue', color: 'bg-red-50 text-red-700 border-red-200', icon: <AlertTriangle className="h-3 w-3" /> },
};

type FilterType = 'all' | 'sent' | 'reminded' | 'paid' | 'cancelled' | 'overdue';

const InvoicesTab: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [genForm, setGenForm] = useState({ patientName: '', patientEmail: '', amount: '', description: '', memo: '' });
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .not('invoice_status', 'is', null)
        .not('invoice_status', 'eq', 'not_required')
        .order('invoice_sent_at', { ascending: false });

      if (error) throw error;

      const mapped: Invoice[] = (data || []).map((a: any) => {
        // Use direct columns first, fall back to notes parsing
        let patientName = a.patient_name || 'Unknown';
        let patientEmail = a.patient_email || '';
        if (patientName === 'Unknown' && a.notes) {
          const nameMatch = a.notes.match(/Patient:\s*([^|]+)/);
          if (nameMatch) patientName = nameMatch[1].trim();
        }
        if (!patientEmail && a.notes) {
          const emailMatch = a.notes.match(/Email:\s*([^|\s]+)/);
          if (emailMatch) patientEmail = emailMatch[1].trim();
        }

        // Check if overdue
        let status = a.invoice_status || 'sent';
        if ((status === 'sent' || status === 'reminded') && a.invoice_due_at && new Date(a.invoice_due_at) < new Date()) {
          status = 'overdue';
        }

        return {
          id: a.id,
          patient_name: patientName,
          patient_email: patientEmail || a.patient_email || '',
          service_type: a.service_type || 'mobile',
          total_amount: a.total_amount || 0,
          invoice_status: status,
          payment_status: a.payment_status || 'pending',
          invoice_sent_at: a.invoice_sent_at,
          invoice_due_at: a.invoice_due_at,
          invoice_reminder_sent_at: a.invoice_reminder_sent_at,
          appointment_date: a.appointment_date?.substring(0, 10) || '',
          appointment_time: a.appointment_time,
          is_vip: a.is_vip || false,
          booking_source: a.booking_source || 'online',
          stripe_invoice_id: a.stripe_invoice_id,
          notes: a.notes,
        };
      });

      setInvoices(mapped);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleMarkPaid = async (invoice: Invoice) => {
    const { error } = await supabase.from('appointments').update({
      payment_status: 'completed',
      invoice_status: 'paid',
    }).eq('id', invoice.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success('Invoice marked as paid');
    fetchInvoices();
  };

  const handleVoidInvoice = async (invoice: Invoice) => {
    if (!confirm('Void this invoice? The appointment will remain but the invoice will be cancelled.')) return;
    const { error } = await supabase.from('appointments').update({
      invoice_status: 'cancelled',
    }).eq('id', invoice.id);
    if (error) { toast.error('Failed to void'); return; }

    // Void on Stripe if exists
    if (invoice.stripe_invoice_id) {
      try {
        await supabase.functions.invoke('send-email', {
          body: { to: 'system', subject: 'void-stripe-invoice', html: invoice.stripe_invoice_id },
        });
      } catch { /* non-blocking */ }
    }

    toast.success('Invoice voided');
    fetchInvoices();
  };

  const handleResendInvoice = async (invoice: Invoice) => {
    if (!invoice.patient_email) { toast.error('No email on file'); return; }
    try {
      await supabase.functions.invoke('send-appointment-invoice', {
        body: {
          appointmentId: invoice.id,
          patientName: invoice.patient_name,
          patientEmail: invoice.patient_email,
          serviceType: invoice.service_type,
          serviceName: invoice.service_type?.replace(/_|-/g, ' '),
          servicePrice: invoice.total_amount,
          appointmentDate: invoice.appointment_date,
          appointmentTime: invoice.appointment_time || '',
          address: 'See appointment details',
          isVip: invoice.is_vip,
        },
      });
      toast.success('Invoice resent to ' + invoice.patient_email);
    } catch (err) {
      toast.error('Failed to resend invoice');
    }
  };

  // Filters
  const filtered = invoices.filter(inv => {
    if (activeFilter !== 'all' && inv.invoice_status !== activeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (inv.patient_name && inv.patient_name.toLowerCase().includes(q)) ||
             (inv.patient_email && inv.patient_email.toLowerCase().includes(q)) ||
             inv.id.includes(q);
    }
    return true;
  });

  // Stats
  const stats = {
    total: invoices.length,
    sent: invoices.filter(i => i.invoice_status === 'sent').length,
    overdue: invoices.filter(i => i.invoice_status === 'overdue' || i.invoice_status === 'reminded').length,
    paid: invoices.filter(i => i.invoice_status === 'paid').length,
    totalOwed: invoices.filter(i => ['sent', 'reminded', 'overdue'].includes(i.invoice_status)).reduce((s, i) => s + i.total_amount, 0),
    totalCollected: invoices.filter(i => i.invoice_status === 'paid').reduce((s, i) => s + i.total_amount, 0),
  };

  const exportCSV = () => {
    const headers = ['Patient', 'Email', 'Service', 'Amount', 'Status', 'Sent', 'Due', 'Appointment Date'];
    const rows = filtered.map(i => [
      i.patient_name, i.patient_email, i.service_type, i.total_amount,
      i.invoice_status, i.invoice_sent_at || '', i.invoice_due_at || '', i.appointment_date,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convelabs-invoices-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    toast.success('Invoices exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-[#B91C1C]" /> Invoices
          </h1>
          <p className="text-sm text-muted-foreground">{invoices.length} invoices total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={fetchInvoices} className="gap-1">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={() => setGenerateModalOpen(true)}>
            <Plus className="h-4 w-4" /> Generate Invoice
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-[#B91C1C]">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{stats.sent}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-amber-600">{stats.overdue}</p>
            <p className="text-[10px] text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-emerald-600">{stats.paid}</p>
            <p className="text-[10px] text-muted-foreground">Paid</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-red-600">${stats.totalOwed.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground">Outstanding</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-emerald-600">${stats.totalCollected.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground">Collected</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Search */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(['all', 'sent', 'overdue', 'paid', 'cancelled'] as FilterType[]).map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={activeFilter === f ? 'default' : 'outline'}
                  className={`text-xs h-8 ${activeFilter === f ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                  onClick={() => setActiveFilter(f)}
                >
                  {f === 'all' ? `All (${stats.total})` : f === 'sent' ? `Pending (${stats.sent})` : f === 'overdue' ? `Overdue (${stats.overdue})` : f === 'paid' ? `Paid (${stats.paid})` : 'Cancelled'}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2 text-muted-foreground" />
              <Input
                placeholder="Search patient or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 w-48 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-muted/50 animate-pulse rounded" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-800">No invoices found</p>
              <p className="text-sm text-muted-foreground">Invoices are created when you manually schedule appointments.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Appointment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(inv => {
                    const statusCfg = STATUS_CONFIG[inv.invoice_status] || STATUS_CONFIG.sent;
                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedInvoice(selectedInvoice?.id === inv.id ? null : inv)}>
                        <TableCell>
                          <p className="font-medium text-sm">{inv.patient_name}</p>
                          <p className="text-[10px] text-muted-foreground">{inv.patient_email}</p>
                        </TableCell>
                        <TableCell className="text-sm capitalize">{inv.service_type.replace(/_|-/g, ' ')}</TableCell>
                        <TableCell className="font-semibold text-sm">${inv.total_amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${statusCfg.color}`}>
                            {statusCfg.icon} {statusCfg.label}
                          </Badge>
                          {inv.is_vip && <Badge variant="outline" className="text-[10px] ml-1 bg-amber-50 text-amber-700 border-amber-200">VIP</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.invoice_sent_at ? format(new Date(inv.invoice_sent_at), 'MMM d, h:mm a') : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.invoice_due_at ? format(new Date(inv.invoice_due_at), 'MMM d, h:mm a') : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {inv.appointment_date ? format(new Date(inv.appointment_date + 'T12:00:00'), 'MMM d') : '—'}
                          {inv.appointment_time && <span className="text-muted-foreground ml-1">{inv.appointment_time}</span>}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            {(inv.invoice_status === 'sent' || inv.invoice_status === 'overdue' || inv.invoice_status === 'reminded') && (
                              <>
                                <Button size="sm" variant="ghost" className="text-xs h-7 text-emerald-600" onClick={() => handleMarkPaid(inv)}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                                </Button>
                                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => handleResendInvoice(inv)}>
                                  <Send className="h-3 w-3 mr-1" /> Resend
                                </Button>
                                <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500" onClick={() => handleVoidInvoice(inv)}>
                                  <XCircle className="h-3 w-3 mr-1" /> Void
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Expanded detail */}
          {selectedInvoice && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg border space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold">Invoice Details</h4>
                <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(null)}>Close</Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><span className="text-muted-foreground">Patient:</span><p className="font-medium">{selectedInvoice.patient_name}</p></div>
                <div><span className="text-muted-foreground">Email:</span><p>{selectedInvoice.patient_email || '—'}</p></div>
                <div><span className="text-muted-foreground">Amount:</span><p className="font-medium">${selectedInvoice.total_amount.toFixed(2)}</p></div>
                <div><span className="text-muted-foreground">Payment:</span><p>{selectedInvoice.payment_status}</p></div>
                <div><span className="text-muted-foreground">Booking:</span><p>{selectedInvoice.booking_source}</p></div>
                <div><span className="text-muted-foreground">VIP:</span><p>{selectedInvoice.is_vip ? 'Yes' : 'No'}</p></div>
                <div><span className="text-muted-foreground">Stripe ID:</span><p className="truncate">{selectedInvoice.stripe_invoice_id || '—'}</p></div>
                <div><span className="text-muted-foreground">Reminder Sent:</span><p>{selectedInvoice.invoice_reminder_sent_at ? format(new Date(selectedInvoice.invoice_reminder_sent_at), 'MMM d, h:mm a') : '—'}</p></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Invoice Modal */}
      <Dialog open={generateModalOpen} onOpenChange={setGenerateModalOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-[#B91C1C]" /> Generate Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Patient Name *</Label><Input value={genForm.patientName} onChange={e => setGenForm(p => ({ ...p, patientName: e.target.value }))} placeholder="Full name" /></div>
            <div><Label>Patient Email *</Label><Input type="email" value={genForm.patientEmail} onChange={e => setGenForm(p => ({ ...p, patientEmail: e.target.value }))} placeholder="patient@email.com" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount ($) *</Label><Input type="number" min="0" step="0.01" value={genForm.amount} onChange={e => setGenForm(p => ({ ...p, amount: e.target.value }))} placeholder="150.00" /></div>
              <div><Label>Description</Label><Input value={genForm.description} onChange={e => setGenForm(p => ({ ...p, description: e.target.value }))} placeholder="Blood Draw Service" /></div>
            </div>
            <div><Label>Memo (optional)</Label><Input value={genForm.memo} onChange={e => setGenForm(p => ({ ...p, memo: e.target.value }))} placeholder="Additional notes for invoice" /></div>
            <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white" disabled={!genForm.patientName || !genForm.patientEmail || !genForm.amount || isGenerating}
              onClick={async () => {
                setIsGenerating(true);
                try {
                  const amount = parseFloat(genForm.amount);
                  // Create an appointment record to track the invoice
                  const { data: appt, error: apptErr } = await supabase.from('appointments').insert([{
                    appointment_date: new Date().toISOString(),
                    patient_name: genForm.patientName,
                    patient_email: genForm.patientEmail,
                    service_type: 'invoice',
                    service_name: genForm.description || 'Invoice',
                    status: 'scheduled',
                    address: 'Invoice Only',
                    zipcode: '32801',
                    total_amount: amount,
                    service_price: amount,
                    booking_source: 'manual',
                    invoice_status: 'sent',
                    invoice_sent_at: new Date().toISOString(),
                    invoice_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    payment_status: 'pending',
                    notes: genForm.memo || null,
                  }]).select().single();
                  if (apptErr) throw apptErr;

                  // Send invoice via Stripe
                  await supabase.functions.invoke('send-appointment-invoice', {
                    body: {
                      appointmentId: appt.id,
                      patientName: genForm.patientName,
                      patientEmail: genForm.patientEmail,
                      serviceName: genForm.description || 'ConveLabs Service',
                      servicePrice: amount,
                      memo: genForm.memo,
                    },
                  });

                  toast.success(`Invoice for $${amount.toFixed(2)} sent to ${genForm.patientEmail}`);
                  setGenForm({ patientName: '', patientEmail: '', amount: '', description: '', memo: '' });
                  setGenerateModalOpen(false);
                  fetchInvoices();
                } catch (err: any) {
                  toast.error(err.message || 'Failed to generate invoice');
                } finally {
                  setIsGenerating(false);
                }
              }}>
              {isGenerating ? 'Sending...' : `Send Invoice — $${parseFloat(genForm.amount || '0').toFixed(2)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesTab;
