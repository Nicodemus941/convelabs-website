
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, ChevronRight, BarChart } from "lucide-react";
import { Territory } from '@/hooks/franchise/useTerritory';
import { Link } from 'react-router-dom';
import { Skeleton } from "@/components/ui/skeleton";

interface TerritoriesTabProps {
  territories: Territory[] | { id: string; name: string; state: string; city: string; status: string }[];
}

const TerritoriesTab: React.FC<TerritoriesTabProps> = ({ territories = [] }) => {
  const [territoryView, setTerritoryView] = useState<'list' | 'map'>('list');

  // Function to determine badge color based on status
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'pending':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'available':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Mock data for territory performance
  const territoryPerformance = {
    'Downtown Metro': {
      revenue: 68400,
      serviceCount: 155,
      clientRetention: 0.94,
      newClients: 54
    },
    'Westside': {
      revenue: 72300,
      serviceCount: 168,
      clientRetention: 0.92,
      newClients: 62
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Your Territories</h2>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setTerritoryView('list')}
            className={territoryView === 'list' ? 'bg-gray-100' : ''}
          >
            List View
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setTerritoryView('map')}
            className={territoryView === 'map' ? 'bg-gray-100' : ''}
          >
            Map View
          </Button>
        </div>
      </div>

      {territories.length > 0 ? (
        territoryView === 'list' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {territories.map((territory) => (
              <Card key={territory.id} className="overflow-hidden">
                <CardHeader className="border-b">
                  <div className="flex justify-between">
                    <div>
                      <CardTitle>{territory.name}</CardTitle>
                      <CardDescription>
                        {territory.city ? `${territory.city}, ` : ''}{territory.state}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusBadgeColor(territory.status)}>
                      {territory.status}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-4">
                  <Tabs defaultValue="performance" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="performance">Performance</TabsTrigger>
                      <TabsTrigger value="staff">Staff</TabsTrigger>
                      <TabsTrigger value="clients">Clients</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="performance">
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="text-center p-3 bg-gray-50 rounded-md">
                          <p className="text-sm font-medium text-gray-500">Revenue</p>
                          <p className="text-xl font-bold">
                            ${(territoryPerformance[territory.name]?.revenue || 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-md">
                          <p className="text-sm font-medium text-gray-500">Services</p>
                          <p className="text-xl font-bold">
                            {territoryPerformance[territory.name]?.serviceCount || 0}
                          </p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-md">
                          <p className="text-sm font-medium text-gray-500">Retention</p>
                          <p className="text-xl font-bold">
                            {Math.round((territoryPerformance[territory.name]?.clientRetention || 0) * 100)}%
                          </p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-md">
                          <p className="text-sm font-medium text-gray-500">New Clients</p>
                          <p className="text-xl font-bold">
                            {territoryPerformance[territory.name]?.newClients || 0}
                          </p>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="staff">
                      <div className="py-4">
                        <div className="flex items-center justify-between py-2">
                          <div className="flex items-center">
                            <Users className="h-5 w-5 mr-2 text-gray-500" />
                            <span>3 staff members</span>
                          </div>
                          <Button variant="link" className="p-0">Manage Staff</Button>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="clients">
                      <div className="py-4">
                        <div className="flex items-center justify-between py-2">
                          <div className="flex items-center">
                            <span>124 active clients</span>
                          </div>
                          <Button variant="link" className="p-0">View Clients</Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
                
                <CardFooter className="border-t bg-gray-50 flex justify-between">
                  <Link to={`/territory/${territory.id}`}>
                    <Button variant="outline" size="sm">
                      <BarChart className="h-4 w-4 mr-2" /> View Analytics
                    </Button>
                  </Link>
                  <Button size="sm" className="bg-conve-red hover:bg-conve-red/90">
                    Manage <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden h-96 bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Territory Map</h3>
              <p className="mt-1 text-sm text-gray-500">
                Interactive territory map view coming soon
              </p>
            </div>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}
    </div>
  );
};

export default TerritoriesTab;
