import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import CalendarView from '@/components/calendar/CalendarView';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar as CalendarIcon, 
  List, 
  Plus, 
  Filter, 
  Download,
  RefreshCw,
  Users,
  Clock,
  MapPin,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns';

const Calendar = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [statusFilter, setStatusFilter] = useState<string[]>(['scheduled', 'in_progress']);
  const [phlebotomistFilter, setPhlebotomistFilter] = useState<string>('all');

  // Fetch phlebotomists for filter dropdown
  const { data: phlebotomists } = useQuery({
    queryKey: ['phlebotomists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('id, user_id, specialty')
        .eq('specialty', 'phlebotomist');

      if (error) throw error;

      // For now, just return basic phlebotomist info
      // In a real app, you'd want to fetch user names from a profiles table
      return data?.map(p => ({
        id: p.id,
        name: `Phlebotomist ${p.id.slice(0, 8)}`
      })) || [];
    }
  });

  // Fetch dashboard stats
  const { data: stats } = useQuery({
    queryKey: ['calendar-stats', selectedDate],
    queryFn: async () => {
      const weekStart = startOfWeek(selectedDate);
      const weekEnd = endOfWeek(selectedDate);

      const [appointmentsResult, todayResult] = await Promise.all([
        // Week's appointments
        supabase
          .from('appointments')
          .select('status, appointment_date')
          .gte('appointment_date', weekStart.toISOString())
          .lte('appointment_date', weekEnd.toISOString()),
        
        // Today's appointments
        supabase
          .from('appointments')
          .select('status')
          .gte('appointment_date', format(new Date(), 'yyyy-MM-dd'))
          .lt('appointment_date', format(addDays(new Date(), 1), 'yyyy-MM-dd'))
      ]);

      const weekAppointments = appointmentsResult.data || [];
      const todayAppointments = todayResult.data || [];

      return {
        weekTotal: weekAppointments.length,
        weekScheduled: weekAppointments.filter(apt => apt.status === 'scheduled').length,
        weekCompleted: weekAppointments.filter(apt => apt.status === 'completed').length,
        todayTotal: todayAppointments.length,
        todayScheduled: todayAppointments.filter(apt => apt.status === 'scheduled').length,
        todayInProgress: todayAppointments.filter(apt => apt.status === 'in_progress').length,
      };
    }
  });

  const handleRefresh = () => {
    // This will trigger a refetch of all queries
    window.location.reload();
  };

  const handleExport = () => {
    // TODO: Implement CSV export functionality
    console.log('Export appointments for', format(selectedDate, 'MMMM yyyy'));
  };

  return (
    <DashboardWrapper>
      <Helmet>
        <title>Calendar | ConveLabs Dashboard</title>
        <meta name="description" content="View and manage appointments, schedules, and availability" />
      </Helmet>

      <div className="container mx-auto py-6 px-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Calendar</h1>
            <p className="text-muted-foreground">
              Manage appointments and view schedules
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Appointment
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Today</p>
                    <p className="text-2xl font-bold">{stats.todayTotal}</p>
                  </div>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    {stats.todayScheduled} scheduled
                  </Badge>
                  <Badge variant="default" className="text-xs">
                    {stats.todayInProgress} active
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">This Week</p>
                    <p className="text-2xl font-bold">{stats.weekTotal}</p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    {stats.weekScheduled} scheduled
                  </Badge>
                  <Badge variant="default" className="text-xs">
                    {stats.weekCompleted} completed
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phlebotomists</p>
                    <p className="text-2xl font-bold">{phlebotomists?.length || 0}</p>
                  </div>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <Badge variant="outline" className="text-xs mt-2">
                  Active staff
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Coverage</p>
                    <p className="text-2xl font-bold">95%</p>
                  </div>
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </div>
                <Badge variant="outline" className="text-xs mt-2">
                  Service areas
                </Badge>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              
              <Select value={phlebotomistFilter} onValueChange={setPhlebotomistFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Phlebotomists" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Phlebotomists</SelectItem>
                  {phlebotomists?.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <span className="text-sm">Status:</span>
                {['scheduled', 'in_progress', 'completed', 'cancelled'].map(status => (
                  <Badge
                    key={status}
                    variant={statusFilter.includes(status) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      if (statusFilter.includes(status)) {
                        setStatusFilter(statusFilter.filter(s => s !== status));
                      } else {
                        setStatusFilter([...statusFilter, status]);
                      }
                    }}
                  >
                    {status}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar/List Toggle */}
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'calendar' | 'list')}>
          <TabsList>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Calendar View
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              List View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-6">
            <CalendarView
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              viewMode="calendar"
              filterByPhlebotomist={phlebotomistFilter === 'all' ? undefined : phlebotomistFilter}
              filterByStatus={statusFilter}
            />
          </TabsContent>

          <TabsContent value="list" className="mt-6">
            <CalendarView
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              viewMode="list"
              filterByPhlebotomist={phlebotomistFilter === 'all' ? undefined : phlebotomistFilter}
              filterByStatus={statusFilter}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardWrapper>
  );
};

export default Calendar;