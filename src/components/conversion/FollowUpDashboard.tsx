import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  Mail, 
  MessageSquare, 
  Phone, 
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  Users
} from 'lucide-react';
import { simpleFollowUpService } from '@/services/SimpleFollowUpService';

interface FollowUpDashboardProps {
  dateRange?: { start: string; end: string };
}

export const FollowUpDashboard: React.FC<FollowUpDashboardProps> = ({ 
  dateRange = {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString()
  }
}) => {
  const [performance, setPerformance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPerformanceData();
  }, [dateRange]);

  const loadPerformanceData = async () => {
    setIsLoading(true);
    try {
      const data = await simpleFollowUpService.getFollowUpPerformance(dateRange);
      setPerformance(data);
    } catch (error) {
      console.error('Error loading follow-up performance:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!performance) {
    return (
      <Card className="p-6 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
        <p className="text-gray-500">No follow-up data found for the selected date range.</p>
      </Card>
    );
  }

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'email': return Mail;
      case 'sms': return MessageSquare;
      case 'phone_call': return Phone;
      case 'retargeting_ad': return Target;
      default: return Clock;
    }
  };

  const getStatusColor = (rate: number) => {
    if (rate >= 70) return 'text-green-600';
    if (rate >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Actions</p>
              <p className="text-2xl font-bold text-gray-900">{performance.totalActions}</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Execution Rate</p>
              <p className={`text-2xl font-bold ${getStatusColor(performance.executionRate)}`}>
                {performance.executionRate.toFixed(1)}%
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Response Rate</p>
              <p className={`text-2xl font-bold ${getStatusColor(performance.responseRate)}`}>
                {performance.responseRate.toFixed(1)}%
              </p>
            </div>
            <Mail className="h-8 w-8 text-purple-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
              <p className={`text-2xl font-bold ${getStatusColor(performance.conversionRate)}`}>
                {performance.conversionRate.toFixed(1)}%
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-indigo-500" />
          </div>
        </Card>
      </div>

      {/* Revenue Metrics */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Revenue Impact</h3>
          <Badge variant="outline" className="text-green-600 border-green-200">
            ${(performance.totalRevenue / 100).toLocaleString()}
          </Badge>
        </div>
        <div className="text-sm text-gray-600">
          Total revenue generated from follow-up automation in the selected period
        </div>
      </Card>

      {/* Performance by Action Type */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Performance by Action Type</h3>
        <div className="space-y-4">
          {Object.entries(performance.performanceByType).map(([type, metrics]: [string, any]) => {
            const IconComponent = getActionIcon(type);
            const responseRate = metrics.executed > 0 ? (metrics.responses / metrics.executed) * 100 : 0;
            const conversionRate = metrics.responses > 0 ? (metrics.conversions / metrics.responses) * 100 : 0;
            
            return (
              <div key={type} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <IconComponent className="h-5 w-5 text-gray-500" />
                    <span className="font-medium capitalize">
                      {type.replace('_', ' ')}
                    </span>
                  </div>
                  <Badge variant="outline">
                    {metrics.total} actions
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Executed:</span>
                    <span className="ml-2 font-medium">{metrics.executed}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Response Rate:</span>
                    <span className={`ml-2 font-medium ${getStatusColor(responseRate)}`}>
                      {responseRate.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Conversions:</span>
                    <span className="ml-2 font-medium">{metrics.conversions}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Revenue:</span>
                    <span className="ml-2 font-medium">
                      ${(metrics.revenue / 100).toLocaleString()}
                    </span>
                  </div>
                </div>
                
                {/* Progress bars */}
                <div className="mt-3 space-y-2">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Response Rate</span>
                      <span>{responseRate.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${Math.min(responseRate, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Conversion Rate</span>
                      <span>{conversionRate.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${Math.min(conversionRate, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex space-x-4">
        <Button onClick={loadPerformanceData} variant="outline">
          Refresh Data
        </Button>
        <Button 
          onClick={() => window.open('/admin/follow-up-automation', '_blank')}
          variant="default"
        >
          View Full Dashboard
        </Button>
      </div>
    </div>
  );
};