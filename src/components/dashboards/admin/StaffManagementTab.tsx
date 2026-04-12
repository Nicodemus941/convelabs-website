
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus, RefreshCw, User, Trash2, Clock, CalendarOff, Mail, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StaffMember {
  id: string;
  user_id: string;
  specialty: string | null;
  pay_rate: number;
  premium_pay_rate: number | null;
  bio: string | null;
  photo_url: string | null;
  created_at: string;
  name?: string;
  role?: string;
}

const ROLES = [
  { value: 'phlebotomist', label: 'Phlebotomist' },
  { value: 'office_manager', label: 'Office Manager / Admin' },
  { value: 'staff', label: 'General Staff' },
];

const SPECIALTIES = [
  { value: 'phlebotomy', label: 'Phlebotomy' },
  { value: 'office_manager', label: 'Office Management' },
  { value: 'nursing', label: 'Nursing' },
  { value: 'lab_tech', label: 'Lab Technician' },
];

const StaffManagementTab = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    role: 'phlebotomist', specialty: 'phlebotomy',
    payRate: '35', premiumRate: '55', bio: '',
  });

  const [timeOffData, setTimeOffData] = useState({
    staffId: '', startDate: '', endDate: '', reason: '',
  });

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase
        .from('staff_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!profiles?.length) { setStaff([]); setLoading(false); return; }

      const userIds = profiles.map(p => p.user_id).filter(Boolean);
      const { data: userProfiles } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', userIds);

      const userMap: Record<string, any> = {};
      userProfiles?.forEach(u => { userMap[u.id] = u; });

      const enriched = profiles.map(p => ({
        ...p,
        name: userMap[p.user_id]?.full_name || p.bio?.replace('ConveLabs Admin - ', '') || 'Staff Member',
        role: p.specialty === 'office_manager' ? 'Office Manager' : 'Phlebotomist',
      }));

      setStaff(enriched);
    } catch (err) {
      console.error('Failed to fetch staff:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const resetForm = () => {
    setFormData({ firstName: '', lastName: '', email: '', phone: '', role: 'phlebotomist', specialty: 'phlebotomy', payRate: '35', premiumRate: '55', bio: '' });
  };

  const handleAddStaff = async () => {
    if (!formData.email || !formData.firstName) {
      toast.error('Name and email are required');
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email.trim().toLowerCase(),
        password: 'ConveLabs2026!Temp',
        email_confirm: false,
        user_metadata: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          full_name: `${formData.firstName} ${formData.lastName}`.trim(),
          role: formData.role,
        },
      });

      if (authError) {
        if (authError.message?.includes('already')) toast.error('This email is already registered');
        else throw authError;
        setIsSubmitting(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) throw new Error('No user ID returned');

      await supabase.from('staff_profiles').insert([{
        user_id: userId,
        pay_rate: parseFloat(formData.payRate) || 35,
        premium_pay_rate: parseFloat(formData.premiumRate) || null,
        specialty: formData.specialty,
        bio: formData.bio || `${formData.firstName} ${formData.lastName} - ${formData.role}`,
      }]);

      await supabase.from('user_profiles').upsert([{
        id: userId,
        full_name: `${formData.firstName} ${formData.lastName}`.trim(),
        phone: formData.phone || null,
      }]);

      await supabase.auth.resetPasswordForEmail(formData.email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      toast.success(`${formData.firstName} added! Email invite sent.`);
      setShowAddModal(false);
      resetForm();
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add staff');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStaff = async (s: StaffMember) => {
    if (!window.confirm(`Remove ${s.name} from staff?`)) return;
    await supabase.from('staff_profiles').delete().eq('id', s.id);
    toast.success('Staff member removed');
    fetchStaff();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Staff Management</h2>
          <p className="text-muted-foreground">{staff.length} staff member{staff.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStaff}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
          <Button size="sm" className="bg-conve-red hover:bg-conve-red-dark text-white" onClick={() => { resetForm(); setShowAddModal(true); }}>
            <UserPlus className="h-4 w-4 mr-1" /> Add Staff
          </Button>
        </div>
      </div>

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Staff Roster</TabsTrigger>
          <TabsTrigger value="schedule">Schedule & Hours</TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4">
          {loading ? (
            <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
          ) : staff.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No staff members yet.</CardContent></Card>
          ) : (
            <div className="grid gap-4">
              {staff.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-conve-red/10 flex items-center justify-center">
                          <User className="h-6 w-6 text-conve-red" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{s.name}</h3>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <Badge variant="outline" className="capitalize">{s.role}</Badge>
                            <Badge variant="outline">{s.specialty || 'N/A'}</Badge>
                            <span className="text-sm text-muted-foreground">${s.pay_rate}/patient{s.premium_pay_rate ? ` · $${s.premium_pay_rate}/specialty` : ''}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteStaff(s)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="schedule" className="mt-4 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5" /> Business Hours</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => (
                  <div key={day} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="font-medium">{day}</span>
                    <span className="text-muted-foreground">6:00 AM - 1:30 PM</span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <span className="font-medium">Saturday</span>
                  <span className="text-amber-700 text-xs">6 AM - 9:30 AM <Badge variant="outline" className="ml-1 text-[10px]">Members</Badge></span>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <span className="font-medium">Sunday</span>
                  <span className="text-red-600">Closed</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarOff className="h-5 w-5" /> Schedule Time Off</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label>Staff Member</Label>
                  <Select value={timeOffData.staffId} onValueChange={v => setTimeOffData(p => ({ ...p, staffId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>{staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Start</Label><Input type="date" value={timeOffData.startDate} onChange={e => setTimeOffData(p => ({ ...p, startDate: e.target.value }))} /></div>
                <div><Label>End</Label><Input type="date" value={timeOffData.endDate} onChange={e => setTimeOffData(p => ({ ...p, endDate: e.target.value }))} /></div>
                <div><Label>Reason</Label><Input value={timeOffData.reason} onChange={e => setTimeOffData(p => ({ ...p, reason: e.target.value }))} placeholder="PTO, Sick..." /></div>
              </div>
              <Button size="sm"><CalendarOff className="h-4 w-4 mr-1" /> Block Time</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Staff Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Add Staff Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First Name *</Label><Input value={formData.firstName} onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))} /></div>
              <div><Label>Last Name</Label><Input value={formData.lastName} onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email *</Label><Input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input type="tel" value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role *</Label>
                <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Specialty</Label>
                <Select value={formData.specialty} onValueChange={v => setFormData(p => ({ ...p, specialty: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pay Rate ($/patient)</Label><Input type="number" value={formData.payRate} onChange={e => setFormData(p => ({ ...p, payRate: e.target.value }))} /></div>
              <div><Label>Premium Rate ($/specialty)</Label><Input type="number" value={formData.premiumRate} onChange={e => setFormData(p => ({ ...p, premiumRate: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={formData.bio} onChange={e => setFormData(p => ({ ...p, bio: e.target.value }))} rows={2} /></div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <Mail className="h-4 w-4 inline mr-1" /> An email invite will be sent to set their password.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button onClick={handleAddStaff} disabled={isSubmitting} className="bg-conve-red hover:bg-conve-red-dark text-white">
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding...</> : <><UserPlus className="h-4 w-4 mr-1" /> Add & Invite</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffManagementTab;
