import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Users, Search, RefreshCw, Download, Phone, Mail, User,
  Calendar, Shield, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

interface PatientRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  insurance_provider: string | null;
  insurance_member_id: string | null;
  created_at: string;
  is_active: boolean;
  appointment_count: number;
}

const UserManagementTab = () => {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'with_phone' | 'with_email' | 'with_insurance'>('all');

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenant_patients')
        .select('*')
        .order('first_name', { ascending: true });

      if (error) throw error;

      // Get appointment counts per patient
      const { data: apptCounts } = await supabase
        .from('appointments')
        .select('patient_id')
        .not('status', 'eq', 'cancelled');

      const countMap = new Map<string, number>();
      (apptCounts || []).forEach((a: any) => {
        if (a.patient_id) countMap.set(a.patient_id, (countMap.get(a.patient_id) || 0) + 1);
      });

      const mapped: PatientRecord[] = (data || []).map((p: any) => ({
        id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        email: p.email,
        phone: p.phone,
        date_of_birth: p.date_of_birth,
        insurance_provider: p.insurance_provider,
        insurance_member_id: p.insurance_member_id,
        created_at: p.created_at,
        is_active: p.is_active !== false,
        appointment_count: countMap.get(p.id) || 0,
      }));

      setPatients(mapped);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
      toast.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const filtered = patients.filter(p => {
    if (filterType === 'with_phone' && !p.phone) return false;
    if (filterType === 'with_email' && !p.email) return false;
    if (filterType === 'with_insurance' && !p.insurance_provider) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
           (p.email && p.email.toLowerCase().includes(q)) ||
           (p.phone && p.phone.includes(q));
  });

  const stats = {
    total: patients.length,
    withPhone: patients.filter(p => p.phone).length,
    withEmail: patients.filter(p => p.email).length,
    withInsurance: patients.filter(p => p.insurance_provider).length,
    withAppointments: patients.filter(p => p.appointment_count > 0).length,
  };

  const handleSendPasswordReset = async (email: string | null) => {
    if (!email) { toast.error('No email on file'); return; }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Password reset sent to ${email}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reset');
    }
  };

  const exportCSV = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'DOB', 'Insurance', 'Appointments', 'Active'];
    const rows = filtered.map(p => [
      p.first_name, p.last_name, p.email || '', p.phone || '',
      p.date_of_birth || '', p.insurance_provider || '', p.appointment_count, p.is_active ? 'Yes' : 'No',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `convelabs-patients-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    toast.success('Patients exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-[#B91C1C]" /> Patient Management
          </h1>
          <p className="text-sm text-muted-foreground">{patients.length} patients in system</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={fetchPatients} className="gap-1">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-[#B91C1C]' },
          { label: 'With Phone', value: stats.withPhone, color: 'text-blue-600' },
          { label: 'With Email', value: stats.withEmail, color: 'text-emerald-600' },
          { label: 'With Insurance', value: stats.withInsurance, color: 'text-purple-600' },
          { label: 'With Appointments', value: stats.withAppointments, color: 'text-amber-600' },
        ].map(s => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + Search */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-2">
              {([
                ['all', `All (${stats.total})`],
                ['with_phone', `Phone (${stats.withPhone})`],
                ['with_email', `Email (${stats.withEmail})`],
                ['with_insurance', `Insurance (${stats.withInsurance})`],
              ] as const).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filterType === key ? 'default' : 'outline'}
                  className={`text-xs h-8 ${filterType === key ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                  onClick={() => setFilterType(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2 text-muted-foreground" />
              <Input
                placeholder="Search name, email, or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 w-56 text-xs"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-3">Showing {filtered.length} of {patients.length} patients</p>

          {loading ? (
            <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-muted/50 animate-pulse rounded" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold">No patients found</p>
              <p className="text-sm text-muted-foreground">{searchQuery ? 'Try a different search.' : 'No patients match the filter.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead>Appts</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 100).map(p => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setSelectedPatient(selectedPatient?.id === p.id ? null : p)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#B91C1C]/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-[#B91C1C]" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{p.first_name} {p.last_name}</p>
                            {p.date_of_birth && <p className="text-[10px] text-muted-foreground">DOB: {p.date_of_birth}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{p.email || <span className="text-muted-foreground text-xs">No email</span>}</TableCell>
                      <TableCell className="text-sm">{p.phone || <span className="text-muted-foreground text-xs">No phone</span>}</TableCell>
                      <TableCell>
                        {p.insurance_provider ? (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">{p.insurance_provider}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Self-pay</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{p.appointment_count}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {p.phone && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.open(`sms:${p.phone}`)}>
                              <Phone className="h-3 w-3" />
                            </Button>
                          )}
                          {p.email && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.open(`mailto:${p.email}`)}>
                              <Mail className="h-3 w-3" />
                            </Button>
                          )}
                          {p.email && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSendPasswordReset(p.email)}>
                              Reset PW
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > 100 && (
                <p className="text-xs text-muted-foreground text-center mt-3">Showing first 100 of {filtered.length} results. Use search to narrow down.</p>
              )}
            </div>
          )}

          {/* Expanded patient detail */}
          {selectedPatient && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg border space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-sm">Patient Details</h4>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>Close</Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><span className="text-muted-foreground">Name:</span><p className="font-medium">{selectedPatient.first_name} {selectedPatient.last_name}</p></div>
                <div><span className="text-muted-foreground">Email:</span><p>{selectedPatient.email || '—'}</p></div>
                <div><span className="text-muted-foreground">Phone:</span><p>{selectedPatient.phone || '—'}</p></div>
                <div><span className="text-muted-foreground">DOB:</span><p>{selectedPatient.date_of_birth || '—'}</p></div>
                <div><span className="text-muted-foreground">Insurance:</span><p>{selectedPatient.insurance_provider || 'Self-pay'}</p></div>
                <div><span className="text-muted-foreground">Member ID:</span><p>{selectedPatient.insurance_member_id || '—'}</p></div>
                <div><span className="text-muted-foreground">Appointments:</span><p className="font-medium">{selectedPatient.appointment_count}</p></div>
                <div><span className="text-muted-foreground">Patient ID:</span><p className="font-mono text-[10px]">{selectedPatient.id}</p></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserManagementTab;
