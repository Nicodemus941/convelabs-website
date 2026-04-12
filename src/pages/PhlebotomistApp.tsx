import React, { useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { RefreshCw, LogOut } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import AppointmentCard from '@/components/phleb-app/AppointmentCard';
import { toast } from 'sonner';

interface PhlebAppointment {
  id: string;
  patient_name?: string;
  patient_email?: string;
  patient_phone?: string;
  address?: string;
  appointment_date?: string;
  appointment_time?: string;
  service_name?: string;
  service_type?: string;
  status: string;
  notes?: string;
  lab_order_file_path?: string;
}

const PhlebotomistApp: React.FC = () => {
  const { user, logout } = useAuth();
  const [appointments, setAppointments] = useState<PhlebAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const phlebotomistName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : 'Your Phlebotomist';

  const fetchTodayAppointments = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    // Get staff profile for current user
    const { data: staffProfile } = await supabase
      .from('staff_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!staffProfile) {
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('phlebotomist_id', staffProfile.id)
      .gte('appointment_date', startOfDay)
      .lt('appointment_date', endOfDay)
      .order('appointment_time', { ascending: true });

    if (error) {
      console.error('Error fetching appointments:', error);
      toast.error('Failed to load appointments');
    } else {
      setAppointments(data || []);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTodayAppointments();
  }, [fetchTodayAppointments]);

  // Subscribe to realtime updates for new appointments
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('phleb-appointments')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
      }, () => {
        fetchTodayAppointments();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchTodayAppointments]);

  const activeAppointments = appointments.filter(a => a.status !== 'completed');
  const completedAppointments = appointments.filter(a => a.status === 'completed');

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Please sign in</h2>
          <Button onClick={() => window.location.href = '/login'}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>ConveLabs Field App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Helmet>

      <div className="min-h-screen bg-background pb-safe">
        {/* Header */}
        <div className="bg-conve-red text-white p-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="font-bold">ConveLabs</h1>
            <p className="text-xs opacity-90">{phlebotomistName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={fetchTodayAppointments}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Date header */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="font-medium">
              {activeAppointments.length} appointment{activeAppointments.length !== 1 ? 's' : ''} today
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeAppointments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No active appointments for today.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeAppointments.map((appt) => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  phlebotomistName={phlebotomistName}
                  onStatusChange={fetchTodayAppointments}
                />
              ))}
            </div>
          )}

          {/* Completed section */}
          {completedAppointments.length > 0 && (
            <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
              <CollapsibleTrigger className="w-full text-center py-2 text-sm text-muted-foreground hover:text-foreground">
                {showCompleted ? 'Hide' : 'Show'} completed ({completedAppointments.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-2">
                {completedAppointments.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    phlebotomistName={phlebotomistName}
                    onStatusChange={fetchTodayAppointments}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </>
  );
};

export default PhlebotomistApp;
