import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ServiceManagementDashboard from './services/ServiceManagementDashboard';
import StaffTimeOffManagement from './staff/StaffTimeOffManagement';

const AdminServicesTab = () => {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="services" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="services">Service Management</TabsTrigger>
          <TabsTrigger value="timeoff">Staff Time Off</TabsTrigger>
        </TabsList>
        
        <TabsContent value="services" className="mt-6">
          <ServiceManagementDashboard />
        </TabsContent>
        
        <TabsContent value="timeoff" className="mt-6">
          <StaffTimeOffManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminServicesTab;