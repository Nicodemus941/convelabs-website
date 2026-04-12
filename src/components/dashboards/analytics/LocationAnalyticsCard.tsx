
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useLocationAnalytics } from '@/hooks/useAdminAnalytics';
import { MapPin, Globe, Building2 } from 'lucide-react';
import LoadingState from '@/components/ui/loading-state';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];

interface LocationAnalyticsCardProps {
  timeRange: 7 | 30 | 90;
}

const LocationAnalyticsCard: React.FC<LocationAnalyticsCardProps> = ({ timeRange }) => {
  const { locationData, isLoading, error } = useLocationAnalytics(timeRange);

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingState />
        </CardContent>
      </Card>
    );
  }

  if (error || !locationData) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Failed to load location data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Top Cities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Top Cities ({timeRange} days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={locationData.topCitiesChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end" 
                height={60}
                fontSize={12}
              />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top States */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Top States ({timeRange} days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={locationData.topStatesChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Countries Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Countries ({timeRange} days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={locationData.countriesChart}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={12}
              >
                {locationData.countriesChart.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Location Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location Coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Views with Location</span>
            <span className="font-semibold">{locationData.totalViewsWithLocation}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Coverage Rate</span>
            <span className="font-semibold">{locationData.coveragePercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full" 
              style={{ width: `${locationData.coveragePercentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Geographic location is determined by IP address geolocation
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationAnalyticsCard;
