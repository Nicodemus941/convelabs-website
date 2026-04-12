import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffProfiles } from "@/hooks/useStaffProfiles";
import { usePayroll } from "@/hooks/usePayroll";
import { Skeleton } from "@/components/ui/skeleton";
import WorkHoursTab from "./WorkHoursTab";
import PayrollPeriodsTab from "./PayrollPeriodsTab";
import PaymentMethodsTab from "./PaymentMethodsTab";
import { CalendarDays, Clock, CreditCard, DollarSign } from "lucide-react";

const PayrollTab = () => {
  const { user } = useAuth();
  const { staffProfiles, isLoading: profilesLoading } = useStaffProfiles();
  const { isLoading: payrollLoading } = usePayroll();
  const [staffProfile, setStaffProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user && staffProfiles.length > 0) {
      // Find staff profile for current user
      const profile = staffProfiles.find(profile => profile.user_id === user.id);
      setStaffProfile(profile);
      
      // Check if user is admin
      setIsAdmin(user.role === 'office_manager' || user.role === 'super_admin');
    }
  }, [user, staffProfiles]);

  if (profilesLoading || payrollLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle><Skeleton className="h-8 w-64" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-96" /></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payroll Management</CardTitle>
        <CardDescription>
          {isAdmin 
            ? "Manage staff payroll, work hours, and payment methods" 
            : "View your hours, payments, and manage your payment methods"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="hours">
          <TabsList className="mb-4">
            <TabsTrigger value="hours" className="flex items-center">
              <Clock className="mr-2 h-4 w-4" />
              Work Hours
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="periods" className="flex items-center">
                <CalendarDays className="mr-2 h-4 w-4" />
                Payroll Periods
              </TabsTrigger>
            )}
            <TabsTrigger value="payments" className="flex items-center">
              <DollarSign className="mr-2 h-4 w-4" />
              Payment History
            </TabsTrigger>
            <TabsTrigger value="methods" className="flex items-center">
              <CreditCard className="mr-2 h-4 w-4" />
              Payment Methods
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="hours">
            <WorkHoursTab staffProfile={staffProfile} isAdmin={isAdmin} />
          </TabsContent>
          
          {isAdmin && (
            <TabsContent value="periods">
              <PayrollPeriodsTab />
            </TabsContent>
          )}
          
          <TabsContent value="payments">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Payment History</h3>
              {/* This will be implemented in the PaymentHistoryTab component */}
              <p>View your payment history and upcoming payments.</p>
            </div>
          </TabsContent>
          
          <TabsContent value="methods">
            <PaymentMethodsTab staffProfile={staffProfile} isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default PayrollTab;
