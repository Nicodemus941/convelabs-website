import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  TrendingUp, 
  DollarSign, 
  Target, 
  MapPin, 
  Clock,
  AlertCircle,
  Check,
  X
} from 'lucide-react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  ArcElement,
  LineElement,
  PointElement
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement
);

interface DashboardMetrics {
  currentVisitors: number;
  conversionRate: number;
  todayRevenue: number;
  bookingsToday: number;
  bookingsGoal: number;
  topService: string;
  topTrafficSource: string;
  avgOrderValue: number;
}

interface VisitorSession {
  id: string;
  city: string;
  state: string;
  visitor_score: number;
  is_high_value: boolean;
  total_duration_seconds: number;
  started_at: string;
  device_type: string;
}

interface FunnelData {
  stage: string;
  count: number;
  percentage: number;
  benchmark: number;
}

interface ABTestResult {
  experiment_id: string;
  variant: string;
  conversion_rate: number;
  revenue_per_visitor: number;
  impressions: number;
  conversions: number;
}

interface BookingRecord {
  time: string;
  service: string;
  amount: number;
  source: string;
  location: string;
}

interface ConversionAlert {
  id: string;
  title: string;
  message: string;
  severity: string;
  triggered_at: string;
  session_id: string;
}

export const ConversionDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    currentVisitors: 0,
    conversionRate: 0,
    todayRevenue: 0,
    bookingsToday: 0,
    bookingsGoal: 10,
    topService: 'Executive Panel',
    topTrafficSource: 'Google Organic',
    avgOrderValue: 0
  });

  const [liveVisitors, setLiveVisitors] = useState<VisitorSession[]>([]);
  const [funnelData, setFunnelData] = useState<FunnelData[]>([]);
  const [abTestResults, setABTestResults] = useState<ABTestResult[]>([]);
  const [recentBookings, setRecentBookings] = useState<BookingRecord[]>([]);
  const [alerts, setAlerts] = useState<ConversionAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Real-time data fetching
  useEffect(() => {
    fetchDashboardData();
    
    // Set up real-time subscriptions
    const visitorChannel = supabase
      .channel('visitor-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'visitor_sessions'
      }, () => {
        fetchLiveVisitors();
      })
      .subscribe();

    const alertsChannel = supabase
      .channel('alerts-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversion_alerts'
      }, () => {
        fetchAlerts();
      })
      .subscribe();

    const bookingChannel = supabase
      .channel('booking-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_attribution'
      }, () => {
        fetchRecentBookings();
        fetchMetrics();
      })
      .subscribe();

    // Auto-refresh intervals
    const metricsInterval = setInterval(fetchMetrics, 30000); // 30 seconds
    const visitorsInterval = setInterval(fetchLiveVisitors, 5000); // 5 seconds
    const funnelInterval = setInterval(fetchFunnelData, 60000); // 1 minute

    return () => {
      supabase.removeChannel(visitorChannel);
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(bookingChannel);
      clearInterval(metricsInterval);
      clearInterval(visitorsInterval);
      clearInterval(funnelInterval);
    };
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchMetrics(),
      fetchLiveVisitors(),
      fetchFunnelData(),
      fetchABTestResults(),
      fetchRecentBookings(),
      fetchAlerts()
    ]);
    setIsLoading(false);
  };

  const fetchMetrics = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Current visitors (active in last 30 minutes)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: currentVisitors } = await supabase
        .from('visitor_sessions')
        .select('id')
        .gte('last_activity', thirtyMinutesAgo);

      // Today's bookings and revenue
      const { data: todayBookings } = await supabase
        .from('booking_attribution')
        .select('service_amount')
        .gte('booking_completed_at', today + 'T00:00:00Z');

      const bookingsCount = todayBookings?.length || 0;
      const revenue = todayBookings?.reduce((sum, booking) => sum + booking.service_amount, 0) || 0;
      const avgOrderValue = bookingsCount > 0 ? revenue / bookingsCount : 0;

      // Conversion rate (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: sessions24h } = await supabase
        .from('visitor_sessions')
        .select('converted')
        .gte('started_at', yesterday);

      const totalSessions = sessions24h?.length || 0;
      const convertedSessions = sessions24h?.filter(s => s.converted).length || 0;
      const conversionRate = totalSessions > 0 ? (convertedSessions / totalSessions) * 100 : 0;

      setMetrics({
        currentVisitors: currentVisitors?.length || 0,
        conversionRate: Number(conversionRate.toFixed(2)),
        todayRevenue: revenue,
        bookingsToday: bookingsCount,
        bookingsGoal: 10,
        topService: 'Executive Panel',
        topTrafficSource: 'Google Organic',
        avgOrderValue: Number(avgOrderValue.toFixed(0))
      });
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  const fetchLiveVisitors = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('visitor_sessions')
        .select('id, city, state, visitor_score, is_high_value, total_duration_seconds, started_at, device_type')
        .gte('last_activity', fiveMinutesAgo)
        .order('started_at', { ascending: false })
        .limit(20);

      setLiveVisitors(data || []);
    } catch (error) {
      console.error('Error fetching live visitors:', error);
    }
  };

  const fetchFunnelData = async () => {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      // Get funnel stage counts
      const { data: sessions } = await supabase
        .from('visitor_sessions')
        .select('id')
        .gte('started_at', yesterday);

      const { data: serviceViews } = await supabase
        .from('page_view_events')
        .select('session_id')
        .like('page_path', '%services%')
        .gte('viewed_at', yesterday);

      const { data: preQualEvents } = await supabase
        .from('conversion_funnel_events')
        .select('session_id')
        .eq('stage', 'pre_qualification')
        .gte('occurred_at', yesterday);

      const { data: bookingIntents } = await supabase
        .from('conversion_funnel_events')
        .select('session_id')
        .eq('stage', 'booking_intent')
        .gte('occurred_at', yesterday);

      const { data: completedBookings } = await supabase
        .from('booking_attribution')
        .select('session_id')
        .gte('booking_completed_at', yesterday);

      const homepageViews = sessions?.length || 0;
      const servicesViews = new Set(serviceViews?.map(v => v.session_id)).size;
      const preQualStarts = new Set(preQualEvents?.map(e => e.session_id)).size;
      const bookingClicks = new Set(bookingIntents?.map(e => e.session_id)).size;
      const bookingCompletions = new Set(completedBookings?.map(b => b.session_id)).size;

      const funnelStages = [
        { stage: 'Homepage Views', count: homepageViews, benchmark: 100 },
        { stage: 'Service Page Views', count: servicesViews, benchmark: 40 },
        { stage: 'Started Pre-Qualification', count: preQualStarts, benchmark: 15 },
        { stage: 'Clicked Book Now', count: bookingClicks, benchmark: 8 },
        { stage: 'Completed Booking', count: bookingCompletions, benchmark: 4 }
      ];

      const funnelWithPercentages = funnelStages.map((stage, index) => ({
        ...stage,
        percentage: homepageViews > 0 ? Number(((stage.count / homepageViews) * 100).toFixed(1)) : 0
      }));

      setFunnelData(funnelWithPercentages);
    } catch (error) {
      console.error('Error fetching funnel data:', error);
    }
  };

  const fetchABTestResults = async () => {
    try {
      const { data } = await supabase
        .from('ab_test_performance')
        .select('experiment_id, variant, conversion_rate, revenue_per_visitor, impressions, conversions')
        .eq('date', new Date().toISOString().split('T')[0])
        .order('experiment_id');

      setABTestResults(data || []);
    } catch (error) {
      console.error('Error fetching A/B test results:', error);
    }
  };

  const fetchRecentBookings = async () => {
    try {
      const { data } = await supabase
        .from('booking_attribution')
        .select(`
          booking_completed_at,
          service_type,
          service_amount,
          traffic_source,
          visitor_sessions!inner(city, state)
        `)
        .order('booking_completed_at', { ascending: false })
        .limit(10);

      const bookings = data?.map(booking => ({
        time: new Date(booking.booking_completed_at).toLocaleTimeString(),
        service: booking.service_type,
        amount: booking.service_amount,
        source: booking.traffic_source || 'Direct',
        location: `${booking.visitor_sessions.city || 'Unknown'}, ${booking.visitor_sessions.state || 'FL'}`
      })) || [];

      setRecentBookings(bookings);
    } catch (error) {
      console.error('Error fetching recent bookings:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const { data } = await supabase
        .from('conversion_alerts')
        .select('*')
        .is('resolved_at', null)
        .order('triggered_at', { ascending: false })
        .limit(5);

      setAlerts(data || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      await supabase
        .from('conversion_alerts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', alertId);
      
      fetchAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  // Chart data
  const funnelChartData = {
    labels: funnelData.map(stage => stage.stage),
    datasets: [{
      label: 'Conversions',
      data: funnelData.map(stage => stage.count),
      backgroundColor: funnelData.map(stage => {
        const ratio = stage.percentage / (stage.benchmark || 100);
        if (ratio >= 1.2) return '#10B981'; // Green - above benchmark
        if (ratio >= 0.8) return '#F59E0B'; // Yellow - at benchmark
        return '#EF4444'; // Red - below benchmark
      }),
      borderRadius: 4
    }]
  };

  const conversionRateData = {
    labels: ['Target', 'Current'],
    datasets: [{
      data: [5.0, metrics.conversionRate],
      backgroundColor: ['#E5E7EB', metrics.conversionRate >= 5 ? '#10B981' : '#EF4444'],
      borderWidth: 0
    }]
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-blue-50 to-white min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Real-Time Conversion Dashboard</h1>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-600">Live Data</span>
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Live Visitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{metrics.currentVisitors}</div>
            <p className="text-xs text-gray-500">Active now</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Conversion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.conversionRate}%</div>
            <p className="text-xs text-gray-500">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Today's Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">${metrics.todayRevenue.toLocaleString()}</div>
            <p className="text-xs text-gray-500">AOV: ${metrics.avgOrderValue}</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Bookings Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {metrics.bookingsToday}/{metrics.bookingsGoal}
            </div>
            <p className="text-xs text-gray-500">
              {Math.round((metrics.bookingsToday / metrics.bookingsGoal) * 100)}% of goal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row: Funnel & Live Visitors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Conversion Funnel (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <Bar 
                data={funnelChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const stage = funnelData[context.dataIndex];
                          return `${stage.count} conversions (${stage.percentage}%)`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: { beginAtZero: true }
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Live Visitors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Live Visitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {liveVisitors.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No active visitors</p>
              ) : (
                liveVisitors.map((visitor) => (
                  <div key={visitor.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">
                        {visitor.city}, {visitor.state}
                      </span>
                      {visitor.is_high_value && (
                        <Badge variant="destructive" className="text-xs">🔥 Hot Lead</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {Math.floor(visitor.total_duration_seconds / 60)}m
                      <span className="bg-gray-200 px-1 rounded">
                        Score: {visitor.visitor_score}/10
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: A/B Tests & Recent Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A/B Test Monitor */}
        <Card>
          <CardHeader>
            <CardTitle>A/B Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {abTestResults.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No active A/B tests</p>
              ) : (
                abTestResults.map((test, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{test.variant}</span>
                      <Badge variant={test.conversion_rate > 3.5 ? "default" : "secondary"}>
                        {(test.conversion_rate * 100).toFixed(1)}% CR
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600">
                      {test.impressions} views, {test.conversions} conversions
                    </div>
                    <div className="text-xs text-gray-500">
                      ${test.revenue_per_visitor.toFixed(2)} revenue per visitor
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Bookings */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentBookings.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No recent bookings</p>
              ) : (
                <div className="space-y-2">
                  {recentBookings.map((booking, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border-b">
                      <div>
                        <div className="font-medium text-sm">{booking.service}</div>
                        <div className="text-xs text-gray-500">
                          {booking.time} • {booking.location}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">${booking.amount}</div>
                        <div className="text-xs text-gray-500">{booking.source}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="h-5 w-5" />
              Active Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div>
                    <div className="font-medium text-sm">{alert.title}</div>
                    <div className="text-xs text-gray-600">{alert.message}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(alert.triggered_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={alert.severity === 'high' ? 'destructive' : 'secondary'}>
                      {alert.severity}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => acknowledgeAlert(alert.id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};