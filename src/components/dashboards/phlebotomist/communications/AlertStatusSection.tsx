
import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";

const AlertStatusSection = () => {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-medium text-lg mb-4">Alert Status</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button 
          variant="outline" 
          className="border-green-200 bg-green-50 hover:bg-green-100 text-green-800"
          onClick={() => toast.success("Status updated: All Clear")}
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          All Clear
        </Button>
        
        <Button 
          variant="outline" 
          className="border-yellow-200 bg-yellow-50 hover:bg-yellow-100 text-yellow-800"
          onClick={() => toast.success("Status updated: Running Behind")}
        >
          <Clock className="h-4 w-4 mr-2" />
          Running Behind
        </Button>
        
        <Button 
          variant="outline" 
          className="border-red-200 bg-red-50 hover:bg-red-100 text-red-800"
          onClick={() => toast.success("Status updated: Need Assistance")}
        >
          <AlertCircle className="h-4 w-4 mr-2" />
          Need Assistance
        </Button>
      </div>
    </div>
  );
};

export default AlertStatusSection;
