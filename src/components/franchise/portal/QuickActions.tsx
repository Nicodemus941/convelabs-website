
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

const QuickActions = () => {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-medium mb-4">Quick Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Schedule Service</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-sm text-gray-500 mb-4">Create a new client appointment</p>
            <Button size="sm" className="w-full bg-conve-red hover:bg-conve-red/90">
              Schedule <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Add Staff Member</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-sm text-gray-500 mb-4">Onboard a new team member</p>
            <Button size="sm" className="w-full">
              Add Staff <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">View Reports</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-sm text-gray-500 mb-4">Access detailed analytics</p>
            <Button size="sm" variant="outline" className="w-full">
              View <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QuickActions;
