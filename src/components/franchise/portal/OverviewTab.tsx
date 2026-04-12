
import React from "react";
import { PerformanceData } from "@/hooks/franchise/useFranchisePerformance";
import PerformanceOverview from "./PerformanceOverview";
import QuickActions from "./QuickActions";
import RecentActivity from "./RecentActivity";

interface OverviewTabProps {
  performanceData: PerformanceData[];
  timeRange: '30' | '90' | '180' | '365';
  setTimeRange: React.Dispatch<React.SetStateAction<'30' | '90' | '180' | '365'>>;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ performanceData, timeRange, setTimeRange }) => {
  return (
    <>
      <PerformanceOverview 
        performanceData={performanceData} 
        timeRange={timeRange} 
        setTimeRange={setTimeRange} 
      />
      <QuickActions />
      <RecentActivity />
    </>
  );
};

export default OverviewTab;
