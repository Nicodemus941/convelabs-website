
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const StaffManagementTab = () => {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStaff(data || []);
    } catch (err) {
      console.error('Failed to fetch staff:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Staff Management</h2>
          <p className="text-muted-foreground">Manage phlebotomists and staff members</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStaff}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading staff...</div>
          ) : staff.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No staff members found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Specialty</TableHead>
                  <TableHead>Pay Rate</TableHead>
                  <TableHead>Premium Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.user_id?.substring(0, 8)}...</TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.specialty || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell>${s.pay_rate}/patient</TableCell>
                    <TableCell>{s.premium_pay_rate ? `$${s.premium_pay_rate}/specialty` : '—'}</TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffManagementTab;
