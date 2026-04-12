
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePageViewAnalytics } from '@/hooks/useAdminAnalytics';
import { TrendingUp, Users, Eye, MapPin } from 'lucide-react';
import LoadingState from '@/components/ui/loading-state';

interface TrafficAnalyticsCardProps {
  timeRange: 7 | 30 | 90;
}

const TrafficAnalyticsCard: React.FC<TrafficAnalyticsCardProps> = ({ timeRange }) => {
  const { pageViewData, isLoading, error } = usePageViewAnalytics(timeRange);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Traffic Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingState />
        </CardContent>
      </Card>
    );
  }

  if (error || !pageViewData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Traffic Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Failed to load traffic data</p>
        </CardContent>
      </Card>
    );
  }

  // Convert data for charts
  const pageViewsChart = Object.entries(pageViewData.pageViewsByDate)
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([date, views]) => ({ date, views: Number(views) }));

  const topPagesChart = Object.entries(pageViewData.topPages)
    .sort(([,a], [,b]) => Number(b) - Number(a))
    .slice(0, 5)
    .map(([page, views]) => ({ 
      page: page.length > 20 ? page.substring(0, 20) + '...' : page, 
      views: Number(views)
    }));

  const topCitiesChart = Object.entries(pageViewData.topCities || {})
    .sort(([,a], [,b]) => Number(b) - Number(a))
    .slice(0, 5)
    .map(([city, views]) => ({ city, views: Number(views) }));

  const topReferrersChart = Object.entries(pageViewData.referrers)
    .sort(([,a], [,b]) => Number(b) - Number(a))
    .slice(0, 5)
    .map(([referrer, views]) => ({ 
      referrer: referrer.includes('://') ? new URL(referrer).hostname : referrer,
      views: Number(views)
    }));

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600">Total Views</p>
                <p className="text-2xl font-bold">{pageViewData.totalViews}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm text-gray-600">Top Cities</p>
                <p className="text-2xl font-bold">{Object.keys(pageViewData.topCities || {}).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-sm text-gray-600">Top States</p>
                <p className="text-2xl font-bold">{Object.keys(pageViewData.topStates || {}).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Page Views Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Page Views Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pageViewsChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="views" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Pages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topPagesChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="page" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="views" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Cities */}
        {topCitiesChart.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Cities</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topCitiesChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="city" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="views" fill="#F59E0B" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top Referrers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Referrers</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topReferrersChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="referrer" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="views" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TrafficAnalyticsCard;
