import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play, 
  Pause, 
  BarChart3, 
  Users, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Target
} from 'lucide-react';
import { simpleABTestingService } from '@/services/SimpleABTestingService';

export const ABTestingDashboard: React.FC = () => {
  const [experiments, setExperiments] = useState<any[]>([]);
  const [results, setResults] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('running');

  useEffect(() => {
    loadExperiments();
  }, []);

  const loadExperiments = async () => {
    setIsLoading(true);
    try {
      // This would normally call the service, but for now we'll use mock data
      const mockExperiments = [
        {
          id: '1',
          name: 'Hero CTA Optimization',
          description: 'Testing different CTA buttons on the hero section',
          status: 'running',
          variants: [
            { id: 'control', name: 'Control', weight: 50 },
            { id: 'red_urgent', name: 'Red + Urgent', weight: 50 }
          ],
          created_at: '2024-01-15',
          traffic_split: { control: 50, red_urgent: 50 }
        },
        {
          id: '2',
          name: 'Pricing Page Headlines',
          description: 'Testing value propositions on pricing page',
          status: 'running',
          variants: [
            { id: 'control', name: 'Control', weight: 33 },
            { id: 'savings', name: 'Savings Focus', weight: 33 },
            { id: 'convenience', name: 'Convenience Focus', weight: 34 }
          ],
          created_at: '2024-01-10',
          traffic_split: { control: 33, savings: 33, convenience: 34 }
        }
      ];
      
      setExperiments(mockExperiments);
      
      // Load results for each experiment
      for (const exp of mockExperiments) {
        const mockResults = {
          control: {
            impressions: 1250,
            clicks: 89,
            conversions: 12,
            clickRate: '7.12',
            conversionRate: '13.48',
            improvement: '0.00',
            significanceLevel: 0
          },
          red_urgent: {
            impressions: 1198,
            clicks: 124,
            conversions: 21,
            clickRate: '10.35',
            conversionRate: '16.94',
            improvement: '3.46',
            significanceLevel: 87
          }
        };
        setResults(prev => ({ ...prev, [exp.id]: Object.values(mockResults) }));
      }
    } catch (error) {
      console.error('Error loading experiments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePauseExperiment = async (experimentId: string) => {
    try {
      console.log('Pausing experiment:', experimentId);
      loadExperiments();
    } catch (error) {
      console.error('Error pausing experiment:', error);
    }
  };

  const handleResumeExperiment = async (experimentId: string) => {
    try {
      console.log('Resuming experiment:', experimentId);
      loadExperiments();
    } catch (error) {
      console.error('Error resuming experiment:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="h-4 w-4 text-green-500" />;
      case 'paused': return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSignificanceColor = (level: number) => {
    if (level >= 95) return 'text-green-600';
    if (level >= 85) return 'text-yellow-600';
    return 'text-gray-600';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">A/B Testing Dashboard</h1>
          <p className="text-gray-600">Optimize conversions with intelligent testing</p>
        </div>
        <Button>
          <Target className="h-4 w-4 mr-2" />
          Create Experiment
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Running Tests</p>
              <p className="text-2xl font-bold">2</p>
            </div>
            <Play className="h-8 w-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Visitors</p>
              <p className="text-2xl font-bold">2.4K</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Improvement</p>
              <p className="text-2xl font-bold text-green-600">+3.2%</p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Significant Results</p>
              <p className="text-2xl font-bold">1</p>
            </div>
            <BarChart3 className="h-8 w-8 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Experiments List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="running">Running</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="running" className="space-y-4">
          {experiments.filter(exp => exp.status === 'running').map((experiment) => (
            <Card key={experiment.id} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(experiment.status)}
                  <div>
                    <h3 className="font-semibold">{experiment.name}</h3>
                    <p className="text-sm text-gray-600">{experiment.description}</p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePauseExperiment(experiment.id)}
                  >
                    <Pause className="h-4 w-4 mr-1" />
                    Pause
                  </Button>
                </div>
              </div>

              {/* Variants Performance */}
              {results[experiment.id] && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {results[experiment.id].map((variant: any, index: number) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">
                            {experiment.variants[index]?.name || `Variant ${index + 1}`}
                          </span>
                          {parseFloat(variant.improvement) > 0 && (
                            <Badge variant="outline" className="text-green-600">
                              +{variant.improvement}%
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Impressions:</span>
                            <span className="font-medium">{variant.impressions}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Click Rate:</span>
                            <span className="font-medium">{variant.clickRate}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Conversion:</span>
                            <span className="font-medium">{variant.conversionRate}%</span>
                          </div>
                          {variant.significanceLevel > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Confidence:</span>
                              <span className={`font-medium ${getSignificanceColor(variant.significanceLevel)}`}>
                                {variant.significanceLevel}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <div className="text-center py-12">
            <CheckCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No completed experiments
            </h3>
            <p className="text-gray-600">
              Completed experiments will appear here once tests finish.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {experiments.map((experiment) => (
            <Card key={experiment.id} className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(experiment.status)}
                  <div>
                    <h3 className="font-semibold">{experiment.name}</h3>
                    <p className="text-sm text-gray-600">{experiment.description}</p>
                  </div>
                </div>
                <Badge variant="outline">
                  {experiment.status}
                </Badge>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};