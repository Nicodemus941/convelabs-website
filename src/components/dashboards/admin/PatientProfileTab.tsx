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
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

const PatientProfileTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
        {/* Back + Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{p.first_name} {p.last_name}</h1>
            <p className="text-sm text-muted-foreground">Patient Profile</p>
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

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="pl-10 h-11"
          />
        </div>
        <p className="text-sm text-muted-foreground">{patients.length} patient{patients.length !== 1 ? 's' : ''}</p>
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
    </div>
  );
};

export default PatientProfileTab;
