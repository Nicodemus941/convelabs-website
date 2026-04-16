import React, { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addDays } from 'date-fns';
import { Clock, MapPin, User, Phone, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time?: string;
  address: string;
  zipcode: string;
  status: string;
  notes?: string;
  patient_id: string;
  phlebotomist_id?: string;
  duration_minutes?: number;
  // Profile data
  patient_name?: string;
  patient_phone?: string;
  patient_email?: string;
  phlebotomist_name?: string;
}

interface CalendarViewProps {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  showAppointments?: boolean;
  viewMode?: 'calendar' | 'list';
  filterByPhlebotomist?: string;
  filterByStatus?: string[];
}

const CalendarView: React.FC<CalendarViewProps> = ({
  selectedDate = new Date(),
  onDateSelect,
  showAppointments = true,
  viewMode = 'calendar',
  filterByPhlebotomist,
  filterByStatus = ['scheduled', 'in_progress']
}) => {
  const [currentDate, setCurrentDate] = useState(selectedDate);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(selectedDate);

  // Fetch appointments for the current month
  const { data: appointments, isLoading, refetch } = useQuery({
    queryKey: ['calendar-appointments', currentDate, filterByPhlebotomist, filterByStatus],
    queryFn: async () => {
      const startDate = startOfMonth(currentDate);
      const endDate = endOfMonth(currentDate);

      let query = supabase
        .from('appointments')
        .select('*')
        .gte('appointment_date', startDate.toISOString())
        .lte('appointment_date', endDate.toISOString())
        .in('status', filterByStatus)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

      if (filterByPhlebotomist) {
        query = query.eq('phlebotomist_id', filterByPhlebotomist);
      }

      const { data: appointmentsData, error } = await query;
      
      if (error) {
        console.error('Error fetching appointments:', error);
        throw error;
      }

      if (!appointmentsData) return [];

      // Get unique patient and phlebotomist IDs
      const patientIds = [...new Set(appointmentsData.map(apt => apt.patient_id))];
      const phlebotomistIds = [...new Set(appointmentsData.map(apt => apt.phlebotomist_id).filter(Boolean))];

      // Fetch patient profiles
      const { data: patientProfiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, phone')
        .in('id', patientIds);

      // Fetch phlebotomist profiles  
      const { data: phlebotomistProfiles } = await supabase
        .from('staff_profiles')
        .select('id, user_id')
        .in('id', phlebotomistIds);

      // Transform the data to include names
      return appointmentsData.map(apt => {
        const patientProfile = patientProfiles?.find(p => p.id === apt.patient_id);
        const phlebotomistProfile = phlebotomistProfiles?.find(p => p.id === apt.phlebotomist_id);

        return {
          ...apt,
          patient_name: patientProfile?.full_name || 'Unknown Patient',
          patient_phone: patientProfile?.phone,
          phlebotomist_name: phlebotomistProfile ? 'Assigned Phlebotomist' : 'Unassigned'
        };
      });
    },
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });

  // Get appointments for selected day
  const selectedDayAppointments = (appointments?.filter(apt =>
    isSameDay(new Date(apt.appointment_date), selectedDay || new Date())
  ) || []).sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''));

  // Get appointment counts per day
  const appointmentCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    appointments?.forEach(apt => {
      const dateKey = format(new Date(apt.appointment_date), 'yyyy-MM-dd');
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    });
    return counts;
  }, [appointments]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDay(date);
      onDateSelect?.(date);
    }
  };

  const formatTime = (appointmentDate: string, appointmentTime?: string) => {
    if (appointmentTime) {
      return appointmentTime;
    }
    return format(new Date(appointmentDate), 'h:mm a');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (viewMode === 'list') {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Appointment List</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4">Loading appointments...</div>
            ) : appointments?.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No appointments found for this period
              </div>
            ) : (
              <div className="space-y-3">
                {appointments?.map(apt => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{apt.patient_name}</span>
                        <Badge className={getStatusColor(apt.status)}>
                          {apt.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(apt.appointment_date), 'MMM d, yyyy')} at {formatTime(apt.appointment_date, apt.appointment_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {apt.address} ({apt.zipcode})
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{apt.phlebotomist_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {apt.duration_minutes || 30} mins
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDay}
              onSelect={handleDateSelect}
              month={currentDate}
              onMonthChange={setCurrentDate}
              className="rounded-md border-0"
              modifiers={{
                hasAppointments: (date) => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  return appointmentCounts[dateKey] > 0;
                }
              }}
              modifiersStyles={{
                hasAppointments: {
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  fontWeight: 'bold'
                }
              }}
              components={{
                DayContent: ({ date, ...props }) => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  const count = appointmentCounts[dateKey];
                  
                  return (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <span>{format(date, 'd')}</span>
                      {count > 0 && (
                        <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                          {count}
                        </div>
                      )}
                    </div>
                  );
                }
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Daily Schedule */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedDay ? format(selectedDay, 'MMMM d, yyyy') : 'Select a Date'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDay ? (
              <div className="space-y-3">
                {selectedDayAppointments.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    No appointments scheduled
                  </div>
                ) : (
                  selectedDayAppointments.map(apt => (
                    <div
                      key={apt.id}
                      className="p-3 border rounded-lg space-y-2 hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {formatTime(apt.appointment_date, apt.appointment_time)}
                          </span>
                        </div>
                        <Badge className={getStatusColor(apt.status)}>
                          {apt.status}
                        </Badge>
                      </div>
                      
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span>{apt.patient_name}</span>
                        </div>
                        
                        {apt.patient_phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{apt.patient_phone}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">{apt.address}</span>
                        </div>
                        
                        {apt.notes && (
                          <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                            {apt.notes}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" className="flex-1">
                          View Details
                        </Button>
                        {apt.status === 'scheduled' && (
                          <Button size="sm" variant="outline">
                            Reschedule
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                Click on a date to view appointments
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarView;