import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { Clock, Users, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface AvailabilityData {
  date: string;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  utilizationRate: number;
  phlebotomistCount: number;
}

interface AvailabilityHeatmapProps {
  zipCode?: string;
  weeksToShow?: number;
  className?: string;
}

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({
  zipCode,
  weeksToShow = 2,
  className
}) => {
  const startDate = startOfWeek(new Date());

  // Fetch availability data for the next few weeks
  const { data: availabilityData, isLoading } = useQuery({
    queryKey: ['availability-heatmap', zipCode, weeksToShow],
    queryFn: async () => {
      const dates: AvailabilityData[] = [];
      
      for (let week = 0; week < weeksToShow; week++) {
        for (let day = 0; day < 7; day++) {
          const currentDate = addDays(startDate, week * 7 + day);
          const dateStr = format(currentDate, 'yyyy-MM-dd');
          
          // Skip past dates
          if (currentDate < new Date()) continue;
          
          try {
            // Get appointments for this date
            const { data: appointments } = await supabase
              .from('appointments')
              .select('status, phlebotomist_id')
              .gte('appointment_date', dateStr)
              .lt('appointment_date', format(addDays(currentDate, 1), 'yyyy-MM-dd'));
            
            // Get available phlebotomists for sample time slots
            const sampleTimes = ['09:00', '12:00', '15:00'];
            const availabilityPromises = sampleTimes.map(time =>
              zipCode ? supabase.rpc('get_available_phlebotomists_for_slot', {
                p_zipcode: zipCode,
                p_date: dateStr,
                p_start_time: time,
                p_duration_minutes: 30
              }) : Promise.resolve({ data: [] })
            );
            
            const availabilityResults = await Promise.all(availabilityPromises);
            
            // Calculate metrics
            const totalSlots = sampleTimes.length * 4; // Assume 4 time slots per sample
            const bookedSlots = appointments?.length || 0;
            const avgPhlebotomists = availabilityResults.reduce((sum, result) => 
              sum + (result.data?.length || 0), 0) / sampleTimes.length;
            const availableSlots = Math.max(0, totalSlots - bookedSlots);
            const utilizationRate = totalSlots > 0 ? (bookedSlots / totalSlots) * 100 : 0;
            
            dates.push({
              date: dateStr,
              totalSlots,
              bookedSlots,
              availableSlots,
              utilizationRate,
              phlebotomistCount: Math.round(avgPhlebotomists)
            });
          } catch (error) {
            console.error(`Error fetching data for ${dateStr}:`, error);
            dates.push({
              date: dateStr,
              totalSlots: 0,
              bookedSlots: 0,
              availableSlots: 0,
              utilizationRate: 0,
              phlebotomistCount: 0
            });
          }
        }
      }
      
      return dates;
    },
    enabled: !!zipCode,
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const getIntensityColor = (rate: number): string => {
    if (rate >= 90) return 'bg-red-500';
    if (rate >= 75) return 'bg-orange-500';
    if (rate >= 50) return 'bg-yellow-500';
    if (rate >= 25) return 'bg-green-500';
    return 'bg-gray-200';
  };

  const getAvailabilityStatus = (data: AvailabilityData): { 
    label: string; 
    color: string; 
    icon: React.ReactNode 
  } => {
    if (data.utilizationRate >= 90) {
      return {
        label: 'High Demand',
        color: 'bg-red-100 text-red-800',
        icon: <AlertTriangle className="h-3 w-3" />
      };
    }
    if (data.utilizationRate >= 75) {
      return {
        label: 'Busy',
        color: 'bg-orange-100 text-orange-800',
        icon: <Clock className="h-3 w-3" />
      };
    }
    if (data.utilizationRate >= 25) {
      return {
        label: 'Available',
        color: 'bg-green-100 text-green-800',
        icon: <Users className="h-3 w-3" />
      };
    }
    return {
      label: 'Low Demand',
      color: 'bg-gray-100 text-gray-800',
      icon: <Users className="h-3 w-3" />
    };
  };

  if (!zipCode) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2" />
            <p>Enter your zip code to view availability</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Availability Overview - {zipCode}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
        ) : availabilityData ? (
          <div className="space-y-4">
            {/* Heatmap Grid */}
            <div className="space-y-2">
              {Array.from({ length: weeksToShow }).map((_, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 7 }).map((_, dayIndex) => {
                    const dataIndex = weekIndex * 7 + dayIndex;
                    const dayData = availabilityData[dataIndex];
                    
                    if (!dayData) return <div key={dayIndex} />;
                    
                    const date = new Date(dayData.date);
                    const isToday = isSameDay(date, new Date());
                    const status = getAvailabilityStatus(dayData);
                    
                    return (
                      <div
                        key={dayIndex}
                        className={cn(
                          "relative p-2 rounded-lg border text-center cursor-pointer transition-colors hover:ring-2 hover:ring-primary/20",
                          getIntensityColor(dayData.utilizationRate),
                          isToday && "ring-2 ring-primary"
                        )}
                        title={`${format(date, 'MMM d')} - ${status.label} (${dayData.utilizationRate.toFixed(0)}% utilized)`}
                      >
                        <div className="text-xs font-medium text-white">
                          {format(date, 'EEE')}
                        </div>
                        <div className="text-lg font-bold text-white">
                          {format(date, 'd')}
                        </div>
                        <div className="text-xs text-white/80">
                          {dayData.availableSlots} slots
                        </div>
                        
                        {isToday && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            
            {/* Legend */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">Utilization:</span>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-200 rounded" />
                  <span>Low</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded" />
                  <span>Busy</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-500 rounded" />
                  <span>High</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded" />
                  <span>Full</span>
                </div>
              </div>
            </div>
            
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {availabilityData.reduce((sum, day) => sum + day.availableSlots, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Available Slots</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {(availabilityData.reduce((sum, day) => sum + day.utilizationRate, 0) / availabilityData.length).toFixed(0)}%
                </div>
                <div className="text-sm text-muted-foreground">Avg Utilization</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {Math.round(availabilityData.reduce((sum, day) => sum + day.phlebotomistCount, 0) / availabilityData.length)}
                </div>
                <div className="text-sm text-muted-foreground">Avg Staff</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-6">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Unable to load availability data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AvailabilityHeatmap;