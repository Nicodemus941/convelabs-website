
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, XCircle, Loader2, Download, FileText } from "lucide-react";

const AppointmentHistory = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      let results: any[] = [];

      const { data: byId } = await supabase.from('appointments').select('*')
        .eq('patient_id', user.id)
        .in('status', ['completed', 'specimen_delivered', 'cancelled'])
        .order('appointment_date', { ascending: false }).limit(20);
      if (byId) results = [...byId];

      if (user.email) {
        const { data: byEmail } = await supabase.from('appointments').select('*')
          .ilike('patient_email', user.email)
          .in('status', ['completed', 'specimen_delivered', 'cancelled'])
          .order('appointment_date', { ascending: false }).limit(20);
        if (byEmail) {
          const ids = new Set(results.map(a => a.id));
          results = [...results, ...byEmail.filter(a => !ids.has(a.id))];
        }
      }

      results.sort((a, b) => new Date(b.appointment_date || 0).getTime() - new Date(a.appointment_date || 0).getTime());
      setAppointments(results);
      setLoading(false);
    };
    fetch();
  }, [user?.id]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" /></div>;
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-6">
        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No past appointments</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {appointments.map(a => {
        const dateStr = a.appointment_date?.substring(0, 10) || '';
        const isCancelled = a.status === 'cancelled';
        const StatusIcon = isCancelled ? XCircle : CheckCircle2;
        const statusColor = isCancelled ? 'text-red-500' : 'text-green-500';

        return (
          <Card key={a.id} className={`shadow-sm ${isCancelled ? 'opacity-60' : ''}`}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <StatusIcon className={`h-5 w-5 flex-shrink-0 ${statusColor}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.service_name || a.service_type?.replace(/_|-/g, ' ') || 'Blood Draw'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {a.total_amount > 0 && !isCancelled && <span className="text-xs font-medium">${a.total_amount}</span>}
                {a.payment_status === 'completed' && !isCancelled && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-[#B91C1C]"
                    onClick={() => {
                      const html = `<!DOCTYPE html><html><head><title>Receipt</title><style>body{font-family:Arial;max-width:500px;margin:40px auto;padding:20px}h1{color:#B91C1C;font-size:22px;margin:0}.r{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px}hr{border-color:#B91C1C;margin:16px 0}.t{font-size:16px;color:#B91C1C;font-weight:700}.f{text-align:center;margin-top:24px;font-size:10px;color:#999}</style></head><body><h1>ConveLabs.</h1><p style="color:#666;font-size:12px">Receipt</p><hr><div class="r"><span>Date</span><span>${dateStr}</span></div><div class="r"><span>Service</span><span>${a.service_name||a.service_type||'Blood Draw'}</span></div><hr><div class="r"><span><b>Total</b></span><span class="t">$${Number(a.total_amount).toFixed(2)}</span></div><div class="r"><span>Status</span><span style="color:green">Paid</span></div><div class="f"><p>ConveLabs | (941) 527-9169</p></div><script>window.print()</script></body></html>`;
                      const w = window.open('', '_blank');
                      if (w) { w.document.write(html); w.document.close(); }
                    }}>
                    <Download className="h-3 w-3 mr-0.5" /> Receipt
                  </Button>
                )}
                <Badge variant="outline" className={`text-[10px] ${isCancelled ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`}>
                  {isCancelled ? 'Cancelled' : 'Completed'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default AppointmentHistory;
