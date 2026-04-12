import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { MessageSquare, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import TodayOverview from "./phlebotomist/TodayOverview";
import TodayScheduleTab from "./phlebotomist/TodayScheduleTab";
import WeeklyScheduleTab from "./phlebotomist/WeeklyScheduleTab";
import InventoryTab from "./phlebotomist/InventoryTab";
import FormsTab from "./phlebotomist/FormsTab";
import CommunicationsTab from "./phlebotomist/CommunicationsTab";
import ProfileTab from "./phlebotomist/ProfileTab";
import SOPsTab from "@/components/staff/SOPsTab";
import { getMockPhlebotomistData } from "./phlebotomist/PhlebotomistDashboardData";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { EquipmentAlertSystem } from "./phlebotomist/EquipmentAlertSystem";
import { PatientArrivalTracker } from "./phlebotomist/PatientArrivalTracker";
import { WorkflowOptimization } from "./phlebotomist/WorkflowOptimization";
import { TrainingResourceCenter } from "./phlebotomist/TrainingResourceCenter";
import ServiceAreaList from "./phlebotomist/ServiceAreaList";

const PhlebotomistDashboard = () => {
  const { user } = useAuth();
  const phlebotomistData = getMockPhlebotomistData();
  
  const handleSendMessage = () => {
    toast.success("Message sent to office manager");
  };

  return (
    <NotificationsProvider>
      <div className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">
              Welcome, {user?.firstName || "Phlebotomist"}
            </h1>
            <p className="text-muted-foreground">
              Here's your schedule for today
            </p>
          </div>
          <div className="flex gap-2 mt-4 md:mt-0">
            <NotificationCenter />
            <Button variant="outline" className="flex items-center gap-2" onClick={handleSendMessage}>
              <MessageSquare className="h-4 w-4" /> Message Office
            </Button>
            <Button className="bg-conve-red hover:bg-conve-red-dark text-white" asChild>
              <Link to="/phleb-app"><Smartphone className="h-4 w-4 mr-1" /> Field App</Link>
            </Button>
          </div>
        </div>

        {/* Today's Overview */}
        <TodayOverview 
          todayAppointments={phlebotomistData.todayAppointments} 
          totalCompletedToday={phlebotomistData.totalCompletedToday}
          nextAppointment={phlebotomistData.upcomingAppointments.length > 0 ? {
            time: phlebotomistData.upcomingAppointments[0].time,
            patientName: phlebotomistData.upcomingAppointments[0].patientName
          } : null}
          weeklySchedule={phlebotomistData.weeklySchedule}
        />

        {/* Real-time tracking and alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-2">
            <PatientArrivalTracker />
          </div>
          <div>
            <ServiceAreaList />
          </div>
        </div>

        {/* Equipment alerts and workflow optimization */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <EquipmentAlertSystem />
          <WorkflowOptimization />
        </div>

        <div className="mt-6">
          <TrainingResourceCenter />
        </div>

        <Tabs defaultValue="today" className="mt-6">
          <TabsList className="mb-6">
            <TabsTrigger value="today">Today's Schedule</TabsTrigger>
            <TabsTrigger value="week">Weekly Schedule</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="forms">Digital Forms</TabsTrigger>
            <TabsTrigger value="communications">Communications</TabsTrigger>
            <TabsTrigger value="sops">SOPs & Guidelines</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="today">
            <TodayScheduleTab />
          </TabsContent>

          <TabsContent value="week">
            <WeeklyScheduleTab 
              weeklySchedule={phlebotomistData.weeklySchedule} 
            />
          </TabsContent>

          <TabsContent value="inventory">
            <InventoryTab />
          </TabsContent>

          <TabsContent value="forms">
            <FormsTab />
          </TabsContent>

          <TabsContent value="communications">
            <CommunicationsTab />
          </TabsContent>
          
          <TabsContent value="sops">
            <SOPsTab />
          </TabsContent>

          <TabsContent value="profile">
            <ProfileTab />
          </TabsContent>
        </Tabs>
      </div>
    </NotificationsProvider>
  );
};

export default PhlebotomistDashboard;