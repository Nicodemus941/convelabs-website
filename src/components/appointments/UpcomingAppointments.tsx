
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarClock, MapPin, Clock, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
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

  // ── Cancellation policy: 24h+ = free, <24h = 50% fee, <2h = no cancel ──
  const getCancelPolicy = (appt: any) => {
    const dateStr = (appt.appointment_date || '').substring(0, 10);
    const timeStr = appt.appointment_time || '12:00:00';
    const apptMs = new Date(`${dateStr}T${timeStr}Z`).getTime();
    const hoursUntil = (apptMs - Date.now()) / (1000 * 60 * 60);

    if (hoursUntil < 2) return { allowed: false, fee: 0, label: 'Too late to cancel (less than 2 hours away). Please call (941) 527-9169.' };
    if (hoursUntil < 24) return { allowed: true, fee: 0.5, label: 'Less than 24 hours notice — a 50% cancellation fee applies.' };
    return { allowed: true, fee: 0, label: 'Free cancellation (24+ hours notice).' };
  };

  const handleCancel = async (id: string) => {
    const appt = appointments.find(a => a.id === id);
    if (!appt) return;

    const policy = getCancelPolicy(appt);
    if (!policy.allowed) { toast.error(policy.label); return; }

    const updateData: any = {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: policy.fee > 0 ? 'Patient cancelled (<24h notice, 50% fee)' : 'Patient cancelled (free)',
    };

    const { error } = await supabase.from('appointments').update(updateData).eq('id', id);
    if (error) { toast.error('Failed to cancel'); return; }

    if (policy.fee > 0 && appt.total_amount > 0) {
      toast.success(`Appointment cancelled. A 50% fee ($${(appt.total_amount * 0.5).toFixed(2)}) applies.`);
    } else {
      toast.success('Appointment cancelled — no fee applied.');
    }
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

              {a.status === 'scheduled' && (() => {
                const policy = getCancelPolicy(a);
                return (
                  <div className="mt-3 pt-2 border-t flex justify-end gap-2">
                    <Button variant="outline" size="sm" className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50" asChild>
                      <a href="/book-now"><RefreshCw className="h-3 w-3 mr-1" />Reschedule</a>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs text-red-600 border-red-200 hover:bg-red-50">Cancel</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="w-[90vw] max-w-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
                          <AlertDialogDescription className="space-y-2">
                            <span className="block">This cannot be undone.</span>
                            {policy.fee > 0 && a.total_amount > 0 ? (
                              <span className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <span>{policy.label} A fee of <strong>${(a.total_amount * 0.5).toFixed(2)}</strong> will be charged.</span>
                              </span>
                            ) : !policy.allowed ? (
                              <span className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <span>{policy.label}</span>
                              </span>
                            ) : (
                              <span className="block text-xs text-green-700">{policy.label}</span>
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep</AlertDialogCancel>
                          {policy.allowed && (
                            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleCancel(a.id)}>Cancel Appointment</AlertDialogAction>
                          )}
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default UpcomingAppointments;
