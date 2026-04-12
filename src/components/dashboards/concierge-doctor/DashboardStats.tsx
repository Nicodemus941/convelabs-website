
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DashboardStats = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Patients
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">28</div>
          <p className="text-xs text-muted-foreground mt-1">
            3 new this month
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pending Lab Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">5</div>
          <p className="text-xs text-muted-foreground mt-1">
            2 scheduled for today
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Recent Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">7</div>
          <p className="text-xs text-muted-foreground mt-1">
            3 need review
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Lab Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">42</div>
          <p className="text-xs text-muted-foreground mt-1">
            Premium plan active
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardStats;
