import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  User, Phone, Mail, Calendar, Clock, MapPin, Shield, FileText,
  Search, ArrowLeft, Package, ClipboardList, DollarSign, Stethoscope,
  ChevronRight, Edit3, CalendarPlus, Receipt, MessageSquare, MoreHorizontal, UserPlus, Loader2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const PatientProfileTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dob: '', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' });
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ amount: '', description: '', memo: '' });
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({ firstName: '', lastName: '', email: '', phone: '', dob: '', address: '', city: '', state: 'FL', zipcode: '', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [allPatients, setAllPatients] = useState<any[]>([]);

  // Load all patients on mount
  useEffect(() => {
    const loadAll = async () => {
      const { data } = await supabase
        .from('tenant_patients')
        .select('*')
        .order('first_name', { ascending: true })
        .limit(500);
      setAllPatients(data || []);
      setPatients(data || []);
    };
    loadAll();
  }, []);

  // Filter patients as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setPatients(allPatients);
      return;
    }
    const q = searchQuery.toLowerCase();
    setPatients(allPatients.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q))
    ));
  }, [searchQuery, allPatients]);

  const loadPatientData = useCallback(async (patient: any) => {
    setSelectedPatient(patient);
    setLoading(true);

    // Fetch appointments
    const { data: appts } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', patient.id)
      .order('appointment_date', { ascending: false });
    setAppointments(appts || []);

    // Fetch specimens
    const { data: specs } = await supabase
      .from('specimen_deliveries' as any)
      .select('*')
      .eq('patient_id', patient.id)
      .order('delivered_at', { ascending: false });
    setSpecimens((specs as any[]) || []);

    // Fetch activity log
    const { data: acts } = await supabase
      .from('activity_log' as any)
      .select('*')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false });
    setActivities((acts as any[]) || []);

    setLoading(false);
  }, []);

  const STATUS_COLORS: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-700',
    confirmed: 'bg-emerald-50 text-emerald-700',
    en_route: 'bg-amber-50 text-amber-700',
    in_progress: 'bg-purple-50 text-purple-700',
    completed: 'bg-gray-50 text-gray-600',
    cancelled: 'bg-red-50 text-red-700',
    specimen_delivered: 'bg-indigo-50 text-indigo-700',
  };

  // Patient profile view
  if (selectedPatient) {
    const p = selectedPatient;
    const upcomingAppts = appointments.filter(a => ['scheduled', 'confirmed'].includes(a.status));
    const pastAppts = appointments.filter(a => ['completed', 'specimen_delivered'].includes(a.status));
    const cancelledAppts = appointments.filter(a => a.status === 'cancelled');
    const totalSpent = appointments.filter(a => a.payment_status === 'completed').reduce((s, a) => s + (a.total_amount || 0), 0);

    return (
      <div className="space-y-6">
        {/* Back + Header + Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{p.first_name} {p.last_name}</h1>
              <p className="text-sm text-muted-foreground">Patient Chart</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-10 sm:pl-0">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              setEditForm({ firstName: p.first_name || '', lastName: p.last_name || '', email: p.email || '', phone: p.phone || '', dob: p.date_of_birth || '', insuranceProvider: p.insurance_provider || '', insuranceMemberId: p.insurance_member_id || '', insuranceGroup: p.insurance_group_number || '' });
              setEditModalOpen(true);
            }}>
              <Edit3 className="h-3.5 w-3.5" /> Edit Info
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              const role = JSON.parse(localStorage.getItem('sb-yluyonhrxxtyuiyrdixl-auth-token') || '{}')?.user?.user_metadata?.role || 'office_manager';
              window.location.href = `/dashboard/${role}/calendar`;
            }}>
              <CalendarPlus className="h-3.5 w-3.5" /> Schedule
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              setInvoiceForm({ amount: '', description: '', memo: '' });
              setInvoiceModalOpen(true);
            }}>
              <Receipt className="h-3.5 w-3.5" /> Generate Invoice
            </Button>
            {p.phone && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => window.open(`sms:${p.phone}`)}>
                <MessageSquare className="h-3.5 w-3.5" /> Message
              </Button>
            )}
          </div>
        </div>

        {/* Patient Info Card */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
                    <User className="h-7 w-7 text-[#B91C1C]" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{p.first_name} {p.last_name}</p>
                    {p.date_of_birth && <p className="text-xs text-muted-foreground">DOB: {p.date_of_birth}</p>}
                  </div>
                </div>
                {p.email && <p className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> {p.email}</p>}
                {p.phone && <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> {p.phone}</p>}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Shield className="h-4 w-4" /> Insurance</p>
                {p.insurance_provider ? (
                  <>
                    <p className="text-sm">{p.insurance_provider}</p>
                    {p.insurance_member_id && <p className="text-xs text-muted-foreground">Member ID: {p.insurance_member_id}</p>}
                    {p.insurance_group_number && <p className="text-xs text-muted-foreground">Group: {p.insurance_group_number}</p>}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Self-pay (no insurance on file)</p>
                )}
              </div>

              {/* Address from most recent appointment */}
              {(() => {
                const latestWithAddress = appointments.find(a => a.address && a.address !== 'Pending');
                return latestWithAddress ? (
                  <div className="space-y-2 md:col-span-3 border-t pt-4 mt-2">
                    <p className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Address on File</p>
                    <p className="text-sm">{latestWithAddress.address}</p>
                    {latestWithAddress.gate_code && (
                      <p className="text-xs text-muted-foreground">Gate Code: <span className="font-mono font-medium text-foreground">{latestWithAddress.gate_code}</span></p>
                    )}
                    {latestWithAddress.notes && latestWithAddress.notes.toLowerCase().includes('gate') && (
                      <p className="text-xs text-amber-600">Note contains gate info — check appointment notes</p>
                    )}
                  </div>
                ) : null;
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{appointments.length}</p>
                  <p className="text-[10px] text-muted-foreground">Total Visits</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700">${totalSpent}</p>
                  <p className="text-[10px] text-muted-foreground">Total Spent</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-purple-700">{specimens.length}</p>
                  <p className="text-[10px] text-muted-foreground">Specimens</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-amber-700">{upcomingAppts.length}</p>
                  <p className="text-[10px] text-muted-foreground">Upcoming</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="appointments">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
            <TabsTrigger value="appointments">Appointments ({appointments.length})</TabsTrigger>
            <TabsTrigger value="specimens">Specimens ({specimens.length})</TabsTrigger>
            <TabsTrigger value="notes">Notes ({activities.length})</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="appointments" className="space-y-3 mt-4">
            {upcomingAppts.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-blue-700">Upcoming ({upcomingAppts.length})</p>
                {upcomingAppts.map(a => (
                  <Card key={a.id} className="shadow-sm mb-2">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[a.status] || ''}`}>{a.status}</Badge>
                          <span className="text-sm font-medium">{a.appointment_date?.substring(0, 10) ? format(new Date(a.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d, yyyy') : ''}</span>
                          <span className="text-xs text-muted-foreground">{a.appointment_time || ''}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{(a.service_name || a.service_type || '').replace(/_|-/g, ' ')}</p>
                        {a.address && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.address}</p>}
                        {a.gate_code && <p className="text-xs text-amber-600">Gate: {a.gate_code}</p>}
                      </div>
                      <span className="text-sm font-medium">${a.total_amount || 0}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {pastAppts.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-gray-600">Past ({pastAppts.length})</p>
                {pastAppts.map(a => (
                  <Card key={a.id} className="shadow-sm mb-2 opacity-75">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600">{a.status}</Badge>
                          <span className="text-sm">{a.appointment_date?.substring(0, 10) ? format(new Date(a.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d, yyyy') : ''}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{(a.service_type || '').replace(/_|-/g, ' ')}</p>
                      </div>
                      <span className="text-sm">${a.total_amount || 0}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {cancelledAppts.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 text-red-600">Cancelled ({cancelledAppts.length})</p>
                {cancelledAppts.map(a => (
                  <Card key={a.id} className="shadow-sm mb-2 opacity-50">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700">cancelled</Badge>
                        <span className="text-sm ml-2">{a.appointment_date?.substring(0, 10) ? format(new Date(a.appointment_date.substring(0, 10) + 'T12:00:00'), 'MMM d') : ''}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {appointments.length === 0 && <p className="text-center text-muted-foreground py-8">No appointments found</p>}
          </TabsContent>

          <TabsContent value="specimens" className="mt-4">
            {specimens.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No specimens recorded</p>
            ) : (
              <div className="space-y-2">
                {specimens.map((s: any) => (
                  <Card key={s.id} className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-medium text-sm">{s.specimen_id}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">{s.lab_name}</Badge>
                            <span className="text-xs text-muted-foreground">{s.tube_count} tube{s.tube_count !== 1 ? 's' : ''}{s.tube_types ? ` (${s.tube_types})` : ''}</span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{s.delivered_at ? format(new Date(s.delivered_at), 'MMM d, h:mm a') : ''}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            {activities.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No activity notes for this patient</p>
            ) : (
              <div className="space-y-2">
                {activities.map((a: any) => (
                  <div key={a.id} className="flex gap-3 p-3 rounded-lg border">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="h-4 w-4 text-gray-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{a.activity_type}</Badge>
                        <span className="text-[10px] text-muted-foreground">{a.created_at ? format(new Date(a.created_at), 'MMM d, h:mm a') : ''}</span>
                      </div>
                      <p className="text-sm mt-1">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="billing" className="mt-4">
            <Card className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Appointments</span><span className="font-medium">{appointments.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid Appointments</span><span className="font-medium">{appointments.filter(a => a.payment_status === 'completed').length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Revenue</span><span className="font-bold text-emerald-700">${totalSpent}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Tips</span><span className="font-medium">${appointments.reduce((s, a) => s + (a.tip_amount || 0), 0)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Outstanding</span><span className="font-medium text-red-600">${appointments.filter(a => a.payment_status !== 'completed' && a.status !== 'cancelled').reduce((s, a) => s + (a.total_amount || 0), 0)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Insurance</span><span>{p.insurance_provider || 'Self-pay'}</span></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Patient Modal */}
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-md w-[95vw] sm:w-full">
            <DialogHeader><DialogTitle>Edit Patient Information</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First Name</Label><Input value={editForm.firstName} onChange={e => setEditForm(pr => ({ ...pr, firstName: e.target.value }))} /></div>
                <div><Label>Last Name</Label><Input value={editForm.lastName} onChange={e => setEditForm(pr => ({ ...pr, lastName: e.target.value }))} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={editForm.email} onChange={e => setEditForm(pr => ({ ...pr, email: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={editForm.phone} onChange={e => setEditForm(pr => ({ ...pr, phone: e.target.value }))} /></div>
                <div><Label>Date of Birth</Label><Input type="date" value={editForm.dob} onChange={e => setEditForm(pr => ({ ...pr, dob: e.target.value }))} /></div>
              </div>
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-semibold">Insurance</p>
                <div><Label>Provider</Label><Input value={editForm.insuranceProvider} onChange={e => setEditForm(pr => ({ ...pr, insuranceProvider: e.target.value }))} placeholder="e.g. Blue Cross" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Member ID</Label><Input value={editForm.insuranceMemberId} onChange={e => setEditForm(pr => ({ ...pr, insuranceMemberId: e.target.value }))} /></div>
                  <div><Label>Group #</Label><Input value={editForm.insuranceGroup} onChange={e => setEditForm(pr => ({ ...pr, insuranceGroup: e.target.value }))} /></div>
                </div>
              </div>
              <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white" onClick={async () => {
                const { error } = await supabase.from('tenant_patients').update({
                  first_name: editForm.firstName, last_name: editForm.lastName,
                  email: editForm.email, phone: editForm.phone, date_of_birth: editForm.dob || null,
                  insurance_provider: editForm.insuranceProvider || null,
                  insurance_member_id: editForm.insuranceMemberId || null,
                  insurance_group_number: editForm.insuranceGroup || null,
                }).eq('id', p.id);
                if (error) { toast.error(error.message); return; }
                toast.success('Patient info updated');
                setSelectedPatient({ ...p, ...editForm, first_name: editForm.firstName, last_name: editForm.lastName });
                setEditModalOpen(false);
                // Refresh patient list
                const { data } = await supabase.from('tenant_patients').select('*').order('first_name').limit(500);
                setAllPatients(data || []);
              }}>Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Generate Invoice for Patient Modal */}
        <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
          <DialogContent className="max-w-md w-[95vw] sm:w-full">
            <DialogHeader><DialogTitle>Generate Invoice for {p.first_name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount ($) *</Label><Input type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={e => setInvoiceForm(pr => ({ ...pr, amount: e.target.value }))} placeholder="150.00" /></div>
                <div><Label>Service</Label><Input value={invoiceForm.description} onChange={e => setInvoiceForm(pr => ({ ...pr, description: e.target.value }))} placeholder="Blood Draw" /></div>
              </div>
              <div><Label>Memo</Label><Input value={invoiceForm.memo} onChange={e => setInvoiceForm(pr => ({ ...pr, memo: e.target.value }))} placeholder="Optional notes" /></div>
              <p className="text-xs text-muted-foreground">Invoice will be sent to <strong>{p.email || 'no email on file'}</strong></p>
              <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white" disabled={!invoiceForm.amount || !p.email}
                onClick={async () => {
                  try {
                    const amount = parseFloat(invoiceForm.amount);
                    const { data: appt, error } = await supabase.from('appointments').insert([{
                      appointment_date: new Date().toISOString(), patient_id: p.id,
                      patient_name: `${p.first_name} ${p.last_name}`, patient_email: p.email,
                      service_type: 'invoice', service_name: invoiceForm.description || 'Invoice',
                      status: 'scheduled', address: 'Invoice Only', zipcode: '32801',
                      total_amount: amount, service_price: amount, booking_source: 'manual',
                      invoice_status: 'sent', invoice_sent_at: new Date().toISOString(),
                      invoice_due_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
                      payment_status: 'pending', notes: invoiceForm.memo || null,
                    }]).select().single();
                    if (error) throw error;
                    await supabase.functions.invoke('send-appointment-invoice', {
                      body: { appointmentId: appt.id, patientName: `${p.first_name} ${p.last_name}`, patientEmail: p.email, serviceName: invoiceForm.description || 'ConveLabs Service', servicePrice: amount, memo: invoiceForm.memo },
                    });
                    toast.success(`Invoice for $${amount.toFixed(2)} sent to ${p.email}`);
                    setInvoiceModalOpen(false);
                    loadPatientData(p); // Refresh appointments
                  } catch (err: any) { toast.error(err.message || 'Failed'); }
                }}>
                Send Invoice — ${parseFloat(invoiceForm.amount || '0').toFixed(2)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Search view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6 text-[#B91C1C]" /> Patient Profiles
        </h1>
        <p className="text-sm text-muted-foreground">Search for a patient to view their complete history</p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-lg w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="pl-10 h-11"
          />
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground whitespace-nowrap">{patients.length} patients</p>
          <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5" onClick={() => setCreatePatientOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Patient
          </Button>
        </div>
      </div>

      {patients.length > 0 && (
        <div className="space-y-2 max-w-lg">
          {patients.map(p => (
            <Card key={p.id} className="shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => loadPatientData(p)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-[#B91C1C]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{p.first_name} {p.last_name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {p.email && <span>{p.email}</span>}
                    {p.phone && <span>{p.phone}</span>}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {patients.length === 0 && searchQuery && (
        <p className="text-muted-foreground text-center py-8">No patients found matching "{searchQuery}"</p>
      )}

      {patients.length === 0 && !searchQuery && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#B91C1C] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Create Patient Modal */}
      <Dialog open={createPatientOpen} onOpenChange={setCreatePatientOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-[#B91C1C]" /> Add New Patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>First Name *</Label><Input value={newPatient.firstName} onChange={e => setNewPatient(p => ({ ...p, firstName: e.target.value }))} placeholder="John" /></div>
              <div><Label>Last Name *</Label><Input value={newPatient.lastName} onChange={e => setNewPatient(p => ({ ...p, lastName: e.target.value }))} placeholder="Smith" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={newPatient.email} onChange={e => setNewPatient(p => ({ ...p, email: e.target.value }))} placeholder="john@email.com" /></div>
              <div><Label>Phone</Label><Input type="tel" value={newPatient.phone} onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} placeholder="4071234567" /></div>
            </div>
            <div><Label>Date of Birth</Label><Input type="date" value={newPatient.dob} onChange={e => setNewPatient(p => ({ ...p, dob: e.target.value }))} /></div>

            <div className="border-t pt-3">
              <p className="text-sm font-semibold mb-2">Address</p>
              <div className="space-y-3">
                <div><Label>Street</Label><Input value={newPatient.address} onChange={e => setNewPatient(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>City</Label><Input value={newPatient.city} onChange={e => setNewPatient(p => ({ ...p, city: e.target.value }))} placeholder="Orlando" /></div>
                  <div><Label>State</Label><Input value={newPatient.state} onChange={e => setNewPatient(p => ({ ...p, state: e.target.value }))} /></div>
                  <div><Label>ZIP</Label><Input value={newPatient.zipcode} onChange={e => setNewPatient(p => ({ ...p, zipcode: e.target.value }))} placeholder="32801" /></div>
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-semibold mb-2">Insurance</p>
              <div className="space-y-3">
                <div><Label>Provider</Label><Input value={newPatient.insuranceProvider} onChange={e => setNewPatient(p => ({ ...p, insuranceProvider: e.target.value }))} placeholder="Blue Cross" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Member ID</Label><Input value={newPatient.insuranceMemberId} onChange={e => setNewPatient(p => ({ ...p, insuranceMemberId: e.target.value }))} /></div>
                  <div><Label>Group #</Label><Input value={newPatient.insuranceGroup} onChange={e => setNewPatient(p => ({ ...p, insuranceGroup: e.target.value }))} /></div>
                </div>
              </div>
            </div>

            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{createError}</div>
            )}

            <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11" disabled={!newPatient.firstName || !newPatient.lastName || isCreating}
              onClick={async () => {
                console.log('Create patient clicked:', newPatient.firstName, newPatient.lastName);
                setCreateError('');
                setIsCreating(true);
                try {
                  if (newPatient.email) {
                    const { data: existing } = await supabase.from('tenant_patients').select('id').ilike('email', newPatient.email.trim()).maybeSingle();
                    if (existing) { setCreateError('A patient with this email already exists'); setIsCreating(false); return; }
                  }

                  console.log('Inserting patient...');
                  const { data, error } = await supabase.from('tenant_patients').insert({
                    first_name: newPatient.firstName.trim(),
                    last_name: newPatient.lastName.trim(),
                    email: newPatient.email?.trim() || null,
                    phone: newPatient.phone?.trim() || null,
                    date_of_birth: newPatient.dob || null,
                    address: newPatient.address?.trim() || null,
                    city: newPatient.city?.trim() || null,
                    state: newPatient.state?.trim() || null,
                    zipcode: newPatient.zipcode?.trim() || null,
                    insurance_provider: newPatient.insuranceProvider?.trim() || null,
                    insurance_member_id: newPatient.insuranceMemberId?.trim() || null,
                    insurance_group_number: newPatient.insuranceGroup?.trim() || null,
                    tenant_id: '00000000-0000-0000-0000-000000000001',
                  }).select().single();

                  console.log('Insert result:', { data, error });
                  if (error) throw error;
                  if (!data) throw new Error('Patient was not created');

                  toast.success(`${newPatient.firstName} ${newPatient.lastName} added!`);
                  setNewPatient({ firstName: '', lastName: '', email: '', phone: '', dob: '', address: '', city: '', state: 'FL', zipcode: '', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' });
                  setCreatePatientOpen(false);

                  const { data: refreshed } = await supabase.from('tenant_patients').select('*').order('first_name').limit(500);
                  setAllPatients(refreshed || []);
                  setPatients(refreshed || []);

                  if (data) loadPatientData(data);
                } catch (err: any) {
                  console.error('Create patient error:', err);
                  const msg = err.message || 'Failed to create patient';
                  setCreateError(msg);
                  toast.error(msg, { duration: 6000 });
                } finally {
                  setIsCreating(false);
                }
              }}>
              {isCreating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : 'Create Patient'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientProfileTab;
