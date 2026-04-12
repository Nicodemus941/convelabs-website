
import React from "react";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Plus, RefreshCw } from "lucide-react";

interface StaffHeaderProps {
  handleAddStaff: () => void;
  handleRefresh: () => void;
  refreshing: boolean;
}

const StaffHeader: React.FC<StaffHeaderProps> = ({ 
  handleAddStaff, 
  handleRefresh, 
  refreshing 
}) => {
  return (
    <div className="flex flex-col md:flex-row justify-between md:items-center space-y-4 md:space-y-0">
      <div>
        <CardTitle>Staff Management</CardTitle>
        <CardDescription>View and manage staff members</CardDescription>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh staff data"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
        <Button onClick={handleAddStaff} className="bg-conve-red hover:bg-conve-red/90">
          <Plus className="mr-2 h-4 w-4" /> Add Staff
        </Button>
      </div>
    </div>
  );
};

export default StaffHeader;
