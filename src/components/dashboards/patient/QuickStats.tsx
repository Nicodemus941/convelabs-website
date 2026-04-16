
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Calendar, Clock, Activity, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Appointment } from "@/types/appointmentTypes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface QuickStatsProps {
  totalCreditsAvailable: number | undefined;
  nextAppointment: Appointment | null;
  userMembership: any;
}

const QuickStats = ({ totalCreditsAvailable, nextAppointment, userMembership }: QuickStatsProps) => {
  const { user } = useAuth();
  const [daysSinceLastVisit, setDaysSinceLastVisit] = useState<number | null>(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (!user?.email) return;
    const fetchStats = async () => {
      // Get last completed appointment
      const { data: lastAppt } = await supabase.from('appointments')
        .select('appointment_date, total_amount')
        .ilike('patient_email', user.email!)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false })
        .limit(1);

      if (lastAppt?.[0]) {
        const lastDate = new Date(lastAppt[0].appointment_date);
        const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        setDaysSinceLastVisit(daysSince);
      }

      // Get total spent + visit count
      const { data: allAppts } = await supabase.from('appointments')
        .select('total_amount')
        .ilike('patient_email', user.email!)
        .eq('status', 'completed');

      if (allAppts) {
        setCompletedCount(allAppts.length);
        setTotalSpent(allAppts.reduce((sum, a) => sum + (a.total_amount || 0), 0));
      }
    };
    fetchStats();
  }, [user?.email]);

  const getFormattedNextAppointmentDate = () => {
    if (!nextAppointment) return 'None scheduled';
    const date = nextAppointment.date || nextAppointment.appointment_date;
    if (!date) return 'Date not available';
    return new Date(date).toLocaleDateString();
  };

  // Days since last visit color coding
  const getDaysColor = () => {
    if (daysSinceLastVisit === null) return { bg: 'bg-gray-50', text: 'text-gray-600', label: 'No visits yet' };
    if (daysSinceLastVisit <= 90) return { bg: 'bg-green-50', text: 'text-green-700', label: 'On track' };
    if (daysSinceLastVisit <= 180) return { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Due for blood work' };
    return { bg: 'bg-red-50', text: 'text-red-700', label: 'Overdue' };
  };
  const daysColor = getDaysColor();

  // Membership savings calculation (for non-members)
  const memberSavings = !userMembership ? Math.round(totalSpent * 0.20) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      {/* Days Since Last Visit — Hormozi urgency trigger */}
      <Card className="overflow-hidden">
        <div className={`h-1 ${daysSinceLastVisit !== null && daysSinceLastVisit > 180 ? 'bg-red-500' : daysSinceLastVisit !== null && daysSinceLastVisit > 90 ? 'bg-amber-500' : 'bg-green-500'}`} />
        <CardContent className="p-4 flex items-center space-x-4">
          <div className={`${daysColor.bg} p-3 rounded-full`}>
            <Activity className={`h-6 w-6 ${daysColor.text}`} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Last Blood Work</p>
            <h3 className="text-2xl font-bold">
              {daysSinceLastVisit !== null ? `${daysSinceLastVisit}d` : '—'}
            </h3>
            <p className={`text-[11px] font-medium ${daysColor.text}`}>{daysColor.label}</p>
          </div>
        </CardContent>
      </Card>

      {/* Next Appointment */}
      <Card>
        <CardContent className="p-4 flex items-center space-x-4">
          <div className="bg-blue-50 p-3 rounded-full">
            <Calendar className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Next Appointment</p>
            <h3 className="text-md font-medium">
              {getFormattedNextAppointmentDate()}
            </h3>
            {!nextAppointment && (
              <Button variant="link" size="sm" className="p-0 h-auto text-xs text-[#B91C1C]" asChild>
                <a href="/book-now">Schedule Now</a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Available Credits */}
      <Card>
        <CardContent className="p-4 flex items-center space-x-4">
          <div className="bg-conve-red/10 p-3 rounded-full">
            <BarChart className="h-6 w-6 text-conve-red" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Available Credits</p>
            <h3 className="text-2xl font-bold">{totalCreditsAvailable || 0}</h3>
            <p className="text-[11px] text-muted-foreground">{completedCount} visit{completedCount !== 1 ? 's' : ''} completed</p>
          </div>
        </CardContent>
      </Card>

      {/* Membership Upsell or Status */}
      <Card className="overflow-hidden">
        {!userMembership && memberSavings > 0 && <div className="h-1 bg-[#B91C1C]" />}
        <CardContent className="p-4 flex items-center space-x-4">
          <div className={`${userMembership ? 'bg-green-50' : 'bg-amber-50'} p-3 rounded-full`}>
            <TrendingUp className={`h-6 w-6 ${userMembership ? 'text-green-600' : 'text-amber-600'}`} />
          </div>
          <div>
            {userMembership ? (
              <>
                <p className="text-sm text-muted-foreground">Membership</p>
                <h3 className="text-md font-medium text-green-700">VIP Active</h3>
                <p className="text-[11px] text-muted-foreground">
                  Renews {userMembership.next_renewal ? new Date(userMembership.next_renewal).toLocaleDateString() : 'N/A'}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">You Could Save</p>
                <h3 className="text-2xl font-bold text-[#B91C1C]">${memberSavings}</h3>
                <Button variant="link" size="sm" className="p-0 h-auto text-xs text-[#B91C1C]" asChild>
                  <a href="/pricing">Upgrade to VIP</a>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuickStats;
