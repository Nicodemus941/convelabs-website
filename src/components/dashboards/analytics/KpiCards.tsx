
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useKpiData } from '@/hooks/useAdminAnalytics';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarClock, Users, CreditCard, UserCog, AlertTriangle } from "lucide-react";

interface KpiCardsProps {
  timeRange: 7 | 30 | 90;
}

const KpiCards: React.FC<KpiCardsProps> = ({ timeRange }) => {
  const { kpiData, isLoading, error } = useKpiData(timeRange);
  
  if (error) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-500">Error loading KPI data: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* New Signups */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            New Signups
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <>
              <div className="text-3xl font-bold">{kpiData?.newSignups || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Last {timeRange} days
              </p>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Upcoming Appointments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Upcoming Appointments
          </CardTitle>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <>
              <div className="text-3xl font-bold">{kpiData?.upcomingAppointments || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Scheduled
              </p>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Monthly Revenue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Revenue
          </CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <>
              <div className="text-3xl font-bold">
                ${((kpiData?.monthlyRevenue || 0) / 100).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Last {timeRange} days
              </p>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Active Phlebotomists */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Active Phlebotomists
          </CardTitle>
          <UserCog className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <>
              <div className="text-3xl font-bold">{kpiData?.activePhlebotomists || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Currently active
              </p>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Inventory Alerts */}
      <Card className={kpiData?.inventoryAlerts ? "border-amber-300" : ""}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Inventory Alerts
          </CardTitle>
          <AlertTriangle className={`h-4 w-4 ${kpiData?.inventoryAlerts ? "text-amber-500" : "text-muted-foreground"}`} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <>
              <div className="text-3xl font-bold">
                {kpiData?.inventoryAlerts || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Items below threshold
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default KpiCards;
