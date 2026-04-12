
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

const PhotoDocumentationSection = () => {
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);

  const handleCapturePhoto = () => {
    setIsCapturingPhoto(true);
    // Simulate photo capture process
    setTimeout(() => {
      setIsCapturingPhoto(false);
      toast.success("Photo captured and saved successfully");
    }, 1500);
  };

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-medium text-lg mb-4">Photo Documentation</h3>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Patient</label>
        <select className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red">
          <option>Select patient</option>
          <option>Jennifer Miller (10:30 AM)</option>
          <option>Robert Thomas (1:15 PM)</option>
        </select>
      </div>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Photo Type</label>
        <select className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-conve-red">
          <option>Select type</option>
          <option>Lab Sample</option>
          <option>Patient ID</option>
          <option>Insurance Card</option>
          <option>Other Documentation</option>
        </select>
      </div>
      
      <div className="border-2 border-dashed rounded-lg p-4 h-48 flex flex-col items-center justify-center mb-4">
        {isCapturingPhoto ? (
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-conve-red mb-2" />
            <p className="text-center">Capturing photo...</p>
          </div>
        ) : (
          <>
            <Camera className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-center text-muted-foreground">Camera preview area</p>
            <p className="text-center text-xs text-muted-foreground">Tap button below to capture photo</p>
          </>
        )}
      </div>
      
      <Button 
        className="w-full" 
        onClick={handleCapturePhoto}
        disabled={isCapturingPhoto}
      >
        {isCapturingPhoto ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...
          </>
        ) : (
          <>
            <Camera className="h-4 w-4 mr-2" /> Capture Photo
          </>
        )}
      </Button>
    </div>
  );
};

export default PhotoDocumentationSection;
