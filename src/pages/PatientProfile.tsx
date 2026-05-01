
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
  Plus, Trash2, Users, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [addFamilyOpen, setAddFamilyOpen] = useState(false);
  const [familyForm, setFamilyForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', dob: '', relationship: 'spouse',
    insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '',
  });
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);

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

      // Load family members
      if (tp?.id) {
        const { data: fam } = await supabase.from('family_members' as any)
          .select('*').eq('patient_id', tp.id).order('created_at');
        setFamilyMembers((fam as any[]) || []);
      }

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
          <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full mb-6">
            <TabsTrigger value="info">My Info</TabsTrigger>
            <TabsTrigger value="appointments">Visits</TabsTrigger>
            <TabsTrigger value="family">Family</TabsTrigger>
            <TabsTrigger value="specimens">Specimens</TabsTrigger>
            <TabsTrigger value="documents">Docs</TabsTrigger>
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
                                // Generate printable HTML receipt
                                const receiptHtml = `<!DOCTYPE html><html><head><title>ConveLabs Receipt</title><style>body{font-family:Arial,sans-serif;max-width:500px;margin:40px auto;padding:20px;color:#333}h1{color:#B91C1C;font-size:24px;margin:0}h2{font-size:14px;color:#666;margin:4px 0 30px}.divider{border-top:2px solid #B91C1C;margin:20px 0}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px}.row .label{color:#666}.row .value{font-weight:600}.total{font-size:18px;color:#B91C1C}.footer{text-align:center;margin-top:30px;font-size:11px;color:#999}@media print{body{margin:0}}</style></head><body><h1>ConveLabs<span style="color:#B91C1C">.</span></h1><h2>Payment Receipt</h2><div class="divider"></div><div class="row"><span class="label">Date</span><span class="value">${a.appointment_date?.substring(0,10)}</span></div><div class="row"><span class="label">Service</span><span class="value">${a.service_name || a.service_type || 'Blood Draw'}</span></div><div class="row"><span class="label">Patient</span><span class="value">${form.firstName} ${form.lastName}</span></div>${a.address && a.address !== 'TBD' ? `<div class="row"><span class="label">Location</span><span class="value">${a.address}</span></div>` : ''}${a.tip_amount > 0 ? `<div class="row"><span class="label">Service Fee</span><span class="value">$${(a.total_amount - a.tip_amount).toFixed(2)}</span></div><div class="row"><span class="label">Gratuity</span><span class="value">$${Number(a.tip_amount).toFixed(2)}</span></div>` : ''}<div class="divider"></div><div class="row"><span class="label" style="font-weight:700">Total Paid</span><span class="value total">$${Number(a.total_amount).toFixed(2)}</span></div><div class="row"><span class="label">Payment Status</span><span class="value" style="color:green">Paid</span></div><div class="footer"><p>ConveLabs Mobile Phlebotomy</p><p>1800 Pembrook Drive, Suite 300, Orlando, FL 32810</p><p>(941) 527-9169 | convelabs.com</p></div><script>window.print()</script></body></html>`;
                                const win = window.open('', '_blank');
                                if (win) { win.document.write(receiptHtml); win.document.close(); }
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

          {/* FAMILY MEMBERS TAB */}
          <TabsContent value="family" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Family Members</h3>
              <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1" onClick={() => setAddFamilyOpen(true)}>
                <Plus className="h-4 w-4" /> Add Member
              </Button>
            </div>

            {familyMembers.length > 0 ? familyMembers.map((fm: any) => (
              <Card key={fm.id} className="shadow-sm">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{fm.first_name} {fm.last_name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px] capitalize">{fm.relationship}</Badge>
                        {fm.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {fm.phone}</span>}
                        {fm.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {fm.email}</span>}
                        {fm.date_of_birth && <span>DOB: {fm.date_of_birth}</span>}
                      </div>
                      {fm.insurance_provider && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Shield className="h-3 w-3" /> {fm.insurance_provider}{fm.insurance_member_id ? ` (${fm.insurance_member_id})` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="text-gray-500 hover:text-[#B91C1C] h-8 w-8 p-0"
                        onClick={() => {
                          setFamilyForm({
                            firstName: fm.first_name || '',
                            lastName: fm.last_name || '',
                            email: fm.email || '',
                            phone: fm.phone || '',
                            dob: fm.date_of_birth || '',
                            relationship: fm.relationship || 'spouse',
                            insuranceProvider: fm.insurance_provider || '',
                            insuranceMemberId: fm.insurance_member_id || '',
                            insuranceGroup: fm.insurance_group_number || '',
                          });
                          setEditingFamilyId(fm.id);
                          setAddFamilyOpen(true);
                        }}
                        title="Edit family member">
                        <User className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 h-8 w-8 p-0"
                        onClick={async () => {
                          if (!confirm(`Remove ${fm.first_name} from family?`)) return;
                          await supabase.from('family_members' as any).delete().eq('id', fm.id);
                          setFamilyMembers(prev => prev.filter(f => f.id !== fm.id));
                          toast.success('Family member removed');
                        }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-muted-foreground">No family members added yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add family members to book appointments for them at the same visit.</p>
              </div>
            )}

            {/* Add / Edit Family Member Modal */}
            <Dialog open={addFamilyOpen} onOpenChange={(v) => {
              setAddFamilyOpen(v);
              if (!v) {
                setEditingFamilyId(null);
                setFamilyForm({ firstName: '', lastName: '', email: '', phone: '', dob: '', relationship: 'spouse', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' });
              }
            }}>
              <DialogContent className="max-w-md w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-[#B91C1C]" />
                    {editingFamilyId ? 'Edit Family Member' : 'Add Family Member'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>First Name *</Label><Input value={familyForm.firstName} onChange={e => setFamilyForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                    <div><Label>Last Name *</Label><Input value={familyForm.lastName} onChange={e => setFamilyForm(p => ({ ...p, lastName: e.target.value }))} /></div>
                  </div>
                  <div>
                    <Label>Relationship *</Label>
                    <Select value={familyForm.relationship} onValueChange={v => setFamilyForm(p => ({ ...p, relationship: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spouse">Spouse</SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                        <SelectItem value="sibling">Sibling</SelectItem>
                        <SelectItem value="dependent">Dependent</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Email</Label><Input type="email" value={familyForm.email} onChange={e => setFamilyForm(p => ({ ...p, email: e.target.value }))} /></div>
                    <div><Label>Phone</Label><Input value={familyForm.phone} onChange={e => setFamilyForm(p => ({ ...p, phone: e.target.value }))} /></div>
                  </div>
                  <div><Label>Date of Birth</Label><Input type="date" value={familyForm.dob} onChange={e => setFamilyForm(p => ({ ...p, dob: e.target.value }))} /></div>

                  {/* Insurance — optional. Stored on the family-member row so
                      their lab orders bill to their own plan, not the primary's. */}
                  <div className="border-t pt-3 mt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Insurance (optional — leave blank if same as primary)
                    </p>
                    <div className="space-y-3">
                      <div><Label>Insurance Provider</Label><Input value={familyForm.insuranceProvider} onChange={e => setFamilyForm(p => ({ ...p, insuranceProvider: e.target.value }))} placeholder="e.g. Blue Cross Blue Shield" /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Member ID</Label><Input value={familyForm.insuranceMemberId} onChange={e => setFamilyForm(p => ({ ...p, insuranceMemberId: e.target.value }))} /></div>
                        <div><Label>Group #</Label><Input value={familyForm.insuranceGroup} onChange={e => setFamilyForm(p => ({ ...p, insuranceGroup: e.target.value }))} /></div>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white" disabled={!familyForm.firstName || !familyForm.lastName}
                    onClick={async () => {
                      const payload = {
                        first_name: familyForm.firstName,
                        last_name: familyForm.lastName,
                        email: familyForm.email || null,
                        phone: familyForm.phone || null,
                        date_of_birth: familyForm.dob || null,
                        relationship: familyForm.relationship,
                        insurance_provider: familyForm.insuranceProvider || null,
                        insurance_member_id: familyForm.insuranceMemberId || null,
                        insurance_group_number: familyForm.insuranceGroup || null,
                      };

                      if (editingFamilyId) {
                        const { data, error } = await supabase
                          .from('family_members' as any)
                          .update(payload)
                          .eq('id', editingFamilyId)
                          .select()
                          .single();
                        if (error) { toast.error(error.message); return; }
                        setFamilyMembers(prev => prev.map(f => f.id === editingFamilyId ? data : f));
                        toast.success(`${familyForm.firstName} updated`);
                      } else {
                        const { data, error } = await supabase
                          .from('family_members' as any)
                          .insert({ patient_id: patient?.id, ...payload })
                          .select()
                          .single();
                        if (error) { toast.error(error.message); return; }
                        setFamilyMembers(prev => [...prev, data]);
                        toast.success(`${familyForm.firstName} added to family`);
                      }

                      setFamilyForm({ firstName: '', lastName: '', email: '', phone: '', dob: '', relationship: 'spouse', insuranceProvider: '', insuranceMemberId: '', insuranceGroup: '' });
                      setEditingFamilyId(null);
                      setAddFamilyOpen(false);
                    }}>
                    {editingFamilyId ? 'Save Changes' : 'Add Family Member'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
                      // Newline-first split (current trigger), comma fallback for legacy rows.
                      // Filenames with commas ("Rienzi, Mary Ellen.pdf") used to break this.
                      const _raw = a.lab_order_file_path as string;
                      const paths = (_raw.includes('\n') ? _raw.split('\n') : _raw.split(',')).map((p: string) => p.trim()).filter(Boolean);
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
