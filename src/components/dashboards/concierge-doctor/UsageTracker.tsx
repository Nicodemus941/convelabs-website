
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const UsageTracker = () => {
  // Mock usage data
  const currentUsage = 15;
  const totalAllocation = 50;
  const usagePercentage = (currentUsage / totalAllocation) * 100;
  
  // Monthly breakdown
  const monthlyUsage = [
    { month: "January", count: 8 },
    { month: "February", count: 12 },
    { month: "March", count: 10 },
    { month: "April", count: 15 },
    { month: "May", count: 7 },
  ];

  return (
    <div className="mb-8">
      <h3 className="text-lg font-medium mb-4">Credit Usage Tracker</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="col-span-full md:col-span-2">
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Monthly Credits Used</span>
                <span className="text-sm font-medium">{currentUsage} / {totalAllocation}</span>
              </div>
              <Progress value={usagePercentage} className="h-2" />
            </div>
            
            <div className="mt-8">
              <h4 className="text-sm font-medium mb-4">Usage by Month</h4>
              <div className="space-y-4">
                {monthlyUsage.map((item, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{item.month}</span>
                      <span className="font-medium">{item.count} credits</span>
                    </div>
                    <Progress value={(item.count / 20) * 100} className="h-1" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <h4 className="text-sm font-medium mb-4">Credit Summary</h4>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">Total Credits</span>
                <span className="font-medium">{totalAllocation}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Used Credits</span>
                <span className="font-medium">{currentUsage}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Remaining Credits</span>
                <span className="font-medium">{totalAllocation - currentUsage}</span>
              </div>
              
              <div className="border-t pt-4 mt-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Renewal Date</span>
                  <span>June 15, 2025</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UsageTracker;
