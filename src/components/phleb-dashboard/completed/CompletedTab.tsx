import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { CheckCircle2, DollarSign, TrendingUp, Calendar, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { PhlebAppointment } from '@/hooks/usePhlebotomistAppointments';

interface CompletedTabProps {
  appointments: PhlebAppointment[];
}

const CompletedTab: React.FC<CompletedTabProps> = ({ appointments }) => {
  const [viewMonth, setViewMonth] = useState(new Date());

  const completed = useMemo(() => {
    return appointments
      .filter(a => a.status === 'completed')
      .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));
  }, [appointments]);

  // Stats
  const now = new Date();
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  const weekCompleted = completed.filter(a => a.appointment_date >= weekStart && a.appointment_date <= weekEnd);
  const monthCompleted = completed.filter(a => a.appointment_date >= monthStart && a.appointment_date <= monthEnd);

  const weekTips = weekCompleted.reduce((sum, a) => sum + (a.tip_amount || 0), 0);
  const monthTips = monthCompleted.reduce((sum, a) => sum + (a.tip_amount || 0), 0);
  const weekRevenue = weekCompleted.reduce((sum, a) => sum + (a.total_amount || 0), 0);
  const monthRevenue = monthCompleted.reduce((sum, a) => sum + (a.total_amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-sm border-0 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium">This Week</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700">{weekCompleted.length}</p>
            <p className="text-xs text-muted-foreground">jobs completed</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 bg-gradient-to-br from-green-50 to-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground font-medium">Tips This Week</span>
            </div>
            <p className="text-2xl font-bold text-green-700">${weekTips.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{weekCompleted.length} jobs</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground font-medium">This Month</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">{monthCompleted.length}</p>
            <p className="text-xs text-muted-foreground">jobs completed</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground font-medium">Tips This Month</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">${monthTips.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{monthCompleted.length} jobs</p>
          </CardContent>
        </Card>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setViewMonth(subMonths(viewMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold text-gray-700">
          {format(viewMonth, 'MMMM yyyy')}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setViewMonth(new Date())}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Completed List */}
      {completed.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-dashed p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="font-semibold text-gray-800 mb-1">No completed jobs yet</h3>
          <p className="text-sm text-muted-foreground">Completed appointments will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {completed.map((appt) => (
            <Card key={appt.id} className="shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-800 text-sm truncate">{appt.patient_name}</p>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm font-bold text-gray-800">${appt.total_amount.toFixed(2)}</p>
                        {appt.tip_amount > 0 && (
                          <p className="text-xs text-emerald-600 font-medium">+${appt.tip_amount.toFixed(2)} tip</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(appt.appointment_date + 'T00:00:00'), 'MMM d')}
                      </span>
                      <span>{appt.appointment_time || ''}</span>
                      <span className="capitalize">{appt.service_type?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CompletedTab;
