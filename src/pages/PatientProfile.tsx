
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  User, Mail, Phone, MapPin, Shield, Save, Loader2, Calendar,
  FileText, Download, ArrowLeft, UserPlus, Package, Receipt,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import Header from '@/components/home/Header';

const PatientProfile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [specimens, setSpecimens] = useState<any[]>([]);

  // Form state
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', dob: '',
    address: '', city: '', state: 'FL', zipcode: '',
    insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '',
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      // Load patient profile
      const { data: tp } = await supabase.from('tenant_patients')
        .select('*')
        .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
        .maybeSingle();

      if (tp) {
        setPatient(tp);
        setForm({
          firstName: tp.first_name || '', lastName: tp.last_name || '',
          email: tp.email || user.email || '', phone: tp.phone || '',
          dob: tp.date_of_birth || '',
          address: tp.address || '', city: tp.city || '', state: tp.state || 'FL', zipcode: tp.zipcode || '',
          insuranceProvider: tp.insurance_provider || '', insuranceMemberId: tp.insurance_member_id || '',
          insuranceGroup: tp.insurance_group_number || '',
        });
      } else {
        setForm(prev => ({ ...prev, email: user.email || '', firstName: user.firstName || '', lastName: user.lastName || '' }));
      }

      // Load appointments
      const { data: appts } = await supabase.from('appointments')
        .select('*')
        .or(`patient_id.eq.${user.id},patient_email.ilike.${user.email || 'none'}`)
        .order('appointment_date', { ascending: false });
      setAppointments(appts || []);

      // Load specimens
      const { data: specs } = await supabase.from('specimen_deliveries' as any)
        .select('*')
        .or(`patient_id.eq.${user.id}`)
        .order('delivered_at', { ascending: false });
      setSpecimens((specs as any[]) || []);

      setLoading(false);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        first_name: form.firstName, last_name: form.lastName,
        email: form.email, phone: form.phone, date_of_birth: form.dob || null,
        address: form.address || null, city: form.city || null, state: form.state || null, zipcode: form.zipcode || null,
        insurance_provider: form.insuranceProvider || null,
        insurance_member_id: form.insuranceMemberId || null,
        insurance_group_number: form.insuranceGroup || null,
      };

      if (patient?.id) {
        const { error } = await supabase.from('tenant_patients').update(updates).eq('id', patient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tenant_patients').insert({ ...updates, tenant_id: '00000000-0000-0000-0000-000000000001', user_id: user?.id });
        if (error) throw error;
      }

      toast.success('Profile saved!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const pastAppts = appointments.filter(a => ['completed', 'specimen_delivered'].includes(a.status));
  const upcomingAppts = appointments.filter(a => ['scheduled', 'confirmed'].includes(a.status));

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-6 pb-24 md:pb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="h-5 w-5" /></Link></Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">My Profile</h1>
              <p className="text-sm text-muted-foreground">Manage your information and view history</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="info">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full mb-6">
            <TabsTrigger value="info">My Info</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="specimens">Specimens</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          {/* MY INFO TAB */}
          <TabsContent value="info" className="space-y-6">
            {/* Personal Info */}
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" /> Personal Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>First Name</Label><Input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                  <div><Label>Last Name</Label><Input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="4071234567" /></div>
                </div>
                <div><Label>Date of Birth</Label><Input type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} /></div>
              </CardContent>
            </Card>

            {/* Address */}
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5" /> Address</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Street Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St" /></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div><Label>City</Label><Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
                  <div><Label>State</Label><Input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} /></div>
                  <div><Label>ZIP</Label><Input value={form.zipcode} onChange={e => setForm(p => ({ ...p, zipcode: e.target.value }))} /></div>
                </div>
              </CardContent>
            </Card>

            {/* Insurance */}
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Shield className="h-5 w-5" /> Insurance</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Provider</Label><Input value={form.insuranceProvider} onChange={e => setForm(p => ({ ...p, insuranceProvider: e.target.value }))} placeholder="e.g. Blue Cross Blue Shield" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Member ID</Label><Input value={form.insuranceMemberId} onChange={e => setForm(p => ({ ...p, insuranceMemberId: e.target.value }))} /></div>
                  <div><Label>Group Number</Label><Input value={form.insuranceGroup} onChange={e => setForm(p => ({ ...p, insuranceGroup: e.target.value }))} /></div>
                </div>
                {patient?.insurance_card_path && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700">Insurance card on file</span>
                    <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={async () => {
                      const { data } = await supabase.storage.from('lab-orders').createSignedUrl(patient.insurance_card_path, 3600);
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                    }}>View Card</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-12" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save Profile</>}
            </Button>
          </TabsContent>

          {/* APPOINTMENTS TAB */}
          <TabsContent value="appointments" className="space-y-4">
            {upcomingAppts.length > 0 && (
              <div>
                <h3 className="font-semibold text-blue-700 mb-2">Upcoming ({upcomingAppts.length})</h3>
                {upcomingAppts.map(a => (
                  <Card key={a.id} className="mb-2 shadow-sm">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">{a.status}</Badge>
                            <span className="text-sm font-medium">{a.appointment_date?.substring(0, 10)}</span>
                            <span className="text-xs text-muted-foreground">{a.appointment_time}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{a.service_name || a.service_type} · {a.address || 'TBD'}</p>
                        </div>
                        {a.total_amount > 0 && <span className="text-sm font-medium">${a.total_amount}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {pastAppts.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-600 mb-2">Past ({pastAppts.length})</h3>
                {pastAppts.map(a => (
                  <Card key={a.id} className="mb-2 shadow-sm opacity-80">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">{a.status}</Badge>
                            <span className="text-sm">{a.appointment_date?.substring(0, 10)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{a.service_name || a.service_type}</p>
                        </div>
                        <div className="text-right">
                          {a.total_amount > 0 && <p className="text-sm font-medium">${a.total_amount}</p>}
                          {a.payment_status === 'completed' && (
                            <Button variant="ghost" size="sm" className="text-xs text-[#B91C1C] h-7 px-2"
                              onClick={() => {
                                // Generate simple receipt
                                const receipt = `ConveLabs Receipt\n\nDate: ${a.appointment_date?.substring(0,10)}\nService: ${a.service_name || a.service_type}\nAmount: $${a.total_amount}\nStatus: Paid\nPatient: ${form.firstName} ${form.lastName}\n\nConveLabs - (941) 527-9169`;
                                const blob = new Blob([receipt], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `convelabs-receipt-${a.appointment_date?.substring(0,10)}.txt`;
                                link.click();
                              }}>
                              <Download className="h-3 w-3 mr-1" /> Receipt
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {appointments.length === 0 && (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-muted-foreground">No appointments yet</p>
                <Button className="mt-4 bg-[#B91C1C] hover:bg-[#991B1B] text-white" asChild>
                  <Link to="/book-now">Book Your First Appointment</Link>
                </Button>
              </div>
            )}
          </TabsContent>

          {/* SPECIMENS TAB */}
          <TabsContent value="specimens" className="space-y-3">
            {specimens.length > 0 ? specimens.map((s: any) => (
              <Card key={s.id} className="shadow-sm">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-medium text-sm">{s.specimen_id}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {s.lab_name} · {s.tube_count} tube{s.tube_count !== 1 ? 's' : ''}{s.tube_types ? ` (${s.tube_types})` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{s.delivered_at ? format(new Date(s.delivered_at), 'MMM d, h:mm a') : ''}</span>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-muted-foreground">No specimens recorded yet</p>
              </div>
            )}
          </TabsContent>

          {/* DOCUMENTS TAB */}
          <TabsContent value="documents" className="space-y-3">
            {/* Lab orders from appointments */}
            {appointments.filter(a => a.lab_order_file_path).length > 0 ? (
              appointments.filter(a => a.lab_order_file_path).map(a => (
                <Card key={a.id} className="shadow-sm">
                  <CardContent className="p-3 sm:p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Lab Order — {a.appointment_date?.substring(0, 10)}</p>
                      <p className="text-xs text-muted-foreground">{a.service_name || a.service_type}</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs gap-1" onClick={async () => {
                      const paths = a.lab_order_file_path.split(',').map((p: string) => p.trim());
                      for (const path of paths) {
                        const { data } = await supabase.storage.from('lab-orders').createSignedUrl(path, 3600);
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                      }
                    }}>
                      <FileText className="h-3.5 w-3.5" /> View
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-muted-foreground">No documents uploaded yet</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default PatientProfile;
