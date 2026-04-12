
import React from "react";
import { MessageSquare } from "lucide-react";

const RecentCommunicationsSection = () => {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-medium text-lg mb-4">Recent Communications</h3>
      
      <div className="space-y-2">
        <div className="flex items-start gap-3 border-b pb-2">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Office Manager</span>
              <span className="text-xs text-muted-foreground">Today, 9:30 AM</span>
            </div>
            <p className="text-sm">New patient added to your schedule tomorrow at 10:00 AM</p>
          </div>
        </div>
        
        <div className="flex items-start gap-3 border-b pb-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-blue-800" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">You</span>
              <span className="text-xs text-muted-foreground">Today, 8:15 AM</span>
            </div>
            <p className="text-sm">Arrived at first appointment location</p>
          </div>
        </div>
        
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">System</span>
              <span className="text-xs text-muted-foreground">Today, 7:45 AM</span>
            </div>
            <p className="text-sm">Your schedule for today has been finalized with 3 appointments</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecentCommunicationsSection;
