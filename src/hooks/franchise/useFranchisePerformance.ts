
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PerformanceData {
  id: string;
  franchise_owner_id: string;
  date: string;
  revenue: number;
  services_count: number;
  new_clients: number;
  client_retention_rate: number;
  created_at: string;
  updated_at: string;
}

export const useFranchisePerformance = () => {
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPerformanceData = useCallback(async (params: {
    franchiseId?: string;
    territoryId?: string; 
    days: number;
  }) => {
    try {
      setIsLoading(true);
      console.log(`Fetching performance data for ${params.days} days`);

      // In a real app, this would fetch from Supabase
      // For now, return mock data
      const mockData = generateMockData(params.days);
      setPerformanceData(mockData);
      
      return mockData;
    } catch (error) {
      console.error('Error fetching franchise performance:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateMockData = (days: number): PerformanceData[] => {
    const data: PerformanceData[] = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(now.getDate() - i);
      
      // Create slightly randomized but trending data
      const baseRevenue = 5000 - (i * 50) + (Math.random() * 1000 - 500);
      const baseServices = 30 - (i * 0.3) + (Math.random() * 10 - 5);
      const baseNewClients = 8 - (i * 0.08) + (Math.random() * 5 - 2.5);
      const baseRetention = 92 - (i * 0.1) + (Math.random() * 5 - 2.5);
      
      data.push({
        id: `mock-${i}`,
        franchise_owner_id: "mock-owner-id",
        date: date.toISOString().split('T')[0],
        revenue: Math.max(0, Math.round(baseRevenue)),
        services_count: Math.max(0, Math.round(baseServices)),
        new_clients: Math.max(0, Math.round(baseNewClients)),
        client_retention_rate: Math.min(100, Math.max(50, Math.round(baseRetention))),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    return data;
  };

  return {
    performanceData,
    isLoading,
    fetchPerformanceData,
    generateMockData
  };
};
