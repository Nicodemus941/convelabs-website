
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare, Send } from 'lucide-react';

// Define a type for appointment with nested user profile
type AppointmentWithProfile = {
  id: string;
  appointment_date: string;
  address: string;
  zipcode?: string;
  notes: string;
  status: string;
  patient_id: string;
  user_profiles: {
    id: string;
    full_name: string | null;
    phone: string | null;
  } | null;
};

const SMSAppointmentDashboard: React.FC = () => {
  const [isSendingReminders, setSendingReminders] = useState(false);
  
  // Fetch recent appointments made via SMS
  const { data: smsAppointments, isLoading, error, refetch } = useQuery({
    queryKey: ['smsAppointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, 
          appointment_date, 
          address, 
          zipcode,
          notes, 
          status,
          patient_id,
          user_profiles:patient_id(id, full_name, phone)
        `)
        .ilike('notes', '%Booked via SMS%')
        .order('appointment_date', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      
      // Transform the data to match our expected type
      const transformedData = data.map((item: any) => ({
        ...item,
        user_profiles: item.user_profiles || null
      }));
      
      return transformedData as AppointmentWithProfile[];
    }
  });
  
  // Function to send appointment reminders manually
  const handleSendReminders = async () => {
    setSendingReminders(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-appointment-reminders');
      
      if (error) throw error;
      
      toast.success(`Sent ${data.processed} appointment reminders`);
      refetch();
    } catch (error) {
      console.error('Error sending reminders:', error);
      toast.error('Failed to send appointment reminders');
    } finally {
      setSendingReminders(false);
    }
  };
  
  // Format date for display
  const formatAppointmentDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">SMS Appointment Dashboard</CardTitle>
            <CardDescription>Monitor and manage appointments booked through SMS</CardDescription>
          </div>
          <Button
            onClick={handleSendReminders}
            disabled={isSendingReminders}
            className="flex items-center gap-2"
          >
            {isSendingReminders ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="h-4 w-4" /> Send Reminders</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500">
            Error loading SMS appointments
          </div>
        ) : smsAppointments && smsAppointments.length > 0 ? (
          <div className="space-y-4">
            {smsAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className="flex flex-col md:flex-row justify-between border rounded-lg p-4 gap-4"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">
                      {appointment.user_profiles?.full_name || 'SMS Patient'}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatAppointmentDate(appointment.appointment_date)}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Address:</span> {appointment.address}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Phone:</span> {appointment.user_profiles?.phone || 'Unknown'}
                  </div>
                </div>
                <div className="flex flex-col md:items-end justify-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    appointment.status === 'scheduled' ? 'bg-green-100 text-green-800' :
                    appointment.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {appointment.status}
                  </span>
                  <div className="text-sm">
                    {appointment.notes.split('\n').map((note, i) => (
                      <div key={i}>{note}</div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No SMS appointments found
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SMSAppointmentDashboard;
