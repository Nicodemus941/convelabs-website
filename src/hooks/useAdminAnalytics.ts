
import { useQuery } from '@tanstack/react-query';
import { supabase, getAuthToken } from '@/integrations/supabase/client';

type TimeRange = 7 | 30 | 90;

export const useAdminAnalytics = (timeRange: TimeRange = 30) => {
  return useQuery({
    queryKey: ['admin-analytics', timeRange],
    queryFn: async () => {
      const token = await getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const { data, error } = await supabase.functions.invoke('get-admin-analytics', {
        body: { timeRange },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      return data;
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Hook for KPI overview cards
export const useKpiData = (timeRange: TimeRange = 30) => {
  const { data, isLoading, error } = useAdminAnalytics(timeRange);
  
  if (isLoading || error || !data) {
    return { isLoading, error, kpiData: null };
  }
  
  // Calculate KPIs from the data
  const newSignups = data.membershipData?.filter(
    (m) => new Date(m.created_at) > new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000)
  ).length || 0;
  
  const upcomingAppointments = data.appointmentsData?.filter(
    (a) => a.status === 'scheduled'
  ).length || 0;
  
  const monthlyRevenue = data.revenueData?.reduce((sum, item) => sum + (item.total_paid || 0), 0) || 0;
  
  const activePhlebotomists = data.phlebotomistCount || 0;
  
  const inventoryAlerts = data.inventoryAlerts?.length || 0;
  
  return {
    isLoading,
    error,
    kpiData: {
      newSignups,
      upcomingAppointments,
      monthlyRevenue,
      activePhlebotomists,
      inventoryAlerts
    }
  };
};

// Hook for revenue analytics
export const useRevenueAnalytics = (timeRange: TimeRange = 30) => {
  const { data, isLoading, error } = useAdminAnalytics(timeRange);
  
  return {
    isLoading,
    error,
    revenueData: data?.revenueData || []
  };
};

// Hook for membership analytics
export const useMembershipAnalytics = (timeRange: TimeRange = 30) => {
  const { data, isLoading, error } = useAdminAnalytics(timeRange);
  
  if (isLoading || error || !data) {
    return { isLoading, error, membershipData: null };
  }
  
  // Process and enrich membership data here
  const enrichedData = data.membershipData || [];
  
  return {
    isLoading,
    error,
    membershipData: enrichedData
  };
};

// Hook for pageview analytics with location data
export const usePageViewAnalytics = (timeRange: TimeRange = 30) => {
  const { data, isLoading, error } = useAdminAnalytics(timeRange);
  
  if (isLoading || error || !data) {
    return { isLoading, error, pageViewData: null };
  }
  
  const pageViews = data.pageViewsData || [];
  
  // Group page views by date
  const pageViewsByDate = pageViews.reduce((acc, view) => {
    const date = new Date(view.created_at).toLocaleDateString();
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Top referrers
  const referrers = pageViews.reduce((acc, view) => {
    if (view.referrer) {
      acc[view.referrer] = (acc[view.referrer] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  // Top pages
  const topPages = pageViews.reduce((acc, view) => {
    if (view.path) {
      acc[view.path] = (acc[view.path] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  // Location analytics
  const topCities = pageViews.reduce((acc, view) => {
    if (view.city && view.state) {
      const location = `${view.city}, ${view.state}`;
      acc[location] = (acc[location] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  const topStates = pageViews.reduce((acc, view) => {
    if (view.state) {
      acc[view.state] = (acc[view.state] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  const topCountries = pageViews.reduce((acc, view) => {
    if (view.country) {
      acc[view.country] = (acc[view.country] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  return {
    isLoading,
    error,
    pageViewData: {
      pageViewsByDate,
      referrers,
      topPages,
      topCities,
      topStates,
      topCountries,
      totalViews: pageViews.length
    }
  };
};

// Hook for location analytics
export const useLocationAnalytics = (timeRange: TimeRange = 30) => {
  const { data, isLoading, error } = useAdminAnalytics(timeRange);
  
  if (isLoading || error || !data) {
    return { isLoading, error, locationData: null };
  }
  
  const pageViews = data.pageViewsData || [];
  
  // Filter views with location data
  const viewsWithLocation = pageViews.filter(view => view.city || view.state || view.country);
  
  // Geographic distribution
  const cityDistribution = viewsWithLocation.reduce((acc, view) => {
    if (view.city && view.state) {
      const key = `${view.city}, ${view.state}`;
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  const stateDistribution = viewsWithLocation.reduce((acc, view) => {
    if (view.state) {
      acc[view.state] = (acc[view.state] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  const countryDistribution = viewsWithLocation.reduce((acc, view) => {
    if (view.country) {
      acc[view.country] = (acc[view.country] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  // Convert to chart-friendly format
  const topCitiesChart = Object.entries(cityDistribution)
    .sort(([,a], [,b]) => Number(b) - Number(a))
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));
  
  const topStatesChart = Object.entries(stateDistribution)
    .sort(([,a], [,b]) => Number(b) - Number(a))
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));
  
  const countriesChart = Object.entries(countryDistribution)
    .sort(([,a], [,b]) => Number(b) - Number(a))
    .map(([name, value]) => ({ name, value }));
  
  return {
    isLoading,
    error,
    locationData: {
      topCitiesChart,
      topStatesChart,
      countriesChart,
      totalViewsWithLocation: viewsWithLocation.length,
      coveragePercentage: pageViews.length > 0 ? (viewsWithLocation.length / pageViews.length) * 100 : 0
    }
  };
};
