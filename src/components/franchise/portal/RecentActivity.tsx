
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, Calendar } from "lucide-react";

const RecentActivity = () => {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Recent Activity</h3>
        <Button variant="link" className="text-conve-red p-0">
          View All
        </Button>
      </div>
      
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 p-2 rounded-md">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">New staff member added</p>
                  <p className="text-sm text-gray-500">Sarah Johnson joined as Receptionist</p>
                </div>
              </div>
              <Badge variant="outline">Today</Badge>
            </div>
            
            <div className="flex items-center justify-between p-4">
              <div className="flex items-start gap-3">
                <div className="bg-green-100 p-2 rounded-md">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Monthly report available</p>
                  <p className="text-sm text-gray-500">April 2023 performance summary ready to view</p>
                </div>
              </div>
              <Badge variant="outline">Yesterday</Badge>
            </div>
            
            <div className="flex items-center justify-between p-4">
              <div className="flex items-start gap-3">
                <div className="bg-purple-100 p-2 rounded-md">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium">15 new appointments</p>
                  <p className="text-sm text-gray-500">Scheduled for next week</p>
                </div>
              </div>
              <Badge variant="outline">3 days ago</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RecentActivity;
