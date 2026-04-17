import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Package, Search, RefreshCw, Download, FlaskConical, Truck } from 'lucide-react';
import { toast } from 'sonner';

interface Specimen {
  id: string;
  appointment_id: string;
  patient_name: string;
  specimen_id: string;
  lab_name: string;
  lab_address: string | null;
  delivered_by: string;
  delivered_at: string;
  tube_count: number;
  tube_types: string | null;
  service_type: string;
  delivery_notes: string | null;
  status: string;
}

const SpecimenTrackingTab: React.FC = () => {
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSpecimens = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('specimen_deliveries' as any)
        .select('*')
        .order('delivered_at', { ascending: false });
      if (error) throw error;
      setSpecimens((data as unknown as Specimen[]) || []);
    } catch (err) {
      console.error('Failed to fetch specimens:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSpecimens(); }, [fetchSpecimens]);

  const filtered = specimens.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (s.patient_name?.toLowerCase().includes(q)) ||
           (s.specimen_id?.toLowerCase().includes(q)) ||
           (s.lab_name?.toLowerCase().includes(q));
  });

  const stats = {
    total: specimens.length,
    today: specimens.filter(s => s.delivered_at?.substring(0, 10) === new Date().toISOString().substring(0, 10)).length,
    totalTubes: specimens.reduce((sum, s) => sum + (s.tube_count || 0), 0),
    labs: new Set(specimens.map(s => s.lab_name)).size,
  };

  const exportCSV = () => {
    const headers = ['Specimen ID', 'Patient', 'Lab', 'Tubes', 'Tube Types', 'Delivered At', 'Delivered By', 'Notes'];
    const rows = filtered.map(s => [
      s.specimen_id, s.patient_name, s.lab_name, s.tube_count,
      s.tube_types || '', s.delivered_at || '', s.delivered_by, s.delivery_notes || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `convelabs-specimens-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    toast.success('Specimens exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-[#B91C1C]" /> Specimen Tracking
          </h1>
          <p className="text-sm text-muted-foreground">Track all specimen deliveries and lab submissions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1"><Download className="h-4 w-4" /> Export</Button>
          <Button variant="outline" size="sm" onClick={fetchSpecimens} className="gap-1"><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-[#B91C1C]">{stats.total}</p><p className="text-[10px] text-muted-foreground">Total Specimens</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-blue-600">{stats.today}</p><p className="text-[10px] text-muted-foreground">Delivered Today</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-600">{stats.totalTubes}</p><p className="text-[10px] text-muted-foreground">Total Tubes</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-purple-600">{stats.labs}</p><p className="text-[10px] text-muted-foreground">Labs Used</p></CardContent></Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Delivery Log</CardTitle>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2 text-muted-foreground" />
              <Input placeholder="Search specimen ID, patient, or lab..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 w-56 text-xs" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted/50 animate-pulse rounded" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-800">No specimens recorded</p>
              <p className="text-sm text-muted-foreground">Specimen deliveries will appear here when phlebotomists confirm delivery.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Specimen ID</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Lab</TableHead>
                    <TableHead>Tubes</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono font-medium text-sm">{s.specimen_id}</TableCell>
                      <TableCell className="text-sm">{s.patient_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{s.lab_name}</Badge></TableCell>
                      <TableCell className="text-sm">{s.tube_count}{s.tube_types ? ` (${s.tube_types})` : ''}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.delivered_at ? format(new Date(s.delivered_at), 'MMM d, h:mm a') : '—'}</TableCell>
                      <TableCell className="text-xs">{s.delivered_by}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{s.delivery_notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SpecimenTrackingTab;
