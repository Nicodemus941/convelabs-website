
import React from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

const PatientFormsSection = () => {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-medium text-lg mb-4">Patient Forms</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
          <FileText className="h-8 w-8 text-conve-red" />
          <span className="font-medium">Consent Form</span>
          <span className="text-xs text-muted-foreground">Required for all patients</span>
        </Button>
        
        <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
          <FileText className="h-8 w-8 text-conve-red" />
          <span className="font-medium">Patient ID Verification</span>
          <span className="text-xs text-muted-foreground">Required for all patients</span>
        </Button>
        
        <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
          <FileText className="h-8 w-8 text-conve-red" />
          <span className="font-medium">Insurance Verification</span>
          <span className="text-xs text-muted-foreground">If patient using insurance</span>
        </Button>
        
        <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
          <FileText className="h-8 w-8 text-conve-red" />
          <span className="font-medium">Special Instructions</span>
          <span className="text-xs text-muted-foreground">For complex procedures</span>
        </Button>
      </div>
    </div>
  );
};

export default PatientFormsSection;
