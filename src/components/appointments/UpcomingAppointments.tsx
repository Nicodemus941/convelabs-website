
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarClock, MapPin, Clock, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";

const UpcomingAppointments = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      let results: any[] = [];

      // Fetch by patient_id
      const { data: byId } = await supabase.from('appointments').select('*')
        .eq('patient_id', user.id)
        .in('status', ['scheduled', 'confirmed', 'en_route'])
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });
      if (byId) results = [...byId];

      // Also by email
      if (user.email) {
        const { data: byEmail } = await supabase.from('appointments').select('*')
          .ilike('patient_email', user.email)
          .in('status', ['scheduled', 'confirmed', 'en_route'])
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true });
        if (byEmail) {
          const ids = new Set(results.map(a => a.id));
          results = [...results, ...byEmail.filter(a => !ids.has(a.id))];
        }
      }

      setAppointments(results);
      setLoading(false);
    };
    fetch();
  }, [user?.id]);

  const handleCancel = async (id: string) => {
    const { error } = await supabase.from('appointments').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Failed to cancel'); return; }
    toast.success('Appointment cancelled');
    setAppointments(prev => prev.filter(a => a.id !== id));
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" /></div>;
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-6">
        <CalendarClock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No upcoming appointments</p>
        <Button variant="outline" className="mt-3" asChild>
          <a href="/book-now">Book An Appointment</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {appointments.map(a => {
        const dateStr = a.appointment_date?.substring(0, 10) || '';
        const timeStr = a.appointment_time || '';
        let displayTime = timeStr;
        if (timeStr && !timeStr.includes('AM') && !timeStr.includes('PM')) {
          const [h, m] = timeStr.split(':').map(Number);
          const p = h >= 12 ? 'PM' : 'AM';
          const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
          displayTime = `${h12}:${String(m).padStart(2,'0')} ${p}`;
        }

        return (
          <Card key={a.id} className="overflow-hidden">
            <div className={`h-1.5 ${a.status === 'confirmed' ? 'bg-green-500' : a.status === 'en_route' ? 'bg-orange-500' : 'bg-blue-500'}`} />
            <CardContent className="p-3 sm:p-4">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm sm:text-base">
                    {dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date TBD'}
                  </p>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mt-0.5">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{displayTime || 'Time TBD'}</span>
                  </div>
                  {a.address && a.address !== 'TBD' && (
                    <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{a.address}</span>
                    </div>
                  )}
                  {(a.service_name || a.service_type) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.service_name || a.service_type?.replace(/_|-/g, ' ')}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${
                  a.status === 'confirmed' ? 'bg-green-50 text-green-700 border-green-200' :
                  a.status === 'en_route' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                  'bg-blue-50 text-blue-700 border-blue-200'
                }`}>{a.status === 'en_route' ? 'En Route' : a.status}</Badge>
              </div>

              {a.status === 'scheduled' && (
                <div className="mt-3 pt-2 border-t flex justify-end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-xs text-red-600 border-red-200 hover:bg-red-50">Cancel</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="w-[90vw] max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleCancel(a.id)}>Cancel Appointment</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default UpcomingAppointments;
