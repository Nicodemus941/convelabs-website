
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const SupportTab = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Support Center</h2>
        <Button className="bg-conve-red hover:bg-conve-red/90">Contact Support</Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>FAQs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="text-blue-600 hover:underline cursor-pointer">How do I add new staff?</li>
              <li className="text-blue-600 hover:underline cursor-pointer">Setting up appointment workflows</li>
              <li className="text-blue-600 hover:underline cursor-pointer">Territory management guidelines</li>
              <li className="text-blue-600 hover:underline cursor-pointer">Financial reporting requirements</li>
            </ul>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Recent Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="border-l-4 border-amber-500 pl-3 py-1">
                <p className="font-medium">Scheduling System Issue</p>
                <p className="text-sm text-gray-500">Opened 2 days ago - In Progress</p>
              </div>
              <div className="border-l-4 border-green-500 pl-3 py-1">
                <p className="font-medium">Staff Access Request</p>
                <p className="text-sm text-gray-500">Opened 5 days ago - Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Your Support Team</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="font-bold text-gray-600">MB</span>
                </div>
                <div>
                  <p className="font-medium">Michael Brown</p>
                  <p className="text-sm text-gray-500">Account Manager</p>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                Schedule a Call
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SupportTab;
