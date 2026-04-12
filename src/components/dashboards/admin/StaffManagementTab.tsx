
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, User, Mail, Phone, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface StaffMember {
  id: string;
  user_id: string;
  specialty: string | null;
  pay_rate: number;
  premium_pay_rate: number | null;
  bio: string | null;
  photo_url: string | null;
  created_at: string;
  // Resolved from user metadata
  name?: string;
  email?: string;
  role?: string;
}

const StaffManagementTab = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!profiles?.length) { setStaff([]); setLoading(false); return; }

      // Resolve user names from user_profiles table
      const userIds = profiles.map(p => p.user_id).filter(Boolean);
      const { data: userProfiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, phone')
        .in('id', userIds);

      const userMap: Record<string, any> = {};
      userProfiles?.forEach(u => { userMap[u.id] = u; });

      const enriched = profiles.map(p => ({
        ...p,
        name: userMap[p.user_id]?.full_name || p.bio || 'Staff Member',
        email: '',
        role: p.specialty || 'phlebotomist',
      }));

      setStaff(enriched);
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
        <Button variant="outline" size="sm" onClick={fetchStaff}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : staff.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No staff members found
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {staff.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-conve-red/10 flex items-center justify-center">
                      {s.photo_url ? (
                        <img src={s.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <User className="h-6 w-6 text-conve-red" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{s.name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant="outline" className="capitalize">{s.role}</Badge>
                        <span className="text-sm text-muted-foreground">
                          ${s.pay_rate}/patient
                          {s.premium_pay_rate ? ` · $${s.premium_pay_rate}/specialty` : ''}
                        </span>
                      </div>
                      {s.bio && (
                        <p className="text-sm text-muted-foreground mt-1">{s.bio}</p>
                      )}
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StaffManagementTab;
