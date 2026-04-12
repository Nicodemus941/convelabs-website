import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings, 
  BarChart3, 
  Users, 
  Zap,
  ArrowRight
} from 'lucide-react';
import { FollowUpDashboard } from '@/components/conversion/FollowUpDashboard';

export const FollowUpAutomationPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Follow-Up Automation</h1>
          <p className="text-gray-600">Intelligent lead nurturing and conversion optimization</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button size="sm">
            <Zap className="h-4 w-4 mr-2" />
            Create Campaign
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Campaigns</p>
              <p className="text-2xl font-bold">8</p>
            </div>
            <Badge variant="outline" className="text-green-600">
              Live
            </Badge>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Week</p>
              <p className="text-2xl font-bold">247</p>
              <p className="text-xs text-gray-500">Follow-ups sent</p>
            </div>
            <ArrowRight className="h-5 w-5 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Response Rate</p>
              <p className="text-2xl font-bold text-green-600">34.2%</p>
            </div>
            <BarChart3 className="h-5 w-5 text-green-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Revenue Impact</p>
              <p className="text-2xl font-bold">$18.4K</p>
            </div>
            <Users className="h-5 w-5 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <FollowUpDashboard />
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Active Campaigns</h3>
            <div className="space-y-4">
              {[
                {
                  name: 'Hot Lead Immediate Response',
                  status: 'active',
                  triggers: 'Exit intent + High lead score',
                  actions: 'SMS + Exit popup',
                  performance: '42% conversion'
                },
                {
                  name: 'Warm Lead Nurture',
                  status: 'active',
                  triggers: 'Pricing page view',
                  actions: 'Email sequence',
                  performance: '28% conversion'
                },
                {
                  name: 'Cold Lead Reactivation',
                  status: 'paused',
                  triggers: '1 week inactivity',
                  actions: 'Educational email',
                  performance: '12% conversion'
                }
              ].map((campaign, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{campaign.name}</h4>
                    <Badge 
                      variant={campaign.status === 'active' ? 'default' : 'secondary'}
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Triggers:</span> {campaign.triggers}
                    </div>
                    <div>
                      <span className="font-medium">Actions:</span> {campaign.actions}
                    </div>
                    <div>
                      <span className="font-medium">Performance:</span> {campaign.performance}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="sequences" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Automation Sequences</h3>
            <div className="text-center py-12">
              <Zap className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">
                Advanced Sequence Builder
              </h4>
              <p className="text-gray-600 mb-4">
                Create complex automation workflows with triggers, conditions, and actions.
              </p>
              <Button>
                <Zap className="h-4 w-4 mr-2" />
                Build Your First Sequence
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Automation Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h4 className="font-medium">Smart Exit Intent</h4>
                  <p className="text-sm text-gray-600">Show personalized offers when users try to leave</p>
                </div>
                <Badge variant="default">Enabled</Badge>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h4 className="font-medium">Follow-up Timing</h4>
                  <p className="text-sm text-gray-600">Optimal timing based on lead behavior</p>
                </div>
                <Badge variant="default">AI Optimized</Badge>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <h4 className="font-medium">Message Personalization</h4>
                  <p className="text-sm text-gray-600">Customize messages based on visitor profile</p>
                </div>
                <Badge variant="default">Active</Badge>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};