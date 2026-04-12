
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";

// Import refactored components
import DashboardStats from "@/components/dashboards/concierge-doctor/DashboardStats";
import PatientList from "@/components/dashboards/concierge-doctor/PatientList";
import LabOrdersTab from "@/components/dashboards/concierge-doctor/LabOrdersTab";
import LabResultsTab from "@/components/dashboards/concierge-doctor/LabResultsTab";
import AppointmentScheduling from "@/components/dashboards/concierge-doctor/AppointmentScheduling";
import StaffAccess from "@/components/dashboards/concierge-doctor/StaffAccess";
import BillingTab from "@/components/dashboards/concierge-doctor/BillingTab";
import AccountSettingsTab from "@/components/dashboards/concierge-doctor/AccountSettingsTab";
import HelpCenter from "@/components/dashboards/concierge-doctor/HelpCenter";

const ConciergeDoctorDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("patients");

  const scheduleLabWork = () => {
    setActiveTab("schedule");
    toast.success("Let's schedule a lab appointment");
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            Welcome, Dr. {user?.lastName || "Doctor"}
          </h1>
          <p className="text-muted-foreground">
            Here's your concierge dashboard
          </p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
          <Button className="luxury-button" onClick={scheduleLabWork}>
            Schedule Lab Work
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <DashboardStats />

      <Tabs defaultValue="patients" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="orders">Lab Orders</TabsTrigger>
          <TabsTrigger value="results">Lab Results</TabsTrigger>
          <TabsTrigger value="schedule">Schedule Appointment</TabsTrigger>
          <TabsTrigger value="staff">Staff Access</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="help">Help</TabsTrigger>
        </TabsList>

        <TabsContent value="patients">
          <PatientList />
        </TabsContent>
        
        <TabsContent value="orders">
          <LabOrdersTab />
        </TabsContent>
        
        <TabsContent value="results">
          <LabResultsTab />
        </TabsContent>

        <TabsContent value="schedule">
          <AppointmentScheduling />
        </TabsContent>

        <TabsContent value="staff">
          <StaffAccess />
        </TabsContent>
        
        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
        
        <TabsContent value="account">
          <AccountSettingsTab />
        </TabsContent>

        <TabsContent value="help">
          <HelpCenter />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConciergeDoctorDashboard;
