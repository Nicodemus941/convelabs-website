
import React from "react";
import { Button } from "@/components/ui/button";
import { PenTool } from "lucide-react";

const DigitalSignatureSection = () => {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-medium text-lg mb-4">Digital Signature Capture</h3>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Patient</label>
        <select className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red">
          <option>Select patient</option>
          <option>Jennifer Miller (10:30 AM)</option>
          <option>Robert Thomas (1:15 PM)</option>
        </select>
      </div>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Form Type</label>
        <select className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red">
          <option>Select form</option>
          <option>Consent Form</option>
          <option>Patient ID Verification</option>
          <option>Insurance Verification</option>
          <option>Special Instructions</option>
        </select>
      </div>
      
      <div className="border-2 border-dashed rounded-lg p-4 h-48 flex flex-col items-center justify-center mb-4">
        <PenTool className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-center text-muted-foreground">Signature capture area</p>
        <p className="text-center text-xs text-muted-foreground">Have the patient sign here using finger or stylus</p>
      </div>
      
      <div className="flex space-x-2">
        <Button variant="outline">Clear</Button>
        <Button className="luxury-button">Save Signature</Button>
      </div>
    </div>
  );
};

export default DigitalSignatureSection;
