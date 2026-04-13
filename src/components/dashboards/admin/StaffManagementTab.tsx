
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
    startTime: '', endTime: '', // For half-day blocking
    recurring: false, recurringDay: '', // For recurring blocks
  });
  const [timeBlocks, setTimeBlocks] = useState<any[]>([]);

  const fetchTimeBlocks = async () => {
    const { data } = await supabase.from('time_blocks' as any).select('*').order('start_date', { ascending: false });
    setTimeBlocks(data || []);
  };

  const handleBlockTime = async () => {
    if (!timeOffData.startDate || !timeOffData.endDate) {
      toast.error('Start and end dates are required');
      return;
    }
    try {
      // Determine label for who this block is for
      const staffLabel = timeOffData.staffId === 'all' ? 'Office Closure'
        : timeOffData.staffId === 'owner' ? 'Owner'
        : timeOffData.staffId === 'admin' ? 'Admin'
        : staff.find(s => s.id === timeOffData.staffId)?.name || '';
      const fullReason = staffLabel
        ? `${staffLabel}: ${timeOffData.reason || 'Time off'}`
        : timeOffData.reason || 'Time off';

      const { error } = await supabase.from('time_blocks' as any).insert({
        staff_id: ['all', 'owner', 'admin'].includes(timeOffData.staffId) ? null : timeOffData.staffId || null,
        start_date: timeOffData.startDate,
        end_date: timeOffData.endDate,
        start_time: timeOffData.startTime || null,
        end_time: timeOffData.endTime || null,
        recurring: timeOffData.recurring || false,
        recurring_day: timeOffData.recurringDay || null,
        reason: fullReason,
        block_type: timeOffData.staffId === 'all' ? 'office_closure' : 'time_off',
      });
      if (error) throw error;

      // Check for affected appointments in the blocked date range
      const { data: affected } = await supabase
        .from('appointments')
        .select('id, patient_name, patient_email, patient_phone, appointment_date, appointment_time, notes')
        .gte('appointment_date', timeOffData.startDate + 'T00:00:00')
        .lte('appointment_date', timeOffData.endDate + 'T23:59:59')
        .in('status', ['scheduled', 'confirmed']);

      if (affected && affected.length > 0) {
        const names = affected.map(a => a.patient_name || a.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim() || 'Unknown').join(', ');
        toast.warning(`⚠️ ${affected.length} appointment(s) affected: ${names}. These patients should be rescheduled.`, { duration: 8000 });

        // Send SMS to affected patients (non-blocking)
        for (const appt of affected) {
          const phone = appt.patient_phone || appt.notes?.match(/Phone:\s*([^|]+)/)?.[1]?.trim();
          const name = appt.patient_name || appt.notes?.match(/Patient:\s*([^|]+)/)?.[1]?.trim() || 'Patient';
          if (phone) {
            supabase.functions.invoke('send-sms-notification', {
              body: {
                to: phone,
                message: `ConveLabs: Hi ${name.split(' ')[0]}, we need to reschedule your appointment due to ${timeOffData.reason || 'a schedule change'}. We'll reach out shortly with a new time, or call us at (941) 527-9169.`,
              },
            }).catch(() => {});
          }
        }
      } else {
        toast.success('Time block saved');
      }

      setTimeOffData({ staffId: '', startDate: '', endDate: '', reason: '', startTime: '', endTime: '', recurring: false, recurringDay: '' });
      fetchTimeBlocks();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save time block');
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!confirm('Delete this time block?')) return;
    await supabase.from('time_blocks' as any).delete().eq('id', blockId);
    toast.success('Time block removed');
    fetchTimeBlocks();
  };

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

  useEffect(() => { fetchStaff(); fetchTimeBlocks(); }, []);

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
                  <Label>Who is this for?</Label>
                  <Select value={timeOffData.staffId} onValueChange={v => setTimeOffData(p => ({ ...p, staffId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select staff or office..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Staff / Office Closure</SelectItem>
                      <SelectItem value="owner">Owner (Nicodemme)</SelectItem>
                      <SelectItem value="admin">Admin (Naquala)</SelectItem>
                      {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Start Date</Label><Input type="date" value={timeOffData.startDate} onChange={e => setTimeOffData(p => ({ ...p, startDate: e.target.value }))} /></div>
                <div><Label>End Date</Label><Input type="date" value={timeOffData.endDate} onChange={e => setTimeOffData(p => ({ ...p, endDate: e.target.value }))} /></div>
                <div><Label>Reason</Label><Input value={timeOffData.reason} onChange={e => setTimeOffData(p => ({ ...p, reason: e.target.value }))} placeholder="PTO, Sick, Training..." /></div>
              </div>

              {/* Half-day / Time range (optional) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label>Start Time <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Select value={timeOffData.startTime} onValueChange={v => setTimeOffData(p => ({ ...p, startTime: v }))}>
                    <SelectTrigger><SelectValue placeholder="Full day" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Full Day</SelectItem>
                      <SelectItem value="6:00 AM">6:00 AM</SelectItem>
                      <SelectItem value="7:00 AM">7:00 AM</SelectItem>
                      <SelectItem value="8:00 AM">8:00 AM</SelectItem>
                      <SelectItem value="9:00 AM">9:00 AM</SelectItem>
                      <SelectItem value="10:00 AM">10:00 AM</SelectItem>
                      <SelectItem value="11:00 AM">11:00 AM</SelectItem>
                      <SelectItem value="12:00 PM">12:00 PM</SelectItem>
                      <SelectItem value="1:00 PM">1:00 PM</SelectItem>
                      <SelectItem value="2:00 PM">2:00 PM</SelectItem>
                      <SelectItem value="3:00 PM">3:00 PM</SelectItem>
                      <SelectItem value="4:00 PM">4:00 PM</SelectItem>
                      <SelectItem value="5:00 PM">5:00 PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>End Time <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Select value={timeOffData.endTime} onValueChange={v => setTimeOffData(p => ({ ...p, endTime: v }))}>
                    <SelectTrigger><SelectValue placeholder="Full day" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Full Day</SelectItem>
                      <SelectItem value="12:00 PM">12:00 PM (Morning off)</SelectItem>
                      <SelectItem value="1:00 PM">1:00 PM</SelectItem>
                      <SelectItem value="2:00 PM">2:00 PM</SelectItem>
                      <SelectItem value="3:00 PM">3:00 PM</SelectItem>
                      <SelectItem value="4:00 PM">4:00 PM</SelectItem>
                      <SelectItem value="5:00 PM">5:00 PM</SelectItem>
                      <SelectItem value="6:00 PM">6:00 PM</SelectItem>
                      <SelectItem value="8:00 PM">8:00 PM (Full PM off)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex items-end gap-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="recurring-block" checked={timeOffData.recurring}
                      onChange={e => setTimeOffData(p => ({ ...p, recurring: e.target.checked }))}
                      className="rounded border-gray-300" />
                    <label htmlFor="recurring-block" className="text-sm font-medium">Recurring weekly</label>
                  </div>
                  {timeOffData.recurring && (
                    <Select value={timeOffData.recurringDay} onValueChange={v => setTimeOffData(p => ({ ...p, recurringDay: v }))}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Which day?" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Every Monday</SelectItem>
                        <SelectItem value="tuesday">Every Tuesday</SelectItem>
                        <SelectItem value="wednesday">Every Wednesday</SelectItem>
                        <SelectItem value="thursday">Every Thursday</SelectItem>
                        <SelectItem value="friday">Every Friday</SelectItem>
                        <SelectItem value="saturday">Every Saturday</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <Button size="sm" onClick={handleBlockTime} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
                <CalendarOff className="h-4 w-4 mr-1" /> Block Time
              </Button>

              {/* Existing Time Blocks */}
              {timeBlocks.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <p className="text-sm font-semibold mb-2">Blocked Dates</p>
                  <div className="space-y-2">
                    {timeBlocks.map((block: any) => (
                      <div key={block.id} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                        <div>
                          <p className="font-medium text-red-800">
                            {new Date(block.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {block.start_date !== block.end_date && ` — ${new Date(block.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                            {block.start_time && block.end_time && ` (${block.start_time} - ${block.end_time})`}
                            {block.start_time && !block.end_time && ` (from ${block.start_time})`}
                            {!block.start_time && block.end_time && ` (until ${block.end_time})`}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-red-600">{block.reason || 'Blocked'}</p>
                            {block.recurring && <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full">🔁 {block.recurring_day}</span>}
                            {block.block_type === 'office_closure' && <span className="text-[10px] bg-red-300 text-red-900 px-1.5 py-0.5 rounded-full">Office Closed</span>}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="text-red-500 h-7" onClick={() => handleDeleteBlock(block.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
