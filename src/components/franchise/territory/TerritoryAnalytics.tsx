
import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ChartDataPoint {
  date: string;
  revenue: number;
  clients: number;
  services: number;
  retention: number;
}

interface TerritoryAnalyticsProps {
  chartData: ChartDataPoint[];
}

const TerritoryAnalytics: React.FC<TerritoryAnalyticsProps> = ({ chartData }) => {
  const [activeMetric, setActiveMetric] = useState<'revenue' | 'clients' | 'services'>('revenue');

  return (
    <Tabs defaultValue="trends" className="mb-6">
      <TabsList>
        <TabsTrigger value="trends">Performance Trends</TabsTrigger>
        <TabsTrigger value="comparison">Metric Comparison</TabsTrigger>
        <TabsTrigger value="details">Performance Details</TabsTrigger>
      </TabsList>
      
      <TabsContent value="trends" className="pt-4">
        <div className="flex gap-2 mb-4">
          <Button 
            variant={activeMetric === 'revenue' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveMetric('revenue')}
          >
            Revenue
          </Button>
          <Button 
            variant={activeMetric === 'clients' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveMetric('clients')}
          >
            Clients
          </Button>
          <Button 
            variant={activeMetric === 'services' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveMetric('services')}
          >
            Services
          </Button>
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              {activeMetric === 'revenue' && (
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  name="Revenue ($)" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              )}
              {activeMetric === 'clients' && (
                <Line 
                  type="monotone" 
                  dataKey="clients" 
                  name="New Clients" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              )}
              {activeMetric === 'services' && (
                <Line 
                  type="monotone" 
                  dataKey="services" 
                  name="Services" 
                  stroke="#8b5cf6" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>
      
      <TabsContent value="comparison" className="pt-4">
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" orientation="left" stroke="#10b981" />
              <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="revenue" name="Revenue ($)" fill="#10b981" />
              <Bar yAxisId="right" dataKey="clients" name="New Clients" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>
      
      <TabsContent value="details" className="pt-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Revenue ($)</TableHead>
                <TableHead className="text-right">New Clients</TableHead>
                <TableHead className="text-right">Services</TableHead>
                <TableHead className="text-right">Retention (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chartData.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="text-right">${row.revenue.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.clients}</TableCell>
                  <TableCell className="text-right">{row.services}</TableCell>
                  <TableCell className="text-right">{row.retention.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  );
};

export default TerritoryAnalytics;
