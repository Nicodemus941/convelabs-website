/**
 * AdminServicesTab — Dashboard "billing/services".
 *
 * Two sub-screens: the services_enhanced catalog (live checkout pricing)
 * and staff time-off / date blocks, which historically lived under the
 * same nav entry. Both tabs keep their own data hooks.
 */
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ServiceManagementDashboard from './services/ServiceManagementDashboard';
import StaffTimeOffManagement from './staff/StaffTimeOffManagement';

const AdminServicesTab = () => {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="services" className="w-full">
        <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-2 h-10 sm:h-9">
          <TabsTrigger value="services" className="text-xs data-[state=active]:bg-[#B91C1C] data-[state=active]:text-white">Services & pricing</TabsTrigger>
          <TabsTrigger value="timeoff" className="text-xs data-[state=active]:bg-[#B91C1C] data-[state=active]:text-white">Staff time off</TabsTrigger>
        </TabsList>
        <TabsContent value="services" className="mt-4">
          <ServiceManagementDashboard />
        </TabsContent>
        <TabsContent value="timeoff" className="mt-4">
          <StaffTimeOffManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminServicesTab;
