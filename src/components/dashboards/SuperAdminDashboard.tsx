
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Calendar, DollarSign, TrendingUp, UserPlus, Clock, Settings, Briefcase, FileText, Mail, Package, Webhook, ArrowRight, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from '@/integrations/supabase/client';

interface StatCard {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState({
    totalAppointments: 0,
    thisWeekAppointments: 0,
    totalPatients: 0,
    newPatientsThisMonth: 0,
    revenue: 0,
    completedToday: 0,
  });
  const [recentAppointments, setRecentAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Fetch appointment counts
      const { count: totalAppts } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true });

      const { count: weekAppts } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .gte('appointment_date', startOfWeek.toISOString());

      const { count: todayCompleted } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('appointment_date', new Date().toISOString().split('T')[0]);

      // Fetch recent appointments
      const { data: recent } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: false })
        .limit(8);

      // Revenue estimate (sum of total_amount)
      const { data: revenueData } = await supabase
        .from('appointments')
        .select('total_amount')
        .eq('payment_status', 'completed')
        .gte('appointment_date', startOfMonth.toISOString());

      const monthRevenue = revenueData?.reduce((sum, a) => sum + (a.total_amount || 0), 0) || 0;

      setStats({
        totalAppointments: totalAppts || 0,
        thisWeekAppointments: weekAppts || 0,
        totalPatients: 0, // Would need a separate query
        newPatientsThisMonth: 0,
        revenue: monthRevenue,
        completedToday: todayCompleted || 0,
      });

      setRecentAppointments(recent || []);
    } catch (err) {
      console.error('Dashboard data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards: StatCard[] = [
    { title: 'This Week', value: stats.thisWeekAppointments, subtitle: 'Scheduled appointments', icon: <Calendar className="h-5 w-5" />, color: 'text-blue-600 bg-blue-50' },
    { title: 'Completed Today', value: stats.completedToday, subtitle: 'Appointments done', icon: <Activity className="h-5 w-5" />, color: 'text-green-600 bg-green-50' },
    { title: 'Revenue (MTD)', value: `$${stats.revenue.toLocaleString()}`, subtitle: 'This month', icon: <DollarSign className="h-5 w-5" />, color: 'text-emerald-600 bg-emerald-50' },
    { title: 'Total Appointments', value: stats.totalAppointments, subtitle: 'All time', icon: <TrendingUp className="h-5 w-5" />, color: 'text-purple-600 bg-purple-50' },
  ];

  const adminLinks = [
    { title: 'User Management', icon: <Users className="h-5 w-5" />, link: '/dashboard/super_admin/users', desc: 'Manage accounts & roles' },
    { title: 'Staff Management', icon: <Briefcase className="h-5 w-5" />, link: '/dashboard/super_admin/staff', desc: 'Staff profiles & assignments' },
    { title: 'Appointments', icon: <Calendar className="h-5 w-5" />, link: '/dashboard/super_admin/appointments', desc: 'View & manage all appointments' },
    { title: 'Services', icon: <Package className="h-5 w-5" />, link: '/dashboard/super_admin/services', desc: 'Service catalog & pricing' },
    { title: 'Marketing', icon: <Mail className="h-5 w-5" />, link: '/dashboard/super_admin/marketing', desc: 'Email campaigns' },
    { title: 'Settings', icon: <Settings className="h-5 w-5" />, link: '/dashboard/super_admin/settings', desc: 'System configuration' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Owner Dashboard</h1>
          <p className="text-muted-foreground mt-1">ConveLabs system overview</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link to="/dashboard/super_admin/appointments">View All Appointments</Link>
          </Button>
          <Button className="bg-conve-red hover:bg-conve-red-dark text-white" asChild>
            <Link to="/book-now">Create Appointment</Link>
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">{stat.title}</span>
                <div className={`h-9 w-9 rounded-lg ${stat.color} flex items-center justify-center`}>
                  {stat.icon}
                </div>
              </div>
              <div className="text-2xl font-bold">{loading ? '—' : stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Appointments + Admin Links */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Appointments */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Recent Appointments</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/dashboard/super_admin/appointments">View all <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3,4].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
                </div>
              ) : recentAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No appointments yet</p>
              ) : (
                <div className="divide-y">
                  {recentAppointments.map((appt) => (
                    <div key={appt.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-sm">
                          {appt.notes?.startsWith('Patient: ') ? appt.notes.split(' | ')[0].replace('Patient: ', '') : appt.patient_email || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {appt.notes?.includes('Service: ') ? appt.notes.split('Service: ')[1]?.split(' | ')[0] : appt.service_type || 'Blood Draw'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {appt.appointment_date ? new Date(appt.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          appt.status === 'completed' ? 'bg-green-100 text-green-700' :
                          appt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                          appt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {appt.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Admin Quick Links */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Admin Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {adminLinks.map((item) => (
                <Link
                  key={item.title}
                  to={item.link}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
